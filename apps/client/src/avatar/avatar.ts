import type { AvatarSpec } from "@bvo/shared";
import * as THREE from "three";

/**
 * Nhân vật chibi dựng từ khối hình đơn giản (T056): đầu to, thân nhỏ, tóc/áo/phụ kiện đổi được.
 * Bản này dùng hình khối thay cho model GLB; khi có tài sản 3D (assets-src/avatar) sẽ thay phần dựng hình,
 * giữ nguyên AvatarSpec và animation.
 */

export type Anim = "idle" | "walk" | "sit" | "wave";

export interface Avatar {
  group: THREE.Group;
  update(dt: number): void;
  setAnim(a: Anim): void;
  dispose(): void;
}

const mat = (color: string) => new THREE.MeshStandardMaterial({ color, roughness: 0.8 });

function hair(style: string, color: string): THREE.Object3D {
  const m = mat(color);
  const g = new THREE.Group();
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.47, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), m);
  cap.position.y = 0.04;
  g.add(cap);
  if (style === "bob" || style === "long") {
    const back = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.4, style === "long" ? 0.75 : 0.45, 24, 1, true, Math.PI * 0.6, Math.PI * 0.8), m);
    back.position.y = style === "long" ? -0.22 : -0.08;
    back.material.side = THREE.DoubleSide;
    g.add(back);
  }
  if (style === "spiky") {
    for (let i = 0; i < 7; i++) {
      const s = new THREE.Mesh(new THREE.ConeGeometry(0.09, 0.22, 6), m);
      const a = (i / 7) * Math.PI * 2;
      s.position.set(Math.cos(a) * 0.28, 0.38, Math.sin(a) * 0.28);
      s.lookAt(s.position.clone().multiplyScalar(3).setY(1.5));
      g.add(s);
    }
  }
  if (style === "bun") {
    const bun = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), m);
    bun.position.set(0, 0.48, -0.12);
    g.add(bun);
  }
  if (style === "curly") {
    for (let i = 0; i < 10; i++) {
      const c = new THREE.Mesh(new THREE.SphereGeometry(0.12, 10, 8), m);
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
    const m = mat("#333");
    for (const x of [-0.15, 0.15]) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.015, 8, 20), m);
      ring.position.set(x, 0, 0.43);
      g.add(ring);
    }
    return g;
  }
  if (kind === "scarf") {
    const s = new THREE.Mesh(new THREE.TorusGeometry(0.22, 0.07, 10, 24), mat("#c0504d"));
    s.rotation.x = Math.PI / 2;
    s.position.y = -0.48;
    return s;
  }
  if (kind === "beanie") {
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), mat(outfit));
    b.position.y = 0.08;
    return b;
  }
  if (kind === "headphones") {
    const g = new THREE.Group();
    const m = mat("#444");
    const band = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.03, 8, 24, Math.PI), m);
    band.position.y = 0.02;
    g.add(band);
    for (const x of [-0.46, 0.46]) {
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.08, 16), m);
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

  // Thân (áo) — nhỏ, tròn trịa.
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 0.25, 6, 16), mat(spec.colors.outfit));
  torso.position.y = 0.55;
  body.add(torso);
  if (spec.parts.outfit === "coat" || spec.parts.outfit === "cardigan") {
    const front = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.02), mat("#ffffff"));
    front.position.set(0, 0.55, 0.28);
    body.add(front);
  }
  if (spec.parts.outfit === "hoodie") {
    const hood = new THREE.Mesh(new THREE.TorusGeometry(0.2, 0.06, 8, 20), mat(spec.colors.outfit));
    hood.rotation.x = Math.PI / 2;
    hood.position.y = 0.85;
    body.add(hood);
  }
  // Chân + tay
  const limbs: THREE.Mesh[] = [];
  for (const x of [-0.12, 0.12]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.08, 0.15, 4, 8), mat(spec.parts.outfit === "pajamas" ? spec.colors.outfit : "#4a4a5a"));
    leg.position.set(x, 0.16, 0);
    body.add(leg);
    limbs.push(leg);
  }
  const arms: THREE.Mesh[] = [];
  for (const x of [-0.36, 0.36]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.2, 4, 8), mat(spec.colors.outfit));
    arm.position.set(x, 0.58, 0);
    arm.geometry.translate(0, -0.12, 0);
    arm.position.y += 0.12;
    body.add(arm);
    arms.push(arm);
  }
  // Đầu to (chibi)
  const head = new THREE.Group();
  head.position.y = 1.2;
  const skull = new THREE.Mesh(
    new THREE.SphereGeometry(0.45, 32, 24),
    mat(spec.colors.skin),
  );
  if (spec.parts.head === "oval") skull.scale.set(0.92, 1.06, 0.95);
  head.add(skull);
  for (const x of [-0.15, 0.15]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 8), mat("#222"));
    eye.position.set(x, 0, 0.41);
    eye.scale.set(1, 1.3, 0.6);
    head.add(eye);
    const blush = new THREE.Mesh(new THREE.CircleGeometry(0.05, 16), new THREE.MeshBasicMaterial({ color: "#f2a7a0", transparent: true, opacity: 0.6 }));
    blush.position.set(x * 1.5, -0.1, 0.42);
    head.add(blush);
  }
  head.add(hair(spec.parts.hair, spec.colors.hair));
  const acc = accessory(spec.parts.accessory, spec.colors.outfit);
  if (acc) (spec.parts.accessory === "scarf" ? body : head).add(acc);
  if (spec.parts.accessory === "scarf" && acc) acc.position.y = 0.78;
  body.add(head);

  group.traverse((o) => {
    if ((o as THREE.Mesh).isMesh) o.castShadow = true;
  });

  let anim: Anim = "idle";
  let time = Math.random() * 10;
  return {
    group,
    setAnim(a) {
      anim = a;
    },
    update(dt) {
      time += dt;
      const sit = anim === "sit";
      body.position.y = sit ? -0.18 : anim === "walk" ? Math.abs(Math.sin(time * 9)) * 0.06 : Math.sin(time * 2) * 0.015;
      head.rotation.z = anim === "idle" ? Math.sin(time * 1.3) * 0.04 : 0;
      limbs.forEach((l, i) => (l.rotation.x = sit ? -Math.PI / 2 : anim === "walk" ? Math.sin(time * 9 + i * Math.PI) * 0.6 : 0));
      arms.forEach((a, i) => {
        a.rotation.x = anim === "walk" ? Math.sin(time * 9 + (i + 1) * Math.PI) * 0.5 : 0;
        a.rotation.z = anim === "wave" && i === 1 ? -2.4 + Math.sin(time * 10) * 0.3 : 0;
      });
    },
    dispose() {
      group.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          (m.material as THREE.Material).dispose();
        }
      });
    },
  };
}
