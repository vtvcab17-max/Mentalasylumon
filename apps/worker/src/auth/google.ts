import { Google, generateCodeVerifier, generateState, decodeIdToken } from "arctic";
import type { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { apiError, requestLocale } from "../api/errors";
import { nowIso, type AppEnv } from "../types";
import { createSession, destroySession } from "./session";

/**
 * Đăng nhập Google — OIDC Authorization Code + PKCE (T016, research.md §R4).
 * Chỉ lưu `sub` và email đã xác minh. ID token nhận trực tiếp từ token endpoint của Google qua TLS,
 * vẫn kiểm iss/aud/exp/email_verified.
 */

const OAUTH_COOKIE = "oauth";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

interface GoogleClaims {
  iss: string;
  aud: string;
  sub: string;
  exp: number;
  email?: string;
  email_verified?: boolean;
}

function client(env: AppEnv["Bindings"], origin: string) {
  return new Google(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, `${origin}/auth/google/callback`);
}

export function registerGoogleAuth(app: Hono<AppEnv>) {
  app.get("/auth/google/start", (c) => {
    const origin = new URL(c.req.url).origin;
    const state = generateState();
    const verifier = generateCodeVerifier();
    const lang = requestLocale(c);
    const url = client(c.env, origin).createAuthorizationURL(state, verifier, ["openid", "email"]);
    url.searchParams.set("prompt", "select_account");
    setCookie(c, OAUTH_COOKIE, JSON.stringify({ state, verifier, lang }), {
      httpOnly: true,
      secure: origin.startsWith("https:"),
      sameSite: "Lax",
      path: "/auth/google",
      maxAge: 600,
    });
    return c.redirect(url.toString(), 302);
  });

  app.get("/auth/google/callback", async (c) => {
    const origin = new URL(c.req.url).origin;
    const raw = getCookie(c, OAUTH_COOKIE);
    deleteCookie(c, OAUTH_COOKIE, { path: "/auth/google" });
    const code = c.req.query("code");
    let saved: { state: string; verifier: string; lang: "vi" | "en" } | null = null;
    try {
      saved = raw ? JSON.parse(raw) : null;
    } catch {
      saved = null;
    }
    if (!code || !saved || c.req.query("state") !== saved.state) return apiError(c, "AUTH_FAILED", 400);

    let claims: GoogleClaims;
    try {
      const tokens = await client(c.env, origin).validateAuthorizationCode(code, saved.verifier);
      claims = decodeIdToken(tokens.idToken()) as GoogleClaims;
    } catch {
      return apiError(c, "AUTH_FAILED", 400);
    }
    const valid =
      ISSUERS.includes(claims.iss) &&
      claims.aud === c.env.GOOGLE_CLIENT_ID &&
      claims.exp * 1000 > Date.now() &&
      claims.email_verified === true &&
      typeof claims.email === "string";
    if (!valid) return apiError(c, "AUTH_FAILED", 400);

    const userId = await findOrCreateUser(c.env.DB, claims.sub, claims.email!, saved.lang);
    await createSession(c, userId);
    return c.redirect("/play", 302);
  });

  app.post("/auth/logout", async (c) => {
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
