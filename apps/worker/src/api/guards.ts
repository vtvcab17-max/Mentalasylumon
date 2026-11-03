import type { MiddlewareHandler } from "hono";
import { getSettings } from "../db/settings";
import type { AppEnv } from "../types";
import { apiError } from "./errors";

/** Cổng truy cập cho API của người chơi (T018, contracts/http-api.md bảng lỗi). */

export const requireUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get("user");
  if (!user) return apiError(c, "UNAUTHENTICATED", 401);
  if (user.status === "banned") return apiError(c, "BANNED", 403);
  if (user.status === "suspended") {
    if (user.suspended_until && user.suspended_until > new Date().toISOString()) {
      return apiError(c, "SUSPENDED", 403, { until: user.suspended_until });
    }
    await c.env.DB.prepare("UPDATE users SET status = 'active', suspended_until = NULL WHERE id = ?").bind(user.id).run();
    user.status = "active";
  }
  await next();
};

/** Đã qua đủ: 18+, đồng ý điều khoản hiện hành, có biệt danh/nhân vật. Dùng sau `requireUser`. */
export const requireOnboarded: MiddlewareHandler<AppEnv> = async (c, next) => {
  const user = c.get("user")!;
  if (!user.age_confirmed_at) return apiError(c, "AGE_REQUIRED", 403);
  const { terms_version } = await getSettings(c.env.DB);
  const consent = await c.env.DB.prepare(
    "SELECT 1 FROM consents WHERE user_id = ? AND terms_version = ? AND withdrawn_at IS NULL LIMIT 1",
  )
    .bind(user.id, terms_version)
    .first();
  if (!consent) return apiError(c, "CONSENT_REQUIRED", 403, { termsVersion: terms_version });
  if (!user.nickname || !user.avatar) return apiError(c, "PROFILE_REQUIRED", 403);
  await next();
};

export const requireAdmin: MiddlewareHandler<AppEnv> = async (c, next) => {
  // Lớp 1 là Cloudflare Access trước /admin/*; lớp 2 là role trong DB (research.md §R12).
  const user = c.get("user");
  if (!user || user.role !== "admin") return apiError(c, "NOT_FOUND", 404);
  await next();
};
