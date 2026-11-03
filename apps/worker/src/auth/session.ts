import type { Context, MiddlewareHandler } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { apiError } from "../api/errors";
import { nowIso, type AppEnv, type UserRow } from "../types";

/** Phiên đăng nhập (T017): cookie `sid`, DB chỉ giữ SHA-256 của token, hạn 30 ngày. */

export const SESSION_COOKIE = "sid";
const SESSION_DAYS = 30;

async function sha256Hex(input: string): Promise<string> {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function randomToken(): string {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function isSecure(c: Context<AppEnv>) {
  return new URL(c.req.url).protocol === "https:";
}

export async function createSession(c: Context<AppEnv>, userId: string): Promise<void> {
  const token = randomToken();
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await c.env.DB.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256Hex(token), userId, nowIso(), expires.toISOString())
    .run();
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isSecure(c),
    sameSite: "Lax",
    path: "/",
    expires,
  });
}

export async function destroySession(c: Context<AppEnv>): Promise<void> {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) await c.env.DB.prepare("DELETE FROM sessions WHERE id = ?").bind(await sha256Hex(token)).run();
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
}

/** Gắn `user` vào context nếu phiên hợp lệ; không chặn request. */
export const loadUser: MiddlewareHandler<AppEnv> = async (c, next) => {
  const token = getCookie(c, SESSION_COOKIE);
  if (token) {
    const user = await c.env.DB.prepare(
      `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ? AND u.status <> 'deleted'`,
    )
      .bind(await sha256Hex(token), nowIso())
      .first<UserRow>();
    if (user) c.set("user", user);
  }
  await next();
};

/** Chống CSRF: request đổi dữ liệu phải có `X-Requested-With: bvo` (contracts/http-api.md). */
export const requireCsrfHeader: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method) && c.req.header("X-Requested-With") !== "bvo") {
    return apiError(c, "CSRF", 403);
  }
  await next();
};
