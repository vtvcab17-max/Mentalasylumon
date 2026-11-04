import * as THREE from "three";
import { mat } from "../avatar/avatar";
import type { Engine } from "../engine/renderer";
import { disposeLabel, makeLabel } from "../engine/label";
import { t } from "../i18n";
import { buildDoors, corridorLength, CORRIDOR_HALF_WIDTH, standInFront, type DoorSpot } from "./doors";

/**
 * Dựng các khu chung của bệnh viện bằng khối module (T068): sảnh chính, vườn, hành lang mỗi tầng.
 * Dựng bằng hình khối trong code cho tới khi có bộ GLB (assets-src/modules, T067). Biển hiệu vẽ chữ lúc chạy
 * theo ngôn ngữ (Constitution V).
 * Camera nhìn từ phía nam (+z) xuống, nên tường phía nam là "tường cắt thấp" (0,6 m) để không che người và cửa.
 */

const LOW_WALL = 0.6;

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export type PortalTarget = "lobby" | "garden" | "elevator" | "circle";

export interface Portal {
  target: PortalTarget;
  x: number;
  z: number;
  radius: number;
  enabled: boolean;
}

export type Place =
  | { kind: "room" }
  | { kind: "lobby" }
  | { kind: "garden" }
  | { kind: "floor"; wing: string; floor: number };

export interface Area {
  place: Place;
  root: THREE.Group;
  walk: Rect;
  blocks: Rect[];
  spawn: [number, number];
  portals: Portal[];
  doors: DoorSpot[];
  dispose(): void;
}

const box = (w: number, h: number, d: number, color: string) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
};

function lights(root: THREE.Group, engine: Engine, span: number) {
  root.add(new THREE.HemisphereLight("#fff8ee", "#b9a68a", 0.95));
  const sun = new THREE.DirectionalLight("#ffeccc", 1.0);
  sun.position.set(-span * 0.4, 18, span * 0.3);
  sun.castShadow = engine.preset.shadows;
  const cam = sun.shadow.camera;
  cam.left = cam.bottom = -span;
  cam.right = cam.top = span;
  cam.far = 60;
  root.add(sun);
}

function floorPlane(root: THREE.Group, w: number, d: number, color: string, cx = 0, cz = 0) {
  const f = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat(color));
  f.rotation.x = -Math.PI / 2;
  f.position.set(cx, 0, cz);
  f.receiveShadow = true;
  root.add(f);
}

function wall(root: THREE.Group, x: number, z: number, w: number, d: number, h = 3, color = "#f3e9dc") {
  const m = box(w, h, d, color);
  m.position.set(x, h / 2, z);
  m.castShadow = false;
  root.add(m);
}

/** Cổng chuyển khu: khung cửa phát sáng nhẹ + biển tên. */
function portal(root: THREE.Group, x: number, z: number, rotY: number, label: string, enabled: boolean) {
  const g = new THREE.Group();
  const frameColor = enabled ? "#2e7d6b" : "#b9b2a6";
  const l = box(0.2, 2.6, 0.3, frameColor);
  l.position.set(-1, 1.3, 0);
  const r = l.clone();
  r.position.x = 1;
  const top = box(2.2, 0.25, 0.3, frameColor);
  top.position.y = 2.6;
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 2.4), mat(enabled ? "#cdeee6" : "#e6e2da", { basic: true, opacity: 0.7, side: THREE.DoubleSide }));
  glow.position.y = 1.2;
  const sign = makeLabel(label, { height: 0.42 });
  sign.position.y = 3.2;
  g.add(l, r, top, glow, sign);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  root.add(g);
  return sign;
}

function sofa(root: THREE.Group, x: number, z: number, rotY: number, color: string) {
  const g = new THREE.Group();
  const seat = box(2, 0.45, 0.9, color);
  seat.position.y = 0.3;
  const back = box(2, 0.7, 0.2, color);
  back.position.set(0, 0.7, -0.4);
  g.add(seat, back);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  root.add(g);
}

function plant(root: THREE.Group, x: number, z: number, scale = 1) {
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.3 * scale, 0.22 * scale, 0.5 * scale, 12), mat("#c98b5e"));
  pot.position.set(x, 0.25 * scale, z);
  const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.55 * scale, 12, 10), mat("#6ea672"));
  leaves.position.set(x, 0.95 * scale, z);
  leaves.castShadow = true;
  root.add(pot, leaves);
}

function tree(root: THREE.Group, x: number, z: number, s: number) {
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.15 * s, 0.2 * s, 1.4 * s, 8), mat("#8a5a3b"));
  trunk.position.set(x, 0.7 * s, z);
  const crown = new THREE.Mesh(new THREE.SphereGeometry(1.1 * s, 12, 10), mat(s > 1.1 ? "#5f9e6e" : "#7bb37a"));
  crown.position.set(x, 1.9 * s, z);
  crown.castShadow = true;
  root.add(trunk, crown);
}

function bench(root: THREE.Group, x: number, z: number, rotY: number) {
  const g = new THREE.Group();
  const seat = box(1.6, 0.1, 0.5, "#b07d50");
  seat.position.y = 0.45;
  const back = box(1.6, 0.4, 0.08, "#b07d50");
  back.position.set(0, 0.75, -0.22);
  for (const lx of [-0.65, 0.65]) {
    const leg = box(0.08, 0.45, 0.45, "#5a4636");
    leg.position.set(lx, 0.22, 0);
    g.add(leg);
  }
  g.add(seat, back);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  root.add(g);
}

/** Số giả ngẫu nhiên ổn định để vườn lần nào cũng giống nhau. */
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

function buildLobby(root: THREE.Group, engine: Engine): Omit<Area, "place" | "root" | "dispose"> & { labels: THREE.Sprite[] } {
  lights(root, engine, 16);
  floorPlane(root, 24, 18, "#e9dcc7");
  const rug = new THREE.Mesh(new THREE.CircleGeometry(3.2, 40), mat("#cdb4db"));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.01, 1.5);
  root.add(rug);
  wall(root, 0, -9, 24, 0.3);
  wall(root, 0, 9, 24, 0.3, LOW_WALL);
  wall(root, -12, -5.5, 0.3, 7);
  wall(root, -12, 5.5, 0.3, 7);
  wall(root, 12, -5.5, 0.3, 7);
  wall(root, 12, 5.5, 0.3, 7);
  // Quầy tiếp đón
  const desk = box(5, 1.1, 1.1, "#f6efe2");
  desk.position.set(0, 0.55, -6);
  root.add(desk);
  const deskTop = box(5.2, 0.08, 1.3, "#8fc1b5");
  deskTop.position.set(0, 1.14, -6);
  root.add(deskTop);
  sofa(root, -6, 2.5, Math.PI / 2, "#a3c4f3");
  sofa(root, 6, 2.5, -Math.PI / 2, "#f2b5a7");
  for (const [x, z] of [[-10.5, -7.5], [10.5, -7.5], [-10.5, 7.5], [10.5, 7.5], [-3, -7.8], [3, -7.8]] as const) plant(root, x, z);
  const labels = [
    portal(root, -11.8, 0, Math.PI / 2, t("world.garden"), true),
    portal(root, 11.8, 0, -Math.PI / 2, t("world.elevator"), true),
    portal(root, -6, -8.8, 0, `${t("world.circle")} · ${t("world.comingSoon")}`, false),
  ];
  const title = makeLabel(t("app.title"), { height: 0.55, bg: "rgba(46,125,107,0.9)", color: "#ffffff" });
  title.position.set(0, 2.6, -8.7);
  root.add(title);
  labels.push(title);
  return {
    walk: { minX: -11.4, maxX: 11.4, minZ: -8.5, maxZ: 8.5 },
    blocks: [
      { minX: -2.8, maxX: 2.8, minZ: -6.8, maxZ: -5.2 },
      { minX: -6.7, maxX: -5.3, minZ: 1.3, maxZ: 3.7 },
      { minX: 5.3, maxX: 6.7, minZ: 1.3, maxZ: 3.7 },
    ],
    spawn: [0, 5],
    portals: [
      { target: "garden", x: -11, z: 0, radius: 1.6, enabled: true },
      { target: "elevator", x: 11, z: 0, radius: 1.6, enabled: true },
      { target: "circle", x: -6, z: -8, radius: 1.6, enabled: false },
    ],
    doors: [],
    labels,
  };
}

function buildGarden(root: THREE.Group, engine: Engine): Omit<Area, "place" | "root" | "dispose"> & { labels: THREE.Sprite[] } {
  lights(root, engine, 20);
  floorPlane(root, 32, 32, "#9fcf8a");
  const path = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 30), mat("#e2cfa8"));
  path.rotation.x = -Math.PI / 2;
  path.position.set(0, 0.01, 0);
  root.add(path);
  const pond = new THREE.Mesh(new THREE.CircleGeometry(3, 36), mat("#8cc8e6"));
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(6.5, 0.02, -5);
  root.add(pond);
  const blocks: Rect[] = [{ minX: 3.8, maxX: 9.2, minZ: -7.7, maxZ: -2.3 }];
  const rnd = seeded(42);
  for (let i = 0; i < 22; i++) {
    const x = (rnd() - 0.5) * 28;
    const z = (rnd() - 0.5) * 28;
    if (Math.abs(x) < 2.5 || (x > 3 && x < 10 && z > -8.5 && z < -1.5) || z > 11) continue;
    const s = 0.8 + rnd() * 0.6;
    tree(root, x, z, s);
    blocks.push({ minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4 });
  }
  for (const [x, z, r] of [[-2, -4, Math.PI / 2], [-2, 4, Math.PI / 2], [2, 0, -Math.PI / 2], [6.5, 0, Math.PI]] as const) bench(root, x, z, r);
  const labels = [portal(root, 0, 15.2, Math.PI, t("world.lobby"), true)];
  return {
    walk: { minX: -15, maxX: 15, minZ: -15, maxZ: 14.6 },
    blocks,
    spawn: [0, 12],
    portals: [{ target: "lobby", x: 0, z: 14.4, radius: 1.6, enabled: true }],
    doors: [],
    labels,
  };
}

function buildFloor(
  root: THREE.Group,
  engine: Engine,
  place: { wing: string; floor: number },
  roomsPerFloor: number,
  myRoomNumber: number | null,
): Omit<Area, "place" | "root" | "dispose"> & { labels: THREE.Sprite[] } {
  const len = corridorLength(roomsPerFloor);
  lights(root, engine, len / 2 + 4);
  floorPlane(root, len + 2, CORRIDOR_HALF_WIDTH * 2, "#dcc9ad", len / 2, 0);
  const stripe = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.4), mat("#cdb4db"));
  stripe.rotation.x = -Math.PI / 2;
  stripe.position.set(len / 2, 0.01, 0);
  root.add(stripe);
  wall(root, len / 2, -CORRIDOR_HALF_WIDTH - 0.15, len + 2, 0.3);
  wall(root, len / 2, CORRIDOR_HALF_WIDTH + 0.15, len + 2, 0.3, LOW_WALL);
  wall(root, len + 1, 0, 0.3, CORRIDOR_HALF_WIDTH * 2);

  const doors = buildDoors(roomsPerFloor, myRoomNumber);
  const labels: THREE.Sprite[] = [];
  for (const d of doors) {
    // Cửa phía nam nằm trên tường cắt thấp: chỉ cao bằng tường để không che hành lang.
    const h = d.side === 1 ? LOW_WALL + 0.05 : 2.1;
    const panel = box(1.1, h, 0.08, d.mine ? "#8fc1b5" : "#c9b8a2");
    panel.position.set(d.x, h / 2, d.z - d.side * 0.2);
    panel.castShadow = false;
    root.add(panel);
    // Biển số phòng: dạng "A-1-07" (không phụ thuộc ngôn ngữ, không lộ chủ phòng).
    const plate = makeLabel(`${place.wing}-${place.floor}-${String(d.roomNumber).padStart(2, "0")}`, {
      height: 0.26,
      bg: d.mine ? "rgba(46,125,107,0.95)" : "rgba(255,253,248,0.92)",
      color: d.mine ? "#ffffff" : "#2b2b2b",
    });
    plate.position.set(d.x, d.side === 1 ? 1.0 : 2.35, d.z - d.side * 0.3);
    root.add(plate);
    labels.push(plate);
  }
  const title = makeLabel(t("world.floor", { wing: place.wing, floor: String(place.floor) }), { height: 0.4 });
  title.position.set(1.2, 2.7, 0);
  root.add(title);
  labels.push(title);
  labels.push(portal(root, -0.6, 0, Math.PI / 2, t("world.elevator"), true));

  const mine = doors.find((d) => d.mine);
  return {
    walk: { minX: 0.2, maxX: len + 0.5, minZ: -CORRIDOR_HALF_WIDTH + 0.4, maxZ: CORRIDOR_HALF_WIDTH - 0.4 },
    blocks: [],
    spawn: mine ? standInFront(mine) : [1.5, 0],
    portals: [{ target: "elevator", x: 0.4, z: 0, radius: 1.3, enabled: true }],
    doors,
    labels,
  };
}

export function buildArea(
  engine: Engine,
  place: Exclude<Place, { kind: "room" }>,
  layout: { roomsPerFloor: number; myRoom: { wing: string; floor: number; roomNumber: number } | null },
): Area {
  const root = new THREE.Group();
  engine.scene.add(root);
  engine.scene.background = new THREE.Color(place.kind === "garden" ? "#cfe8f3" : "#f4efe6");
  const built =
    place.kind === "lobby"
      ? buildLobby(root, engine)
      : place.kind === "garden"
        ? buildGarden(root, engine)
        : buildFloor(
            root,
            engine,
            place,
            layout.roomsPerFloor,
            layout.myRoom && layout.myRoom.wing === place.wing && layout.myRoom.floor === place.floor ? layout.myRoom.roomNumber : null,
          );
  const { labels, ...rest } = built;
  return {
    place,
    root,
    ...rest,
    dispose() {
      labels.forEach(disposeLabel);
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        // Vật liệu dùng chung (cache) — chỉ giải phóng hình khối riêng của khu.
        if (m.isMesh) m.geometry.dispose();
      });
      engine.scene.remove(root);
    },
  };
}

/** Đẩy vị trí ra khỏi vật cản và giữ trong vùng đi được. */
export function constrain(area: Pick<Area, "walk" | "blocks">, x: number, z: number, radius = 0.3): [number, number] {
  let nx = Math.min(area.walk.maxX, Math.max(area.walk.minX, x));
  let nz = Math.min(area.walk.maxZ, Math.max(area.walk.minZ, z));
  for (const b of area.blocks) {
    const minX = b.minX - radius;
    const maxX = b.maxX + radius;
    const minZ = b.minZ - radius;
    const maxZ = b.maxZ + radius;
    if (nx > minX && nx < maxX && nz > minZ && nz < maxZ) {
      const push = [nx - minX, maxX - nx, nz - minZ, maxZ - nz];
      const i = push.indexOf(Math.min(...push));
      if (i === 0) nx = minX;
      else if (i === 1) nx = maxX;
      else if (i === 2) nz = minZ;
      else nz = maxZ;
    }
  }
  return [nx, nz];
}
