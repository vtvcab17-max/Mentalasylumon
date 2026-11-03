import { encrypt } from "../crypto/aes";
import { chatKey } from "../do/key-vault";
import { getSettings } from "../db/settings";
import type { Env } from "../env";
import { nowIso } from "../types";
import type { FlagCategory } from "./pipeline";

/**
 * Cờ khủng hoảng (T033, FR-018, Constitution III). `excerpt` chỉ gồm tin bị gắn cờ, phản hồi an toàn và
 * tối đa 2 tin liền trước — luôn mã hóa. Webhook chỉ báo "có cờ mới", không bao giờ gửi nội dung.
 */

export interface NewFlag {
  userId: string;
  source: "doctor_chat" | "circle" | "lecture_qa";
  level: "concern" | "acute";
  category: FlagCategory;
  excerpt: { previous?: { role: string; text: string }[]; message: string; reply: string };
}

export async function createFlag(env: Pick<Env, "DB" | "CHAT_ENCRYPTION_KEY" | "KEY_VAULT">, flag: NewFlag): Promise<string> {
  const id = crypto.randomUUID();
  const excerpt = {
    previous: (flag.excerpt.previous ?? []).slice(-2),
    message: flag.excerpt.message,
    reply: flag.excerpt.reply,
  };
  await env.DB.prepare(
    "INSERT INTO crisis_flags (id, user_id, source, level, category, excerpt, status, created_at) VALUES (?, ?, ?, ?, ?, ?, 'open', ?)",
  )
    .bind(id, flag.userId, flag.source, flag.level, flag.category, await encrypt(await chatKey(env), JSON.stringify(excerpt)), nowIso())
    .run();
  return id;
}

/** Gọi trong ctx.waitUntil để không làm chậm phản hồi. */
export async function notifyAdmins(db: D1Database, flag: { id: string; level: string; source: string }): Promise<void> {
  const { admin_webhook_url } = await getSettings(db);
  if (!admin_webhook_url) return;
  const text = `🚩 Cờ ${flag.level === "acute" ? "KHẨN" : "cần chú ý"} mới (${flag.source}) — mở trang quản trị để xem. ID: ${flag.id}`;
  await fetch(admin_webhook_url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    // Tương thích cả Discord (content) và Telegram/Slack-style (text).
    body: JSON.stringify({ content: text, text }),
  }).catch((e) => console.error("admin webhook failed", e));
}
