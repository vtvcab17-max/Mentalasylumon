/** Ngày/tuần theo giờ Việt Nam (UTC+7, không có giờ mùa hè) — specs/002-ranks-quests/research.md R3. */

const VN_OFFSET = 7 * 3600_000;
const DAY = 86400_000;

/** "YYYY-MM-DD" theo giờ VN. */
export function vnDay(d: Date = new Date()): string {
  return new Date(d.getTime() + VN_OFFSET).toISOString().slice(0, 10);
}

/** Tuần ISO theo giờ VN, dạng "2026-W46". */
export function vnWeek(d: Date = new Date()): string {
  const local = new Date(d.getTime() + VN_OFFSET);
  const t = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
  const dow = t.getUTCDay() || 7; // thứ Hai = 1 … Chủ Nhật = 7
  t.setUTCDate(t.getUTCDate() + 4 - dow); // thứ Năm cùng tuần quyết định năm ISO
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const week = Math.ceil(((t.getTime() - yearStart) / DAY + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

/** Thứ Hai 00:00 giờ VN của tuần ISO, trả về thời điểm UTC. */
export function weekStart(week: string): Date {
  const m = week.match(/^(\d{4})-W(\d{2})$/);
  if (!m) throw new Error(`bad week ${week}`);
  const year = Number(m[1]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const monday = Date.UTC(year, 0, 4 - ((jan4.getUTCDay() || 7) - 1)) + (Number(m[2]) - 1) * 7 * DAY;
  return new Date(monday - VN_OFFSET);
}

export function nextWeek(week: string): string {
  return vnWeek(new Date(weekStart(week).getTime() + 7 * DAY + 3600_000));
}

/**
 * Mốc của kỳ bầu cử tuần `week` (giờ VN): ứng cử T5 00:00 → T6 23:59, bỏ phiếu T7 00:00 → CN 20:00,
 * công bố CN 20:00, nhiệm kỳ tuần kế tiếp T2 00:00 → CN 23:59.
 */
export function weekSchedule(week: string) {
  const mon = weekStart(week).getTime();
  const at = (days: number, hours = 0) => new Date(mon + days * DAY + hours * 3600_000).toISOString();
  return {
    nominateFrom: at(3),
    nominateTo: at(5),
    voteFrom: at(5),
    voteTo: at(6, 20),
    termFrom: at(7),
    termTo: at(14),
    termWeek: nextWeek(week),
  };
}
