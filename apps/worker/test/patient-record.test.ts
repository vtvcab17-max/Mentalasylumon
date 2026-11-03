import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import type { PatientRecord } from "../src/do/patient-record";

function record(name = crypto.randomUUID()) {
  return env.PATIENT_RECORD.get(env.PATIENT_RECORD.idFromName(name)) as DurableObjectStub<PatientRecord>;
}

describe("PatientRecord (T041)", () => {
  it("giới hạn lượt hỏi mỗi ngày", async () => {
    const r = record();
    for (let i = 1; i <= 3; i++) expect(await r.reserveMessage("2026-11-04", 3)).toEqual({ ok: true, used: i });
    expect(await r.reserveMessage("2026-11-04", 3)).toEqual({ ok: false, used: 3 });
    // Ngày mới thì có lượt mới.
    expect((await r.reserveMessage("2026-11-05", 3)).ok).toBe(true);
  });

  it("gửi đồng thời cũng không vượt giới hạn", async () => {
    const r = record();
    const res = await Promise.all(Array.from({ length: 25 }, () => r.reserveMessage("2026-11-04", 20)));
    expect(res.filter((x) => x.ok)).toHaveLength(20);
  });

  it("lưu cuộc trò chuyện và tin nhắn, đọc lại theo thứ tự, xóa từng cuộc và xóa hết", async () => {
    const r = record();
    const c1 = await r.createConversation("dr-an");
    const c2 = await r.createConversation("dr-mai");
    await r.appendMessage(c1, "user", "cipher-1", "vi", "none");
    await r.appendMessage(c1, "doctor", "cipher-2", "vi", "none");
    expect((await r.recentMessages(c1, 20)).map((m) => m.content)).toEqual(["cipher-1", "cipher-2"]);
    expect((await r.listConversations()).map((c) => c.id).sort()).toEqual([c1, c2].sort());

    await r.deleteConversation(c1);
    expect(await r.recentMessages(c1, 20)).toEqual([]);
    expect((await r.listConversations()).map((c) => c.id)).toEqual([c2]);

    await r.deleteAll();
    expect(await r.listConversations()).toEqual([]);
  });

  it("câu hỏi 'được lắng nghe' chỉ hỏi một lần mỗi cuộc", async () => {
    const r = record();
    const c = await r.createConversation("dr-an");
    expect(await r.markFeedback(c)).toBe(true);
    expect(await r.markFeedback(c)).toBe(false);
  });
});
