import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import { assignRoom } from "../src/world/rooms";

async function newUser() {
  const id = crypto.randomUUID();
  await env.DB.prepare("INSERT INTO users (id, google_sub, email, created_at) VALUES (?, ?, ?, ?)")
    .bind(id, `sub-${id}`, "x@example.com", new Date().toISOString())
    .run();
  return id;
}

// Bố cục nhỏ để test nhanh: 2 phòng mỗi tầng, 2 tầng mỗi khu.
const small = { roomsPerFloor: 2, floorsPerWing: 2 };

describe("world/rooms — cấp phòng (T040, FR-007, FR-008)", () => {
  it("lấy phòng trống nhỏ nhất; hết phòng thì mở tầng; đủ tầng thì mở khu mới", async () => {
    await env.DB.exec("DELETE FROM rooms; DELETE FROM floors; DELETE FROM wings;");
    const got = [];
    for (let i = 0; i < 5; i++) got.push(await assignRoom(env.DB, await newUser(), small));
    expect(got.map((r) => `${r.wing}-${r.floor}-${r.roomNumber}`)).toEqual(["A-1-1", "A-1-2", "A-2-1", "A-2-2", "B-1-1"]);
  });

  it("gọi lại cho cùng người chơi trả đúng phòng cũ", async () => {
    const u = await newUser();
    const a = await assignRoom(env.DB, u, small);
    const b = await assignRoom(env.DB, u, small);
    expect(b.roomId).toBe(a.roomId);
    const row = await env.DB.prepare("SELECT room_id FROM users WHERE id = ?").bind(u).first<{ room_id: string }>();
    expect(row!.room_id).toBe(a.roomId);
  });

  it("nhiều người đăng ký cùng lúc không bao giờ trùng phòng", async () => {
    const users = await Promise.all(Array.from({ length: 12 }, newUser));
    const rooms = await Promise.all(users.map((u) => assignRoom(env.DB, u, small)));
    expect(new Set(rooms.map((r) => r.roomId)).size).toBe(12);
  });
});
