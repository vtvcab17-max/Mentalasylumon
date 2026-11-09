import type { Env } from "../env";
import { vnWeek, weekSchedule } from "../progress/time";
import { chatKey } from "../do/key-vault";

/**
 * Bầu Viện trưởng hằng tuần (002 T029, US4, FR-016–FR-021, research.md R3–R6).
 * `tickElections(now)` an toàn khi chạy lặp lại: cron 10 phút một lần và mỗi lần có người xem bầu cử.
 */

export const POWER_KEYS = ["theme", "quests", "decor", "announce", "honorary"] as const;
export const MIN_VALID_VOTES = 3;
export const COUNCIL_MIN_ACCOUNT_DAYS = 14;
const DAY = 86400_000;

export interface ElectionRow {
  id: string;
  nominate_from: string;
  nominate_to: string;
  vote_from: string;
  vote_to: string;
  term_week: string;
  status: "nominating" | "voting" | "announced" | "vacant";
  winner_id: string | null;
  tie_break: string | null;
  vacant_reason: string | null;
  result: string | null;
}

export type Phase = "before" | "nominating" | "between" | "voting" | "closed";

export function phaseOf(e: ElectionRow, now: Date): Phase {
  const t = now.toISOString();
  if (t < e.nominate_from) return "before";
  if (t < e.nominate_to) return "nominating";
  if (t < e.vote_from) return "between";
  if (t < e.vote_to) return "voting";
  return "closed";
}

export async function ensureElection(db: D1Database, week: string): Promise<ElectionRow> {
  const s = weekSchedule(week);
  await db
    .prepare("INSERT OR IGNORE INTO elections (id, nominate_from, nominate_to, vote_from, vote_to, term_week) VALUES (?, ?, ?, ?, ?, ?)")
    .bind(week, s.nominateFrom, s.nominateTo, s.voteFrom, s.voteTo, s.termWeek)
    .run();
  return (await db.prepare("SELECT * FROM elections WHERE id = ?").bind(week).first<ElectionRow>())!;
}

/** HMAC(khóa KeyVault, election:voter) — không ai đọc D1 mà biết được ai bầu cho ai (R4). */
export async function voterHash(env: Pick<Env, "CHAT_ENCRYPTION_KEY" | "KEY_VAULT">, electionId: string, voterId: string): Promise<string> {
  const raw = Uint8Array.from(atob(await chatKey(env)), (ch) => ch.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", raw, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`ballot:${electionId}:${voterId}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

interface MemberRow {
  rank: number;
  council_banned: number;
  status: string;
  suspended_until: string | null;
  created_at: string;
}

async function member(db: D1Database, userId: string) {
  return db
    .prepare(
      `SELECT COALESCE(p.rank, 1) AS rank, COALESCE(p.council_banned, 0) AS council_banned, u.status, u.suspended_until, u.created_at
         FROM users u LEFT JOIN user_progress p ON p.user_id = u.id WHERE u.id = ?`,
    )
    .bind(userId)
    .first<MemberRow>();
}

const isActive = (m: MemberRow, now: Date) => m.status === "active" || (m.status === "suspended" && !!m.suspended_until && m.suspended_until <= now.toISOString());

/** Người đang giữ nhiệm kỳ tuần `week` (còn hiệu lực). */
export async function termHolder(db: D1Database, week: string): Promise<string | null> {
  const t = await db.prepare("SELECT holder_id FROM terms WHERE week = ? AND ended_reason IS NULL").bind(week).first<{ holder_id: string | null }>();
  return t?.holder_id ?? null;
}

export async function eligibility(db: D1Database, e: ElectionRow, userId: string, now: Date) {
  const m = await member(db, userId);
  const phase = phaseOf(e, now);
  // Viện trưởng của nhiệm kỳ đang chạy trong tuần bầu cử này phải nghỉ một nhiệm kỳ (FR-018).
  const servingNow = (await previousHolder(db, e)) === userId;
  const nominate = (() => {
    if (!m || !isActive(m, now)) return "suspended";
    if (m.rank < 6) return "rank";
    if (m.council_banned) return "council_banned";
    if (servingNow) return "consecutive";
    if (phase !== "nominating") return "phase";
    return null;
  })();
  const vote = (() => {
    if (!m || !isActive(m, now)) return "suspended";
    if (m.rank < 5) return "rank";
    if (m.council_banned) return "council_banned";
    if (now.getTime() - Date.parse(m.created_at) < COUNCIL_MIN_ACCOUNT_DAYS * DAY) return "account_age";
    if (phase !== "voting") return "phase";
    return null;
  })();
  return { nominate, vote };
}

/** Viện trưởng của nhiệm kỳ ngay trước nhiệm kỳ mà kỳ bầu cử này chọn ra (không được ứng cử liền). */
export async function previousHolder(db: D1Database, e: ElectionRow): Promise<string | null> {
  const t = await db.prepare("SELECT holder_id FROM terms WHERE week = ?").bind(e.id).first<{ holder_id: string | null }>();
  return t?.holder_id ?? null;
}

/** Kiểm phiếu và tạo nhiệm kỳ (R6). */
async function finalize(env: Pick<Env, "DB">, e: ElectionRow, now: Date) {
  const db = env.DB;
  const { results: cands } = await db
    .prepare(
      `SELECT c.user_id, u.nickname, u.status, u.suspended_until, COALESCE(p.rank, 1) AS rank
         FROM candidates c JOIN users u ON u.id = c.user_id LEFT JOIN user_progress p ON p.user_id = c.user_id
        WHERE c.election_id = ? AND c.withdrawn = 0`,
    )
    .bind(e.id)
    .all<{ user_id: string; nickname: string; status: string; suspended_until: string | null; rank: number }>();
  const valid = cands.filter((c) => (c.status === "active" || (c.status === "suspended" && c.suspended_until && c.suspended_until <= now.toISOString())) && c.rank >= 6);
  const { results: votes } = await db
    .prepare("SELECT candidate_id, COUNT(*) AS n FROM ballots WHERE election_id = ? GROUP BY candidate_id")
    .bind(e.id)
    .all<{ candidate_id: string; n: number }>();
  const tally = valid.map((c) => ({ candidateId: c.user_id, nickname: c.nickname, votes: votes.find((v) => v.candidate_id === c.user_id)?.n ?? 0 }));
  tally.sort((a, b) => b.votes - a.votes);
  const total = tally.reduce((n, c) => n + c.votes, 0);

  let winner: string | null = null;
  let tieBreak: string | null = null;
  let vacant: string | null = null;
  if (!valid.length) vacant = "no_candidates";
  else if (total < MIN_VALID_VOTES) vacant = "few_votes";
  else {
    let top = tally.filter((c) => c.votes === tally[0].votes);
    if (top.length > 1) {
      tieBreak = "points_28d";
      const since = new Date(Date.parse(e.vote_to) - 28 * DAY).toISOString();
      const pts = await Promise.all(
        top.map(async (c) => {
          const r = await db
            .prepare("SELECT COALESCE(SUM(points), 0) AS p FROM points_ledger WHERE user_id = ? AND created_at >= ? AND created_at < ?")
            .bind(c.candidateId, since, e.vote_to)
            .first<{ p: number }>();
          return { c, p: r?.p ?? 0 };
        }),
      );
      const best = Math.max(...pts.map((x) => x.p));
      top = pts.filter((x) => x.p === best).map((x) => x.c);
      if (top.length > 1) {
        tieBreak = "lot";
        const scored = await Promise.all(top.map(async (c) => ({ c, h: await sha256(`${e.id}:${c.candidateId}`) })));
        scored.sort((a, b) => (a.h < b.h ? -1 : 1));
        top = [scored[0].c];
      }
    }
    winner = top[0].candidateId;
  }

  const status = winner ? "announced" : "vacant";
  const res = await db
    .prepare("UPDATE elections SET status = ?, winner_id = ?, tie_break = ?, vacant_reason = ?, result = ? WHERE id = ? AND status IN ('nominating','voting')")
    .bind(status, winner, tieBreak, vacant, JSON.stringify(tally), e.id)
    .run();
  if (!res.meta.changes) return;
  await db.prepare("INSERT OR IGNORE INTO terms (week, election_id, holder_id) VALUES (?, ?, ?)").bind(e.term_week, e.id, winner).run();
}

async function sha256(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Đưa mọi kỳ bầu cử về đúng trạng thái theo giờ hiện tại. */
export async function tickElections(env: Pick<Env, "DB">, now = new Date()) {
  const db = env.DB;
  await ensureElection(db, vnWeek(now));
  const { results } = await db
    .prepare("SELECT * FROM elections WHERE status IN ('nominating','voting') AND nominate_from <= ?")
    .bind(now.toISOString())
    .all<ElectionRow>();
  for (const e of results) {
    const phase = phaseOf(e, now);
    if (phase === "closed") await finalize(env, e, now);
    else if (phase === "voting" && e.status === "nominating") await db.prepare("UPDATE elections SET status = 'voting' WHERE id = ? AND status = 'nominating'").bind(e.id).run();
  }
  // Nhiệm kỳ đang chạy: người giữ ghế bị khóa/xóa → ghế trống tới hết tuần (FR-025).
  const week = vnWeek(now);
  const t = await db
    .prepare("SELECT t.holder_id, u.status FROM terms t LEFT JOIN users u ON u.id = t.holder_id WHERE t.week = ? AND t.ended_reason IS NULL AND t.holder_id IS NOT NULL")
    .bind(week)
    .first<{ holder_id: string; status: string | null }>();
  if (t && t.status !== "active") {
    await db.prepare("UPDATE terms SET ended_reason = ? WHERE week = ?").bind(t.status === "deleted" || !t.status ? "deleted" : "suspended", week).run();
  }
}
