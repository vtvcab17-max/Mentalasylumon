import { env, SELF } from "cloudflare:test";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { recordEvent } from "../src/progress/quests";
import { weekSchedule } from "../src/progress/time";
import { BASE, login, seedResources } from "./helpers";

/** 002 — bầu Viện trưởng (T027) và quyền Viện trưởng + kiểm thử bảo mật (T032, SC-006). Đồng hồ tua qua X-Test-Now. */

function at(cookie: string, now: string, method: string, path: string, body?: unknown) {
  return SELF.fetch(BASE + path, {
    method,
    headers: { cookie, "X-Requested-With": "bvo", "X-Test-Now": now, ...(body !== undefined ? { "content-type": "application/json" } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
}
const plus = (iso: string, minutes: number) => new Date(Date.parse(iso) + minutes * 60_000).toISOString();

async function asRank(rank: number, opts: { ageDays?: number; createdAt?: string; locale?: "vi" | "en" } = {}) {
  const u = await login({ onboarded: true, locale: opts.locale });
  await env.DB.prepare("INSERT OR REPLACE INTO user_progress (user_id, rank, updated_at) VALUES (?, ?, ?)").bind(u.id, rank, new Date().toISOString()).run();
  await env.DB.prepare("UPDATE users SET created_at = ? WHERE id = ?").bind(opts.createdAt ?? new Date(Date.now() - (opts.ageDays ?? 30) * 86400_000).toISOString(), u.id).run();
  return u;
}

interface ElectionView {
  id: string;
  status: string;
  candidates: { userId: string; nickname: string; pledge: string }[];
  myRole: { canNominate: boolean; nominateReason: string | null; canVote: boolean; voteReason: string | null };
  myVote: string | null;
  result: { winner: string | null; tieBreak: string | null; vacantReason: string | null; tally: { candidateId: string; votes: number }[] } | null;
}
const view = async (cookie: string, now: string) => (await (await at(cookie, now, "GET", "/api/elections/current")).json()) as ElectionView;

beforeAll(async () => {
  await seedResources();
  await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('model_classifier', '@test/classifier')").run();
});
afterAll(async () => {
  await env.DB.prepare("DELETE FROM settings WHERE key = 'model_classifier'").run();
});

describe("bầu Viện trưởng (T027)", () => {
  const W = weekSchedule("2030-W10");
  let head: Awaited<ReturnType<typeof asRank>>;

  it("ứng cử → bỏ phiếu kín → công bố → nhiệm kỳ tuần sau; không làm 2 nhiệm kỳ liền", async () => {
    head = await asRank(6);
    const patient = await asRank(1);
    const [i1, i2, i3] = await Promise.all([asRank(5), asRank(5), asRank(6)]);
    // Tài khoản mới 3 ngày tuổi tính theo giờ bỏ phiếu (đồng hồ đã tua tới 2030).
    const young = await asRank(5, { createdAt: plus(W.voteFrom, -3 * 24 * 60) });
    const nom = plus(W.nominateFrom, 60);

    // Trước giờ ứng cử: chưa được.
    expect((await at(head.cookie, plus(W.nominateFrom, -60), "POST", "/api/elections/current/candidacy", { pledge: "Mình sẽ chăm vườn" })).status).toBe(403);
    expect(((await (await at(patient.cookie, nom, "POST", "/api/elections/current/candidacy", { pledge: "Chọn tôi" })).json()) as { error: { reason: string } }).error.reason).toBe("rank");
    // Lời hứa xúc phạm bị chặn như tin công khai (FR-018).
    expect((await at(head.cookie, nom, "POST", "/api/elections/current/candidacy", { pledge: "Mấy đứa kia đồ ngu" })).status).toBe(422);
    expect((await at(head.cookie, nom, "POST", "/api/elections/current/candidacy", { pledge: "Mình sẽ chọn chủ đề Giấc ngủ", plans: ["theme", "decor"] })).status).toBe(201);
    expect((await at(head.cookie, nom, "POST", "/api/elections/current/candidacy", { pledge: "x", plans: ["ban_people"] })).status).toBe(400);
    expect((await view(i1.cookie, nom)).candidates.map((c) => c.userId)).toEqual([head.id]);

    // Chưa tới giờ bỏ phiếu.
    expect((await at(i1.cookie, nom, "POST", "/api/elections/current/vote", { candidateId: head.id })).status).toBe(403);
    const vote = plus(W.voteFrom, 60);
    for (const u of [i1, i2, i3]) expect((await at(u.cookie, vote, "POST", "/api/elections/current/vote", { candidateId: head.id })).status).toBe(204);
    expect(((await (await at(young.cookie, vote, "POST", "/api/elections/current/vote", { candidateId: head.id })).json()) as { error: { reason: string } }).error.reason).toBe("account_age");
    expect(((await (await at(patient.cookie, vote, "POST", "/api/elections/current/vote", { candidateId: head.id })).json()) as { error: { reason: string } }).error.reason).toBe("rank");
    // Đổi phiếu được; vẫn chỉ 1 phiếu mỗi người.
    expect((await at(i1.cookie, vote, "POST", "/api/elections/current/vote", { candidateId: head.id })).status).toBe(204);
    expect((await view(i1.cookie, vote)).myVote).toBe(head.id);
    expect((await view(i2.cookie, vote)).result).toBeNull(); // chưa công bố thì không có kết quả

    // Phiếu kín: bảng ballots không chứa id người bầu (FR-019).
    const { results: ballots } = await env.DB.prepare("SELECT * FROM ballots WHERE election_id = '2030-W10'").all();
    expect(ballots).toHaveLength(3);
    for (const id of [i1.id, i2.id, i3.id]) expect(JSON.stringify(ballots)).not.toContain(id);

    const after = plus(W.voteTo, 5);
    const v = await view(i1.cookie, after);
    expect(v.status).toBe("announced");
    expect(v.result).toMatchObject({ winner: head.id, tieBreak: null, tally: [{ candidateId: head.id, votes: 3 }] });
    const term = await env.DB.prepare("SELECT holder_id FROM terms WHERE week = '2030-W11'").first();
    expect(term).toEqual({ holder_id: head.id });

    // Tuần sau: đang làm Viện trưởng → không ứng cử được.
    const next = weekSchedule("2030-W11");
    const v2 = await view(head.cookie, plus(next.nominateFrom, 30));
    expect(v2.myRole).toMatchObject({ canNominate: false, nominateReason: "consecutive" });
  });

  it("ghế trống: không có ứng viên / ít hơn 3 phiếu", async () => {
    const W2 = weekSchedule("2030-W14");
    const h = await asRank(6);
    const [a, b] = await Promise.all([asRank(5), asRank(5)]);
    await at(h.cookie, plus(W2.nominateFrom, 10), "POST", "/api/elections/current/candidacy", { pledge: "Mình xin ứng cử" });
    for (const u of [a, b]) await at(u.cookie, plus(W2.voteFrom, 10), "POST", "/api/elections/current/vote", { candidateId: h.id });
    expect((await view(a.cookie, plus(W2.voteTo, 1))).result).toMatchObject({ winner: null, vacantReason: "few_votes" });
    const W3 = weekSchedule("2030-W16");
    const v = await view(a.cookie, plus(W3.voteTo, 1));
    expect(v).toMatchObject({ status: "vacant", result: { vacantReason: "no_candidates" } });
    // Nhiệm kỳ tuần sau để trống → không có Viện trưởng.
    const st = (await (await at(a.cookie, plus(W3.termFrom, 60), "GET", "/api/world/state")).json()) as { director: unknown };
    expect(st.director).toBeNull();
  });

  it("hòa phiếu → điểm 28 ngày quyết định", async () => {
    const W4 = weekSchedule("2030-W20");
    const [x, y] = await Promise.all([asRank(6), asRank(6)]);
    const voters = await Promise.all([1, 2, 3, 4].map(() => asRank(5)));
    for (const u of [x, y]) await at(u.cookie, plus(W4.nominateFrom, 10), "POST", "/api/elections/current/candidacy", { pledge: "Ứng cử" });
    for (const [i, u] of voters.entries()) await at(u.cookie, plus(W4.voteFrom, 10), "POST", "/api/elections/current/vote", { candidateId: i < 2 ? x.id : y.id });
    await env.DB.prepare("INSERT INTO points_ledger (id, user_id, day, source, dedupe_key, points, created_at) VALUES (?, ?, '2030-05-15', 'quest', 'tie', 50, ?)")
      .bind(crypto.randomUUID(), y.id, plus(W4.voteTo, -3 * 24 * 60))
      .run();
    expect((await view(x.cookie, plus(W4.voteTo, 1))).result).toMatchObject({ winner: y.id, tieBreak: "points_28d" });
  });
});

describe("Viện trưởng (T033) + bảo mật (T032, SC-006)", () => {
  async function director() {
    const week = "2030-W30";
    const S = weekSchedule("2030-W29");
    const d = await asRank(6);
    await env.DB.prepare("INSERT OR REPLACE INTO terms (week, holder_id) VALUES (?, ?)").bind(week, d.id).run();
    return { d, now: plus(S.termFrom, 120), week };
  }

  it("chủ đề, trang trí, nhiệm vụ tuần, thông báo (1 lần/ngày, có kiểm duyệt), danh dự; người khác bị 403", async () => {
    const { d, now, week } = await director();
    const other = await asRank(6);
    expect((await at(other.cookie, now, "POST", "/api/director/theme", { themeId: "theme-sleep" })).status).toBe(403);
    expect((await at(d.cookie, now, "POST", "/api/director/theme", { themeId: "theme-sleep" })).status).toBe(200);
    expect((await at(d.cookie, now, "POST", "/api/director/theme", { themeId: "decor-flags" })).status).toBe(400);
    expect((await at(d.cookie, now, "POST", "/api/director/decor", { decorId: "decor-lanterns" })).status).toBe(200);
    expect((await at(d.cookie, now, "POST", "/api/director/announce", { text: "Đồ ngu hết" })).status).toBe(422);
    expect((await at(d.cookie, now, "POST", "/api/director/announce", { text: "Tuần này cùng ngủ sớm nhé!" })).status).toBe(201);
    const again = await at(d.cookie, plus(now, 30), "POST", "/api/director/announce", { text: "Thêm một thông báo" });
    expect(again.status).toBe(429);
    expect(((await again.json()) as { error: { retryAt: string } }).error.retryAt).toBeTruthy();
    const nick = (await env.DB.prepare("SELECT nickname FROM users WHERE id = ?").bind(other.id).first<{ nickname: string }>())!.nickname;
    expect((await at(d.cookie, now, "POST", "/api/director/honorary", { nicknames: [nick] })).status).toBe(200);

    const st = (await (await at(other.cookie, now, "GET", "/api/world/state")).json()) as Record<string, unknown>;
    expect(st).toMatchObject({ week, director: { id: d.id }, theme: { id: "theme-sleep" }, decor: { id: "decor-lanterns" }, announcement: { text: "Tuần này cùng ngủ sớm nhé!" }, honorary: [nick] });
    const { results: log } = await env.DB.prepare("SELECT action FROM term_actions WHERE week = ? ORDER BY at").bind(week).all<{ action: string }>();
    expect(log.map((l) => l.action)).toEqual(["theme", "decor", "announce", "honorary"]);
  });

  it("nhiệm vụ tuần: đạt mục tiêu → mọi người góp sức được thưởng", async () => {
    const { d, now, week } = await director();
    await env.DB.prepare("INSERT OR REPLACE INTO catalog_items (id, kind, text, data) VALUES ('wq-test', 'weekly_quest', ?, '{\"event\":\"gratitude\",\"target\":2,\"points\":30}')")
      .bind(JSON.stringify({ vi: { title: "Thử", desc: "Thử" }, en: { title: "Test", desc: "Test" } }))
      .run();
    expect((await at(d.cookie, now, "POST", "/api/director/quests", { questIds: ["wq-test"] })).status).toBe(200);
    const [a, b] = await Promise.all([asRank(1), asRank(1)]);
    await recordEvent(env, a.id, { type: "gratitude" }, new Date(now));
    expect((await env.DB.prepare("SELECT count FROM weekly_counters WHERE week = ? AND item_id = 'wq-test'").bind(week).first<{ count: number }>())!.count).toBe(1);
    await recordEvent(env, b.id, { type: "gratitude" }, new Date(now));
    for (const u of [a, b]) {
      const r = await env.DB.prepare("SELECT points FROM points_ledger WHERE user_id = ? AND dedupe_key = ?").bind(u.id, `wq:${week}:wq-test`).first<{ points: number }>();
      expect(r?.points).toBeGreaterThan(0);
    }
  });

  it("Viện trưởng không vào được bất kỳ route admin nào và không đọc được dữ liệu người khác", async () => {
    const { d, now } = await director();
    const victim = await asRank(1);
    const adminRoutes: [string, string][] = [
      ["GET", "/admin/api/flags"],
      ["GET", "/admin/api/flags/x"],
      ["POST", "/admin/api/flags/x/resolve"],
      ["GET", "/admin/api/reports"],
      ["POST", "/admin/api/reports/x/action"],
      ["GET", "/admin/api/circles"],
      ["GET", "/admin/api/ranks"],
      ["PUT", "/admin/api/ranks/3"],
      ["POST", `/admin/api/users/${victim.id}/rank`],
      ["POST", `/admin/api/users/${victim.id}/council`],
      ["POST", "/admin/api/terms/current/remove"],
      ["GET", "/admin/api/terms/2030-W30/actions"],
      ["GET", "/admin/api/elections/2030-W10/voters"],
      ["GET", "/admin/api/catalog"],
    ];
    for (const [m, p] of adminRoutes) expect((await at(d.cookie, now, m, p, m === "GET" ? undefined : {})).status, `${m} ${p}`).toBe(404);
    // Không có route người chơi nào trả dữ liệu riêng của người khác.
    const prof = await (await at(d.cookie, now, "GET", `/api/profile/${victim.id}`)).text();
    expect(prof).not.toMatch(/@example\.com|points|selfcare/i);
    expect((await at(d.cookie, now, "GET", `/api/conversations?userId=${victim.id}`)).status).not.toBe(500);
    const mine = (await (await at(d.cookie, now, "GET", "/api/selfcare")).json()) as unknown[];
    expect(mine).toEqual([]);
  });

  it("admin phế truất → ghế trống tới hết tuần, trang trí giữ nguyên", async () => {
    const { d, now } = await director();
    const admin = await login({ onboarded: true, role: "admin" });
    await at(d.cookie, now, "POST", "/api/director/decor", { decorId: "decor-flags" });
    expect((await at(admin.cookie, now, "POST", "/admin/api/terms/current/remove", { note: "vi phạm quy tắc" })).status).toBe(200);
    const st = (await (await at(d.cookie, now, "GET", "/api/world/state")).json()) as { director: unknown; vacantReason: string; decor: { id: string } };
    expect(st).toMatchObject({ director: null, vacantReason: "removed_by_admin", decor: { id: "decor-flags" } });
    expect((await at(d.cookie, now, "POST", "/api/director/theme", { themeId: "theme-sleep" })).status).toBe(403);
  });
});
