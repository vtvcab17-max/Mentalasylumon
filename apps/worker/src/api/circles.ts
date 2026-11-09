import type { Hono } from "hono";
import { z } from "zod";
import type { CircleRoom } from "../do/circle-room";
import type { Env } from "../env";
import { nowIso, type AppEnv } from "../types";
import { apiError } from "./errors";
import { requireOnboarded, requireUser } from "./guards";
import { notifyAdmins } from "../safety/flags";

/** Vòng sinh hoạt, báo cáo, chặn (T081, contracts/http-api.md, FR-023, FR-026, FR-038). */

export const CIRCLE_ID_RE = /^[a-z0-9-]{2,40}$/;

export function circleStub(env: Pick<Env, "CIRCLE_ROOM">, id: string) {
  return env.CIRCLE_ROOM.get(env.CIRCLE_ROOM.idFromName(id)) as DurableObjectStub<CircleRoom>;
}

interface CircleListRow {
  id: string;
  name: string;
  language: "vi" | "en";
  max_seats: number;
  topic: string | null;
  starts_at: string | null;
  status: "scheduled" | "live" | null;
}

async function listCircles(env: Env, lang: "vi" | "en", excludeUserId: string) {
  const { results } = await env.DB.prepare(
    `SELECT c.id, c.name, c.language, c.max_seats, s.topic, s.starts_at, s.status
       FROM circles c
       LEFT JOIN circle_sessions s ON s.id = (
         SELECT id FROM circle_sessions WHERE circle_id = c.id AND status <> 'ended' AND ends_at > ? ORDER BY starts_at LIMIT 1)
      WHERE c.active = 1
      ORDER BY (c.language = ?) DESC, c.sort, c.name`,
  )
    .bind(nowIso(), lang)
    .all<CircleListRow>();
  return Promise.all(
    results.map(async (r) => ({
      id: r.id,
      name: r.name,
      language: r.language,
      maxSeats: r.max_seats,
      seatsTaken: await circleStub(env, r.id).members(excludeUserId),
      session: r.topic ? { topic: r.topic, startsAt: r.starts_at!, status: r.status! } : null,
    })),
  );
}

const ReportBody = z.object({
  reportedUserId: z.string().min(1).max(64),
  context: z.object({ circleId: z.string().regex(CIRCLE_ID_RE), messageId: z.string().min(1).max(64) }),
  reason: z.enum(["harassment", "harmful", "spam", "other"]),
});

export function registerCircles(app: Hono<AppEnv>) {
  const guard = [requireUser, requireOnboarded] as const;

  app.get("/api/circles", ...guard, async (c) => {
    const user = c.get("user")!;
    const q = c.req.query("lang");
    const lang = q === "vi" || q === "en" ? q : user.locale;
    return c.json(await listCircles(c.env, lang, user.id));
  });

  app.post("/api/circles/:id/join", ...guard, async (c) => {
    const id = c.req.param("id");
    if (!CIRCLE_ID_RE.test(id)) return apiError(c, "NOT_FOUND", 404);
    const user = c.get("user")!;
    const circle = await c.env.DB.prepare("SELECT id, language, max_seats FROM circles WHERE id = ? AND active = 1")
      .bind(id)
      .first<{ id: string; language: "vi" | "en"; max_seats: number }>();
    if (!circle) return apiError(c, "NOT_FOUND", 404);
    if ((await circleStub(c.env, id).members(user.id)) < circle.max_seats) return c.json({ wsUrl: `/ws/circle/${id}` });
    // Đầy (FR-023): gợi ý vòng khác còn chỗ, cùng ngôn ngữ trước.
    const alternatives = (await listCircles(c.env, circle.language, user.id)).filter((x) => x.id !== id && x.seatsTaken < x.maxSeats);
    return c.json({ full: true, alternatives });
  });

  app.post("/api/reports", ...guard, async (c) => {
    const parsed = ReportBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return apiError(c, "VALIDATION", 400);
    const user = c.get("user")!;
    const { reportedUserId, context, reason } = parsed.data;
    if (reportedUserId === user.id) return apiError(c, "VALIDATION", 400);
    const msg = await circleStub(c.env, context.circleId).getMessage(context.messageId);
    // Chỉ báo cáo được tin có thật của đúng người bị báo cáo.
    if (!msg || msg.userId !== reportedUserId) return apiError(c, "NOT_FOUND", 404);
    const id = crypto.randomUUID();
    try {
      await c.env.DB.prepare(
        `INSERT INTO reports (id, reporter_id, reported_user_id, context, message_snapshot, reason, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'open', ?)`,
      )
        .bind(id, user.id, reportedUserId, JSON.stringify({ circleId: context.circleId, messageId: context.messageId }), msg.text, reason, nowIso())
        .run();
    } catch {
      return apiError(c, "CONFLICT", 409);
    }
    c.executionCtx.waitUntil(notifyAdmins(c.env.DB, { id, level: "report", source: "circle" }));
    return c.json({ id }, 201);
  });

  app.post("/api/blocks", ...guard, async (c) => {
    const body = z.object({ userId: z.string().min(1).max(64) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "VALIDATION", 400);
    const user = c.get("user")!;
    if (body.data.userId === user.id) return apiError(c, "VALIDATION", 400);
    const exists = await c.env.DB.prepare("SELECT 1 FROM users WHERE id = ?").bind(body.data.userId).first();
    if (!exists) return apiError(c, "NOT_FOUND", 404);
    await c.env.DB.prepare("INSERT OR IGNORE INTO blocks (blocker_id, blocked_id, created_at) VALUES (?, ?, ?)")
      .bind(user.id, body.data.userId, nowIso())
      .run();
    return c.body(null, 204);
  });

  app.delete("/api/blocks/:userId", ...guard, async (c) => {
    await c.env.DB.prepare("DELETE FROM blocks WHERE blocker_id = ? AND blocked_id = ?").bind(c.get("user")!.id, c.req.param("userId")).run();
    return c.body(null, 204);
  });

  app.get("/api/blocks", ...guard, async (c) => {
    const { results } = await c.env.DB.prepare(
      "SELECT b.blocked_id AS userId, u.nickname FROM blocks b JOIN users u ON u.id = b.blocked_id WHERE b.blocker_id = ? ORDER BY b.created_at DESC",
    )
      .bind(c.get("user")!.id)
      .all<{ userId: string; nickname: string | null }>();
    return c.json(results);
  });
}
