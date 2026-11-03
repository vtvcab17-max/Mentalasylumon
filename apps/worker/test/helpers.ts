import { env, SELF } from "cloudflare:test";

export const BASE = "https://x.test";

async function sha256Hex(input: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Tạo user + phiên đăng nhập, trả về header cookie. `onboarded` = đã qua 18+, đồng ý, hồ sơ. */
export async function login(opts: { onboarded?: boolean; locale?: "vi" | "en"; role?: "player" | "admin" } = {}) {
  const id = crypto.randomUUID();
  const token = crypto.randomUUID();
  const now = new Date().toISOString();
  await env.DB.prepare(
    "INSERT INTO users (id, google_sub, email, locale, role, created_at) VALUES (?, ?, ?, ?, ?, ?)",
  )
    .bind(id, `sub-${id}`, `${id}@example.com`, opts.locale ?? "vi", opts.role ?? "player", now)
    .run();
  await env.DB.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)")
    .bind(await sha256Hex(token), id, now, new Date(Date.now() + 86400_000).toISOString())
    .run();
  const cookie = `sid=${token}`;
  if (opts.onboarded) {
    await call(cookie, "POST", "/api/onboarding/age", { isAdult: true });
    await call(cookie, "POST", "/api/onboarding/consent", { termsVersion: "2026-11-v1", items: ALL_CONSENT });
    await call(cookie, "POST", "/api/onboarding/profile", {
      nickname: `n${id.slice(0, 8)}`,
      avatar: AVATAR,
    });
  }
  return { id, cookie };
}

export const ALL_CONSENT = { ai_disclosure: true, sensitive_data: true, admin_flag_review: true, overseas_ai_processing: true };
export const AVATAR = {
  parts: { head: "round", hair: "short", outfit: "hoodie", accessory: null },
  colors: { skin: "#f1c9a5", hair: "#1d1d1d", outfit: "#8fc1b5" },
};

export function call(cookie: string, method: string, path: string, body?: unknown) {
  return SELF.fetch(BASE + path, {
    method,
    headers: { cookie, "X-Requested-With": "bvo", ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}

export async function seedDoctors() {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO doctors (id, name, topic, display, avatar, persona_prompt, active, sort) VALUES
     ('dr-an','An','stress','{"vi":{"title":"Bác sĩ An","bio":"vi"},"en":{"title":"Dr. An","bio":"en"}}','{}','persona',1,10)`,
  ).run();
}

export async function seedResources() {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO support_resources (id,name_vi,name_en,phone,url,scope,schedule,is_free,locales,verified_at,sort) VALUES
     ('emergency-115','Cấp cứu y tế','Medical emergency','115',NULL,'emergency',NULL,1,'["vi","en"]','2026-08-31',10),
     ('child-111','Tổng đài quốc gia bảo vệ trẻ em','National Child Protection Hotline','111',NULL,'youth',NULL,1,'["vi","en"]','2026-08-31',50)`,
  ).run();
}

/** Đọc toàn bộ SSE thành mảng {event, data}. */
export async function readSse(res: Response) {
  const text = await res.text();
  return text
    .split("\n\n")
    .filter(Boolean)
    .map((chunk) => {
      const event = chunk.match(/^event: (.+)$/m)?.[1] ?? "message";
      const data = chunk.match(/^data: (.+)$/m)?.[1];
      return { event, data: data ? JSON.parse(data) : null };
    });
}
