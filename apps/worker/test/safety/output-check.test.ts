import { describe, expect, it } from "vitest";
import { checkOutput } from "../../src/safety/output-check";

describe("safety/output-check (T026)", () => {
  it.each([
    "Bạn có thể uống sertraline 50 mg mỗi sáng.",
    "Thử uống 2 viên thuốc ngủ trước khi đi ngủ nhé.",
    "Take 10mg of diazepam twice a day.",
    "You could try one tablet of melatonin, 3 mg.",
  ])("chặn tên thuốc kèm liều: %s", (text) => {
    const r = checkOutput(text);
    expect(r.ok).toBe(false);
    expect(r.violations).toContain("medication_dose");
  });

  it.each([
    "Theo những gì bạn kể, bạn bị trầm cảm nặng.",
    "Bạn mắc rối loạn lo âu rồi.",
    "It sounds like you have bipolar disorder.",
    "You definitely have PTSD.",
  ])("chặn câu chẩn đoán: %s", (text) => {
    expect(checkOutput(text).violations).toContain("diagnosis");
  });

  it("xóa cả mã ngắn khẩn cấp do AI tự viết (tài nguyên thật được thêm từ DB)", () => {
    const r = checkOutput("Hãy gọi 115 ngay.");
    expect(r.violations).toContain("phone");
    expect(r.sanitized).not.toContain("115");
  });

  it("xóa số điện thoại do AI tự viết", () => {
    const r = checkOutput("Bạn có thể gọi 1900 1234 để được hỗ trợ.");
    expect(r.violations).toContain("phone");
    expect(r.sanitized).not.toMatch(/1900/);
  });

  it.each([
    "Nghe như bạn đang rất mệt mỏi. Bạn có muốn kể thêm về giấc ngủ không?",
    "Một số người thấy hít thở chậm 4 giây vào, 6 giây ra giúp dịu lại.",
    "Nếu buồn kéo dài hơn 2 tuần, bạn nên gặp bác sĩ hoặc chuyên gia tâm lý.",
    "Sinh viên năm nhất thường gặp áp lực thi cử, bạn không đơn độc đâu.",
    "Depression is a common condition, and a professional can help assess what's going on.",
    "Năm 2026 có nhiều thay đổi, hơn 3000 người đã tham gia vòng sinh hoạt.",
    "About 1 in 5 adults experience this at some point.",
    "Có hơn 100 người tham gia buổi nói chuyện tuần trước.",
  ])("cho qua câu trả lời bình thường: %s", (text) => {
    const r = checkOutput(text);
    expect(r.ok).toBe(true);
    expect(r.sanitized).toBe(text);
  });
});
