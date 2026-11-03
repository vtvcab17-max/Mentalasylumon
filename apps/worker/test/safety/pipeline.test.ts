import { describe, expect, it, vi } from "vitest";
import { moderatePublic, respondSafely, type SafetyDeps } from "../../src/safety/pipeline";
import { toPublic, type ResourceRow } from "../../src/safety/resources";

const rows: ResourceRow[] = [
  { id: "emergency-115", name_vi: "Cấp cứu y tế", name_en: "Medical emergency", phone: "115", url: null, scope: "emergency", schedule: null, locales: '["vi","en"]', sort: 10 },
  { id: "hope", name_vi: "HOPE", name_en: "HOPE", phone: "086 50 444 00", url: null, scope: "crisis", schedule: null, locales: '["vi","en"]', sort: 40 },
];

// Không có API key → lớp phân loại AI "lỗi" → phải rơi về `concern` (Constitution I).
function deps(onFlag = vi.fn()): SafetyDeps {
  return {
    ai: { ANTHROPIC_API_KEY: "", AI_GATEWAY_ACCOUNT_ID: "", AI_GATEWAY_ID: "x" },
    classifierModel: "test",
    loadResources: async (l) => toPublic(rows, l, new Date()),
    onFlag,
  };
}

describe("safety/pipeline (T032)", () => {
  it("acute theo từ khóa → mẫu khủng hoảng, KHÔNG gọi model trò chuyện, có cờ", async () => {
    const generate = vi.fn();
    const onFlag = vi.fn();
    const r = await respondSafely(deps(onFlag), { text: "tối nay tôi sẽ tự tử", locale: "vi" }, generate);
    expect(r.kind).toBe("crisis");
    expect(generate).not.toHaveBeenCalled();
    expect(onFlag).toHaveBeenCalledWith(expect.objectContaining({ level: "acute", category: "suicide" }));
    if (r.kind === "crisis") expect(r.message).toContain("086 50 444 00");
  });

  it("AI phân loại lỗi → không bao giờ coi là an toàn: mức tối thiểu concern, kèm tài nguyên", async () => {
    const r = await respondSafely(deps(), { text: "hôm nay trời đẹp", locale: "vi" }, async () => "Thật tuyệt!");
    expect(r.kind).toBe("reply");
    if (r.kind === "reply") {
      expect(r.level).toBe("concern");
      expect(r.resources?.length).toBeGreaterThan(0);
    }
  });

  it("câu trả lời có liều thuốc → tạo lại; vẫn vi phạm → câu dự phòng an toàn", async () => {
    const generate = vi.fn(async () => "Bạn thử uống sertraline 50 mg mỗi sáng.");
    const r = await respondSafely(deps(), { text: "mình nên uống thuốc gì?", locale: "vi" }, generate);
    expect(generate).toHaveBeenCalledTimes(2);
    if (r.kind === "reply") {
      expect(r.text).not.toMatch(/50 mg/);
      expect(r.text).toMatch(/chuyên gia/);
      expect(r.violationsSeen).toContain("medication_dose");
    }
  });

  it("số điện thoại do AI viết bị xóa và thay bằng tài nguyên thật", async () => {
    const r = await respondSafely(deps(), { text: "mình buồn", locale: "vi" }, async () => "Bạn gọi 0909 123 456 nhé.");
    if (r.kind === "reply") {
      expect(r.text).not.toContain("0909");
      expect(r.resources).not.toBeNull();
    }
  });

  it("lỗi tạo cờ không làm hỏng phản hồi", async () => {
    const r = await respondSafely(
      deps(vi.fn(async () => { throw new Error("db down"); })),
      { text: "tối nay tôi sẽ tự tử", locale: "vi" },
      vi.fn(),
    );
    expect(r.kind).toBe("crisis");
  });
});

describe("safety/moderatePublic", () => {
  it("phân loại lỗi → không phát tin công khai", async () => {
    const r = await moderatePublic(deps(), "chào mọi người", "vi");
    expect(r.action).toBe("block");
  });

  it("tin khủng hoảng → chặn công khai và gửi hỗ trợ riêng cho người gửi", async () => {
    const r = await moderatePublic(deps(), "tối nay tôi sẽ tự tử", "vi");
    expect(r.action).toBe("block");
    expect(r.support?.message).toContain("115");
  });
});
