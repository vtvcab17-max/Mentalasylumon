import type { Hono } from "hono";
import { z } from "zod";
import { apiError } from "../api/errors";
import { nowIso, type AppEnv } from "../types";
import { verifyGoogleIdToken, type JwksFetcher } from "./google-id-token";
import { createSession, destroySession, requireCsrfHeader } from "./session";

/**
 * Đăng nhập Google kiểu "Sign in with Google" (giống Vạn Linh Đảo) — chỉ cần GOOGLE_CLIENT_ID (công khai),
 * không cần Client secret. Trình duyệt gửi ID token; server kiểm chữ ký bằng khóa công khai của Google,
 * rồi chỉ lưu `sub` và email đã xác minh (research.md §R4).
 */

const TokenBody = z.object({ credential: z.string().min(20).max(4096), locale: z.enum(["vi", "en"]).default("vi") });

export function registerGoogleAuth(app: Hono<AppEnv>, opts: { jwks?: JwksFetcher } = {}) {
  app.get("/api/config", (c) => c.json({ googleClientId: c.env.GOOGLE_CLIENT_ID || null }));

  app.post("/auth/google/token", requireCsrfHeader, async (c) => {
    if (!c.env.GOOGLE_CLIENT_ID) return apiError(c, "AUTH_FAILED", 503);
    const parsed = TokenBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return apiError(c, "AUTH_FAILED", 400);
    let claims;
    try {
      claims = await verifyGoogleIdToken(parsed.data.credential, c.env.GOOGLE_CLIENT_ID, { jwks: opts.jwks });
    } catch {
      return apiError(c, "AUTH_FAILED", 401);
    }
    const userId = await findOrCreateUser(c.env.DB, claims.sub, claims.email!, parsed.data.locale);
    await createSession(c, userId);
    return c.json({ ok: true });
  });

  app.post("/auth/logout", requireCsrfHeader, async (c) => {
    await destroySession(c);
    return c.body(null, 204);
  });
}

export async function findOrCreateUser(db: D1Database, sub: string, email: string, locale: "vi" | "en") {
  const existing = await db
    .prepare("SELECT id, status FROM users WHERE google_sub = ?")
    .bind(sub)
    .first<{ id: string; status: string }>();
  if (existing && existing.status !== "deleted") {
    await db.prepare("UPDATE users SET email = ?, last_seen_at = ? WHERE id = ?").bind(email, nowIso(), existing.id).run();
    return existing.id;
  }
  if (existing) {
    // Tài khoản đã xóa: tách google_sub cũ để người này đăng ký lại như người mới (SC-008).
    await db.prepare("UPDATE users SET google_sub = ? WHERE id = ?").bind(`deleted:${existing.id}`, existing.id).run();
  }
  const id = crypto.randomUUID();
  await db
    .prepare("INSERT INTO users (id, google_sub, email, locale, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(id, sub, email, locale, nowIso(), nowIso())
    .run();
  return id;
}
