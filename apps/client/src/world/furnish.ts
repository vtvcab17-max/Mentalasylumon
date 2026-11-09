import * as THREE from "three";
import type { Atmosphere } from "../engine/atmosphere";
import type { Engine } from "../engine/renderer";
import { placeProp, type PropOpts } from "./props";

/**
 * Bày đồ cho từng khu bằng model CC0 (research.md §R19) + đèn bật ban đêm.
 * Đồ trang trí không chặn đường đi (đặt sát tường/mép khu), nên không thêm vật cản mới.
 */

type P = [name: string, x: number, z: number, opts?: PropOpts];

const LOBBY: P[] = [
  ["rug_rectangle_stripes_A", 0, 2.2, { width: 4.2, noShadow: true }],
  ["couch_pillows", 9.6, 5.2, { width: 2.4, rotY: -Math.PI / 2 }],
  ["table_low", 8, 5.2, { width: 1.1 }],
  ["armchair", 8, 7.2, { height: 1.0, rotY: Math.PI }],
  ["pot_large", -10.6, 7.6, { height: 0.7 }],
  ["plant_bushLarge", -10.6, 7.6, { height: 1.3, y: 0.55, noShadow: true }],
  ["pot_large", 10.6, -7.6, { height: 0.7 }],
  ["plant_bushLarge", 10.6, -7.6, { height: 1.3, y: 0.55, noShadow: true }],
  ["cactus_medium_A", -9.6, -5.5, { height: 0.5, y: 1.05, noShadow: true }],
  ["cabinet_small_decorated", -10.8, -3.2, { width: 1.6, rotY: Math.PI / 2 }],
];

const COURT: P[] = [
  ...[-24, -19, -14, 14, 19, 24].map((x): P => ["plant_bushLarge", x, 0.6, { height: 1.2, noShadow: true }]),
  ...[-22, -16, 16, 22].map((x): P => ["flower_redA", x, 1.4, { height: 0.5, noShadow: true }]),
  ...[-20, 20].map((x): P => ["flower_yellowA", x, 1.4, { height: 0.5, noShadow: true }]),
  ["trash_A", 9.5, 24.5, { height: 0.8 }],
];

const GARDEN: P[] = [
  ["lily_large", 7.5, -7, { width: 1.2, y: 0.03, noShadow: true }],
  ["lily_large", 10.5, -9, { width: 0.9, y: 0.03, noShadow: true }],
  ["rock_smallA", 5, -4.3, { width: 0.7 }],
  ["rock_smallA", 13.2, -6.5, { width: 0.6 }],
  // Luống hoa dọc tường và quanh lối đi.
  ...[-13, -11, -9, -7, -5, 5, 7, 9, 11, 13].map((x, i): P => [["flower_purpleA", "flower_redA", "flower_yellowA"][i % 3], x, 13.8, { height: 0.8, noShadow: true }]),
  ...[-13, -10, -7, 7, 10].map((z, i): P => [["flower_yellowA", "flower_purpleA", "flower_redA"][i % 3], -14.8, z, { height: 0.8, noShadow: true }]),
  ...[-6, -4, 4, 6].map((x, i): P => [["flower_redA", "flower_yellowA"][i % 2], x, 1.4, { height: 0.7, noShadow: true }]),
  ...[[-6, 10], [6, 10], [-10, 2], [10, 6]].map(([x, z]): P => ["plant_bushLarge", x, z, { height: 1.1, noShadow: true }]),
  ["stump_round", -13.5, -13.5, { height: 0.5 }],
  ["grass_large", -9, -13, { height: 0.5, noShadow: true }],
  ["grass_large", 3, -13.5, { height: 0.5, noShadow: true }],
];

/** Cột đèn đường: model + bóng đèn phát sáng; đèn điểm thật nếu mức đồ họa cho phép. */
async function streetlight(engine: Engine, root: THREE.Object3D, atm: Atmosphere, x: number, z: number, rotY = 0) {
  const o = await placeProp(engine, root, "streetlight", x, z, { height: 3.6, rotY });
  const top = new THREE.Vector3(x, 3.4, z);
  if (o) {
    const b = new THREE.Box3().setFromObject(o);
    // Đầu đèn nằm ở phía cánh tay vươn ra: lấy điểm xa trục nhất ở đỉnh.
    const c = b.getCenter(new THREE.Vector3());
    top.set(c.x + (c.x - x), b.max.y - 0.2, c.z + (c.z - z));
  }
  addBulb(root, atm, top, "#ffd28a", 10);
}

function addBulb(root: THREE.Object3D, atm: Atmosphere, at: THREE.Vector3, color: string, range: number, size = 0.16) {
  const bulbMat = new THREE.MeshStandardMaterial({ color: "#fff4d6", emissive: color, emissiveIntensity: 0.2 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(size, 12, 8), bulbMat);
  bulb.position.copy(at);
  root.add(bulb);
  atm.addLamp({ position: at.clone().add(new THREE.Vector3(0, -0.3, 0)), bulb: bulbMat, color, range });
}

async function standingLamp(engine: Engine, root: THREE.Object3D, atm: Atmosphere, x: number, z: number) {
  const o = await placeProp(engine, root, "lamp_standing", x, z, { height: 1.8 });
  addBulb(root, atm, new THREE.Vector3(x, o ? 1.55 : 1.6, z), "#ffcf8a", 7, 0.12);
}

export function furnish(engine: Engine, root: THREE.Object3D, kind: string, atm: Atmosphere) {
  const list = kind === "lobby" ? LOBBY : kind === "court" ? COURT : kind === "garden" ? GARDEN : [];
  for (const [name, x, z, opts] of list) void placeProp(engine, root, name, x, z, opts);
  if (kind === "lobby") {
    void standingLamp(engine, root, atm, -10.6, 5.6);
    void standingLamp(engine, root, atm, 10.6, 7.8);
    // Đèn trần giữa sảnh: chỉ ánh sáng (bóng đèn sẽ che camera nhìn từ trên xuống).
    atm.addLamp({ position: new THREE.Vector3(0, 4.2, 0), color: "#ffe2a8", range: 16 });
  } else if (kind === "court") {
    for (const [x, z] of [[-10, 6], [10, 6], [-10, 16], [10, 16], [-3.5, 25], [3.5, 25]] as const) void streetlight(engine, root, atm, x, z, x < 0 ? 0 : Math.PI);
  } else if (kind === "garden") {
    for (const [x, z] of [[-3, 9], [3, -9], [-9, -3], [12, 3]] as const) void streetlight(engine, root, atm, x, z, x < 0 ? 0 : Math.PI);
  } else if (kind === "floor") {
    // Gallery: đèn tường dọc hành lang.
    for (const x of [-30, -18, -6, 6, 18, 30]) addBulb(root, atm, new THREE.Vector3(x, 2.6, -1.9), "#ffd9a0", 8, 0.12);
  }
}
