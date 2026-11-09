import type { QuestEvent, QuestView } from "@bvo/shared";
import type { Env } from "../env";
import { nowIso } from "../types";
import { award, ensureProgress } from "./ledger";
import { vnDay, vnWeek } from "./time";
import { weeklyProgress } from "../elections/director";

/**
 * Nhiệm vụ (T006, FR-001–FR-003, research.md R1).
 * - Nhiệm vụ ngày: lần đầu trong ngày (mở Sổ hoặc có sự kiện) chọn 1 mẫu mỗi nhóm selfcare/community/explore,
 *   tất định theo hash(user + ngày), trong các mẫu có min_rank ≤ bậc hiện tại.
 * - Chuỗi thăng cấp: giao cả chuỗi của bậc kế tiếp, không hết hạn.
 * - Sự kiện do máy chủ xác nhận (WorldZone, CircleRoom, API) → cộng tiến độ → xong thì ghi điểm.
 */

export interface GameEvent {
  type: QuestEvent;
  zone?: string;
  spot?: string;
  amount?: number;
}

export interface QuestUpdate {
  questId: string;
  progress: number;
  target: number;
  status: "active" | "done";
  awarded: number;
}

interface TemplateRow {
  id: string;
  kind: "daily" | "chain" | "weekly";
  category: QuestView["category"];
  event: QuestEvent;
  params: string;
  target: number;
  points: number;
  min_rank: number;
  chain_id: string | null;
  step: number | null;
  text: string;
}

const DAILY_CATEGORIES = ["selfcare", "community", "explore"] as const;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

export async function userRank(db: D1Database, userId: string): Promise<number> {
  const r = await db.prepare("SELECT rank FROM user_progress WHERE user_id = ?").bind(userId).first<{ rank: number }>();
  return r?.rank ?? 1;
}

/** Giao 3 nhiệm vụ ngày nếu hôm nay chưa có. */
export async function assignDaily(db: D1Database, userId: string, day: string, rank: number) {
  const existing = await db.prepare("SELECT 1 FROM user_quests WHERE user_id = ? AND period = ? LIMIT 1").bind(userId, day).first();
  if (existing) return;
  const { results } = await db
    .prepare("SELECT id, category, target FROM quest_templates WHERE kind = 'daily' AND active = 1 AND min_rank <= ? ORDER BY id")
    .bind(rank)
    .all<{ id: string; category: string; target: number }>();
  const stmts: D1PreparedStatement[] = [];
  for (const cat of DAILY_CATEGORIES) {
    const pool = results.filter((r) => r.category === cat);
    if (!pool.length) continue;
    const pick = pool[hash(`${userId}:${day}:${cat}`) % pool.length];
    stmts.push(
      db.prepare("INSERT OR IGNORE INTO user_quests (user_id, quest_id, period, progress, target) VALUES (?, ?, ?, 0, ?)").bind(userId, pick.id, day, pick.target),
    );
  }
  if (stmts.length) await db.batch(stmts);
}

/** Giao chuỗi nhiệm vụ của bậc kế tiếp (nếu có). */
export async function assignChain(db: D1Database, userId: string, rank: number) {
  await db
    .prepare(
      `INSERT OR IGNORE INTO user_quests (user_id, quest_id, period, progress, target)
       SELECT ?, t.id, 'chain', 0, t.target FROM quest_templates t JOIN ranks r ON r.chain_id = t.chain_id
        WHERE r.level = ? AND t.kind = 'chain' AND t.active = 1`,
    )
    .bind(userId, rank + 1)
    .run();
}

export async function prepareQuests(db: D1Database, userId: string, now = new Date()) {
  await ensureProgress(db, userId);
  const rank = await userRank(db, userId);
  await assignDaily(db, userId, vnDay(now), rank);
  await assignChain(db, userId, rank);
  return rank;
}

function matches(params: string, ev: GameEvent): boolean {
  let p: Record<string, string> = {};
  try {
    p = JSON.parse(params) as Record<string, string>;
  } catch {
    return false;
  }
  return Object.entries(p).every(([k, v]) => (ev as unknown as Record<string, unknown>)[k] === v);
}

/** Ghi một sự kiện đã được máy chủ xác nhận. Trả về các nhiệm vụ vừa thay đổi tiến độ. */
export async function recordEvent(env: Pick<Env, "DB">, userId: string, ev: GameEvent, now = new Date()): Promise<QuestUpdate[]> {
  const db = env.DB;
  await prepareQuests(db, userId, now);
  const day = vnDay(now);
  const week = vnWeek(now);
  const { results } = await db
    .prepare(
      `SELECT q.quest_id, q.period, q.progress, q.target, t.params, t.points, t.kind
         FROM user_quests q JOIN quest_templates t ON t.id = q.quest_id
        WHERE q.user_id = ? AND q.status = 'active' AND t.event = ? AND q.period IN (?, ?, 'chain')`,
    )
    .bind(userId, ev.type, day, week)
    .all<{ quest_id: string; period: string; progress: number; target: number; params: string; points: number; kind: TemplateRow["kind"] }>();

  const updates: QuestUpdate[] = [];
  for (const q of results) {
    if (!matches(q.params, ev)) continue;
    const progress = Math.min(q.target, q.progress + Math.max(1, Math.floor(ev.amount ?? 1)));
    const done = progress >= q.target;
    // Điều kiện status = 'active' chống cộng hai lần khi hai sự kiện tới cùng lúc.
    const res = await db
      .prepare("UPDATE user_quests SET progress = ?, status = ?, done_at = ? WHERE user_id = ? AND quest_id = ? AND period = ? AND status = 'active' AND progress = ?")
      .bind(progress, done ? "done" : "active", done ? nowIso() : null, userId, q.quest_id, q.period, q.progress)
      .run();
    if (!res.meta.changes) continue;
    let awarded = 0;
    if (done) {
      awarded =
        (await award(env, userId, { source: q.kind === "chain" ? "chain" : q.kind === "weekly" ? "weekly" : "quest", dedupeKey: `q:${q.quest_id}:${q.period}`, points: q.points }, now)) ?? 0;
    }
    updates.push({ questId: q.quest_id, progress, target: q.target, status: done ? "done" : "active", awarded });
  }
  // Nhiệm vụ tuần của cả viện (do Viện trưởng chọn) — lỗi ở đây không được làm hỏng nhiệm vụ cá nhân.
  await weeklyProgress(env, userId, ev.type, now).catch((e) => console.error("weekly quest failed", e));
  return updates;
}

/** Sổ nhiệm vụ: nhiệm vụ ngày, chuỗi đang mở, nhiệm vụ tuần. */
export async function listQuests(db: D1Database, userId: string, locale: "vi" | "en", now = new Date()) {
  const rank = await prepareQuests(db, userId, now);
  const day = vnDay(now);
  const week = vnWeek(now);
  const { results } = await db
    .prepare(
      `SELECT q.quest_id, q.period, q.progress, q.target, q.status, t.kind, t.category, t.event, t.params, t.points, t.text, t.step
         FROM user_quests q JOIN quest_templates t ON t.id = q.quest_id
        WHERE q.user_id = ? AND q.period IN (?, ?, 'chain')
          AND (q.period <> 'chain' OR t.chain_id = (SELECT chain_id FROM ranks WHERE level = ?))
        ORDER BY t.kind, t.step, t.category`,
    )
    .bind(userId, day, week, rank + 1)
    .all<{
      quest_id: string;
      progress: number;
      target: number;
      status: "active" | "done";
      kind: TemplateRow["kind"];
      category: QuestView["category"];
      event: QuestEvent;
      params: string;
      points: number;
      text: string;
    }>();
  const view = (r: (typeof results)[number]): QuestView => {
    const text = (JSON.parse(r.text) as Record<string, { title: string; how: string; where: string }>)[locale];
    const params = JSON.parse(r.params) as { zone?: string; spot?: string };
    return {
      id: r.quest_id,
      kind: r.kind,
      category: r.category,
      event: r.event,
      title: text.title,
      how: text.how,
      where: text.where,
      spot: params.zone && params.spot ? { zone: params.zone, spot: params.spot } : null,
      points: r.points,
      progress: r.progress,
      target: r.target,
      status: r.status,
    };
  };
  return {
    daily: results.filter((r) => r.kind === "daily").map(view),
    chain: results.filter((r) => r.kind === "chain").map(view),
    weekly: results.filter((r) => r.kind === "weekly").map(view),
  };
}
