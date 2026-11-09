import type { Hono } from "hono";
import { z } from "zod";
import { apiError } from "../api/errors";
import { requireAdmin } from "../api/guards";
import { ensureProgress } from "../progress/ledger";
import { nowIso, type AppEnv } from "../types";

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
