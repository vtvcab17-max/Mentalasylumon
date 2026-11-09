import { HOTSPOTS } from "@bvo/shared";
import * as THREE from "three";
import type { Engine } from "../engine/renderer";

/**
 * Dẫn đường tới điểm khám phá (002 FR-002): vòng sáng dưới đất + mũi tên nhấp nhô trên điểm đến,
 * và một mũi tên nhỏ quanh chân nhân vật chỉ hướng. Tới nơi thì tự tắt (máy chủ ghi nhận nhiệm vụ).
 */
export function showGuide(engine: Engine, zone: string, spotId: string, player: () => THREE.Vector3): (() => void) | null {
  const spot = HOTSPOTS[zone]?.find((s) => s.id === spotId);
  if (!spot) return null;
  const root = new THREE.Group();
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(spot.r - 0.25, spot.r, 40),
    new THREE.MeshBasicMaterial({ color: "#f6d186", transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.set(spot.x, 0.03, spot.z);
  const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 4), new THREE.MeshBasicMaterial({ color: "#2e7d6b" }));
  arrow.rotation.x = Math.PI;
  arrow.position.set(spot.x, 2.6, spot.z);
  const pointer = new THREE.Mesh(new THREE.ConeGeometry(0.18, 0.5, 3), new THREE.MeshBasicMaterial({ color: "#2e7d6b" }));
  pointer.rotation.x = Math.PI / 2;
  const pointerHolder = new THREE.Group();
  pointerHolder.add(pointer);
  pointer.position.z = 1.1;
  root.add(ring, arrow, pointerHolder);
  engine.scene.add(root);

  let time = 0;
  const stop = engine.onFrame((dt) => {
    time += dt;
    arrow.position.y = 2.6 + Math.sin(time * 3) * 0.2;
    const p = player();
    pointerHolder.position.set(p.x, 0.15, p.z);
    pointerHolder.rotation.y = Math.atan2(spot.x - p.x, spot.z - p.z);
    const inside = (p.x - spot.x) ** 2 + (p.z - spot.z) ** 2 <= spot.r * spot.r;
    pointerHolder.visible = !inside;
    if (inside && time > 0.5) dispose();
  });
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    stop();
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (m.material as THREE.Material).dispose();
      }
    });
    engine.scene.remove(root);
  }
  return dispose;
}
