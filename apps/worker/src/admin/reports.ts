import type { Hono } from "hono";
import { z } from "zod";
import { apiError } from "../api/errors";
import { requireAdmin } from "../api/guards";
import { circleStub } from "../api/circles";
import { nowIso, type AppEnv } from "../types";

/**
 * Báo cáo vi phạm cho quản trị viên (T084, FR-028, research.md §R11).
 * - `overdue` = báo cáo mở quá 12 giờ (trang admin tô đỏ để kịp xử lý trong 24 giờ).
 * - Xử lý: hide (ẩn tin ở mọi người) | suspend (khóa N ngày, ẩn tin) | ban (khóa vĩnh viễn, ẩn tin) | none (bỏ qua).
 */

export const OVERDUE_MS = 12 * 3600 * 1000;

const ActionBody = z.object({
  action: z.enum(["hide", "suspend", "ban", "none"]),
  days: z.number().int().min(1).max(365).optional(),
});

export function registerAdminReports(app: Hono<AppEnv>) {
  app.get("/admin/api/reports", requireAdmin, async (c) => {
    const status = c.req.query("status") ?? "open";
    if (!["open", "actioned", "dismissed"].includes(status)) return apiError(c, "VALIDATION", 400);
    const { results } = await c.env.DB.prepare(
      `SELECT r.id, r.reporter_id, r.reported_user_id, u.nickname AS reported_nickname, r.context, r.message_snapshot,
              r.reason, r.status, r.action, r.handled_at, r.created_at
         FROM reports r JOIN users u ON u.id = r.reported_user_id
        WHERE r.status = ? ORDER BY r.created_at ASC LIMIT 200`,
    )
      .bind(status)
      .all<Record<string, unknown> & { context: string; created_at: string }>();
    const now = Date.now();
    return c.json(
      results.map((r) => ({
        ...r,
        context: JSON.parse(r.context),
        overdue: status === "open" && now - Date.parse(r.created_at) > OVERDUE_MS,
      })),
    );
  });

  app.post("/admin/api/reports/:id/action", requireAdmin, async (c) => {
    const parsed = ActionBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return apiError(c, "VALIDATION", 400);
    const { action, days } = parsed.data;
    if (action === "suspend" && !days) return apiError(c, "VALIDATION", 400, { fields: ["days"] });
    const report = await c.env.DB.prepare("SELECT id, reported_user_id, context, status FROM reports WHERE id = ?")
      .bind(c.req.param("id"))
      .first<{ id: string; reported_user_id: string; context: string; status: string }>();
    if (!report) return apiError(c, "NOT_FOUND", 404);
    if (report.status !== "open") return apiError(c, "CONFLICT", 409);
    const ctx = JSON.parse(report.context) as { circleId: string; messageId: string };

    if (action !== "none") await circleStub(c.env, ctx.circleId).hide(ctx.messageId);
    if (action === "suspend" || action === "ban") {
      const until = action === "suspend" ? new Date(Date.now() + days! * 86400_000).toISOString() : null;
      await c.env.DB.prepare("UPDATE users SET status = ?, suspended_until = ? WHERE id = ? AND role <> 'admin'")
        .bind(action === "ban" ? "banned" : "suspended", until, report.reported_user_id)
        .run();
      // Ngắt ngay khỏi mọi vòng đang ngồi.
      const { results } = await c.env.DB.prepare("SELECT id FROM circles").all<{ id: string }>();
      await Promise.all(results.map((r) => circleStub(c.env, r.id).kick(report.reported_user_id, action === "ban" ? "BANNED" : "SUSPENDED")));
    }
    // Mọi báo cáo khác về cùng tin cũng được đóng theo.
    await c.env.DB.prepare(
      "UPDATE reports SET status = ?, action = ?, handled_by = ?, handled_at = ? WHERE status = 'open' AND (id = ? OR context = ?)",
    )
      .bind(action === "none" ? "dismissed" : "actioned", action, c.get("user")!.id, nowIso(), report.id, report.context)
      .run();
    return c.json({ ok: true });
  });
}
