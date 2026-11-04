import type { AvatarSpec } from "@bvo/shared";
import * as THREE from "three";

/**
 * Nhân vật chibi dựng từ khối hình (T056): đầu to, thân nhỏ, tóc/áo/phụ kiện đổi được.
 * Hình khối và vật liệu được dùng chung giữa mọi nhân vật (cache) để cảnh đông người nhẹ trên điện thoại
 * (SC-009). Khi có model GLB (assets-src/avatar) sẽ thay phần dựng hình, giữ nguyên AvatarSpec và animation.
 */

export type Anim = "idle" | "walk" | "sit" | "wave";

export interface Avatar {
  group: THREE.Group;
  update(dt: number): void;
  setAnim(a: Anim): void;
  readonly anim: Anim;
  dispose(): void;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
const matCache = new Map<string, THREE.Material>();

function geo<T extends THREE.BufferGeometry>(key: string, make: () => T): T {
  let g = geoCache.get(key);
  if (!g) {
    g = make();
    geoCache.set(key, g);
  }
  return g as T;
}

export function mat(color: string, opts: { basic?: boolean; opacity?: number; side?: THREE.Side } = {}): THREE.Material {
  const key = `${color}|${opts.basic ? 1 : 0}|${opts.opacity ?? 1}|${opts.side ?? 0}`;
  let m = matCache.get(key);
  if (!m) {
    const params = { color, transparent: opts.opacity !== undefined, opacity: opts.opacity ?? 1, side: opts.side ?? THREE.FrontSide };
    m = opts.basic ? new THREE.MeshBasicMaterial(params) : new THREE.MeshStandardMaterial({ ...params, roughness: 0.8 });
    matCache.set(key, m);
  }
  return m;
}

const mesh = (g: THREE.BufferGeometry, m: THREE.Material) => new THREE.Mesh(g, m);

function hair(style: string, color: string): THREE.Object3D {
  const m = mat(color);
  const g = new THREE.Group();
  const cap = mesh(geo("hair-cap", () => new THREE.SphereGeometry(0.47, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55)), m);
  cap.position.y = 0.04;
  g.add(cap);
  if (style === "bob" || style === "long") {
    const long = style === "long";
    const back = mesh(
      geo(`hair-back-${style}`, () => new THREE.CylinderGeometry(0.46, 0.4, long ? 0.75 : 0.45, 20, 1, true, Math.PI * 0.6, Math.PI * 0.8)),
      mat(color, { side: THREE.DoubleSide }),
    );
    back.position.y = long ? -0.22 : -0.08;
    g.add(back);
  }
  if (style === "spiky") {
    for (let i = 0; i < 7; i++) {
      const s = mesh(geo("hair-spike", () => new THREE.ConeGeometry(0.09, 0.22, 6)), m);
      const a = (i / 7) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.28, 0.38, Math.sin(a) * 0.28);
      s.lookAt(s.position.clone().multiplyScalar(3).setY(1.5));
      g.add(s);
    }
  }
  if (style === "bun") {
    const bun = mesh(geo("hair-bun", () => new THREE.SphereGeometry(0.16, 12, 10)), m);
    bun.position.set(0, 0.48, -0.12);
    g.add(bun);
  }
  if (style === "curly") {
    for (let i = 0; i < 10; i++) {
      const c = mesh(geo("hair-curl", () => new THREE.SphereGeometry(0.12, 8, 6)), m);
      const a = (i / 10) * Math.PI * 2;
      c.position.set(Math.cos(a) * 0.36, 0.22, Math.sin(a) * 0.36);
      g.add(c);
    }
  }
  return g;
}

function accessory(kind: string | null, outfit: string): THREE.Object3D | null {
  if (!kind) return null;
  if (kind === "glasses") {
    const g = new THREE.Group();
    for (const x of [-0.15, 0.15]) {
      const ring = mesh(geo("glasses-ring", () => new THREE.TorusGeometry(0.08, 0.015, 6, 16)), mat("#333333"));
      ring.position.set(x, 0, 0.43);
      g.add(ring);
    }
    return g;
  }
  if (kind === "scarf") {
    const s = mesh(geo("scarf", () => new THREE.TorusGeometry(0.22, 0.07, 8, 20)), mat("#c0504d"));
    s.rotation.x = Math.PI / 2;
    return s;
  }
  if (kind === "beanie") {
    const b = mesh(geo("beanie", () => new THREE.SphereGeometry(0.5, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.45)), mat(outfit));
    b.position.y = 0.08;
    return b;
  }
  if (kind === "headphones") {
    const g = new THREE.Group();
    const band = mesh(geo("hp-band", () => new THREE.TorusGeometry(0.47, 0.03, 6, 20, Math.PI)), mat("#444444"));
    band.position.y = 0.02;
    g.add(band);
    for (const x of [-0.46, 0.46]) {
      const cup = mesh(geo("hp-cup", () => new THREE.CylinderGeometry(0.11, 0.11, 0.08, 12)), mat("#444444"));
      cup.rotation.z = Math.PI / 2;
      cup.position.x = x;
      g.add(cup);
    }
    return g;
  }
  return null;
}

export function buildAvatar(spec: AvatarSpec): Avatar {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);

  const torso = mesh(geo("torso", () => new THREE.CapsuleGeometry(0.28, 0.25, 6, 12)), mat(spec.colors.outfit));
  torso.position.y = 0.55;
  body.add(torso);
  if (spec.parts.outfit === "coat" || spec.parts.outfit === "cardigan") {
    const front = mesh(geo("coat-front", () => new THREE.BoxGeometry(0.06, 0.4, 0.02)), mat("#ffffff"));
    front.position.set(0, 0.55, 0.28);
    body.add(front);
  }
  if (spec.parts.outfit === "hoodie") {
    const hood = mesh(geo("hood", () => new THREE.TorusGeometry(0.2, 0.06, 6, 16)), mat(spec.colors.outfit));
    hood.rotation.x = Math.PI / 2;
    hood.position.y = 0.85;
    body.add(hood);
  }

  const legs: THREE.Object3D[] = [];
  for (const x of [-0.12, 0.12]) {
    const leg = mesh(geo("leg", () => new THREE.CapsuleGeometry(0.08, 0.15, 4, 8)), mat(spec.parts.outfit === "pajamas" ? spec.colors.outfit : "#4a4a5a"));
    leg.position.set(x, 0.16, 0);
    body.add(leg);
    legs.push(leg);
  }
  const arms: THREE.Object3D[] = [];
  for (const x of [-0.36, 0.36]) {
    // Khớp vai: nhóm xoay quanh vai, tay treo xuống dưới.
    const pivot = new THREE.Group();
    pivot.position.set(x, 0.7, 0);
    const arm = mesh(geo("arm", () => new THREE.CapsuleGeometry(0.07, 0.2, 4, 8)), mat(spec.colors.outfit));
    arm.position.y = -0.12;
    pivot.add(arm);
    body.add(pivot);
    arms.push(pivot);
  }

  const head = new THREE.Group();
  head.position.y = 1.2;
  const skull = mesh(geo("skull", () => new THREE.SphereGeometry(0.45, 24, 16)), mat(spec.colors.skin));
  if (spec.parts.head === "oval") skull.scale.set(0.92, 1.06, 0.95);
  head.add(skull);
  for (const x of [-0.15, 0.15]) {
    const eye = mesh(geo("eye", () => new THREE.SphereGeometry(0.05, 10, 6)), mat("#222222"));
    eye.position.set(x, 0, 0.41);
    eye.scale.set(1, 1.3, 0.6);
    head.add(eye);
    const blush = mesh(geo("blush", () => new THREE.CircleGeometry(0.05, 12)), mat("#f2a7a0", { basic: true, opacity: 0.6 }));
    blush.position.set(x * 1.5, -0.1, 0.42);
    head.add(blush);
  }
  head.add(hair(spec.parts.hair, spec.colors.hair));
  const acc = accessory(spec.parts.accessory, spec.colors.outfit);
  if (acc && spec.parts.accessory === "scarf") {
    acc.position.y = 0.78;
    body.add(acc);
  } else if (acc) head.add(acc);
  body.add(head);

  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });

  let anim: Anim = "idle";
  let time = Math.random() * 10;
  return {
    group,
    get anim() {
      return anim;
    },
    setAnim(a) {
      anim = a;
    },
    update(dt) {
      time += dt;
      const sit = anim === "sit";
      const walk = anim === "walk";
      body.position.y = sit ? -0.18 : walk ? Math.abs(Math.sin(time * 9)) * 0.06 : Math.sin(time * 2) * 0.015;
      head.rotation.z = anim === "idle" ? Math.sin(time * 1.3) * 0.04 : 0;
      legs.forEach((l, i) => (l.rotation.x = sit ? -Math.PI / 2 : walk ? Math.sin(time * 9 + i * Math.PI) * 0.6 : 0));
      arms.forEach((a, i) => {
        a.rotation.x = walk ? Math.sin(time * 9 + (i + 1) * Math.PI) * 0.5 : 0;
        a.rotation.z = anim === "wave" && i === 1 ? 2.6 + Math.sin(time * 10) * 0.3 : 0;
      });
    },
    // Hình khối/vật liệu dùng chung: chỉ cần gỡ khỏi cảnh.
    dispose() {
      group.removeFromParent();
    },
  };
}
