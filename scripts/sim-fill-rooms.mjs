#!/usr/bin/env node
// pnpm sim:fill-rooms [số người, mặc định 45] — tạo người chơi giả trên server local và xem bệnh viện tự mở
// thêm tầng/khu (T074, FR-008). Chỉ chạy với wrangler dev.
import { BASE, createUsers, headers } from "./lib/fake-users.mjs";

const n = Number(process.argv[2] ?? 45);
const users = await createUsers(n, { prefix: "fill" });
const layout = await (await fetch(`${BASE}/api/world/layout`, { headers: headers(users[0].cookie) })).json();

const rooms = new Map();
for (const u of users) {
  const key = `${u.room.wing}-${u.room.floor}`;
  rooms.set(key, (rooms.get(key) ?? 0) + 1);
}
console.log(`Đã tạo ${n} người chơi giả. Phòng mới cấp theo tầng:`);
for (const [k, v] of rooms) console.log(`  Khu/tầng ${k}: ${v} phòng`);
console.log(`Bệnh viện hiện có: ${layout.wings.map((w) => `khu ${w.name} (${w.floors.length} tầng)`).join(", ")}`);

const ids = new Set(users.map((u) => u.room.roomId));
if (ids.size !== n) {
  console.error(`✗ Trùng phòng: ${n} người nhưng chỉ ${ids.size} phòng`);
  process.exit(1);
}
const totalFloors = layout.wings.reduce((s, w) => s + w.floors.length, 0);
if (n > layout.roomsPerFloor && totalFloors < 2) {
  console.error("✗ Hết phòng nhưng không mở thêm tầng");
  process.exit(1);
}
console.log("✓ Mỗi người một phòng; tầng mới tự mở khi cần.");
