import type { Hono } from "hono";
import { z } from "zod";
import { apiError } from "../api/errors";
import { requireAdmin } from "../api/guards";
import { decrypt } from "../crypto/aes";
import { chatKey } from "../do/key-vault";
import { nowIso, type AppEnv } from "../types";

/**
 * Cờ khủng hoảng cho quản trị viên (T061, FR-018, research.md §R12, Constitution III).
 * - Danh sách KHÔNG kèm nội dung.
 * - Mở chi tiết: ghi flag_access_log TRƯỚC khi giải mã và trả nội dung.
 * Lớp bảo vệ ngoài: Cloudflare Access cho /admin/* (cấu hình trong dashboard Zero Trust).
 */
export function registerAdminFlags(app: Hono<AppEnv>) {
  app.get("/admin/api/flags", requireAdmin, async (c) => {
    const status = c.req.query("status") ?? "open";
    const { results } = await c.env.DB.prepare(
      "SELECT id, source, level, category, status, created_at FROM crisis_flags WHERE status = ? ORDER BY level = 'acute' DESC, created_at ASC LIMIT 200",
    )
      .bind(status)
      .all();
    return c.json(results);
  });

  app.get("/admin/api/flags/:id", requireAdmin, async (c) => {
    const admin = c.get("user")!;
    const flag = await c.env.DB.prepare("SELECT * FROM crisis_flags WHERE id = ?")
      .bind(c.req.param("id"))
      .first<{ id: string; excerpt: string | null; status: string } & Record<string, unknown>>();
    if (!flag) return apiError(c, "NOT_FOUND", 404);
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT INTO flag_access_log (id, flag_id, admin_user_id, action, at) VALUES (?, ?, ?, 'view', ?)").bind(
        crypto.randomUUID(), flag.id, admin.id, nowIso(),
      ),
      c.env.DB.prepare("UPDATE crisis_flags SET status = 'in_review' WHERE id = ? AND status = 'open'").bind(flag.id),
    ]);
    const excerpt = flag.excerpt ? JSON.parse(await decrypt(await chatKey(c.env), flag.excerpt)) : null;
    // Không trả user_id: quản trị viên chỉ cần nội dung để đánh giá (tối thiểu hóa dữ liệu).
    const { user_id: _u, excerpt: _e, ...rest } = flag;
    return c.json({ ...rest, status: flag.status === "open" ? "in_review" : flag.status, excerpt });
  });

  app.post("/admin/api/flags/:id/resolve", requireAdmin, async (c) => {
    const admin = c.get("user")!;
    const parsed = z.object({ note: z.string().max(2000).default("") }).safeParse(await c.req.json().catch(() => ({})));
    if (!parsed.success) return apiError(c, "VALIDATION", 400);
    const res = await c.env.DB.batch([
      c.env.DB.prepare("UPDATE crisis_flags SET status = 'resolved', resolved_by = ?, resolved_at = ?, note = ? WHERE id = ? AND status <> 'resolved'").bind(
        admin.id, nowIso(), parsed.data.note, c.req.param("id"),
      ),
      c.env.DB.prepare("INSERT INTO flag_access_log (id, flag_id, admin_user_id, action, at) SELECT ?, id, ?, 'resolve', ? FROM crisis_flags WHERE id = ?").bind(
        crypto.randomUUID(), admin.id, nowIso(), c.req.param("id"),
      ),
    ]);
    if (res[0].meta.changes === 0) return apiError(c, "NOT_FOUND", 404);
    return c.body(null, 204);
  });
}
