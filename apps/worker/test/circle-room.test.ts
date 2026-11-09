import { env, SELF } from "cloudflare:test";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { BASE, call, login, seedDoctors, seedResources } from "./helpers";

/**
 * CircleRoom — vòng sinh hoạt (T076, ws-protocol.md "CircleRoom", research.md §R11, FR-022–FR-028, FR-038).
 * Dùng model giả "@test/…" (ai/gateway.ts): bộ phân loại đánh dấu quấy rối theo vài cụm từ cố định;
 * lớp từ khóa khủng hoảng chạy như thật.
 */

type Msg = Record<string, unknown> & { t: string };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const open: WebSocket[] = [];

async function connect(cookie: string, circleId: string) {
  const res = await SELF.fetch(`${BASE}/ws/circle/${circleId}`, { headers: { Upgrade: "websocket", cookie } });
  expect(res.status).toBe(101);
  const ws = res.webSocket!;
  ws.accept();
  open.push(ws);
  const inbox: Msg[] = [];
  ws.addEventListener("message", (e) => inbox.push(JSON.parse(e.data as string)));
  return {
    ws,
    inbox,
    send: (m: unknown) => ws.send(JSON.stringify(m)),
    async waitFor(pred: (m: Msg) => boolean, timeout = 3000): Promise<Msg> {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const i = inbox.findIndex(pred);
        if (i >= 0) return inbox.splice(i, 1)[0];
        await sleep(10);
      }
      throw new Error(`timeout waiting; inbox=${JSON.stringify(inbox).slice(0, 400)}`);
    },
    /** Không có tin nào khớp trong `ms`. */
    async never(pred: (m: Msg) => boolean, ms = 400) {
      await sleep(ms);
      expect(inbox.find(pred), JSON.stringify(inbox).slice(0, 300)).toBeUndefined();
    },
  };
}

async function makeCircle(language: "vi" | "en" = "vi", maxSeats = 12) {
  const id = `t-${crypto.randomUUID().slice(0, 12)}`;
  await env.DB.prepare("INSERT INTO circles (id, name, language, max_seats, active, sort, created_at) VALUES (?, ?, ?, ?, 1, 999, ?)")
    .bind(id, `Test ${id}`, language, maxSeats, new Date().toISOString())
    .run();
  return id;
}

async function seated(cookie: string, circleId: string, seat: number) {
  const c = await connect(cookie, circleId);
  await c.waitFor((m) => m.t === "welcome");
  c.send({ t: "sit", seat });
  await c.waitFor((m) => m.t === "seat_update" && m.seat === seat && m.userId !== null);
  return c;
}

async function setSetting(key: string, value: string) {
  await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(key, value).run();
}

beforeAll(async () => {
  await seedResources();
  await seedDoctors();
  await setSetting("model_classifier", "@test/classifier");
  await setSetting("model_chat", "@test/chat");
});

afterAll(async () => {
  await env.DB.prepare("DELETE FROM settings WHERE key IN ('model_classifier','model_chat')").run();
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

describe("API vòng sinh hoạt (T081)", () => {
  it("danh sách xếp vòng cùng ngôn ngữ trước (FR-038)", async () => {
    const vi = await login({ onboarded: true, locale: "vi" });
    const en = await login({ onboarded: true, locale: "en" });
    const lv = (await (await call(vi.cookie, "GET", "/api/circles")).json()) as { language: string }[];
    const le = (await (await call(en.cookie, "GET", "/api/circles")).json()) as { language: string; maxSeats: number; seatsTaken: number }[];
    expect(lv[0].language).toBe("vi");
    expect(le[0]).toMatchObject({ language: "en", maxSeats: 12 });
    expect(typeof le[0].seatsTaken).toBe("number");
  });

  it("vòng đầy → full + gợi ý vòng khác (FR-023)", async () => {
    const id = await makeCircle("vi", 4);
    const users = await Promise.all([1, 2, 3, 4, 5].map(() => login({ onboarded: true })));
    for (const u of users.slice(0, 4)) await (await connect(u.cookie, id)).waitFor((m) => m.t === "welcome");
    const j = (await (await call(users[4].cookie, "POST", `/api/circles/${id}/join`)).json()) as { full?: boolean; alternatives?: { id: string }[] };
    expect(j.full).toBe(true);
    expect(j.alternatives!.length).toBeGreaterThan(0);
    expect(j.alternatives!.some((a) => a.id === id)).toBe(false);
    // Người đang ở trong vòng vẫn vào lại được.
    expect(await (await call(users[0].cookie, "POST", `/api/circles/${id}/join`)).json()).toEqual({ wsUrl: `/ws/circle/${id}` });
  });

  it("vòng không tồn tại → 404", async () => {
    const a = await login({ onboarded: true });
    expect((await call(a.cookie, "POST", "/api/circles/khong-co/join")).status).toBe(404);
    const res = await SELF.fetch(`${BASE}/ws/circle/BAD!`, { headers: { Upgrade: "websocket", cookie: a.cookie } });
    expect(res.status).toBe(404);
  });
});

describe("CircleRoom (T076)", () => {
  it("ngồi/đứng: mọi người thấy ghế; ghế đã có người thì báo SEAT_TAKEN", async () => {
    const id = await makeCircle();
    const a = await login({ onboarded: true });
    const b = await login({ onboarded: true });
    const A = await seated(a.cookie, id, 0);
    const B = await connect(b.cookie, id);
    const w = await B.waitFor((m) => m.t === "welcome");
    expect(w).toMatchObject({ circle: { id, language: "vi", maxSeats: 12 }, seats: [{ seat: 0, userId: a.id }] });
    B.send({ t: "sit", seat: 0 });
    await B.waitFor((m) => m.t === "warn" && m.code === "SEAT_TAKEN");
    A.send({ t: "stand" });
    await B.waitFor((m) => m.t === "seat_update" && m.seat === 0 && m.userId === null);
  });

  it("chưa ngồi thì không chat được; đã ngồi thì tin tới mọi người", async () => {
    const id = await makeCircle();
    const a = await login({ onboarded: true });
    const b = await login({ onboarded: true });
    const B = await connect(b.cookie, id);
    await B.waitFor((m) => m.t === "welcome");
    B.send({ t: "chat", text: "chào", clientMsgId: "x" });
    await B.waitFor((m) => m.t === "warn" && m.code === "NOT_SEATED");
    const A = await seated(a.cookie, id, 1);
    A.send({ t: "chat", text: "Chào mọi người, hôm nay mình hơi mệt.", clientMsgId: "m1" });
    const got = await B.waitFor((m) => m.t === "chat");
    expect(got).toMatchObject({ from: { id: a.id }, text: "Chào mọi người, hôm nay mình hơi mệt." });
    await A.waitFor((m) => m.t === "chat");
  });

  it("tin quấy rối bị chặn trước khi phát: chỉ người gửi biết lý do (FR-027)", async () => {
    const id = await makeCircle();
    const a = await login({ onboarded: true });
    const b = await login({ onboarded: true });
    const A = await seated(a.cookie, id, 0);
    const B = await seated(b.cookie, id, 1);
    A.send({ t: "chat", text: "Đồ ngu, câm mồm đi.", clientMsgId: "bad" });
    expect(await A.waitFor((m) => m.t === "chat_rejected")).toMatchObject({ clientMsgId: "bad", reason: "harassment" });
    await B.never((m) => m.t === "chat");
  });

  it("tin khủng hoảng: không phát; chỉ người gửi nhận `support` (số từ DB); có cờ source=circle", async () => {
    const id = await makeCircle();
    const a = await login({ onboarded: true });
    const b = await login({ onboarded: true });
    const A = await seated(a.cookie, id, 0);
    const B = await seated(b.cookie, id, 1);
    A.send({ t: "chat", text: "tối nay tôi sẽ tự tử", clientMsgId: "c1" });
    const support = await A.waitFor((m) => m.t === "support");
    expect(String(support.message)).toContain("115");
    expect(await A.waitFor((m) => m.t === "chat_rejected")).toMatchObject({ reason: "harmful" });
    await B.never((m) => m.t === "chat" || m.t === "support");
    const flag = await env.DB.prepare("SELECT level, source FROM crisis_flags WHERE user_id = ?").bind(a.id).first();
    expect(flag).toMatchObject({ level: "acute", source: "circle" });
  });

  it("giới hạn 1 tin mỗi 3 giây → spam", async () => {
    const id = await makeCircle();
    const a = await login({ onboarded: true });
    const A = await seated(a.cookie, id, 0);
    A.send({ t: "chat", text: "một", clientMsgId: "1" });
    A.send({ t: "chat", text: "hai", clientMsgId: "2" });
    expect(await A.waitFor((m) => m.t === "chat_rejected")).toMatchObject({ clientMsgId: "2", reason: "spam" });
  });

  it("chặn: người chặn không nhận tin của người bị chặn, kể cả trong `recent` (FR-026)", async () => {
    const id = await makeCircle();
    const [a, b, c] = await Promise.all([1, 2, 3].map(() => login({ onboarded: true })));
    expect((await call(b.cookie, "POST", "/api/blocks", { userId: a.id })).status).toBe(204);
    expect((await call(b.cookie, "POST", "/api/blocks", { userId: b.id })).status).toBe(400);
    const A = await seated(a.cookie, id, 0);
    const B = await seated(b.cookie, id, 1);
    const C = await seated(c.cookie, id, 2);
    A.send({ t: "chat", text: "Mình là A đây.", clientMsgId: "a1" });
    await C.waitFor((m) => m.t === "chat" && m.text === "Mình là A đây.");
    await B.never((m) => m.t === "chat");
    // Vào lại: lịch sử vẫn lọc.
    const B2 = await connect(b.cookie, id);
    const w = await B2.waitFor((m) => m.t === "welcome");
    expect((w.recent as { from: { id: string } }[]).some((r) => r.from.id === a.id)).toBe(false);
    const C2 = await connect(c.cookie, id);
    expect(((await C2.waitFor((m) => m.t === "welcome")).recent as unknown[]).length).toBe(1);
    // Bỏ chặn.
    expect((await call(b.cookie, "DELETE", `/api/blocks/${a.id}`)).status).toBe(204);
  });

  it("báo cáo → admin thấy (quá 12 giờ thì overdue) → ẩn tin: biến mất ở mọi người (FR-028)", async () => {
    const id = await makeCircle();
    const [a, b] = await Promise.all([1, 2].map(() => login({ onboarded: true })));
    const admin = await login({ onboarded: true, role: "admin" });
    const A = await seated(a.cookie, id, 0);
    const B = await seated(b.cookie, id, 1);
    A.send({ t: "chat", text: "Tin này hơi khó chịu.", clientMsgId: "r1" });
    const chat = await B.waitFor((m) => m.t === "chat");
    const body = { reportedUserId: a.id, context: { circleId: id, messageId: chat.id }, reason: "harassment" };
    const r = await call(b.cookie, "POST", "/api/reports", body);
    expect(r.status).toBe(201);
    const { id: reportId } = (await r.json()) as { id: string };
    expect((await call(b.cookie, "POST", "/api/reports", body)).status).toBe(409);
    // Báo cáo tin không phải của người đó → 404.
    expect((await call(b.cookie, "POST", "/api/reports", { ...body, reportedUserId: admin.id })).status).toBe(404);
    // Người chơi không xem được trang admin.
    expect((await call(b.cookie, "GET", "/admin/api/reports")).status).toBe(404);

    await env.DB.prepare("UPDATE reports SET created_at = ? WHERE id = ?").bind(new Date(Date.now() - 13 * 3600_000).toISOString(), reportId).run();
    const list = (await (await call(admin.cookie, "GET", "/admin/api/reports?status=open")).json()) as { id: string; overdue: boolean; message_snapshot: string }[];
    expect(list.find((x) => x.id === reportId)).toMatchObject({ overdue: true, message_snapshot: "Tin này hơi khó chịu." });

    expect((await call(admin.cookie, "POST", `/admin/api/reports/${reportId}/action`, { action: "hide" })).status).toBe(200);
    await A.waitFor((m) => m.t === "chat_hidden" && m.id === chat.id);
    await B.waitFor((m) => m.t === "chat_hidden" && m.id === chat.id);
    const B2 = await connect(b.cookie, id);
    expect(((await B2.waitFor((m) => m.t === "welcome")).recent as unknown[]).length).toBe(0);
    expect((await call(admin.cookie, "POST", `/admin/api/reports/${reportId}/action`, { action: "hide" })).status).toBe(409);
  });

  it("khóa tạm thời qua báo cáo → bị ngắt khỏi vòng, không vào lại được", async () => {
    const id = await makeCircle();
    const [a, b] = await Promise.all([1, 2].map(() => login({ onboarded: true })));
    const admin = await login({ onboarded: true, role: "admin" });
    const A = await seated(a.cookie, id, 0);
    const B = await seated(b.cookie, id, 1);
    A.send({ t: "chat", text: "Tin bị báo cáo.", clientMsgId: "s1" });
    const chat = await B.waitFor((m) => m.t === "chat");
    const { id: reportId } = (await (
      await call(b.cookie, "POST", "/api/reports", { reportedUserId: a.id, context: { circleId: id, messageId: chat.id }, reason: "spam" })
    ).json()) as { id: string };
    expect((await call(admin.cookie, "POST", `/admin/api/reports/${reportId}/action`, { action: "suspend" })).status).toBe(400);
    expect((await call(admin.cookie, "POST", `/admin/api/reports/${reportId}/action`, { action: "suspend", days: 3 })).status).toBe(200);
    await A.waitFor((m) => m.t === "kicked" && m.reason === "SUSPENDED");
    await B.waitFor((m) => m.t === "seat_update" && m.seat === 0 && m.userId === null);
    expect((await call(a.cookie, "POST", `/api/circles/${id}/join`)).status).toBe(403);
  });

  it("bác sĩ AI dẫn dắt theo lịch, nói ngôn ngữ của vòng (FR-024, FR-038)", async () => {
    const id = await makeCircle("en");
    const admin = await login({ onboarded: true, role: "admin" });
    const a = await login({ onboarded: true, locale: "vi" });
    const A = await seated(a.cookie, id, 0);
    const now = Date.now();
    const res = await call(admin.cookie, "POST", "/admin/api/circle-sessions", {
      circleId: id,
      doctorId: "dr-an",
      topic: "Sleep and stress",
      startsAt: new Date(now - 1000).toISOString(),
      endsAt: new Date(now + 3000).toISOString(),
    });
    expect(res.status).toBe(201);
    expect(await A.waitFor((m) => m.t === "session" && m.status === "live", 5000)).toMatchObject({ topic: "Sleep and stress" });
    const lines = [await A.waitFor((m) => m.t === "facilitator", 5000), await A.waitFor((m) => m.t === "facilitator", 5000)];
    for (const l of lines) expect(l).toMatchObject({ label: "AI", doctor: { id: "dr-an", name: "Dr. An" } });
    // Model giả trả tiếng Anh vì vòng là tiếng Anh, dù người chơi chọn tiếng Việt.
    expect(String(lines[0].text)).toMatch(/Test AI|Hi everyone/);
    expect(await A.waitFor((m) => m.t === "session" && m.status === "ended", 8000)).toBeTruthy();
    const row = await env.DB.prepare("SELECT status FROM circle_sessions WHERE circle_id = ?").bind(id).first();
    expect(row).toMatchObject({ status: "ended" });
  });

  it("dữ liệu sai bị từ chối", async () => {
    const admin = await login({ onboarded: true, role: "admin" });
    expect((await call(admin.cookie, "POST", "/admin/api/circle-sessions", { circleId: "x", doctorId: "dr-an", topic: "t", startsAt: "a", endsAt: "b" })).status).toBe(400);
    expect((await call(admin.cookie, "PUT", "/admin/api/circles/abc-def", { name: "Vòng mới", language: "vi", maxSeats: 30 })).status).toBe(400);
    expect((await call(admin.cookie, "PUT", "/admin/api/circles/abc-def", { name: "Vòng mới", language: "vi", maxSeats: 8 })).status).toBe(200);
  });
});
