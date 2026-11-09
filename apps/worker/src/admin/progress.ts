import type { Hono } from "hono";
import { z } from "zod";
import { apiError } from "../api/errors";
import { requireAdmin } from "../api/guards";
import { ensureProgress } from "../progress/ledger";
import { nowIso, type AppEnv } from "../types";
import { clockOf } from "../elections/director";
import { vnWeek } from "../progress/time";

/** Quản trị cấp bậc (002 T021, FR-009, FR-013). Đổi ngưỡng không hạ cấp người đã ở bậc đó. */

const RankBody = z.object({ minPoints: z.number().int().min(0).max(1_000_000), minActiveDays: z.number().int().min(0).max(3650) });

export function registerAdminProgress(app: Hono<AppEnv>) {
  app.get("/admin/api/ranks", requireAdmin, async (c) => {
    const { results } = await c.env.DB.prepare("SELECT level, key, min_points, min_active_days, chain_id, unlocks FROM ranks ORDER BY level").all();
    return c.json(results);
  });

  app.put("/admin/api/ranks/:level", requireAdmin, async (c) => {
    const level = Number(c.req.param("level"));
    const body = RankBody.safeParse(await c.req.json().catch(() => null));
    if (!body.success || !(level >= 2 && level <= 6)) return apiError(c, "VALIDATION", 400);
    await c.env.DB.prepare("UPDATE ranks SET min_points = ?, min_active_days = ? WHERE level = ?").bind(body.data.minPoints, body.data.minActiveDays, level).run();
    return c.json({ ok: true });
  });

  app.post("/admin/api/users/:id/rank", requireAdmin, async (c) => {
    const body = z.object({ level: z.number().int().min(1).max(6), note: z.string().trim().min(3).max(500) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "VALIDATION", 400);
    const userId = c.req.param("id");
    if (!(await c.env.DB.prepare("SELECT 1 FROM users WHERE id = ?").bind(userId).first())) return apiError(c, "NOT_FOUND", 404);
    await ensureProgress(c.env.DB, userId);
    const cur = (await c.env.DB.prepare("SELECT rank FROM user_progress WHERE user_id = ?").bind(userId).first<{ rank: number }>())!.rank;
    if (cur === body.data.level) return c.json({ ok: true });
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE user_progress SET rank = ?, updated_at = ? WHERE user_id = ?").bind(body.data.level, nowIso(), userId),
      c.env.DB.prepare("INSERT INTO rank_history (id, user_id, from_rank, to_rank, reason, note, by_user_id, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)").bind(
        crypto.randomUUID(), userId, cur, body.data.level, body.data.level < cur ? "admin_demote" : "admin_restore", body.data.note, c.get("user")!.id, nowIso(),
      ),
    ]);
    return c.json({ ok: true });
  });

  app.post("/admin/api/users/:id/council", requireAdmin, async (c) => {
    const body = z.object({ banned: z.boolean(), note: z.string().trim().min(3).max(500) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "VALIDATION", 400);
    await ensureProgress(c.env.DB, c.req.param("id"));
    await c.env.DB.prepare("UPDATE user_progress SET council_banned = ?, updated_at = ? WHERE user_id = ?").bind(body.data.banned ? 1 : 0, nowIso(), c.req.param("id")).run();
    return c.json({ ok: true });
  });
}

/** Bầu cử & nhiệm kỳ cho quản trị viên (002 T035, FR-019, FR-025, FR-026). */
export function registerAdminElections(app: Hono<AppEnv>) {
  app.post("/admin/api/terms/current/remove", requireAdmin, async (c) => {
    const body = z.object({ note: z.string().trim().min(3).max(500) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "VALIDATION", 400);
    const week = vnWeek(clockOf(c));
    const t = await c.env.DB.prepare("SELECT holder_id FROM terms WHERE week = ? AND ended_reason IS NULL AND holder_id IS NOT NULL").bind(week).first<{ holder_id: string }>();
    if (!t) return apiError(c, "NOT_FOUND", 404);
    await c.env.DB.prepare("UPDATE terms SET ended_reason = 'removed_by_admin' WHERE week = ?").bind(week).run();
    return c.json({ ok: true });
  });

  app.get("/admin/api/terms/:week/actions", requireAdmin, async (c) => {
    const { results } = await c.env.DB.prepare("SELECT holder_id, action, payload, at FROM term_actions WHERE week = ? ORDER BY at").bind(c.req.param("week")).all();
    return c.json(results);
  });

  // Chỉ ai đã bầu — không kèm phiếu (phiếu kín, R4).
  app.get("/admin/api/elections/:id/voters", requireAdmin, async (c) => {
    const { results } = await c.env.DB.prepare(
      "SELECT v.voter_id, u.nickname, v.voted_at FROM election_voters v JOIN users u ON u.id = v.voter_id WHERE v.election_id = ? ORDER BY v.voted_at",
    )
      .bind(c.req.param("id"))
      .all();
    return c.json(results);
  });

  app.get("/admin/api/catalog", requireAdmin, async (c) => c.json((await c.env.DB.prepare("SELECT * FROM catalog_items ORDER BY kind, id").all()).results));

  app.put("/admin/api/catalog/:id", requireAdmin, async (c) => {
    const Text = z.object({ title: z.string().trim().min(1).max(80), desc: z.string().trim().max(200) });
    const body = z
      .object({ kind: z.enum(["theme", "decor", "weekly_quest"]), text: z.object({ vi: Text, en: Text }), data: z.record(z.unknown()).default({}), active: z.boolean().default(true) })
      .safeParse(await c.req.json().catch(() => null));
    if (!body.success || !/^[a-z0-9-]{2,40}$/.test(c.req.param("id"))) return apiError(c, "VALIDATION", 400);
    const b = body.data;
    await c.env.DB.prepare(
      "INSERT INTO catalog_items (id, kind, text, data, active) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, text = excluded.text, data = excluded.data, active = excluded.active",
    )
      .bind(c.req.param("id"), b.kind, JSON.stringify(b.text), JSON.stringify(b.data), b.active ? 1 : 0)
      .run();
    return c.json({ ok: true });
  });
}
