import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { decrypt, encrypt } from "../src/crypto/aes";

describe("crypto/aes (T014)", () => {
  it("mã hóa rồi giải mã ra đúng nội dung, kể cả tiếng Việt", async () => {
    const text = "Dạo này mình mất ngủ và thấy rất mệt.";
    const sealed = await encrypt(env.CHAT_ENCRYPTION_KEY, text);
    expect(sealed).not.toContain("mất ngủ");
    expect(await decrypt(env.CHAT_ENCRYPTION_KEY, sealed)).toBe(text);
  });

  it("mỗi lần mã hóa dùng IV khác nhau", async () => {
    const a = await encrypt(env.CHAT_ENCRYPTION_KEY, "giống nhau");
    const b = await encrypt(env.CHAT_ENCRYPTION_KEY, "giống nhau");
    expect(a).not.toBe(b);
  });

  it("sai khóa thì không giải mã được", async () => {
    const sealed = await encrypt(env.CHAT_ENCRYPTION_KEY, "bí mật");
    const otherKey = btoa(String.fromCharCode(...new Uint8Array(32).fill(7)));
    await expect(decrypt(otherKey, sealed)).rejects.toThrow();
  });

  it("từ chối khóa không đủ 32 byte", async () => {
    await expect(encrypt(btoa("short"), "x")).rejects.toThrow(/32/);
  });
});
