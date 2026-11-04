/**
 * Cửa phòng ở hành lang mỗi tầng (T072, FR-010). Chỉ chủ phòng vào được; người khác chỉ thấy số phòng.
 * Phòng lẻ ở phía bắc (z âm), phòng chẵn ở phía nam; mỗi cặp phòng cách nhau 2,5 m dọc hành lang.
 */

export const CORRIDOR_HALF_WIDTH = 2;
export const DOOR_SPACING = 2.5;
export const FIRST_DOOR_X = 3;

export interface DoorSpot {
  roomNumber: number;
  x: number;
  z: number; // tường cửa
  side: -1 | 1;
  mine: boolean;
}

export function doorPosition(roomNumber: number): { x: number; z: number; side: -1 | 1 } {
  const k = Math.floor((roomNumber - 1) / 2);
  const side: -1 | 1 = roomNumber % 2 === 1 ? -1 : 1;
  return { x: FIRST_DOOR_X + k * DOOR_SPACING, z: side * CORRIDOR_HALF_WIDTH, side };
}

export function corridorLength(roomsPerFloor: number) {
  return FIRST_DOOR_X + Math.ceil(roomsPerFloor / 2) * DOOR_SPACING + 1;
}

export function buildDoors(roomsPerFloor: number, myRoomNumber: number | null): DoorSpot[] {
  return Array.from({ length: roomsPerFloor }, (_, i) => {
    const roomNumber = i + 1;
    return { roomNumber, ...doorPosition(roomNumber), mine: roomNumber === myRoomNumber };
  });
}

/** Vị trí đứng trước cửa (trong hành lang). */
export function standInFront(door: Pick<DoorSpot, "x" | "side">): [number, number] {
  return [door.x, door.side * (CORRIDOR_HALF_WIDTH - 0.9)];
}

/** Cửa gần nhất trong tầm với (mặc định 1,4 m) tính từ vị trí người chơi. */
export function nearestDoor(doors: DoorSpot[], x: number, z: number, reach = 1.4): DoorSpot | null {
  let best: DoorSpot | null = null;
  let bestD = reach * reach;
  for (const d of doors) {
    const [fx, fz] = standInFront(d);
    const dd = (fx - x) ** 2 + (fz - z) ** 2;
    if (dd <= bestD) {
      best = d;
      bestD = dd;
    }
  }
  return best;
}

export type DoorAction = { kind: "enter" } | { kind: "locked"; roomNumber: number };

export function doorAction(door: DoorSpot): DoorAction {
  return door.mine ? { kind: "enter" } : { kind: "locked", roomNumber: door.roomNumber };
}
