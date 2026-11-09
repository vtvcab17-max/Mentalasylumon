import { describe, expect, it } from "vitest";
import { nextWeek, vnDay, vnWeek, weekSchedule, weekStart } from "../src/progress/time";

describe("progress/time (T003)", () => {
  it("ngày theo giờ VN đổi lúc 17:00 UTC", () => {
    expect(vnDay(new Date("2026-11-09T16:59:00Z"))).toBe("2026-11-09");
    expect(vnDay(new Date("2026-11-09T17:00:00Z"))).toBe("2026-11-10");
  });

  it("tuần ISO theo giờ VN", () => {
    expect(vnWeek(new Date("2026-11-09T03:00:00Z"))).toBe("2026-W46"); // thứ Hai
    expect(vnWeek(new Date("2026-11-15T16:30:00Z"))).toBe("2026-W46"); // CN 23:30 VN
    expect(vnWeek(new Date("2026-11-15T17:00:00Z"))).toBe("2026-W47"); // T2 00:00 VN
    expect(vnWeek(new Date("2027-01-01T05:00:00Z"))).toBe("2026-W53");
    expect(nextWeek("2026-W52")).toBe("2026-W53");
    expect(nextWeek("2026-W53")).toBe("2027-W01");
  });

  it("thứ Hai 00:00 VN và lịch bầu cử", () => {
    expect(weekStart("2026-W46").toISOString()).toBe("2026-11-08T17:00:00.000Z");
    const s = weekSchedule("2026-W46");
    expect(s.nominateFrom).toBe("2026-11-11T17:00:00.000Z"); // T5 00:00 VN
    expect(s.voteFrom).toBe("2026-11-13T17:00:00.000Z"); // T7 00:00 VN
    expect(s.voteTo).toBe("2026-11-15T13:00:00.000Z"); // CN 20:00 VN
    expect(s.termFrom).toBe("2026-11-15T17:00:00.000Z"); // T2 tuần sau
    expect(s.termWeek).toBe("2026-W47");
  });
});
