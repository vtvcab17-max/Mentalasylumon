import { rankKey, type NextStep, type ProgressView } from "@bvo/shared";
import { getSettings } from "../db/settings";
import type { Env } from "../env";
import { nowIso } from "../types";
import { ensureProgress, todayPoints } from "./ledger";
import { assignChain } from "./quests";

/** Cấp bậc (T018, FR-009–FR-011, data-model.md "ranks"). Bậc 7 (Viện trưởng) chỉ qua bầu cử. */

interface RankRow {
  level: number;
  key: string;
  min_points: number;
  min_active_days: number;
  chain_id: string | null;
}

interface ProgressRow {
  rank: number;
  total_points: number;
  active_days: number;
}

async function rankRow(db: D1Database, level: number) {
  return db.prepare("SELECT level, key, min_points, min_active_days, chain_id FROM ranks WHERE level = ?").bind(level).first<RankRow>();
}

async function progressRow(db: D1Database, userId: string): Promise<ProgressRow> {
  await ensureProgress(db, userId);
  return (await db.prepare("SELECT rank, total_points, active_days FROM user_progress WHERE user_id = ?").bind(userId).first<ProgressRow>())!;
}

export async function nextStep(db: D1Database, userId: string): Promise<{ next: NextStep | null; eligible: boolean; p: ProgressRow }> {
  const p = await progressRow(db, userId);
  if (p.rank >= 6) return { next: null, eligible: false, p };
  const r = await rankRow(db, p.rank + 1);
  if (!r) return { next: null, eligible: false, p };
  const requirements: NextStep["requirements"] = [
    { kind: "points", have: p.total_points, need: r.min_points },
    { kind: "days", have: p.active_days, need: r.min_active_days },
  ];
  if (r.chain_id) {
    await assignChain(db, userId, p.rank);
    const c = await db
      .prepare(
        `SELECT COUNT(*) AS total, SUM(q.status = 'done') AS done FROM user_quests q JOIN quest_templates t ON t.id = q.quest_id
          WHERE q.user_id = ? AND q.period = 'chain' AND t.chain_id = ?`,
      )
      .bind(userId, r.chain_id)
      .first<{ total: number; done: number | null }>();
    requirements.push({ kind: "chain", have: c?.done ?? 0, need: c?.total ?? 0, label: r.chain_id });
  }
  const eligible = requirements.every((q) => q.have >= q.need);
  return { next: { level: r.level, key: rankKey(r.level), requirements }, eligible, p };
}

export async function progressView(db: D1Database, userId: string): Promise<ProgressView> {
  const { next, eligible, p } = await nextStep(db, userId);
  const { daily_point_cap } = await getSettings(db);
  return {
    rank: { level: p.rank, key: rankKey(p.rank) },
    totalPoints: p.total_points,
    todayPoints: await todayPoints(db, userId),
    dailyCap: daily_point_cap,
    activeDays: p.active_days,
    next,
    eligible,
  };
}

/** Thăng lên đúng 1 bậc nếu đủ điều kiện. Trả về bậc mới hoặc null. */
export async function promote(env: Pick<Env, "DB">, userId: string): Promise<{ level: number; next: NextStep | null } | { level: null; next: NextStep | null }> {
  const db = env.DB;
  const { next, eligible, p } = await nextStep(db, userId);
  if (!next || !eligible) return { level: null, next };
  const res = await db.prepare("UPDATE user_progress SET rank = ?, updated_at = ? WHERE user_id = ? AND rank = ?").bind(next.level, nowIso(), userId, p.rank).run();
  if (!res.meta.changes) return { level: null, next };
  await db
    .prepare("INSERT INTO rank_history (id, user_id, from_rank, to_rank, reason, at) VALUES (?, ?, ?, ?, 'promotion', ?)")
    .bind(crypto.randomUUID(), userId, p.rank, next.level, nowIso())
    .run();
  await assignChain(db, userId, next.level);
  return { level: next.level, next: (await nextStep(db, userId)).next };
}
