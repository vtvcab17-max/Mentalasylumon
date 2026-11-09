/**
 * Cửa phòng trong gallery mỗi tầng (T072, FR-010). Chỉ chủ phòng vào được; người khác chỉ thấy số phòng.
 * Bố cục theo bản vẽ 1815 (research.md §R18): sảnh cầu thang ở giữa, gallery chạy sang tây và đông, phòng xếp
 * một bên (phía bắc, z âm), bên kia là cửa sổ. Phòng 1–20 ở gallery tây (1 ở đầu xa nhất), 21–40 ở gallery đông.
 */

export const GALLERY_HALF_WIDTH = 2;
export const DOOR_SPACING = 2.5;
/** Nửa chiều dài sảnh cầu thang ở giữa. */
export const HALL_HALF = 6;

export interface DoorSpot {
  roomNumber: number;
  x: number;
  z: number; // mặt tường có cửa
  side: -1 | 1;
  mine: boolean;
}

export function doorPosition(roomNumber: number, roomsPerFloor = 40): { x: number; z: number; side: -1 | 1 } {
  const half = Math.ceil(roomsPerFloor / 2);
  const x =
    roomNumber <= half
      ? -(HALL_HALF + 1 + (half - roomNumber) * DOOR_SPACING)
      : HALL_HALF + 1 + (roomNumber - half - 1) * DOOR_SPACING;
  return { x, z: -GALLERY_HALF_WIDTH, side: -1 };
}

/** Nửa chiều dài cả tầng (từ giữa sảnh cầu thang tới đầu gallery). */
export function galleryHalfLength(roomsPerFloor: number) {
  return HALL_HALF + 1 + Math.ceil(roomsPerFloor / 2) * DOOR_SPACING + 0.5;
}

export function buildDoors(roomsPerFloor: number, myRoomNumber: number | null): DoorSpot[] {
  return Array.from({ length: roomsPerFloor }, (_, i) => {
    const roomNumber = i + 1;
    return { roomNumber, ...doorPosition(roomNumber, roomsPerFloor), mine: roomNumber === myRoomNumber };
  });
}

/** Vị trí đứng trước cửa (trong gallery). */
export function standInFront(door: Pick<DoorSpot, "x" | "side">): [number, number] {
  return [door.x, door.side * (GALLERY_HALF_WIDTH - 0.9)];
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
