import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env";

/**
 * KeyVault — giữ khóa mã hóa nội dung trò chuyện, tự tạo lần đầu (không phải đặt secret tay).
 * Khóa nằm trong storage riêng của Durable Object này, tách khỏi D1 và khỏi PatientRecord,
 * nên lộ một nơi không đủ để đọc lịch sử. Nếu đặt secret CHAT_ENCRYPTION_KEY thì secret được ưu tiên.
 * ⚠️ Không xóa object này: mất khóa = không đọc lại được lịch sử cũ.
 */
export class KeyVault extends DurableObject<Env> {
  async chatKey(): Promise<string> {
    let key = await this.ctx.storage.get<string>("chat-key");
    if (!key) {
      const raw = crypto.getRandomValues(new Uint8Array(32));
      key = btoa(String.fromCharCode(...raw));
      await this.ctx.storage.put("chat-key", key);
    }
    return key;
  }
}

let cached: Promise<string> | null = null;

/** Khóa mã hóa trò chuyện: secret nếu có, nếu không thì lấy (hoặc tạo) từ KeyVault. */
export function chatKey(env: Pick<Env, "CHAT_ENCRYPTION_KEY" | "KEY_VAULT">): Promise<string> {
  if (env.CHAT_ENCRYPTION_KEY) return Promise.resolve(env.CHAT_ENCRYPTION_KEY);
  if (!cached) {
    const stub = env.KEY_VAULT.get(env.KEY_VAULT.idFromName("chat")) as DurableObjectStub<KeyVault>;
    cached = stub.chatKey().catch((e) => {
      cached = null;
      throw e;
    });
  }
  return cached;
}
