import * as THREE from "three";
import type { Engine } from "../engine/renderer";

/**
 * Đồ vật 3D (research.md §R19): hai gói GLB gộp sẵn, tổng ~440 KB.
 * - `kaykit-props.glb`: KayKit Furniture/City Builder/Restaurant Bits — Kay Lousberg, CC0.
 * - `kenney-nature.glb`: Kenney Nature Kit — Kenney, CC0.
 * Mỗi món là một node gốc theo tên. Đặt bằng kích thước mong muốn (cao hoặc rộng) để khớp tỉ lệ chibi của game.
 * Hình học/vật liệu dùng chung giữa các bản sao: đánh dấu `userData.shared` để khi rời khu không giải phóng nhầm.
 */

export const PROP_FILES = ["/models/kaykit-props.glb", "/models/kenney-nature.glb"] as const;

let library: Promise<Map<string, THREE.Object3D>> | null = null;

function load(engine: Engine) {
  if (!library) {
    library = Promise.all(PROP_FILES.map((f) => engine.loadGLB(f).catch(() => null))).then((scenes) => {
      const map = new Map<string, THREE.Object3D>();
      for (const s of scenes) {
        if (!s) continue;
        for (const child of s.children) {
          child.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) {
              m.userData.shared = true;
              const mats = Array.isArray(m.material) ? m.material : [m.material];
              for (const mm of mats) (mm as THREE.MeshStandardMaterial).roughness = Math.max(0.7, (mm as THREE.MeshStandardMaterial).roughness ?? 1);
            }
          });
          map.set(child.name, child);
        }
      }
      return map;
    });
  }
  return library;
}

export function preloadProps(engine: Engine) {
  void load(engine);
}

export const isShared = (o: THREE.Object3D) => !!o.userData.shared;

export interface PropOpts {
  rotY?: number;
  /** Cao (m) sau khi đặt. */
  height?: number;
  /** Rộng lớn nhất theo mặt đất (m) — dùng cho thảm, bàn. */
  width?: number;
  y?: number;
  /** Bỏ đổ bóng (vật nhỏ, cỏ hoa) để nhẹ máy. */
  noShadow?: boolean;
}

const box = new THREE.Box3();
const size = new THREE.Vector3();

/** Đặt một món đồ; trả về null nếu gói chưa có (mạng lỗi) — người gọi có thể dựng khối thay thế. */
export async function placeProp(engine: Engine, root: THREE.Object3D, name: string, x: number, z: number, opts: PropOpts = {}) {
  const lib = await load(engine);
  const src = lib.get(name);
  if (!src || !root.parent) return null;
  const o = src.clone(true);
  o.position.set(0, 0, 0);
  o.rotation.set(0, 0, 0);
  o.scale.set(1, 1, 1);
  o.updateMatrixWorld(true);
  box.setFromObject(o).getSize(size);
  const k = opts.height ? opts.height / Math.max(size.y, 1e-3) : opts.width ? opts.width / Math.max(size.x, size.z, 1e-3) : 1;
  o.scale.setScalar(k);
  // Đặt đáy chạm sàn.
  o.position.set(x, (opts.y ?? 0) - box.min.y * k, z);
  o.rotation.y = opts.rotY ?? 0;
  const shadow = engine.preset.shadows && !opts.noShadow;
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh) {
      m.castShadow = shadow;
      m.receiveShadow = true;
    }
  });
  root.add(o);
  return o;
}

/** Tìm vật liệu theo tên trong một món (để làm bóng đèn phát sáng ban đêm). */
export function findMaterial(o: THREE.Object3D, test: (m: THREE.MeshStandardMaterial, mesh: THREE.Mesh) => boolean) {
  let found: THREE.MeshStandardMaterial | null = null;
  o.traverse((c) => {
    const m = c as THREE.Mesh;
    if (found || !m.isMesh) return;
    for (const mm of Array.isArray(m.material) ? m.material : [m.material]) if (test(mm as THREE.MeshStandardMaterial, m)) found = mm as THREE.MeshStandardMaterial;
  });
  return found as THREE.MeshStandardMaterial | null;
}
