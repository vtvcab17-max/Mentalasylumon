import { env, SELF } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import { findOrCreateUser } from "../src/auth/google";
import { decrypt } from "../src/crypto/aes";
import { createFlag } from "../src/safety/flags";

beforeAll(async () => {
  await env.DB.batch([
    env.DB.prepare(
      `INSERT OR REPLACE INTO support_resources (id,name_vi,name_en,phone,url,scope,schedule,is_free,locales,verified_at,sort)
       VALUES ('emergency-115','Cấp cứu y tế','Medical emergency','115',NULL,'emergency',NULL,1,'["vi","en"]','2026-08-31',10)`,
    ),
    env.DB.prepare(
      `INSERT OR REPLACE INTO support_resources (id,name_vi,name_en,phone,url,scope,schedule,is_free,locales,verified_at,sort)
       VALUES ('find-a-helpline','Danh bạ quốc tế','Find A Helpline',NULL,'https://findahelpline.com','international',NULL,1,'["en"]','2026-11-03',90)`,
    ),
  ]);
});

describe("GET /api/support-resources (T035)", () => {
  it("trả theo ngôn ngữ; danh bạ quốc tế chỉ có ở bản tiếng Anh", async () => {
    const vi = (await (await SELF.fetch("https://x.test/api/support-resources?lang=vi")).json()) as { resources: { id: string; name: string }[] };
    const en = (await (await SELF.fetch("https://x.test/api/support-resources?lang=en")).json()) as { resources: { id: string; name: string }[] };
    // Storage dùng chung giữa các file test, nên chỉ kiểm các mục của test này.
    expect(vi.resources.map((r) => r.id)).toContain("emergency-115");
    expect(vi.resources.map((r) => r.id)).not.toContain("find-a-helpline");
    expect(vi.resources.find((r) => r.id === "emergency-115")!.name).toBe("Cấp cứu y tế");
    expect(en.resources.map((r) => r.id)).toEqual(expect.arrayContaining(["emergency-115", "find-a-helpline"]));
  });

  it("không cần đăng nhập và cho phép cache", async () => {
    const res = await SELF.fetch("https://x.test/api/support-resources");
    expect(res.status).toBe(200);
    expect(res.headers.get("Cache-Control")).toContain("max-age=300");
  });
});

describe("bảo vệ request (T017, T018)", () => {
  it("POST thiếu X-Requested-With bị chặn (CSRF)", async () => {
    const res = await SELF.fetch("https://x.test/api/me/locale", { method: "PUT", body: "{}" });
    expect(res.status).toBe(403);
    expect(await res.json()).toMatchObject({ error: { code: "CSRF" } });
  });

  it("WebSocket khi chưa đăng nhập → 401, thông báo theo ngôn ngữ", async () => {
    const res = await SELF.fetch("https://x.test/ws/zone/lobby-1?lang=en", { headers: { Upgrade: "websocket" } });
    expect(res.status).toBe(401);
    expect(await res.json()).toMatchObject({ error: { code: "UNAUTHENTICATED", message: "Please sign in to continue." } });
  });

  it("/api/config trả Client ID công khai (không có secret nào)", async () => {
    const res = await SELF.fetch("https://x.test/api/config");
    expect(await res.json()).toEqual({ googleClientId: "test-client" });
  });

  it("ID token giả bị từ chối", async () => {
    const res = await SELF.fetch("https://x.test/auth/google/token", {
      method: "POST",
      headers: { "X-Requested-With": "bvo", "content-type": "application/json" },
      body: JSON.stringify({ credential: "eyJhbGciOiJSUzI1NiJ9.e30.c2lnbmF0dXJlLWdpYS1tYW8tcGhvbmc", locale: "vi" }),
    });
    expect(res.status).toBe(401);
  });

  it("đăng nhập bằng token phải có header chống CSRF", async () => {
    const res = await SELF.fetch("https://x.test/auth/google/token", { method: "POST", body: "{}" });
    expect(res.status).toBe(403);
  });
});

describe("tài khoản và cờ (T016, T033)", () => {
  it("findOrCreateUser: cùng Google sub → cùng tài khoản", async () => {
    const a = await findOrCreateUser(env.DB, "sub-1", "a@example.com", "vi");
    const b = await findOrCreateUser(env.DB, "sub-1", "a@example.com", "vi");
    expect(a).toBe(b);
  });

  it("excerpt của cờ được mã hóa; nhật ký xem cờ không sửa/xóa được", async () => {
    const userId = await findOrCreateUser(env.DB, "sub-flag", "f@example.com", "vi");
    const id = await createFlag(env, {
      userId,
      source: "doctor_chat",
      level: "acute",
      category: "suicide",
      excerpt: { message: "tin nhắn gốc", reply: "phản hồi an toàn" },
    });
    const row = await env.DB.prepare("SELECT excerpt FROM crisis_flags WHERE id = ?").bind(id).first<{ excerpt: string }>();
    expect(row!.excerpt).not.toContain("tin nhắn gốc");
    expect(JSON.parse(await decrypt(env.CHAT_ENCRYPTION_KEY!, row!.excerpt)).message).toBe("tin nhắn gốc");

    await env.DB.prepare("INSERT INTO flag_access_log (id, flag_id, admin_user_id, action, at) VALUES ('l1', ?, ?, 'view', '2026-11-04')")
      .bind(id, userId)
      .run();
    await expect(env.DB.prepare("DELETE FROM flag_access_log WHERE id = 'l1'").run()).rejects.toThrow(/append-only/);
  });
});
