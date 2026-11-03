import { env } from "cloudflare:test";
import { beforeAll, describe, expect, it } from "vitest";
import type { PatientRecord } from "../src/do/patient-record";
import { call, login, readSse, seedDoctors, seedResources } from "./helpers";

beforeAll(async () => {
  await seedResources();
  await seedDoctors();
});

const recordOf = (userId: string) =>
  env.PATIENT_RECORD.get(env.PATIENT_RECORD.idFromName(userId)) as DurableObjectStub<PatientRecord>;

describe("trò chuyện với bác sĩ AI (US1)", () => {
  it("chưa onboarding thì không dùng được", async () => {
    const { cookie } = await login();
    expect((await call(cookie, "GET", "/api/doctors")).status).toBe(403);
  });

  it("danh sách bác sĩ theo ngôn ngữ", async () => {
    const { cookie } = await login({ onboarded: true, locale: "en" });
    const list = (await (await call(cookie, "GET", "/api/doctors")).json()) as { title: string }[];
    expect(list[0].title).toBe("Dr. An");
  });

  it("tin khủng hoảng → sự kiện `crisis` có số từ DB, có cờ, nội dung lưu đã mã hóa", async () => {
    const { id, cookie } = await login({ onboarded: true });
    const conv = (await (await call(cookie, "POST", "/api/conversations", { doctorId: "dr-an" })).json()) as { conversationId: string };
    const res = await call(cookie, "POST", `/api/conversations/${conv.conversationId}/messages`, { text: "tối nay tôi sẽ tự tử" });
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const events = await readSse(res);
    expect(events[0]).toMatchObject({ event: "meta", data: { label: "AI" } });
    const crisis = events.find((e) => e.event === "crisis");
    expect(crisis?.data.message).toContain("115");
    expect(events.at(-1)?.event).toBe("done");

    const flag = await env.DB.prepare("SELECT level, source FROM crisis_flags WHERE user_id = ?").bind(id).first();
    expect(flag).toMatchObject({ level: "acute", source: "doctor_chat" });

    const stored = await recordOf(id).recentMessages(conv.conversationId, 10);
    expect(stored).toHaveLength(2);
    for (const m of stored) expect(m.content).not.toContain("tự tử");

    const page = (await (await call(cookie, "GET", `/api/conversations/${conv.conversationId}/messages`)).json()) as {
      messages: { role: string; text: string }[];
    };
    expect(page.messages[0]).toMatchObject({ role: "user", text: "tối nay tôi sẽ tự tử" });
  });

  it("AI không trả lời được → sự kiện error AI_UNAVAILABLE (nút hỗ trợ vẫn ở client)", async () => {
    const { cookie } = await login({ onboarded: true });
    const conv = (await (await call(cookie, "POST", "/api/conversations", { doctorId: "dr-an" })).json()) as { conversationId: string };
    const events = await readSse(await call(cookie, "POST", `/api/conversations/${conv.conversationId}/messages`, { text: "chào bác sĩ" }));
    expect(events.find((e) => e.event === "error")?.data).toMatchObject({ code: "AI_UNAVAILABLE" });
  });

  it("hết lượt hỏi → 429 DAILY_LIMIT_REACHED", async () => {
    const { cookie } = await login({ onboarded: true });
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('daily_message_limit', '1')").run();
    const conv = (await (await call(cookie, "POST", "/api/conversations", { doctorId: "dr-an" })).json()) as { conversationId: string };
    await readSse(await call(cookie, "POST", `/api/conversations/${conv.conversationId}/messages`, { text: "tối nay tôi sẽ tự tử" }));
    const res = await call(cookie, "POST", `/api/conversations/${conv.conversationId}/messages`, { text: "nữa" });
    expect(res.status).toBe(429);
    expect(await res.json()).toMatchObject({ error: { code: "DAILY_LIMIT_REACHED" } });
    await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('daily_message_limit', '20')").run();
  });

  it("không đọc được cuộc trò chuyện không tồn tại / của người khác", async () => {
    const a = await login({ onboarded: true });
    const b = await login({ onboarded: true });
    const conv = (await (await call(a.cookie, "POST", "/api/conversations", { doctorId: "dr-an" })).json()) as { conversationId: string };
    expect((await call(b.cookie, "GET", `/api/conversations/${conv.conversationId}/messages`)).status).toBe(404);
  });

  it("phản hồi 'được lắng nghe' lưu không kèm user_id, chỉ một lần mỗi cuộc", async () => {
    const { cookie } = await login({ onboarded: true });
    const conv = (await (await call(cookie, "POST", "/api/conversations", { doctorId: "dr-an" })).json()) as { conversationId: string };
    expect((await call(cookie, "POST", "/api/feedback", { conversationId: conv.conversationId, feltHeard: "yes" })).status).toBe(204);
    expect((await call(cookie, "POST", "/api/feedback", { conversationId: conv.conversationId, feltHeard: "no" })).status).toBe(409);
  });

  it("xóa tài khoản → không đăng nhập được nữa, lịch sử mất, phòng được giải phóng", async () => {
    const { id, cookie } = await login({ onboarded: true });
    const conv = (await (await call(cookie, "POST", "/api/conversations", { doctorId: "dr-an" })).json()) as { conversationId: string };
    await readSse(await call(cookie, "POST", `/api/conversations/${conv.conversationId}/messages`, { text: "tối nay tôi sẽ tự tử" }));
    expect((await call(cookie, "DELETE", "/api/me", { confirm: "XOA" })).status).toBe(202);
    expect((await call(cookie, "GET", "/api/me")).status).toBe(401);
    expect(await recordOf(id).listConversations()).toEqual([]);
    const room = await env.DB.prepare("SELECT 1 FROM rooms WHERE owner_user_id = ?").bind(id).first();
    expect(room).toBeNull();
  });
});
