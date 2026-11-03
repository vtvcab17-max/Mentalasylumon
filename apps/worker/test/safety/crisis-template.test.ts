import { describe, expect, it } from "vitest";
import { buildCrisisResponse } from "../../src/safety/crisis-template";
import { isOnDuty, toPublic, type ResourceRow } from "../../src/safety/resources";

const rows: ResourceRow[] = [
  { id: "emergency-115", name_vi: "Cấp cứu y tế", name_en: "Medical emergency", phone: "115", url: null, scope: "emergency", schedule: null, locales: '["vi","en"]', sort: 10 },
  {
    id: "ngay-mai", name_vi: "Đường dây nóng Ngày Mai", name_en: "Ngày Mai Hotline", phone: "096 306 1414", url: null, scope: "crisis",
    schedule: '{"days":[3,4,5,6,0],"from":"13:00","to":"20:30","tz":"Asia/Ho_Chi_Minh"}', locales: '["vi","en"]', sort: 30,
  },
  {
    id: "hope", name_vi: "Hy Vọng Sống (HOPE)", name_en: "HOPE", phone: "086 50 444 00", url: null, scope: "crisis",
    schedule: '{"days":[0,1,2,3,4,5,6],"from":"16:30","to":"20:30","tz":"Asia/Ho_Chi_Minh"}', locales: '["vi","en"]', sort: 40,
  },
  { id: "find-a-helpline", name_vi: "Danh bạ quốc tế", name_en: "Find A Helpline", phone: null, url: "https://findahelpline.com", scope: "international", schedule: null, locales: '["en"]', sort: 90 },
];

// 2026-11-04 là thứ Tư. 18:00 giờ VN = 11:00 UTC.
const wed1800 = new Date("2026-11-04T11:00:00Z");
// Thứ Hai 2026-11-02, 10:00 giờ VN = 03:00 UTC: mọi đường dây khủng hoảng đều ngoài giờ.
const mon1000 = new Date("2026-11-02T03:00:00Z");

describe("safety/resources", () => {
  it("tính giờ trực theo giờ Việt Nam", () => {
    const ngayMai = JSON.parse(rows[1].schedule!);
    expect(isOnDuty(ngayMai, wed1800)).toBe(true);
    expect(isOnDuty(ngayMai, mon1000)).toBe(false); // thứ Hai nghỉ
    expect(isOnDuty(null, mon1000)).toBe(true); // 24/7
  });
});

describe("safety/crisis-template (T025)", () => {
  it("số điện thoại chỉ đến từ danh sách tài nguyên, không thêm số nào khác", () => {
    const res = buildCrisisResponse("vi", toPublic(rows, "vi", wed1800), wed1800);
    const digits = res.message.match(/\d[\d ]{2,}\d/g) ?? [];
    const allowed = rows.map((r) => r.phone).filter(Boolean);
    for (const d of digits) expect(allowed).toContain(d.trim());
    expect(res.message).toContain("115");
    expect(res.message).toContain("096 306 1414");
    expect(res.message).toContain("086 50 444 00");
  });

  it("ngoài giờ: không liệt kê đường dây đang đóng, nhắc gọi 115 và giờ mở tiếp theo", () => {
    const res = buildCrisisResponse("vi", toPublic(rows, "vi", mon1000), mon1000);
    expect(res.message).not.toContain("096 306 1414");
    expect(res.message).toContain("115");
    expect(res.message).toMatch(/ngoài giờ/);
    expect(res.message).toMatch(/16:30/); // HOPE mở lại sớm nhất hôm nay
  });

  it("bản tiếng Việt không có danh bạ quốc tế", () => {
    const res = buildCrisisResponse("vi", toPublic(rows, "vi", wed1800), wed1800);
    expect(res.message).not.toContain("findahelpline");
    expect(res.resources.find((r) => r.scope === "international")).toBeUndefined();
  });

  it("bản tiếng Anh có đường dẫn quốc tế và câu chữ tiếng Anh", () => {
    const res = buildCrisisResponse("en", toPublic(rows, "en", wed1800), wed1800);
    expect(res.message).toContain("https://findahelpline.com");
    expect(res.message).toMatch(/I'm an AI/);
  });

  it("luôn nói rõ là AI", () => {
    expect(buildCrisisResponse("vi", toPublic(rows, "vi", wed1800), wed1800).message).toMatch(/Mình là AI/);
  });
});
