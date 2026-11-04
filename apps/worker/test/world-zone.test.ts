import { env, SELF } from "cloudflare:test";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { BASE, call, login, seedDoctors, seedResources } from "./helpers";

/** WorldZone — sảnh/vườn/hành lang realtime (T063, contracts/ws-protocol.md, research.md §R2). */

type Msg = Record<string, unknown> & { t: string };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const open: WebSocket[] = [];

async function connect(cookie: string, zone: string, query = "") {
  const res = await SELF.fetch(`${BASE}/ws/zone/${zone}${query}`, { headers: { Upgrade: "websocket", cookie } });
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
    async waitFor(pred: (m: Msg) => boolean, timeout = 2000): Promise<Msg> {
      const start = Date.now();
      while (Date.now() - start < timeout) {
        const i = inbox.findIndex(pred);
        if (i >= 0) return inbox.splice(i, 1)[0];
        await sleep(10);
      }
      throw new Error(`timeout waiting; inbox=${JSON.stringify(inbox).slice(0, 300)}`);
    },
  };
}

async function setCapacity(n: number) {
  await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('zone_capacity', ?)").bind(String(n)).run();
}

beforeAll(async () => {
  await seedResources();
  await seedDoctors();
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
  await setCapacity(150);
});

describe("WorldZone (T063)", () => {
  it("welcome → join → leave", async () => {
    const a = await login({ onboarded: true });
    const b = await login({ onboarded: true });
    const A = await connect(a.cookie, "lobby-11");
    const wa = await A.waitFor((m) => m.t === "welcome");
    expect(wa).toMatchObject({ selfId: a.id, zoneId: "lobby-11", players: [] });

    const B = await connect(b.cookie, "lobby-11", "?x=1&z=2");
    const wb = await B.waitFor((m) => m.t === "welcome");
    expect((wb.players as { id: string }[]).map((p) => p.id)).toEqual([a.id]);
    const join = await A.waitFor((m) => m.t === "join");
    expect(join.player).toMatchObject({ id: b.id, p: [1, 0, 2], a: "idle" });
    // Không lộ email hay thông tin ngoài biệt danh + nhân vật.
    expect(JSON.stringify(join)).not.toContain("@example.com");

    B.ws.close(1000, "bye");
    const leave = await A.waitFor((m) => m.t === "leave");
    expect(leave.id).toBe(b.id);
  });

  it("snapshot chỉ gồm người trong bán kính 30 m", async () => {
    const a = await login({ onboarded: true });
    const b = await login({ onboarded: true });
    const A = await connect(a.cookie, "lobby-21");
    await A.waitFor((m) => m.t === "welcome");
    const B = await connect(b.cookie, "lobby-21", "?x=1&z=1");
    await B.waitFor((m) => m.t === "welcome");

    // Người mới vào: cả hai bên nhận snapshot thấy nhau.
    expect((await A.waitFor((m) => m.t === "snapshot")).players).toEqual([{ id: b.id, p: [1, 0, 1], r: 0, a: "idle" }]);
    expect((await B.waitFor((m) => m.t === "snapshot")).players).toEqual([{ id: a.id, p: [0, 0, 0], r: 0, a: "idle" }]);

    B.send({ t: "move", p: [3, 0, 3], r: 0.5, a: "walk" });
    const near = await A.waitFor((m) => m.t === "snapshot");
    expect(near).toMatchObject({ players: [{ id: b.id, p: [3, 0, 3], r: 0.5, a: "walk" }], gone: [] });

    B.send({ t: "move", p: [90, 0, 90], r: 0.5, a: "walk" });
    const far = await A.waitFor((m) => m.t === "snapshot");
    expect(far).toMatchObject({ players: [], gone: [b.id] });
    // A đứng yên: không gửi lại cho A những gì A đã biết.
    await sleep(250);
    expect(A.inbox.filter((m) => m.t === "snapshot")).toHaveLength(0);
  });

  it("gửi dồn quá giới hạn → bị bỏ qua và nhận cảnh báo", async () => {
    const a = await login({ onboarded: true });
    const A = await connect(a.cookie, "lobby-31");
    await A.waitFor((m) => m.t === "welcome");
    for (let i = 0; i < 20; i++) A.send({ t: "move", p: [i * 0.1, 0, 0], r: 0, a: "walk" });
    expect(await A.waitFor((m) => m.t === "warn")).toEqual({ t: "warn", code: "RATE_LIMITED" });
  });

  it("zone đầy → zone_full kèm bản sao kế tiếp", async () => {
    await setCapacity(2);
    const users = [await login({ onboarded: true }), await login({ onboarded: true }), await login({ onboarded: true })];
    const conns = [];
    for (const u of users) conns.push(await connect(u.cookie, "lobby-41"));
    await conns[0].waitFor((m) => m.t === "welcome");
    await conns[1].waitFor((m) => m.t === "welcome");
    expect(await conns[2].waitFor((m) => m.t === "zone_full")).toEqual({ t: "zone_full", redirectZoneId: "lobby-42" });
  });

  it("cùng tài khoản mở hai tab → tab cũ bị đóng (DUPLICATE)", async () => {
    const a = await login({ onboarded: true });
    const first = await connect(a.cookie, "lobby-51");
    await first.waitFor((m) => m.t === "welcome");
    const second = await connect(a.cookie, "lobby-51");
    await second.waitFor((m) => m.t === "welcome");
    expect(await first.waitFor((m) => m.t === "kicked")).toEqual({ t: "kicked", reason: "DUPLICATE" });
  });

  it("emote chỉ 1 lần mỗi 2 giây", async () => {
    const a = await login({ onboarded: true });
    const b = await login({ onboarded: true });
    const A = await connect(a.cookie, "lobby-61");
    await A.waitFor((m) => m.t === "welcome");
    const B = await connect(b.cookie, "lobby-61");
    await B.waitFor((m) => m.t === "welcome");
    B.send({ t: "emote", e: "wave" });
    B.send({ t: "emote", e: "heart" });
    expect(await A.waitFor((m) => m.t === "emote")).toEqual({ t: "emote", id: b.id, e: "wave" });
    await sleep(150);
    expect(A.inbox.filter((m) => m.t === "emote")).toHaveLength(0);
  });

  it("tên zone không hợp lệ bị từ chối", async () => {
    const a = await login({ onboarded: true });
    for (const bad of ["evil", "lobby", "lobby-1-x", "wing1-floor1-1", "wingA-floor11-1"]) {
      const res = await SELF.fetch(`${BASE}/ws/zone/${bad}`, { headers: { Upgrade: "websocket", cookie: a.cookie } });
      expect(res.status, bad).toBe(404);
    }
  });
});

describe("API thế giới (T066)", () => {
  it("join chọn bản sao còn chỗ", async () => {
    await setCapacity(1);
    const a = await login({ onboarded: true });
    const b = await login({ onboarded: true });
    const ja = (await (await call(a.cookie, "POST", "/api/world/join", { area: "garden" })).json()) as { zoneId: string; wsUrl: string };
    expect(ja).toEqual({ zoneId: "garden-1", wsUrl: "/ws/zone/garden-1" });
    const A = await connect(a.cookie, ja.zoneId);
    await A.waitFor((m) => m.t === "welcome");
    // Người đang ở trong zone hỏi lại thì vẫn được giữ đúng zone của mình.
    expect(((await (await call(a.cookie, "POST", "/api/world/join", { area: "garden" })).json()) as { zoneId: string }).zoneId).toBe("garden-1");
    const jb = (await (await call(b.cookie, "POST", "/api/world/join", { area: "garden" })).json()) as { zoneId: string };
    expect(jb.zoneId).toBe("garden-2");
  });

  it("join tầng: chỉ tầng có thật", async () => {
    const a = await login({ onboarded: true });
    const me = (await (await call(a.cookie, "GET", "/api/me")).json()) as { room: { wing: string; floor: number } };
    const ok = await call(a.cookie, "POST", "/api/world/join", { area: "floor", wing: me.room.wing, floor: me.room.floor });
    expect(((await ok.json()) as { zoneId: string }).zoneId).toBe(`wing${me.room.wing}-floor${me.room.floor}-1`);
    expect((await call(a.cookie, "POST", "/api/world/join", { area: "floor", wing: "ZZ", floor: 9 })).status).toBe(400);
  });

  it("layout có khu/tầng và phòng của mình, không lộ chủ phòng khác", async () => {
    const a = await login({ onboarded: true });
    const layout = (await (await call(a.cookie, "GET", "/api/world/layout")).json()) as {
      wings: { name: string; floors: number[] }[];
      roomsPerFloor: number;
      myRoom: { wing: string; floor: number; roomNumber: number };
    };
    expect(layout.roomsPerFloor).toBe(40);
    expect(layout.wings.find((w) => w.name === layout.myRoom.wing)?.floors).toContain(layout.myRoom.floor);
    expect(JSON.stringify(layout)).not.toMatch(/owner|user_id|[0-9a-f]{8}-[0-9a-f]{4}-/);
  });

  it("danh mục nhân vật", async () => {
    const a = await login({ onboarded: true });
    const cat = (await (await call(a.cookie, "GET", "/api/avatar-catalog")).json()) as { hair: string[] };
    expect(cat.hair).toContain("bob");
  });
});
