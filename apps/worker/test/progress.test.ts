import { env, SELF } from "cloudflare:test";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import type { CircleRoom } from "../src/do/circle-room";
import { award } from "../src/progress/ledger";
import { recordEvent } from "../src/progress/quests";
import { vnDay } from "../src/progress/time";
import { BASE, call, login, seedDoctors, seedResources } from "./helpers";

/** 002 — sổ cái (T005), nhiệm vụ (T008, T009), cấp bậc (T017). */

type Msg = Record<string, unknown> & { t: string };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const open: WebSocket[] = [];

async function connect(cookie: string, path: string) {
  const res = await SELF.fetch(`${BASE}${path}`, { headers: { Upgrade: "websocket", cookie } });
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  ws.accept();
  open.push(ws);
  const inbox: Msg[] = [];
  ws.addEventListener("message", (e) => inbox.push(JSON.parse(e.data as string)));
  return {
    send: (m: unknown) => ws.send(JSON.stringify(m)),
    async waitFor(pred: (m: Msg) => boolean, timeout = 3000): Promise<Msg> {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const i = inbox.findIndex(pred);
        if (i >= 0) return inbox.splice(i, 1)[0];
        await sleep(10);
      }
      throw new Error(`timeout; inbox=${JSON.stringify(inbox).slice(0, 300)}`);
    },
  };
}

interface QuestList {
  daily: { id: string; category: string; event: string; status: string; progress: number; spot: { zone: string; spot: string } | null }[];
  chain: { id: string; status: string }[];
}
const quests = async (cookie: string) => (await (await call(cookie, "GET", "/api/quests")).json()) as QuestList;
const progress = async (cookie: string) =>
  (await (await call(cookie, "GET", "/api/progress")).json()) as {
    rank: { level: number; key: string };
    totalPoints: number;
    todayPoints: number;
    activeDays: number;
    eligible: boolean;
    next: { level: number; requirements: { kind: string; have: number; need: number }[] } | null;
  };

/** Ép nhiệm vụ ngày hôm nay thành các mẫu cho trước (giao ngẫu nhiên theo hash). */
async function forceDaily(userId: string, ids: string[]) {
  const day = vnDay();
  await env.DB.prepare("DELETE FROM user_quests WHERE user_id = ? AND period = ?").bind(userId, day).run();
  for (const id of ids) {
    await env.DB.prepare("INSERT INTO user_quests (user_id, quest_id, period, progress, target) SELECT ?, id, ?, 0, target FROM quest_templates WHERE id = ?")
      .bind(userId, day, id)
      .run();
  }
}

beforeAll(async () => {
  await seedResources();
  await seedDoctors();
  await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('model_classifier', '@test/classifier')").run();
});
afterAll(async () => {
  await env.DB.prepare("DELETE FROM settings WHERE key = 'model_classifier'").run();
});
afterEach(async () => {
  for (const ws of open.splice(0)) {
    try {
      ws.close(1000, "done");
    } catch {
      /* đã đóng */
    }
  }
  await sleep(50);
});

describe("sổ cái điểm (T005)", () => {
  it("cùng khóa chỉ tính một lần; cắt theo giới hạn 100/ngày; không trừ", async () => {
    const a = await login({ onboarded: true });
    expect(await award(env, a.id, { source: "minigame", dedupeKey: "x1", points: 60 })).toBe(60);
    expect(await award(env, a.id, { source: "minigame", dedupeKey: "x1", points: 60 })).toBeNull();
    expect(await award(env, a.id, { source: "minigame", dedupeKey: "x2", points: 60 })).toBe(40);
    expect(await award(env, a.id, { source: "minigame", dedupeKey: "x3", points: 30 })).toBe(0);
    const p = await progress(a.cookie);
    expect(p).toMatchObject({ totalPoints: 100, todayPoints: 100, activeDays: 1 });
    // Ngày hôm sau: giới hạn mới, thêm 1 ngày hoạt động.
    expect(await award(env, a.id, { source: "minigame", dedupeKey: "x4", points: 30 }, new Date(Date.now() + 86400_000))).toBe(30);
    expect((await progress(a.cookie)).activeDays).toBe(2);
  });
});

describe("nhiệm vụ hằng ngày (T008)", () => {
  it("3 nhiệm vụ thuộc 3 nhóm, ổn định trong ngày, chữ theo ngôn ngữ", async () => {
    const a = await login({ onboarded: true, locale: "en" });
    const q1 = await quests(a.cookie);
    expect(q1.daily.map((q) => q.category).sort()).toEqual(["community", "explore", "selfcare"]);
    expect((await quests(a.cookie)).daily.map((q) => q.id)).toEqual(q1.daily.map((q) => q.id));
    // Bậc 1 có chuỗi "Ngày đầu ở viện" 4 bước.
    expect(q1.chain.map((q) => q.id)).toEqual(["firstday-1", "firstday-2", "firstday-3", "firstday-4"]);
  });

  it("tới hotspot trong WorldZone → nhiệm vụ khám phá xong (máy chủ xác nhận)", async () => {
    const a = await login({ onboarded: true });
    await forceDaily(a.id, ["daily-pond"]);
    const A = await connect(a.cookie, `/ws/zone/garden-${Math.floor(Math.random() * 900) + 50}`);
    await A.waitFor((m) => m.t === "welcome");
    A.send({ t: "move", p: [9, 0, -3.8], r: 0, a: "walk" });
    const qp = await A.waitFor((m) => m.t === "quest_progress" && m.questId === "daily-pond");
    expect(qp).toMatchObject({ status: "done", awarded: 15 });
    expect((await quests(a.cookie)).daily[0]).toMatchObject({ id: "daily-pond", status: "done" });
  });

  it("vẫy tay chỉ tính khi có người ở gần", async () => {
    const [a, b] = await Promise.all([login({ onboarded: true }), login({ onboarded: true })]);
    await forceDaily(a.id, ["daily-wave"]);
    const zone = `/ws/zone/lobby-${Math.floor(Math.random() * 900) + 50}`;
    const A = await connect(a.cookie, `${zone}?x=0&z=6`);
    await A.waitFor((m) => m.t === "welcome");
    A.send({ t: "emote", e: "wave" });
    await sleep(300);
    expect((await quests(a.cookie)).daily[0].status).toBe("active");
    const B = await connect(b.cookie, `${zone}?x=2&z=6`);
    await B.waitFor((m) => m.t === "welcome");
    await sleep(2100);
    A.send({ t: "emote", e: "wave" });
    expect(await A.waitFor((m) => m.t === "quest_progress")).toMatchObject({ questId: "daily-wave", status: "done" });
  });

  it("bài thở: kết thúc sớm → 400; đủ 170 giây → xong", async () => {
    const a = await login({ onboarded: true });
    await forceDaily(a.id, ["daily-breath"]);
    const { token } = (await (await call(a.cookie, "POST", "/api/quests/breath/start", {})).json()) as { token: string };
    expect((await call(a.cookie, "POST", "/api/quests/breath/finish", { token })).status).toBe(400);
    await env.DB.prepare("UPDATE breath_sessions SET started_at = ? WHERE token = ?").bind(new Date(Date.now() - 180_000).toISOString(), token).run();
    const r = (await (await call(a.cookie, "POST", "/api/quests/breath/finish", { token })).json()) as { awarded: number };
    expect(r.awarded).toBe(20);
    // Mã chỉ dùng một lần.
    expect((await call(a.cookie, "POST", "/api/quests/breath/finish", { token })).status).toBe(400);
  });

  it("cảm xúc / biết ơn chỉ nằm (mã hóa) trong PatientRecord, không có trong D1 (FR-006)", async () => {
    const a = await login({ onboarded: true });
    await forceDaily(a.id, ["daily-gratitude"]);
    const r = (await (await call(a.cookie, "POST", "/api/selfcare", { kind: "gratitude", text: "Biết ơn ly cà phê sáng nay" })).json()) as { awarded: number; support: unknown };
    expect(r).toMatchObject({ awarded: 15, support: null });
    expect((await call(a.cookie, "POST", "/api/selfcare", { kind: "mood", value: "ok" })).status).toBe(200);
    for (const table of ["points_ledger", "user_quests", "user_progress"]) {
      const { results } = await env.DB.prepare(`SELECT * FROM ${table} WHERE user_id = ?`).bind(a.id).all();
      expect(JSON.stringify(results)).not.toContain("cà phê");
    }
    const list = (await (await call(a.cookie, "GET", "/api/selfcare")).json()) as { kind: string; value: string }[];
    expect(list.map((x) => x.value).sort()).toEqual(["Biết ơn ly cà phê sáng nay", "ok"]);
    // Dòng tự viết có dấu hiệu khủng hoảng → vẫn đưa thông tin hỗ trợ.
    const crisis = (await (await call(a.cookie, "POST", "/api/selfcare", { kind: "gratitude", text: "tối nay tôi sẽ tự tử" })).json()) as { support: { message: string } };
    expect(crisis.support.message).toContain("115");
    expect((await call(a.cookie, "DELETE", "/api/selfcare")).status).toBe(204);
    expect(await (await call(a.cookie, "GET", "/api/selfcare")).json()).toEqual([]);
  });
});

describe("nhiệm vụ ở vòng sinh hoạt (T009)", () => {
  async function circle() {
    const id = `t-${crypto.randomUUID().slice(0, 12)}`;
    await env.DB.prepare("INSERT INTO circles (id, name, language, max_seats, active, sort, created_at) VALUES (?, ?, 'vi', 12, 1, 999, ?)").bind(id, `Test ${id}`, new Date().toISOString()).run();
    return id;
  }

  it("ngồi đủ 10 phút → nhiệm vụ ngồi xong; vào vòng → bước 'ghé phòng sinh hoạt'", async () => {
    const a = await login({ onboarded: true });
    await forceDaily(a.id, ["daily-sit"]);
    const id = await circle();
    const A = await connect(a.cookie, `/ws/circle/${id}`);
    await A.waitFor((m) => m.t === "welcome");
    expect(await A.waitFor((m) => m.t === "quest_progress" && m.questId === "firstday-4")).toMatchObject({ status: "done" });
    A.send({ t: "sit", seat: 0 });
    await A.waitFor((m) => m.t === "seat_update" && m.userId === a.id);
    const stub = env.CIRCLE_ROOM.get(env.CIRCLE_ROOM.idFromName(id)) as DurableObjectStub<CircleRoom>;
    await stub.testShiftSit(a.id, 11 * 60_000);
    A.send({ t: "stand" });
    expect(await A.waitFor((m) => m.t === "quest_progress" && m.questId === "daily-sit")).toMatchObject({ progress: 10, status: "done", awarded: 25 });
  });

  it("cảm ơn: cùng một người 1 lần/ngày; không tính khi đã chặn; không cảm ơn chính mình", async () => {
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => login({ onboarded: true })));
    for (const u of [a, c]) await forceDaily(u.id, ["daily-thank"]);
    await call(c.cookie, "POST", "/api/blocks", { userId: b.id });
    const id = await circle();
    const B = await connect(b.cookie, `/ws/circle/${id}`);
    await B.waitFor((m) => m.t === "welcome");
    B.send({ t: "sit", seat: 1 });
    await B.waitFor((m) => m.t === "seat_update" && m.userId === b.id);
    B.send({ t: "chat", text: "Hôm nay mình đi bộ được 20 phút.", clientMsgId: "1" });
    const chat = await B.waitFor((m) => m.t === "chat");
    const A = await connect(a.cookie, `/ws/circle/${id}`);
    await A.waitFor((m) => m.t === "welcome");
    A.send({ t: "thank", messageId: chat.id });
    expect(await A.waitFor((m) => m.t === "thanked")).toMatchObject({ messageId: chat.id, count: 1 });
    expect(await A.waitFor((m) => m.t === "quest_progress" && m.questId === "daily-thank")).toMatchObject({ status: "done" });
    const row = await env.DB.prepare("SELECT COUNT(*) AS n FROM thanks WHERE from_user_id = ?").bind(a.id).first<{ n: number }>();
    expect(row!.n).toBe(1);
    // C đã chặn B: lời cảm ơn vẫn hiện số đếm nhưng không được tính nhiệm vụ.
    const C = await connect(c.cookie, `/ws/circle/${id}`);
    await C.waitFor((m) => m.t === "welcome");
    C.send({ t: "thank", messageId: chat.id });
    await sleep(400);
    expect((await quests(c.cookie)).daily[0].status).toBe("active");
    B.send({ t: "thank", messageId: chat.id });
    await sleep(200);
    const self = await env.DB.prepare("SELECT COUNT(*) AS n FROM thanks WHERE from_user_id = ?").bind(b.id).first<{ n: number }>();
    expect(self!.n).toBe(0);
  });
});

describe("cấp bậc (T017)", () => {
  it("bước tiếp theo nêu đủ điều kiện; chưa đủ → 409; đủ → lên 1 bậc + lịch sử + chuỗi mới", async () => {
    const a = await login({ onboarded: true });
    const p0 = await progress(a.cookie);
    expect(p0.rank).toEqual({ level: 1, key: "patient" });
    expect(p0.next!.requirements).toEqual([
      { kind: "points", have: 0, need: 100 },
      { kind: "days", have: 0, need: 0 },
      expect.objectContaining({ kind: "chain", have: 0, need: 4 }),
    ]);
    expect((await call(a.cookie, "POST", "/api/ranks/promote", {})).status).toBe(409);
    for (const spot of [["court", "portico"], ["lobby", "staircase"], ["garden", "pond"]] as const) {
      await recordEvent(env, a.id, { type: "reach", zone: spot[0], spot: spot[1] });
    }
    await recordEvent(env, a.id, { type: "circle_visit" });
    await award(env, a.id, { source: "minigame", dedupeKey: "boost", points: 50 });
    const p1 = await progress(a.cookie);
    expect(p1.eligible).toBe(true);
    const r = (await (await call(a.cookie, "POST", "/api/ranks/promote", {})).json()) as { level: number; key: string };
    expect(r).toMatchObject({ level: 2, key: "cleaner" });
    const hist = await env.DB.prepare("SELECT from_rank, to_rank, reason FROM rank_history WHERE user_id = ?").bind(a.id).first();
    expect(hist).toEqual({ from_rank: 1, to_rank: 2, reason: "promotion" });
    expect((await quests(a.cookie)).chain.map((q) => q.id)).toEqual(["helper-1", "helper-2", "helper-3"]);
    // Không nhảy cóc: lần sau vẫn chưa đủ.
    expect((await call(a.cookie, "POST", "/api/ranks/promote", {})).status).toBe(409);
  });

  it("hồ sơ công khai chỉ có biệt danh + chức danh, không có điểm/email", async () => {
    const [a, b] = await Promise.all([login({ onboarded: true }), login({ onboarded: true })]);
    const prof = (await (await call(b.cookie, "GET", `/api/profile/${a.id}`)).json()) as Record<string, unknown>;
    expect(prof).toMatchObject({ rank: { level: 1, key: "patient" }, inGameTitle: true });
    expect(JSON.stringify(prof)).not.toMatch(/example\.com|Points/);
  });

  it("chức danh đi kèm người chơi trong WorldZone", async () => {
    const [a, b] = await Promise.all([login({ onboarded: true }), login({ onboarded: true })]);
    await env.DB.prepare("INSERT OR REPLACE INTO user_progress (user_id, rank, updated_at) VALUES (?, 3, ?)").bind(a.id, new Date().toISOString()).run();
    const zone = `/ws/zone/lobby-${Math.floor(Math.random() * 900) + 50}`;
    const A = await connect(a.cookie, zone);
    await A.waitFor((m) => m.t === "welcome");
    const B = await connect(b.cookie, zone);
    const w = await B.waitFor((m) => m.t === "welcome");
    expect((w.players as { id: string; rank: number }[]).find((p) => p.id === a.id)?.rank).toBe(3);
  });
});

describe("admin cấp bậc (T021)", () => {
  it("đổi ngưỡng không hạ người đã ở bậc; hạ cấp có lý do, ghi lịch sử", async () => {
    const admin = await login({ onboarded: true, role: "admin" });
    const a = await login({ onboarded: true });
    await env.DB.prepare("INSERT OR REPLACE INTO user_progress (user_id, rank, updated_at) VALUES (?, 3, ?)").bind(a.id, new Date().toISOString()).run();
    expect((await call(a.cookie, "PUT", "/admin/api/ranks/3", { minPoints: 1, minActiveDays: 0 })).status).toBe(404);
    expect((await call(admin.cookie, "PUT", "/admin/api/ranks/3", { minPoints: 9999, minActiveDays: 3 })).status).toBe(200);
    expect((await progress(a.cookie)).rank.level).toBe(3);
    expect((await call(admin.cookie, "POST", `/admin/api/users/${a.id}/rank`, { level: 2 })).status).toBe(400);
    expect((await call(admin.cookie, "POST", `/admin/api/users/${a.id}/rank`, { level: 2, note: "quấy rối nhiều lần" })).status).toBe(200);
    expect((await progress(a.cookie)).rank.level).toBe(2);
    const h = await env.DB.prepare("SELECT reason, note FROM rank_history WHERE user_id = ?").bind(a.id).first();
    expect(h).toEqual({ reason: "admin_demote", note: "quấy rối nhiều lần" });
    await call(admin.cookie, "PUT", "/admin/api/ranks/3", { minPoints: 400, minActiveDays: 3 });
  });
});
