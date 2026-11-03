import type { SupportResource } from "@bvo/shared";

/** Đường dây nóng từ bảng `support_resources` (research.md §R8). Không bao giờ do AI viết. */

export interface ResourceRow {
  id: string;
  name_vi: string;
  name_en: string;
  phone: string | null;
  url: string | null;
  scope: SupportResource["scope"];
  schedule: string | null;
  locales: string;
  sort: number;
}

export interface Schedule {
  days: number[]; // 0 = Chủ nhật
  from: string; // "HH:MM"
  to: string;
  tz: "Asia/Ho_Chi_Minh";
}

const VN_OFFSET_MIN = 7 * 60; // Việt Nam không có giờ mùa hè.

function vnClock(now: Date) {
  const vn = new Date(now.getTime() + VN_OFFSET_MIN * 60_000);
  return { day: vn.getUTCDay(), minutes: vn.getUTCHours() * 60 + vn.getUTCMinutes() };
}

const toMin = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

export function isOnDuty(schedule: Schedule | null, now: Date): boolean {
  if (!schedule) return true;
  const { day, minutes } = vnClock(now);
  return schedule.days.includes(day) && minutes >= toMin(schedule.from) && minutes < toMin(schedule.to);
}

/** Lần mở cửa gần nhất trong 7 ngày tới: { dayOffset, from }. */
export function nextOpening(schedule: Schedule, now: Date): { dayOffset: number; from: string } | null {
  const { day, minutes } = vnClock(now);
  for (let off = 0; off < 8; off++) {
    const d = (day + off) % 7;
    if (!schedule.days.includes(d)) continue;
    if (off === 0 && minutes >= toMin(schedule.from)) continue;
    return { dayOffset: off, from: schedule.from };
  }
  return null;
}

const DAY_NAMES = {
  vi: ["CN", "T2", "T3", "T4", "T5", "T6", "T7"],
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
};

export function hoursText(schedule: Schedule | null, locale: "vi" | "en"): string {
  if (!schedule) return "24/7";
  const days =
    schedule.days.length === 7 ? (locale === "vi" ? "hằng ngày" : "daily") : schedule.days.map((d) => DAY_NAMES[locale][d]).join(", ");
  return `${schedule.from}–${schedule.to} ${days}`;
}

export function parseSchedule(raw: string | null): Schedule | null {
  return raw ? (JSON.parse(raw) as Schedule) : null;
}

export function toPublic(rows: ResourceRow[], locale: "vi" | "en", now: Date): SupportResource[] {
  return rows
    .filter((r) => (JSON.parse(r.locales) as string[]).includes(locale))
    .sort((a, b) => a.sort - b.sort)
    .map((r) => {
      const schedule = parseSchedule(r.schedule);
      return {
        id: r.id,
        name: locale === "vi" ? r.name_vi : r.name_en,
        phone: r.phone,
        url: r.url,
        scope: r.scope,
        hours: hoursText(schedule, locale),
        onDutyNow: isOnDuty(schedule, now),
        nextOpening: schedule && !isOnDuty(schedule, now) ? nextOpening(schedule, now) : null,
      };
    });
}

export async function loadResourceRows(db: D1Database): Promise<ResourceRow[]> {
  const { results } = await db
    .prepare("SELECT id, name_vi, name_en, phone, url, scope, schedule, locales, sort FROM support_resources ORDER BY sort")
    .all<ResourceRow>();
  return results;
}
