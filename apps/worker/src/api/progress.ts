import { rankKey } from "@bvo/shared";
import type { Hono } from "hono";
import { z } from "zod";
import { decrypt, encrypt } from "../crypto/aes";
import { chatKey } from "../do/key-vault";
import type { WorldZone } from "../do/world-zone";
import { listQuests, recordEvent } from "../progress/quests";
import { progressView, promote } from "../progress/ranks";
import { vnDay } from "../progress/time";
import { buildCrisisResponse } from "../safety/crisis-template";
import { scanKeywords } from "../safety/keywords";
import { loadResourceRows, toPublic } from "../safety/resources";
import { nowIso, type AppEnv } from "../types";
import { recordOf } from "./conversations";
import { apiError } from "./errors";
import { requireOnboarded, requireUser } from "./guards";
import { ZONE_RE } from "./world";

/** Tiến trình, nhiệm vụ, tự chăm sóc, thăng cấp (002 T013/T018, contracts/http-api.md). */

export const BREATH_MIN_SECONDS = 170;
const BREATH_MAX_SECONDS = 30 * 60;
const MOODS = ["great", "ok", "meh", "low", "bad"] as const;

const SelfCareBody = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("mood"), value: z.enum(MOODS) }),
  z.object({ kind: z.literal("gratitude"), text: z.string().trim().min(1).max(200) }),
]);

export function registerProgress(app: Hono<AppEnv>) {
  const guard = [requireUser, requireOnboarded] as const;

  app.get("/api/progress", ...guard, async (c) => c.json(await progressView(c.env.DB, c.get("user")!.id)));

  app.get("/api/quests", ...guard, async (c) => {
    const user = c.get("user")!;
    return c.json(await listQuests(c.env.DB, user.id, user.locale));
  });

  app.post("/api/quests/breath/start", ...guard, async (c) => {
    const token = crypto.randomUUID();
    const user = c.get("user")!;
    await c.env.DB.prepare("DELETE FROM breath_sessions WHERE user_id = ?").bind(user.id).run();
    await c.env.DB.prepare("INSERT INTO breath_sessions (token, user_id, started_at) VALUES (?, ?, ?)").bind(token, user.id, nowIso()).run();
    return c.json({ token, minSeconds: BREATH_MIN_SECONDS });
  });

  app.post("/api/quests/breath/finish", ...guard, async (c) => {
    const body = z.object({ token: z.string().uuid() }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "VALIDATION", 400);
    const user = c.get("user")!;
    const s = await c.env.DB.prepare("SELECT started_at FROM breath_sessions WHERE token = ? AND user_id = ?")
      .bind(body.data.token, user.id)
      .first<{ started_at: string }>();
    if (!s) return apiError(c, "VALIDATION", 400);
    const seconds = (Date.now() - Date.parse(s.started_at)) / 1000;
    if (seconds < BREATH_MIN_SECONDS || seconds > BREATH_MAX_SECONDS) return apiError(c, "VALIDATION", 400, { seconds: Math.floor(seconds) });
    await c.env.DB.prepare("DELETE FROM breath_sessions WHERE token = ?").bind(body.data.token).run();
    const updates = await recordEvent(c.env, user.id, { type: "breath" });
    return c.json({ ok: true, awarded: updates.reduce((n, u) => n + u.awarded, 0), updates });
  });

  // Nhật ký tự chăm sóc: chỉ lưu (mã hóa) trong PatientRecord của chính người chơi (FR-006).
  app.post("/api/selfcare", ...guard, async (c) => {
    const parsed = SelfCareBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return apiError(c, "VALIDATION", 400);
    const user = c.get("user")!;
    const b = parsed.data;
    const raw = b.kind === "mood" ? b.value : b.text;
    await recordOf(c, user.id).addSelfCare(b.kind, await encrypt(await chatKey(c.env), raw), vnDay());
    const updates = await recordEvent(c.env, user.id, { type: b.kind });
    // Dòng tự viết không gửi cho ai, nhưng nếu có dấu hiệu khủng hoảng thì vẫn đưa thông tin hỗ trợ (Constitution I).
    let support = null;
    if (b.kind === "gratitude" && scanKeywords(b.text).level === "acute") {
      support = buildCrisisResponse(user.locale, toPublic(await loadResourceRows(c.env.DB), user.locale, new Date()), new Date());
    }
    return c.json({ awarded: updates.reduce((n, u) => n + u.awarded, 0), updates, support });
  });

  app.get("/api/selfcare", ...guard, async (c) => {
    const days = Math.min(Math.max(Number(c.req.query("days")) || 30, 1), 365);
    const user = c.get("user")!;
    const since = vnDay(new Date(Date.now() - days * 86400_000));
    const key = await chatKey(c.env);
    const rows = await recordOf(c, user.id).listSelfCare(since);
    return c.json(await Promise.all(rows.map(async (r) => ({ id: r.id, kind: r.kind, day: r.day, value: await decrypt(key, r.value) }))));
  });

  app.delete("/api/selfcare", ...guard, async (c) => {
    await recordOf(c, c.get("user")!.id).clearSelfCare();
    return c.body(null, 204);
  });

  // Lễ thăng cấp ở sảnh (FR-011). `zoneId` = sảnh người chơi đang đứng, để cả sảnh thấy pháo giấy.
  app.post("/api/ranks/promote", ...guard, async (c) => {
    const body = z.object({ zoneId: z.string().regex(ZONE_RE).optional() }).safeParse(await c.req.json().catch(() => ({})));
    const user = c.get("user")!;
    const r = await promote(c.env, user.id);
    if (r.level === null) return apiError(c, "NOT_ELIGIBLE", 409, { next: r.next });
    const zoneId = body.success ? body.data.zoneId : undefined;
    if (zoneId?.startsWith("lobby-")) {
      const stub = c.env.WORLD_ZONE.get(c.env.WORLD_ZONE.idFromName(zoneId)) as DurableObjectStub<WorldZone>;
      c.executionCtx.waitUntil(stub.celebrate(user.id, r.level).catch(() => undefined));
    }
    return c.json({ level: r.level, key: rankKey(r.level), next: r.next });
  });

  // Hồ sơ công khai: chỉ biệt danh và chức danh trong game; không điểm, không email (FR-007, FR-012).
  app.get("/api/profile/:userId", ...guard, async (c) => {
    const row = await c.env.DB.prepare(
      "SELECT u.nickname, COALESCE(p.rank, 1) AS rank FROM users u LEFT JOIN user_progress p ON p.user_id = u.id WHERE u.id = ? AND u.status <> 'deleted'",
    )
      .bind(c.req.param("userId"))
      .first<{ nickname: string | null; rank: number }>();
    if (!row) return apiError(c, "NOT_FOUND", 404);
    return c.json({ nickname: row.nickname, rank: { level: row.rank, key: rankKey(row.rank) }, inGameTitle: true });
  });
}
