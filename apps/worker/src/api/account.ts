import { DeleteAccountBody } from "@bvo/shared";
import type { Hono } from "hono";
import { deleteCookie } from "hono/cookie";
import { D1IdentityStore } from "../identity/identity-store";
import { nowIso, type AppEnv } from "../types";
import { releaseRoom } from "../world/rooms";
import { SESSION_COOKIE } from "../auth/session";
import { apiError } from "./errors";
import { requireUser } from "./guards";
import { recordOf } from "./conversations";

/**
 * DELETE /api/me (T053, FR-005, SC-008): ẩn tài khoản ngay, xóa lịch sử trò chuyện ngay, giải phóng phòng,
 * xóa phiên. Phần còn lại (hàng users, cờ, đồng ý) bị xóa hẳn bởi cron trong ≤ 30 ngày (T100).
 */
export function registerAccount(app: Hono<AppEnv>) {
  app.delete("/api/me", requireUser, async (c) => {
    const parsed = DeleteAccountBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return apiError(c, "VALIDATION", 400);
    const user = c.get("user")!;

    await recordOf(c, user.id).deleteAll();
    await new D1IdentityStore(c.env.DB).delete(user.id);
    await releaseRoom(c.env.DB, user.id);
    await c.env.DB.batch([
      c.env.DB.prepare("UPDATE users SET status = 'deleted', nickname = NULL, nickname_lc = NULL, avatar = NULL, last_seen_at = ? WHERE id = ?").bind(nowIso(), user.id),
      c.env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(user.id),
      c.env.DB.prepare("DELETE FROM blocks WHERE blocker_id = ? OR blocked_id = ?").bind(user.id, user.id),
    ]);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.body(null, 202);
  });
}
