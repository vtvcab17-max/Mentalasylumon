import { getSettings } from "../db/settings";
import type { Env } from "../env";
import { nowIso } from "../types";
import { vnDay } from "./time";

/**
 * Sổ cái điểm cống hiến (T005, research.md R2, FR-004/FR-005/FR-008).
 * - Mỗi khoản có `dedupeKey`: cùng khóa chỉ được ghi một lần (hai thiết bị, gửi lại…).
 * - Cắt theo giới hạn ngày; đã đủ thì ghi 0 điểm (việc vẫn tính là đã làm).
 * - Không bao giờ trừ điểm.
 */

export type PointSource = "quest" | "chain" | "minigame" | "weekly" | "thank";

export async function ensureProgress(db: D1Database, userId: string) {
  await db.prepare("INSERT OR IGNORE INTO user_progress (user_id, updated_at) VALUES (?, ?)").bind(userId, nowIso()).run();
}

export async function todayPoints(db: D1Database, userId: string, day = vnDay()): Promise<number> {
  const r = await db.prepare("SELECT COALESCE(SUM(points), 0) AS p FROM points_ledger WHERE user_id = ? AND day = ?").bind(userId, day).first<{ p: number }>();
  return r?.p ?? 0;
}

/** Trả về số điểm thực nhận (0 nếu trùng hoặc đã đủ giới hạn ngày); `null` nếu khoản này đã có từ trước. */
export async function award(
  env: Pick<Env, "DB">,
  userId: string,
  entry: { source: PointSource; dedupeKey: string; points: number },
  now = new Date(),
): Promise<number | null> {
  const db = env.DB;
  const day = vnDay(now);
  await ensureProgress(db, userId);
  const { daily_point_cap } = await getSettings(db);
  const room = Math.max(0, daily_point_cap - (await todayPoints(db, userId, day)));
  const points = Math.max(0, Math.min(entry.points, room, 100));
  const res = await db
    .prepare("INSERT INTO points_ledger (id, user_id, day, source, dedupe_key, points, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT (user_id, dedupe_key) DO NOTHING")
    .bind(crypto.randomUUID(), userId, day, entry.source, entry.dedupeKey, points, now.toISOString())
    .run();
  if (!res.meta.changes) return null;
  await db
    .prepare(
      `UPDATE user_progress SET total_points = total_points + ?,
         active_days = active_days + (CASE WHEN last_active_day IS NULL OR last_active_day <> ? THEN 1 ELSE 0 END),
         last_active_day = ?, updated_at = ? WHERE user_id = ?`,
    )
    .bind(points, day, day, now.toISOString(), userId)
    .run();
  return points;
}
