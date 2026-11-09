import type { Context } from "hono";
import type { Env } from "../env";
import { award } from "../progress/ledger";
import { vnWeek } from "../progress/time";
import type { AppEnv } from "../types";

/**
 * Viện trưởng (002 US5, FR-022–FR-026, research.md R7): danh sách quyền đóng.
 * Mọi quyền chỉ ghi vào `terms`, `term_actions`, `announcements` — không đọc dữ liệu riêng của ai.
 */

export interface TermRow {
  week: string;
  holder_id: string | null;
  theme_id: string | null;
  decor_id: string | null;
  weekly_quests: string;
  honorary: string;
  ended_reason: string | null;
}

/** Thời điểm "bây giờ"; chỉ test/máy cục bộ (ALLOW_TIME_TRAVEL=1, không phải production) được tua qua header. */
export function clockOf(c: Context<AppEnv>): Date {
  const env = c.env as Env & { ALLOW_TIME_TRAVEL?: string };
  const h = c.req.header("X-Test-Now");
  if (h && env.ALLOW_TIME_TRAVEL === "1" && env.APP_ENV !== "production") {
    const d = new Date(h);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

export async function currentTerm(db: D1Database, now = new Date()): Promise<TermRow | null> {
  return db.prepare("SELECT * FROM terms WHERE week = ?").bind(vnWeek(now)).first<TermRow>();
}

/** Người đang làm Viện trưởng (nhiệm kỳ còn hiệu lực, tài khoản đang hoạt động). */
export async function activeDirector(db: D1Database, now = new Date()): Promise<string | null> {
  const t = await currentTerm(db, now);
  if (!t?.holder_id || t.ended_reason) return null;
  const u = await db.prepare("SELECT status FROM users WHERE id = ?").bind(t.holder_id).first<{ status: string }>();
  return u?.status === "active" ? t.holder_id : null;
}

/** Bậc hiển thị: Viện trưởng đương nhiệm hiện bậc 7. */
export async function displayRank(db: D1Database, userId: string, now = new Date()): Promise<number> {
  if ((await activeDirector(db, now)) === userId) return 7;
  const p = await db.prepare("SELECT rank FROM user_progress WHERE user_id = ?").bind(userId).first<{ rank: number }>();
  return p?.rank ?? 1;
}

export async function logAction(db: D1Database, week: string, holderId: string, action: string, payload: unknown) {
  await db
    .prepare("INSERT INTO term_actions (id, week, holder_id, action, payload, at) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(crypto.randomUUID(), week, holderId, action, JSON.stringify(payload), new Date().toISOString())
    .run();
}

/**
 * Nhiệm vụ tuần của cả viện (do Viện trưởng chọn): mỗi sự kiện khớp cộng 1 vào bộ đếm chung, người làm thành
 * "người góp sức". Đạt mục tiêu → mọi người góp sức được thưởng; ai góp sức sau đó cũng được thưởng ngay.
 */
export async function weeklyProgress(env: Pick<Env, "DB">, userId: string, eventType: string, now = new Date()) {
  const db = env.DB;
  const t = await currentTerm(db, now);
  if (!t) return;
  const ids = JSON.parse(t.weekly_quests) as string[];
  if (!ids.length) return;
  const { results } = await db
    .prepare(`SELECT id, data FROM catalog_items WHERE kind = 'weekly_quest' AND id IN (${ids.map(() => "?").join(",")})`)
    .bind(...ids)
    .all<{ id: string; data: string }>();
  for (const item of results) {
    const d = JSON.parse(item.data) as { event: string; target: number; points: number };
    if (d.event !== eventType) continue;
    await db.prepare("INSERT OR IGNORE INTO weekly_contributors (week, item_id, user_id) VALUES (?, ?, ?)").bind(t.week, item.id, userId).run();
    await db
      .prepare("INSERT INTO weekly_counters (week, item_id, count) VALUES (?, ?, 1) ON CONFLICT (week, item_id) DO UPDATE SET count = count + 1")
      .bind(t.week, item.id)
      .run();
    const c = await db.prepare("SELECT count, done_at FROM weekly_counters WHERE week = ? AND item_id = ?").bind(t.week, item.id).first<{ count: number; done_at: string | null }>();
    if (!c) continue;
    const key = `wq:${t.week}:${item.id}`;
    if (!c.done_at && c.count >= d.target) {
      const res = await db.prepare("UPDATE weekly_counters SET done_at = ? WHERE week = ? AND item_id = ? AND done_at IS NULL").bind(now.toISOString(), t.week, item.id).run();
      if (res.meta.changes) {
        const { results: people } = await db
          .prepare("SELECT user_id FROM weekly_contributors WHERE week = ? AND item_id = ? LIMIT 5000")
          .bind(t.week, item.id)
          .all<{ user_id: string }>();
        for (const p of people) await award(env, p.user_id, { source: "weekly", dedupeKey: key, points: d.points }, now);
      }
    } else if (c.done_at) {
      await award(env, userId, { source: "weekly", dedupeKey: key, points: d.points }, now);
    }
  }
}

/** Nhiệm vụ tuần đang chạy, hiển thị trong Sổ nhiệm vụ. */
export async function weeklyViews(db: D1Database, locale: "vi" | "en", now = new Date()) {
  const t = await currentTerm(db, now);
  const ids = t ? (JSON.parse(t.weekly_quests) as string[]) : [];
  if (!ids.length) return [];
  const { results } = await db
    .prepare(
      `SELECT c.id, c.text, c.data, COALESCE(w.count, 0) AS count, w.done_at FROM catalog_items c
         LEFT JOIN weekly_counters w ON w.item_id = c.id AND w.week = ?
        WHERE c.id IN (${ids.map(() => "?").join(",")})`,
    )
    .bind(t!.week, ...ids)
    .all<{ id: string; text: string; data: string; count: number; done_at: string | null }>();
  return results.map((r) => {
    const text = (JSON.parse(r.text) as Record<string, { title: string; desc: string }>)[locale];
    const d = JSON.parse(r.data) as { event: string; target: number; points: number };
    return {
      id: r.id,
      kind: "weekly" as const,
      category: "community" as const,
      event: d.event as never,
      title: text.title,
      how: text.desc,
      where: locale === "vi" ? "Cả viện cùng làm" : "The whole hospital together",
      spot: null,
      points: d.points,
      progress: Math.min(r.count, d.target),
      target: d.target,
      status: r.done_at ? ("done" as const) : ("active" as const),
    };
  });
}
