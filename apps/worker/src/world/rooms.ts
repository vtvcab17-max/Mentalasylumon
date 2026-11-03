import { nowIso } from "../types";

/**
 * Cấp phòng riêng (T046, FR-007, FR-008). Lấy phòng trống có số nhỏ nhất; hết phòng thì mở tầng mới;
 * khu đủ tầng thì mở khu mới. An toàn khi nhiều người đăng ký cùng lúc:
 * - UPDATE … WHERE owner_user_id IS NULL chỉ thành công cho đúng một người;
 * - rooms.owner_user_id UNIQUE chặn một người có hai phòng;
 * - tầng + 40 phòng được tạo trong một batch (một transaction), UNIQUE(wing_id, floor_number) chặn tạo trùng.
 */

export interface Layout {
  roomsPerFloor: number;
  floorsPerWing: number;
}
export const DEFAULT_LAYOUT: Layout = { roomsPerFloor: 40, floorsPerWing: 10 };

export interface AssignedRoom {
  roomId: string;
  wing: string;
  floor: number;
  roomNumber: number;
}

/** 1 → A, 26 → Z, 27 → AA … */
export function wingName(sort: number): string {
  let s = "";
  for (let n = sort; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export async function findRoom(db: D1Database, userId: string): Promise<AssignedRoom | null> {
  return db
    .prepare(
      `SELECT r.id AS roomId, w.name AS wing, f.floor_number AS floor, r.room_number AS roomNumber
       FROM rooms r JOIN floors f ON f.id = r.floor_id JOIN wings w ON w.id = f.wing_id
       WHERE r.owner_user_id = ?`,
    )
    .bind(userId)
    .first<AssignedRoom>();
}

async function addFloor(db: D1Database, layout: Layout): Promise<void> {
  const last = await db
    .prepare(
      `SELECT w.id, w.sort, COALESCE(MAX(f.floor_number), 0) AS top
       FROM wings w LEFT JOIN floors f ON f.wing_id = w.id
       GROUP BY w.id ORDER BY w.sort DESC LIMIT 1`,
    )
    .first<{ id: string; sort: number; top: number }>();

  const stmts: D1PreparedStatement[] = [];
  let wingId: string;
  let floorNumber: number;
  if (!last || last.top >= layout.floorsPerWing) {
    const sort = (last?.sort ?? 0) + 1;
    wingId = crypto.randomUUID();
    floorNumber = 1;
    stmts.push(
      db.prepare("INSERT INTO wings (id, name, sort, floor_count, created_at) VALUES (?, ?, ?, 0, ?)").bind(wingId, wingName(sort), sort, nowIso()),
    );
  } else {
    wingId = last.id;
    floorNumber = last.top + 1;
  }
  const floorId = crypto.randomUUID();
  stmts.push(db.prepare("INSERT INTO floors (id, wing_id, floor_number) VALUES (?, ?, ?)").bind(floorId, wingId, floorNumber));
  stmts.push(db.prepare("UPDATE wings SET floor_count = floor_count + 1 WHERE id = ?").bind(wingId));
  for (let n = 1; n <= layout.roomsPerFloor; n++) {
    stmts.push(db.prepare("INSERT INTO rooms (id, floor_id, room_number) VALUES (?, ?, ?)").bind(crypto.randomUUID(), floorId, n));
  }
  try {
    await db.batch(stmts);
  } catch (e) {
    // Người khác vừa tạo đúng tầng/khu này: bỏ qua, vòng lặp ngoài sẽ lấy phòng ở đó.
    if (!/UNIQUE/i.test(String(e))) throw e;
  }
}

export async function assignRoom(db: D1Database, userId: string, layout: Layout = DEFAULT_LAYOUT): Promise<AssignedRoom> {
  const existing = await findRoom(db, userId);
  if (existing) return existing;

  for (let attempt = 0; attempt < 50; attempt++) {
    let changed = 0;
    try {
      const res = await db
        .prepare(
          `UPDATE rooms SET owner_user_id = ?1, assigned_at = ?2
           WHERE owner_user_id IS NULL AND id = (
             SELECT r.id FROM rooms r JOIN floors f ON f.id = r.floor_id JOIN wings w ON w.id = f.wing_id
             WHERE r.owner_user_id IS NULL
             ORDER BY w.sort, f.floor_number, r.room_number LIMIT 1)`,
        )
        .bind(userId, nowIso())
        .run();
      changed = res.meta.changes;
    } catch (e) {
      if (!/UNIQUE/i.test(String(e))) throw e; // chính người này đã được cấp ở request song song
    }
    const mine = await findRoom(db, userId);
    if (mine) {
      await db.prepare("UPDATE users SET room_id = ? WHERE id = ?").bind(mine.roomId, userId).run();
      return mine;
    }
    if (changed === 0) await addFloor(db, layout);
  }
  throw new Error("could not assign a room");
}

export async function releaseRoom(db: D1Database, userId: string): Promise<void> {
  await db.batch([
    db.prepare("UPDATE rooms SET owner_user_id = NULL, assigned_at = NULL WHERE owner_user_id = ?").bind(userId),
    db.prepare("UPDATE users SET room_id = NULL WHERE id = ?").bind(userId),
  ]);
}
