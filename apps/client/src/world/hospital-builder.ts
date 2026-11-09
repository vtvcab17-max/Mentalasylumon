import * as THREE from "three";
import { mat } from "../avatar/avatar";
import type { Engine } from "../engine/renderer";
import { disposeLabel, makeLabel } from "../engine/label";
import { t } from "../i18n";
import { buildDoors, galleryHalfLength, GALLERY_HALF_WIDTH, HALL_HALF, standInFront, type DoorSpot } from "./doors";

/**
 * Dựng các khu chung của bệnh viện (T068). Kiến trúc lấy theo bản vẽ mặt bằng + mặt đứng năm 1815 của một bệnh
 * viện tâm thần lịch sử ở St George's Fields, London (research.md §R18): mặt chính dài kiểu Georgian ba tầng, cổng
 * 6 cột + mái vòm ở giữa, hai gallery dài chạy đông/tây với phòng một bên, sân trước có đường xe và nhà gác, sân dạo
 * phía sau có ao phía đông. Chỉ lấy kiến trúc — không dùng tên/thương hiệu của bệnh viện thật.
 *
 * Dựng bằng khối trong code cho tới khi có GLB (assets-src/modules, T067). Biển hiệu vẽ chữ lúc chạy theo ngôn ngữ
 * (Constitution V). Camera nhìn từ phía nam (+z) xuống, nên tường phía nam là "tường cắt thấp" để không che người.
 */

export interface Rect {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export type PortalTarget = "lobby" | "garden" | "court" | "stairs" | "circle" | "council";

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
  | { kind: "court" }
  | { kind: "garden" }
  | { kind: "floor"; wing: string; floor: number }
  | { kind: "circle"; id: string };

/** Khu đi bộ chung (có WorldZone). */
export type WalkPlace = Exclude<Place, { kind: "room" } | { kind: "circle" }>;

/** Góc camera riêng của khu (mặc định nhìn cao từ phía nam xuống). */
export interface CameraView {
  offset: [number, number, number];
  lookY: number;
  /** Nhìn về trước nhân vật bao nhiêu mét theo trục z (âm = về phía bắc). */
  lookAhead: number;
  /** Tầm nhìn tối thiểu (m) cho khu ngoài trời rộng. */
  far?: number;
}

export interface Area {
  place: Place;
  view?: CameraView;
  root: THREE.Group;
  /** Vùng đi được (hợp của các hình chữ nhật). */
  walk: Rect[];
  blocks: Rect[];
  spawn: [number, number];
  portals: Portal[];
  doors: DoorSpot[];
  dispose(): void;
}

type Built = Omit<Area, "place" | "root" | "dispose"> & { labels: THREE.Sprite[]; textures: THREE.Texture[] };

const LOW_WALL = 0.6;
// Bảng màu: gạch Georgian ấm, đá Portland cho cổng cột, mái vòm đồng xanh.
const BRICK = "#c9a98a";
const STONE = "#ece4d4";
const STONE_SHADE = "#d9cfbc";
const COPPER = "#7fae9b";
const FLOOR_WOOD = "#c8a77f";

const box = (w: number, h: number, d: number, color: string, shadow = true) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color));
  m.castShadow = shadow;
  m.receiveShadow = true;
  return m;
};

function lights(root: THREE.Group, engine: Engine, span: number) {
  root.add(new THREE.HemisphereLight("#fff8ee", "#b9a68a", 0.95));
  const sun = new THREE.DirectionalLight("#ffeccc", 1.0);
  sun.position.set(-span * 0.4, 22, span * 0.3);
  sun.castShadow = engine.preset.shadows;
  const cam = sun.shadow.camera;
  cam.left = cam.bottom = -span;
  cam.right = cam.top = span;
  cam.far = 80;
  root.add(sun);
}

function floorPlane(root: THREE.Group, w: number, d: number, color: string | THREE.Material, cx = 0, cz = 0) {
  const f = new THREE.Mesh(new THREE.PlaneGeometry(w, d), typeof color === "string" ? mat(color) : color);
  f.rotation.x = -Math.PI / 2;
  f.position.set(cx, 0, cz);
  f.receiveShadow = true;
  root.add(f);
  return f;
}

function wall(root: THREE.Group, x: number, z: number, w: number, d: number, h = 3.2, color = "#f1e7d8") {
  const m = box(w, h, d, color, false);
  m.position.set(x, h / 2, z);
  root.add(m);
  return m;
}

/** Cổng chuyển khu: khung cửa đá + biển tên. */
function portal(root: THREE.Group, x: number, z: number, rotY: number, label: string, enabled: boolean, labels: THREE.Sprite[]) {
  const g = new THREE.Group();
  const frame = enabled ? "#2e7d6b" : "#b9b2a6";
  const l = box(0.3, 2.8, 0.3, frame);
  l.position.set(-1.1, 1.4, 0);
  const r = l.clone();
  r.position.x = 1.1;
  const top = box(2.6, 0.3, 0.32, frame);
  top.position.y = 2.85;
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 2.6), mat(enabled ? "#cdeee6" : "#e6e2da", { basic: true, opacity: 0.65, side: THREE.DoubleSide }));
  glow.position.y = 1.3;
  const sign = makeLabel(label, { height: 0.42 });
  sign.position.y = 3.45;
  g.add(l, r, top, glow, sign);
  g.position.set(x, 0, z);
  g.rotation.y = rotY;
  root.add(g);
  labels.push(sign);
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

function column(root: THREE.Group, x: number, z: number, h: number, r = 0.4) {
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.9, r, h, 16), mat(STONE));
  shaft.position.set(x, h / 2, z);
  shaft.castShadow = true;
  const cap = box(r * 2.6, 0.3, r * 2.6, STONE_SHADE);
  cap.position.set(x, h + 0.15, z);
  const base = box(r * 2.6, 0.3, r * 2.6, STONE_SHADE);
  base.position.set(x, 0.15, z);
  root.add(shaft, cap, base);
}

/** Số giả ngẫu nhiên ổn định để cảnh lần nào cũng giống nhau. */
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

/** Texture mặt tường gạch Georgian: hàng cửa sổ kéo trượt (sash) 3 tầng, lặp theo từng gian 4 m. */
function facadeTexture(storeys: number): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64 * storeys;
  const g = c.getContext("2d")!;
  g.fillStyle = BRICK;
  g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = "rgba(120,80,60,0.12)";
  for (let y = 0; y < c.height; y += 6) g.fillRect(0, y, c.width, 1);
  for (let s = 0; s < storeys; s++) {
    const top = s * 64 + 12;
    g.fillStyle = STONE;
    g.fillRect(40, top - 3, 48, 46); // khung đá
    g.fillStyle = "#3f4c58";
    g.fillRect(44, top, 40, 40); // kính
    g.fillStyle = STONE;
    g.fillRect(63, top, 2, 40); // song dọc
    g.fillRect(44, top + 19, 40, 2); // song ngang
  }
  // Gờ đá giữa các tầng
  g.fillStyle = STONE;
  for (let s = 1; s < storeys; s++) g.fillRect(0, s * 64 - 2, c.width, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function facadeBlock(root: THREE.Group, tex: THREE.Texture, x: number, z: number, w: number, h: number, d: number) {
  const t = tex.clone();
  t.needsUpdate = true;
  t.repeat.set(Math.max(1, Math.round(w / 4)), 1);
  const front = new THREE.MeshStandardMaterial({ map: t, roughness: 0.9 });
  const plain = mat(BRICK);
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [plain, plain, mat(STONE_SHADE), plain, front, plain]);
  m.position.set(x, h / 2, z);
  m.receiveShadow = true;
  root.add(m);
  // Gờ mái đá
  const cornice = box(w + 0.4, 0.5, d + 0.4, STONE);
  cornice.position.set(x, h + 0.25, z);
  root.add(cornice);
  return t;
}

// ── Sân trước: mặt chính + cổng 6 cột + mái vòm ─────────────────────────
function buildCourt(root: THREE.Group, engine: Engine): Built {
  const labels: THREE.Sprite[] = [];
  const textures: THREE.Texture[] = [];
  lights(root, engine, 34);
  floorPlane(root, 90, 50, "#9fcf8a", 0, 10);

  // Mặt chính: cánh tây/đông dài, khối giữa nhô ra và cao hơn, hai đầu hồi nhô nhẹ.
  const tex = facadeTexture(3);
  textures.push(tex);
  textures.push(facadeBlock(root, tex, -36, -10, 48, 11, 8));
  textures.push(facadeBlock(root, tex, 36, -10, 48, 11, 8));
  textures.push(facadeBlock(root, tex, -62, -9.5, 8, 11.5, 9));
  textures.push(facadeBlock(root, tex, 62, -9.5, 8, 11.5, 9));
  textures.push(facadeBlock(root, tex, 0, -9.5, 24, 13, 9));

  // Cổng 6 cột (Ionic) + trán tường tam giác.
  const podium = box(16, 1, 4.2, STONE_SHADE);
  podium.position.set(0, 0.5, -3.3);
  root.add(podium);
  for (let i = 0; i < 3; i++) {
    const step = box(10, 0.33, 0.6, STONE);
    step.position.set(0, 0.17 + i * 0.33 - 0.33, -0.9 + (2 - i) * 0.6 - 0.6);
    root.add(step);
  }
  for (let i = 0; i < 6; i++) column(root, -6.25 + i * 2.5, -2.2, 8, 0.42);
  for (const c of root.children.slice(-18)) c.position.y += 1;
  const entab = box(16, 1.1, 4.4, STONE);
  entab.position.set(0, 10.15, -3.2);
  root.add(entab);
  const tri = new THREE.Shape();
  tri.moveTo(-8, 0);
  tri.lineTo(8, 0);
  tri.lineTo(0, 2.8);
  tri.closePath();
  const ped = new THREE.Mesh(new THREE.ExtrudeGeometry(tri, { depth: 4.2, bevelEnabled: false }), mat(STONE));
  ped.position.set(0, 10.7, -5.3);
  ped.castShadow = true;
  root.add(ped);
  // Cửa chính trong cổng
  const door = box(2.4, 3.6, 0.2, "#4a3a2c");
  door.position.set(0, 2.8, -4.95);
  root.add(door);

  // Mái vòm đồng xanh trên trống tròn + đèn lồng.
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.2, 2.6, 28), mat(STONE));
  drum.position.set(0, 14.3, -10);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(4.4, 28, 14, 0, Math.PI * 2, 0, Math.PI / 2), mat(COPPER));
  dome.position.set(0, 15.6, -10);
  const lantern = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 0.9, 1.6, 12), mat(STONE));
  lantern.position.set(0, 20.6, -10);
  const finial = new THREE.Mesh(new THREE.ConeGeometry(0.9, 1.4, 12), mat(COPPER));
  finial.position.set(0, 22.1, -10);
  for (const m of [drum, dome, lantern, finial]) m.castShadow = true;
  root.add(drum, dome, lantern, finial);

  // Sân trước: đường xe vòng quanh bãi cỏ bầu dục, lối thẳng ra cổng, hai nhà gác.
  const ring = new THREE.Mesh(new THREE.RingGeometry(6.5, 9, 48), mat("#e2cfa8"));
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(0, 0.01, 9);
  ring.scale.set(1.4, 1, 1);
  root.add(ring);
  const drive = new THREE.Mesh(new THREE.PlaneGeometry(3, 12), mat("#e2cfa8"));
  drive.rotation.x = -Math.PI / 2;
  drive.position.set(0, 0.01, 22);
  const forecourt = new THREE.Mesh(new THREE.PlaneGeometry(18, 4), mat("#e2cfa8"));
  forecourt.rotation.x = -Math.PI / 2;
  forecourt.position.set(0, 0.01, 0.2);
  root.add(drive, forecourt);
  for (const x of [-5, 5]) {
    const lodge = box(4, 3, 3.5, BRICK);
    lodge.position.set(x, 1.5, 27.5);
    const roof = box(4.4, 0.4, 3.9, STONE);
    roof.position.set(x, 3.2, 27.5);
    root.add(lodge, roof);
  }
  // Tường rào sân (phía nam thấp vì gần camera)
  wall(root, -17, 29, 22, 0.4, LOW_WALL, BRICK);
  wall(root, 17, 29, 22, 0.4, LOW_WALL, BRICK);
  wall(root, -28.2, 10, 0.4, 38, 2.2, BRICK);
  wall(root, 28.2, 10, 0.4, 38, 2.2, BRICK);
  const rnd = seeded(7);
  for (let i = 0; i < 10; i++) {
    const side = i % 2 ? 1 : -1;
    tree(root, side * (17 + rnd() * 8), 4 + rnd() * 20, 1 + rnd() * 0.3);
  }
  for (const [x, z, r] of [[-11, 6, Math.PI / 2], [11, 6, -Math.PI / 2]] as const) bench(root, x, z, r);

  const sign = makeLabel(t("app.title"), { height: 0.6, bg: "rgba(46,125,107,0.92)", color: "#ffffff" });
  sign.position.set(0, 6.2, -1);
  root.add(sign);
  labels.push(sign);

  return {
    walk: [{ minX: -27.5, maxX: 27.5, minZ: -0.6, maxZ: 28.4 }],
    blocks: [
      { minX: -7.2, maxX: -2.8, minZ: 25.6, maxZ: 29.4 },
      { minX: 2.8, maxX: 7.2, minZ: 25.6, maxZ: 29.4 },
    ],
    spawn: [0, 22],
    // Camera thấp và lùi xa, nhìn về phía bắc để thấy cả mặt tiền, portico và mái vòm như bản vẽ elevation.
    view: { offset: [0, 4.5, 9], lookY: 4.2, lookAhead: -10, far: 90 },
    portals: [{ target: "lobby", x: 0, z: -0.2, radius: 1.8, enabled: true }],
    doors: [],
    labels,
    textures,
  };
}

// ── Sảnh chính: cửa chính ra sân trước, cầu thang chính phía sau ─────────
function buildLobby(root: THREE.Group, engine: Engine): Built {
  const labels: THREE.Sprite[] = [];
  lights(root, engine, 16);
  // Sàn đá lát ô bàn cờ.
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) {
    g.fillStyle = (i + j) % 2 ? "#d9cfbc" : "#f3ede1";
    g.fillRect(i * 32, j * 32, 32, 32);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(12, 9);
  floorPlane(root, 24, 18, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  wall(root, 0, -9, 24, 0.3);
  wall(root, -6.5, 9, 11, 0.3, LOW_WALL);
  wall(root, 6.5, 9, 11, 0.3, LOW_WALL);
  wall(root, -12, -5.5, 0.3, 7);
  wall(root, -12, 5.5, 0.3, 7);
  wall(root, 12, -5.5, 0.3, 7);
  wall(root, 12, 5.5, 0.3, 7);
  // Hai hàng cột đôi trong sảnh.
  for (const x of [-4, 4]) for (const z of [-3, 3]) column(root, x, z, 3.2, 0.32);
  // Cầu thang chính: các bậc đi lên phía bắc.
  for (let i = 0; i < 6; i++) {
    const step = box(6, 0.25 * (i + 1), 0.45, STONE);
    step.position.set(0, (0.25 * (i + 1)) / 2, -6.2 - i * 0.45);
    root.add(step);
  }
  for (const x of [-3.2, 3.2]) {
    const rail = box(0.2, 1.8, 3, "#8a6a4a");
    rail.position.set(x, 0.9, -7.3);
    root.add(rail);
  }
  // Quầy tiếp đón (bên tây) + ghế dài.
  const desk = box(4, 1.1, 1.1, "#f6efe2");
  desk.position.set(-7, 0.55, -5.5);
  const deskTop = box(4.2, 0.08, 1.3, "#8fc1b5");
  deskTop.position.set(-7, 1.14, -5.5);
  root.add(desk, deskTop);
  bench(root, 7, 4, -Math.PI / 2);
  bench(root, -7, 4, Math.PI / 2);

  portal(root, 0, 8.8, Math.PI, t("world.court"), true, labels);
  portal(root, 0, -5.4, 0, t("world.elevator"), true, labels);
  portal(root, 11.8, 0, -Math.PI / 2, t("world.garden"), true, labels);
  portal(root, -11.8, 0, Math.PI / 2, t("world.circle"), true, labels);
  // Bảng tin Hội đồng (002 US4): ứng viên, kết quả, bảng vàng.
  const board = box(3, 1.7, 0.12, "#7a5a3a");
  board.position.set(7.6, 1.7, -8.78);
  const paper = box(2.7, 1.4, 0.04, "#f6efe2", false);
  paper.position.set(7.6, 1.7, -8.7);
  root.add(board, paper);
  const boardSign = makeLabel(`🏛 ${t("council.board")}`, { height: 0.36 });
  boardSign.position.set(7.6, 2.9, -8.6);
  root.add(boardSign);
  labels.push(boardSign);
  const title = makeLabel(t("app.title"), { height: 0.55, bg: "rgba(46,125,107,0.9)", color: "#ffffff" });
  title.position.set(0, 3.4, -8.7);
  root.add(title);
  labels.push(title);
  return {
    walk: [{ minX: -11.4, maxX: 11.4, minZ: -8.5, maxZ: 8.5 }],
    blocks: [
      { minX: -9.1, maxX: -4.9, minZ: -6.2, maxZ: -4.8 },
      { minX: -3.4, maxX: 3.4, minZ: -9, maxZ: -6 },
      ...[-4, 4].flatMap((x) => [-3, 3].map((z) => ({ minX: x - 0.35, maxX: x + 0.35, minZ: z - 0.35, maxZ: z + 0.35 }))),
    ],
    spawn: [0, 4],
    portals: [
      { target: "court", x: 0, z: 8.2, radius: 1.6, enabled: true },
      { target: "stairs", x: 0, z: -5.4, radius: 1.4, enabled: true },
      { target: "garden", x: 11, z: 0, radius: 1.6, enabled: true },
      { target: "circle", x: -11, z: 0, radius: 1.6, enabled: true },
      { target: "council", x: 7.6, z: -7.6, radius: 1.4, enabled: true },
    ],
    doors: [],
    labels,
    textures: [tex],
  };
}

// ── Vườn sau (sân dạo): tường gạch bao, cây, lối đi chữ thập, ao phía đông ──
function buildGarden(root: THREE.Group, engine: Engine): Built {
  const labels: THREE.Sprite[] = [];
  lights(root, engine, 20);
  floorPlane(root, 32, 32, "#9fcf8a");
  const pathNS = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 30), mat("#e2cfa8"));
  pathNS.rotation.x = -Math.PI / 2;
  pathNS.position.set(0, 0.01, 0);
  const pathEW = new THREE.Mesh(new THREE.PlaneGeometry(30, 2.2), mat("#e2cfa8"));
  pathEW.rotation.x = -Math.PI / 2;
  pathEW.position.set(0, 0.012, -1);
  root.add(pathNS, pathEW);
  const pond = new THREE.Mesh(new THREE.CircleGeometry(3, 36), mat("#8cc8e6"));
  pond.rotation.x = -Math.PI / 2;
  pond.position.set(9, 0.02, -8);
  pond.scale.set(1.3, 1, 1);
  root.add(pond);
  wall(root, 0, -15.6, 32, 0.4, 2.4, BRICK);
  wall(root, -15.8, 0, 0.4, 31.6, 2.4, BRICK);
  wall(root, 15.8, 0, 0.4, 31.6, 2.4, BRICK);
  wall(root, -9, 15.6, 14, 0.4, LOW_WALL, BRICK);
  wall(root, 9, 15.6, 14, 0.4, LOW_WALL, BRICK);
  const blocks: Rect[] = [{ minX: 4.8, maxX: 13.2, minZ: -11.2, maxZ: -4.8 }];
  const rnd = seeded(42);
  for (let i = 0; i < 24; i++) {
    const x = (rnd() - 0.5) * 27;
    const z = (rnd() - 0.5) * 27;
    if (Math.abs(x) < 2.2 || Math.abs(z + 1) < 2.2 || (x > 4 && x < 14 && z > -12 && z < -4) || z > 11) continue;
    const s = 0.8 + rnd() * 0.6;
    tree(root, x, z, s);
    blocks.push({ minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4 });
  }
  for (const [x, z, r] of [[-2, -5, Math.PI / 2], [-2, 4, Math.PI / 2], [2, 6, -Math.PI / 2], [9, -3.5, Math.PI]] as const) bench(root, x, z, r);
  portal(root, 0, 15.2, Math.PI, t("world.lobby"), true, labels);
  return {
    walk: [{ minX: -15.2, maxX: 15.2, minZ: -15, maxZ: 14.6 }],
    blocks,
    spawn: [0, 12],
    portals: [{ target: "lobby", x: 0, z: 14.4, radius: 1.6, enabled: true }],
    doors: [],
    labels,
    textures: [],
  };
}

// ── Gallery mỗi tầng: sảnh cầu thang ở giữa, phòng một bên, cửa sổ bên kia ──
function buildFloor(
  root: THREE.Group,
  engine: Engine,
  place: { wing: string; floor: number },
  roomsPerFloor: number,
  myRoomNumber: number | null,
): Built {
  const labels: THREE.Sprite[] = [];
  const half = galleryHalfLength(roomsPerFloor);
  const W = GALLERY_HALF_WIDTH;
  lights(root, engine, half + 4);
  floorPlane(root, half * 2 + 1, W * 2, FLOOR_WOOD);
  floorPlane(root, HALL_HALF * 2, 4, STONE_SHADE, 0, -W - 2);
  const runner = new THREE.Mesh(new THREE.PlaneGeometry(half * 2, 0.6), mat("#a3c4f3"));
  runner.rotation.x = -Math.PI / 2;
  runner.position.set(0, 0.01, 0.2);
  root.add(runner);

  // Tường bắc (có cửa phòng), lùi vào ở sảnh cầu thang.
  wall(root, -(half + HALL_HALF) / 2, -W - 0.15, half - HALL_HALF, 0.3);
  wall(root, (half + HALL_HALF) / 2, -W - 0.15, half - HALL_HALF, 0.3);
  wall(root, 0, -W - 4.15, HALL_HALF * 2, 0.3);
  wall(root, -HALL_HALF, -W - 2.15, 0.3, 4);
  wall(root, HALL_HALF, -W - 2.15, 0.3, 4);
  wall(root, -half - 0.5, 0, 0.3, W * 2);
  wall(root, half + 0.5, 0, 0.3, W * 2);
  // Tường nam cắt thấp + khung cửa sổ kéo trượt dọc gallery.
  wall(root, 0, W + 0.15, half * 2 + 1, 0.3, LOW_WALL);
  for (let x = -half + 2; x <= half - 2; x += 3.75) {
    const sill = box(1.6, 0.1, 0.45, STONE, false);
    sill.position.set(x, LOW_WALL + 0.05, W + 0.15);
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.5), mat("#bfe3f5", { basic: true, opacity: 0.55 }));
    glass.rotation.x = -Math.PI / 2.4;
    glass.position.set(x, LOW_WALL + 0.12, W + 0.3);
    root.add(sill, glass);
  }
  // Cầu thang chính trong sảnh giữa.
  for (let i = 0; i < 5; i++) {
    const step = box(5, 0.25 * (i + 1), 0.45, STONE);
    step.position.set(0, (0.25 * (i + 1)) / 2, -W - 1.9 - i * 0.45);
    root.add(step);
  }

  const doors = buildDoors(roomsPerFloor, myRoomNumber);
  for (const d of doors) {
    const panel = box(1.1, 2.2, 0.08, d.mine ? "#8fc1b5" : "#a98a68", false);
    panel.position.set(d.x, 1.1, d.z + 0.05);
    const lintel = box(1.4, 0.18, 0.12, STONE, false);
    lintel.position.set(d.x, 2.3, d.z + 0.06);
    root.add(panel, lintel);
    // Biển số phòng dạng "A-1-07": không phụ thuộc ngôn ngữ, không lộ chủ phòng.
    const plate = makeLabel(`${place.wing}-${place.floor}-${String(d.roomNumber).padStart(2, "0")}`, {
      height: 0.26,
      bg: d.mine ? "rgba(46,125,107,0.95)" : "rgba(255,253,248,0.92)",
      color: d.mine ? "#ffffff" : "#2b2b2b",
    });
    plate.position.set(d.x, 2.65, d.z + 0.2);
    root.add(plate);
    labels.push(plate);
  }
  const title = makeLabel(t("world.floor", { wing: place.wing, floor: String(place.floor) }), { height: 0.42 });
  title.position.set(0, 3.6, -W - 4);
  root.add(title);
  labels.push(title);
  portal(root, 0, -W - 3.6, 0, t("world.elevator"), true, labels);

  const mine = doors.find((d) => d.mine);
  return {
    walk: [
      { minX: -half, maxX: half, minZ: -W + 0.4, maxZ: W - 0.4 },
      { minX: -HALL_HALF + 0.4, maxX: HALL_HALF - 0.4, minZ: -W - 3.4, maxZ: W - 0.4 },
    ],
    blocks: [],
    spawn: mine ? standInFront(mine) : [0, 0],
    portals: [{ target: "stairs", x: 0, z: -W - 3.2, radius: 1.3, enabled: true }],
    doors,
    labels,
    textures: [],
  };
}

export function buildArea(
  engine: Engine,
  place: WalkPlace,
  layout: { roomsPerFloor: number; myRoom: { wing: string; floor: number; roomNumber: number } | null },
): Area {
  const root = new THREE.Group();
  engine.scene.add(root);
  const sky = place.kind === "garden" || place.kind === "court" ? "#cfe8f3" : "#f4efe6";
  engine.scene.background = new THREE.Color(sky);
  (engine.scene.fog as THREE.Fog | null)?.color.set(sky);
  const built =
    place.kind === "lobby"
      ? buildLobby(root, engine)
      : place.kind === "court"
        ? buildCourt(root, engine)
        : place.kind === "garden"
          ? buildGarden(root, engine)
          : buildFloor(
              root,
              engine,
              place,
              layout.roomsPerFloor,
              layout.myRoom && layout.myRoom.wing === place.wing && layout.myRoom.floor === place.floor ? layout.myRoom.roomNumber : null,
            );
  const { labels, textures, ...rest } = built;
  return {
    place,
    root,
    ...rest,
    dispose() {
      labels.forEach(disposeLabel);
      textures.forEach((x) => x.dispose());
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        m.geometry.dispose();
        // Vật liệu dùng chung (cache) giữ lại; chỉ giải phóng vật liệu riêng có texture.
        for (const mm of Array.isArray(m.material) ? m.material : [m.material]) {
          if ((mm as THREE.MeshStandardMaterial).map) mm.dispose();
        }
      });
      engine.scene.remove(root);
    },
  };
}

/** Đẩy vị trí ra khỏi vật cản và giữ trong vùng đi được (hợp nhiều hình chữ nhật). */
export function constrain(area: Pick<Area, "walk" | "blocks">, x: number, z: number, radius = 0.3): [number, number] {
  let nx = x;
  let nz = z;
  const inside = area.walk.some((r) => nx >= r.minX && nx <= r.maxX && nz >= r.minZ && nz <= r.maxZ);
  if (!inside) {
    let best: [number, number] = [nx, nz];
    let bestD = Infinity;
    for (const r of area.walk) {
      const px = Math.min(r.maxX, Math.max(r.minX, nx));
      const pz = Math.min(r.maxZ, Math.max(r.minZ, nz));
      const d = (px - nx) ** 2 + (pz - nz) ** 2;
      if (d < bestD) {
        bestD = d;
        best = [px, pz];
      }
    }
    [nx, nz] = best;
  }
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
