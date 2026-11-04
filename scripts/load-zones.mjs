#!/usr/bin/env node
// pnpm load:zones --users 500 [--seconds 20] [--area lobby] — thử tải realtime trên server local (T064, SC-004).
// Mỗi người giả kết nối WebSocket, đi lại ngẫu nhiên 5 lần/giây; đo số người kết nối được, số zone dùng,
// tần suất snapshot và khoảng cách giữa các snapshot.
import WebSocket from "ws";
import { BASE, createUsers, headers } from "./lib/fake-users.mjs";

const args = process.argv.slice(2);
const arg = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const N = Number(arg("--users", 200));
const SECONDS = Number(arg("--seconds", 20));
const AREA = arg("--area", "lobby");

console.log(`Tạo ${N} người chơi giả…`);
const users = await createUsers(N, { prefix: "load" });

const stats = { connected: 0, failed: 0, warns: 0, kicked: 0, zones: new Map(), snapshots: 0, gaps: [], entries: 0, bytes: 0 };
const sockets = [];

function connectUser(u, zoneId, x, z, hops = 0) {
  const ws = new WebSocket(`${BASE.replace(/^http/, "ws")}/ws/zone/${zoneId}?x=${x}&z=${z}`, { headers: { cookie: u.cookie } });
  sockets.push(ws);
  let last = 0;
  let pos = [x, 0, z];
  let timer = null;
  ws.on("message", (data) => {
    const m = JSON.parse(String(data));
    if (m.t === "zone_full" && hops < 10) {
      ws.close();
      connectUser(u, m.redirectZoneId, x, z, hops + 1);
    } else if (m.t === "welcome") {
      stats.connected++;
      stats.zones.set(m.zoneId, (stats.zones.get(m.zoneId) ?? 0) + 1);
      timer = setInterval(() => {
        pos = [Math.max(-11, Math.min(11, pos[0] + (Math.random() - 0.5))), 0, Math.max(-8, Math.min(8, pos[2] + (Math.random() - 0.5)))];
        ws.send(JSON.stringify({ t: "move", p: pos, r: Math.random() * 6, a: "walk" }));
      }, 200);
    } else if (m.t === "snapshot") {
      const now = performance.now();
      if (last) stats.gaps.push(now - last);
      last = now;
      stats.snapshots++;
      stats.entries += m.players.length;
      stats.bytes += String(data).length;
    } else if (m.t === "warn") stats.warns++;
    else if (m.t === "kicked") stats.kicked++;
  });
  ws.on("close", () => timer && clearInterval(timer));
  ws.on("error", () => stats.failed++);
}

await Promise.all(
  users.map(async (u, i) => {
    await new Promise((r) => setTimeout(r, i * 5)); // dàn đều lúc vào
    const j = await (await fetch(`${BASE}/api/world/join`, { method: "POST", headers: headers(u.cookie), body: JSON.stringify({ area: AREA }) })).json();
    connectUser(u, j.zoneId, (Math.random() - 0.5) * 20, (Math.random() - 0.5) * 14);
  }),
);
// Chờ mọi người vào xong rồi mới bắt đầu đo.
for (let i = 0; i < 60 && stats.connected < N; i++) await new Promise((r) => setTimeout(r, 500));
Object.assign(stats, { snapshots: 0, gaps: [], entries: 0, bytes: 0, warns: 0 });

await new Promise((r) => setTimeout(r, SECONDS * 1000));
for (const ws of sockets) ws.close();

const gaps = stats.gaps.sort((a, b) => a - b);
const pct = (p) => (gaps.length ? gaps[Math.floor(gaps.length * p)].toFixed(0) : "–");
const result = {
  users: N,
  connected: stats.connected,
  failed: stats.failed,
  zones: Object.fromEntries(stats.zones),
  snapshotsPerClientPerSecond: +(stats.snapshots / Math.max(stats.connected, 1) / SECONDS).toFixed(2),
  snapshotGapMs: { p50: pct(0.5), p95: pct(0.95), p99: pct(0.99) },
  avgPlayersPerSnapshot: +(stats.entries / Math.max(stats.snapshots, 1)).toFixed(1),
  downKBpsPerClient: +(stats.bytes / 1024 / Math.max(stats.connected, 1) / SECONDS).toFixed(1),
  rateLimitWarnings: stats.warns,
};
console.log(JSON.stringify(result, null, 2));
const ok = stats.connected === N && stats.failed === 0 && stats.warns === 0 && Number(result.snapshotGapMs.p95) < 500;
console.log(ok ? "✓ Đạt" : "✗ Chưa đạt");
process.exit(ok ? 0 : 1);
