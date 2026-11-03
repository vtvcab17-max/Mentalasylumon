import { describe, expect, it } from "vitest";
import { normalize, scanKeywords } from "../../src/safety/keywords";

describe("safety/keywords (T024)", () => {
  it.each([
    "Tôi muốn tự tử",
    "toi muon tu tu",
    "mình ko muốn sống nữa",
    "minh k muon song nua",
    "tôi muốn chết quách cho xong",
    "chắc tối nay mình sẽ kết thúc cuộc đời",
    "I want to kill myself",
    "i dont want to live anymore",
    "thinking about ending my life",
    "kms",
  ])("bắt được ý định tự tử: %s", (text) => {
    const r = scanKeywords(text);
    expect(r.level).not.toBe("none");
    expect(["suicide", "self_harm"]).toContain(r.category);
  });

  it.each(["mình lại tự làm đau bản thân rồi", "minh lai rach tay", "I've been cutting myself again", "i keep hurting myself"])(
    "bắt được tự hại: %s",
    (text) => {
      expect(scanKeywords(text).category).toBe("self_harm");
    },
  );

  it.each(["tôi bị bạo hành ở nhà", "anh ấy đánh tôi mỗi tối", "I'm being abused"])("bắt được bị xâm hại: %s", (text) => {
    expect(scanKeywords(text).category).toBe("abuse");
  });

  it("ý định cụ thể (có thời điểm/kế hoạch) được coi là acute", () => {
    expect(scanKeywords("tối nay tôi sẽ tự tử").level).toBe("acute");
    expect(scanKeywords("I'm going to kill myself tonight").level).toBe("acute");
  });

  it.each([
    "từ từ thôi, không cần vội",
    "tu tu roi minh lam",
    "hôm nay mệt chết đi được",
    "cười muốn chết với clip này",
    "this movie is killing me lol",
    "mình mất ngủ mấy hôm nay",
    "I'm stressed about exams",
    "nhân viên mới rất dễ thương",
  ])("không báo nhầm câu bình thường: %s", (text) => {
    expect(scanKeywords(text).level).toBe("none");
  });

  it("chuẩn hóa: bỏ dấu, đ→d, chữ thường, gộp khoảng trắng", () => {
    expect(normalize("  Đừng   LO lắng!! ")).toBe("dung lo lang");
  });
});
