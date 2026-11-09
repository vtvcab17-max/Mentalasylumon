import type { Context, Hono } from "hono";
import { z } from "zod";
import { getSettings } from "../db/settings";
import { activeDirector, clockOf, currentTerm, logAction } from "../elections/director";
import { eligibility, ensureElection, POWER_KEYS, tickElections, voterHash, type ElectionRow } from "../elections/election";
import { vnDay, vnWeek } from "../progress/time";
import { createFlag, notifyAdmins } from "../safety/flags";
import { moderatePublic, type SafetyDeps } from "../safety/pipeline";
import { loadResourceRows, toPublic } from "../safety/resources";
import { nowIso, type AppEnv } from "../types";
import { apiError } from "./errors";
import { requireOnboarded, requireUser } from "./guards";

/** Bầu cử (002 T030, US4) và quyền Viện trưởng (T033, US5) — contracts/http-api.md. */

type Ctx = Context<AppEnv>;

async function safety(c: Ctx, source: "circle"): Promise<SafetyDeps> {
  const settings = await getSettings(c.env.DB);
  const userId = c.get("user")!.id;
  return {
    ai: c.env,
    classifierModel: settings.model_classifier,
    loadResources: async (l) => toPublic(await loadResourceRows(c.env.DB), l, new Date()),
    onFlag: async (f) => {
      const id = await createFlag(c.env, { userId, source, level: f.level, category: f.category, excerpt: { message: f.text, reply: f.reply } });
      c.executionCtx.waitUntil(notifyAdmins(c.env.DB, { id, level: f.level, source }));
    },
  };
}

/** Văn bản công khai (lời hứa, thông báo): kiểm duyệt như vòng sinh hoạt (FR-018, FR-023, SC-007). */
async function moderate(c: Ctx, text: string) {
  return moderatePublic(await safety(c, "circle"), text, c.get("user")!.locale);
}

async function electionView(c: Ctx, e: ElectionRow, now: Date) {
  const db = c.env.DB;
  const user = c.get("user")!;
  const { results: cands } = await db
    .prepare("SELECT c.user_id, u.nickname, c.pledge, c.plans FROM candidates c JOIN users u ON u.id = c.user_id WHERE c.election_id = ? AND c.withdrawn = 0 ORDER BY c.created_at")
    .bind(e.id)
    .all<{ user_id: string; nickname: string; pledge: string; plans: string }>();
  const el = await eligibility(db, e, user.id, now);
  const ballot = await db
    .prepare("SELECT candidate_id FROM ballots WHERE election_id = ? AND voter_hash = ?")
    .bind(e.id, await voterHash(c.env, e.id, user.id))
    .first<{ candidate_id: string }>();
  const closed = e.status === "announced" || e.status === "vacant";
  return {
    id: e.id,
    status: e.status,
    schedule: { nominateFrom: e.nominate_from, nominateTo: e.nominate_to, voteFrom: e.vote_from, voteTo: e.vote_to, termWeek: e.term_week },
    candidates: cands.map((x) => ({ userId: x.user_id, nickname: x.nickname, pledge: x.pledge, plans: JSON.parse(x.plans) as string[] })),
    myRole: { canNominate: !el.nominate, nominateReason: el.nominate, canVote: !el.vote, voteReason: el.vote, isCandidate: cands.some((x) => x.user_id === user.id) },
    myVote: ballot?.candidate_id ?? null,
    result: closed ? { winner: e.winner_id, tieBreak: e.tie_break, vacantReason: e.vacant_reason, tally: JSON.parse(e.result ?? "[]") } : null,
  };
}

const CandidacyBody = z.object({ pledge: z.string().trim().min(1).max(200), plans: z.array(z.enum(POWER_KEYS)).max(3).default([]) });

export function registerElections(app: Hono<AppEnv>) {
  const guard = [requireUser, requireOnboarded] as const;

  // ── Bầu cử ─────────────────────────────────────────────────────────
  app.get("/api/elections/current", ...guard, async (c) => {
    const now = clockOf(c);
    await tickElections(c.env, now);
    const e = await ensureElection(c.env.DB, vnWeek(now));
    return c.json(await electionView(c, e, now));
  });

  app.post("/api/elections/current/candidacy", ...guard, async (c) => {
    const parsed = CandidacyBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return apiError(c, "VALIDATION", 400);
    const now = clockOf(c);
    await tickElections(c.env, now);
    const e = await ensureElection(c.env.DB, vnWeek(now));
    const el = await eligibility(c.env.DB, e, c.get("user")!.id, now);
    if (el.nominate) return apiError(c, "NOT_ELIGIBLE", 403, { reason: el.nominate });
    const m = await moderate(c, parsed.data.pledge);
    if (m.action === "block") return apiError(c, "MODERATION_BLOCKED", 422, { reason: m.reason, support: m.support });
    await c.env.DB.prepare(
      `INSERT INTO candidates (election_id, user_id, pledge, plans, withdrawn, created_at) VALUES (?, ?, ?, ?, 0, ?)
       ON CONFLICT (election_id, user_id) DO UPDATE SET pledge = excluded.pledge, plans = excluded.plans, withdrawn = 0`,
    )
      .bind(e.id, c.get("user")!.id, parsed.data.pledge, JSON.stringify([...new Set(parsed.data.plans)]), nowIso())
      .run();
    return c.json({ ok: true }, 201);
  });

  app.delete("/api/elections/current/candidacy", ...guard, async (c) => {
    const now = clockOf(c);
    const e = await ensureElection(c.env.DB, vnWeek(now));
    if (e.status !== "nominating" && e.status !== "voting") return apiError(c, "CONFLICT", 409);
    await c.env.DB.prepare("UPDATE candidates SET withdrawn = 1 WHERE election_id = ? AND user_id = ?").bind(e.id, c.get("user")!.id).run();
    return c.body(null, 204);
  });

  app.post("/api/elections/current/vote", ...guard, async (c) => {
    const body = z.object({ candidateId: z.string().min(1).max(64) }).safeParse(await c.req.json().catch(() => null));
    if (!body.success) return apiError(c, "VALIDATION", 400);
    const now = clockOf(c);
    await tickElections(c.env, now);
    const e = await ensureElection(c.env.DB, vnWeek(now));
    const user = c.get("user")!;
    const el = await eligibility(c.env.DB, e, user.id, now);
    if (el.vote) return apiError(c, "NOT_ELIGIBLE", 403, { reason: el.vote });
    const cand = await c.env.DB.prepare("SELECT 1 FROM candidates WHERE election_id = ? AND user_id = ? AND withdrawn = 0").bind(e.id, body.data.candidateId).first();
    if (!cand) return apiError(c, "NOT_FOUND", 404);
    // Phiếu kín: bảng ballots chỉ có HMAC; election_voters chỉ biết ai đã bầu (FR-019).
    await c.env.DB.batch([
      c.env.DB.prepare("INSERT OR REPLACE INTO ballots (election_id, voter_hash, candidate_id, cast_at) VALUES (?, ?, ?, ?)").bind(
        e.id, await voterHash(c.env, e.id, user.id), body.data.candidateId, now.toISOString(),
      ),
      c.env.DB.prepare("INSERT OR IGNORE INTO election_voters (election_id, voter_id, voted_at) VALUES (?, ?, ?)").bind(e.id, user.id, now.toISOString()),
    ]);
    return c.body(null, 204);
  });

  app.get("/api/elections/hall-of-fame", ...guard, async (c) => {
    const { results } = await c.env.DB.prepare(
      "SELECT t.week, u.nickname FROM terms t JOIN users u ON u.id = t.holder_id WHERE t.ended_reason IS NULL AND u.status <> 'deleted' ORDER BY t.week DESC LIMIT 100",
    ).all<{ week: string; nickname: string }>();
    return c.json(results);
  });

  // ── Trạng thái viện (trang trí, chủ đề, thông báo) ────────────────
  app.get("/api/world/state", ...guard, async (c) => {
    const now = clockOf(c);
    await tickElections(c.env, now);
    const t = await currentTerm(c.env.DB, now);
    const director = await activeDirector(c.env.DB, now);
    const loc = c.get("user")!.locale;
    const item = async (id: string | null) => {
      if (!id) return null;
      const r = await c.env.DB.prepare("SELECT id, text, data FROM catalog_items WHERE id = ?").bind(id).first<{ id: string; text: string; data: string }>();
      if (!r) return null;
      const text = (JSON.parse(r.text) as Record<string, { title: string; desc: string }>)[loc];
      return { id: r.id, title: text.title, desc: text.desc, data: JSON.parse(r.data) as unknown };
    };
    const nick = director ? await c.env.DB.prepare("SELECT nickname FROM users WHERE id = ?").bind(director).first<{ nickname: string }>() : null;
    const ann = t
      ? await c.env.DB.prepare("SELECT a.text, a.day, u.nickname FROM announcements a JOIN users u ON u.id = a.author_id WHERE a.week = ? ORDER BY a.created_at DESC LIMIT 1")
          .bind(t.week)
          .first<{ text: string; day: string; nickname: string }>()
      : null;
    const honorary = t ? (JSON.parse(t.honorary) as string[]) : [];
    const honoraryNames = honorary.length
      ? (await c.env.DB.prepare(`SELECT nickname FROM users WHERE id IN (${honorary.map(() => "?").join(",")})`).bind(...honorary).all<{ nickname: string }>()).results.map((r) => r.nickname)
      : [];
    return c.json({
      week: vnWeek(now),
      director: director ? { id: director, nickname: nick?.nickname ?? "" } : null,
      vacantReason: director ? null : t?.ended_reason ?? (t ? "no_winner" : "no_term"),
      theme: await item(t?.theme_id ?? null),
      decor: await item(t?.decor_id ?? null),
      announcement: ann ? { text: ann.text, day: ann.day, author: ann.nickname } : null,
      honorary: honoraryNames,
    });
  });

  app.get("/api/catalog", ...guard, async (c) => {
    const kind = c.req.query("kind");
    if (!["theme", "decor", "weekly_quest"].includes(kind ?? "")) return apiError(c, "VALIDATION", 400);
    const loc = c.get("user")!.locale;
    const { results } = await c.env.DB.prepare("SELECT id, text, data FROM catalog_items WHERE kind = ? AND active = 1 ORDER BY id").bind(kind).all<{ id: string; text: string; data: string }>();
    return c.json(results.map((r) => ({ id: r.id, ...(JSON.parse(r.text) as Record<string, { title: string; desc: string }>)[loc], data: JSON.parse(r.data) as unknown })));
  });

  // ── Quyền Viện trưởng: danh sách đóng (FR-022, R7) ─────────────────
  const director = async (c: Ctx) => {
    const now = clockOf(c);
    await tickElections(c.env, now);
    const holder = await activeDirector(c.env.DB, now);
    return holder && holder === c.get("user")!.id ? { now, week: vnWeek(now) } : null;
  };
  const catalogOk = async (c: Ctx, kind: string, ids: string[]) => {
    if (!ids.length) return true;
    const r = await c.env.DB.prepare(`SELECT COUNT(*) AS n FROM catalog_items WHERE kind = ? AND active = 1 AND id IN (${ids.map(() => "?").join(",")})`)
      .bind(kind, ...ids)
      .first<{ n: number }>();
    return r?.n === ids.length;
  };

  app.post("/api/director/theme", ...guard, async (c) => {
    const d = await director(c);
    if (!d) return apiError(c, "NOT_DIRECTOR", 403);
    const b = z.object({ themeId: z.string().max(64) }).safeParse(await c.req.json().catch(() => null));
    if (!b.success || !(await catalogOk(c, "theme", [b.data.themeId]))) return apiError(c, "VALIDATION", 400);
    await c.env.DB.prepare("UPDATE terms SET theme_id = ? WHERE week = ?").bind(b.data.themeId, d.week).run();
    await logAction(c.env.DB, d.week, c.get("user")!.id, "theme", b.data);
    return c.json({ ok: true });
  });

  app.post("/api/director/decor", ...guard, async (c) => {
    const d = await director(c);
    if (!d) return apiError(c, "NOT_DIRECTOR", 403);
    const b = z.object({ decorId: z.string().max(64) }).safeParse(await c.req.json().catch(() => null));
    if (!b.success || !(await catalogOk(c, "decor", [b.data.decorId]))) return apiError(c, "VALIDATION", 400);
    await c.env.DB.prepare("UPDATE terms SET decor_id = ? WHERE week = ?").bind(b.data.decorId, d.week).run();
    await logAction(c.env.DB, d.week, c.get("user")!.id, "decor", b.data);
    return c.json({ ok: true });
  });

  app.post("/api/director/quests", ...guard, async (c) => {
    const d = await director(c);
    if (!d) return apiError(c, "NOT_DIRECTOR", 403);
    const b = z.object({ questIds: z.array(z.string().max(64)).max(3) }).safeParse(await c.req.json().catch(() => null));
    const ids = b.success ? [...new Set(b.data.questIds)] : [];
    if (!b.success || !(await catalogOk(c, "weekly_quest", ids))) return apiError(c, "VALIDATION", 400);
    await c.env.DB.prepare("UPDATE terms SET weekly_quests = ? WHERE week = ?").bind(JSON.stringify(ids), d.week).run();
    await logAction(c.env.DB, d.week, c.get("user")!.id, "quests", { questIds: ids });
    return c.json({ ok: true });
  });

  app.post("/api/director/announce", ...guard, async (c) => {
    const d = await director(c);
    if (!d) return apiError(c, "NOT_DIRECTOR", 403);
    const b = z.object({ text: z.string().trim().min(1).max(200) }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return apiError(c, "VALIDATION", 400);
    const user = c.get("user")!;
    const day = vnDay(d.now);
    const already = await c.env.DB.prepare("SELECT 1 FROM announcements WHERE author_id = ? AND day = ?").bind(user.id, day).first();
    if (already) {
      const retryAt = new Date(`${day}T00:00:00+07:00`).getTime() + 86400_000;
      return apiError(c, "RATE_LIMITED", 429, { retryAt: new Date(retryAt).toISOString() });
    }
    const m = await moderate(c, b.data.text);
    if (m.action === "block") return apiError(c, "MODERATION_BLOCKED", 422, { reason: m.reason, support: m.support });
    try {
      await c.env.DB.prepare("INSERT INTO announcements (id, week, author_id, text, day, created_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(crypto.randomUUID(), d.week, user.id, b.data.text, day, d.now.toISOString())
        .run();
    } catch {
      return apiError(c, "RATE_LIMITED", 429);
    }
    await logAction(c.env.DB, d.week, user.id, "announce", b.data);
    return c.json({ ok: true }, 201);
  });

  app.post("/api/director/honorary", ...guard, async (c) => {
    const d = await director(c);
    if (!d) return apiError(c, "NOT_DIRECTOR", 403);
    // Theo biệt danh (người chơi không thấy id của nhau).
    const b = z.object({ nicknames: z.array(z.string().trim().min(2).max(20)).max(2) }).safeParse(await c.req.json().catch(() => null));
    if (!b.success) return apiError(c, "VALIDATION", 400);
    const user = c.get("user")!;
    const ids: string[] = [];
    for (const n of [...new Set(b.data.nicknames.map((x) => x.toLocaleLowerCase("vi")))]) {
      const r = await c.env.DB.prepare("SELECT id FROM users WHERE nickname_lc = ? AND status = 'active'").bind(n).first<{ id: string }>();
      if (!r) return apiError(c, "NOT_FOUND", 404, { nickname: n });
      if (r.id !== user.id) ids.push(r.id);
    }
    await c.env.DB.prepare("UPDATE terms SET honorary = ? WHERE week = ?").bind(JSON.stringify(ids), d.week).run();
    await logAction(c.env.DB, d.week, user.id, "honorary", { nicknames: b.data.nicknames });
    return c.json({ ok: true });
  });
}
