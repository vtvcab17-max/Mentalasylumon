import type { AvatarSpec } from "@bvo/shared";
import * as THREE from "three";
import { buildAvatar, type Avatar } from "../avatar/avatar";
import { disposeLabel, makeLabel } from "../engine/label";
import type { Engine } from "../engine/renderer";

/**
 * Phòng sinh hoạt hình tròn (T082/T083, FR-022). Dựng bằng khối hình cho tới khi có GLB:
 * sàn tròn, thảm, ghế xếp vòng quanh bàn trà, cửa sổ cao kiểu phòng octagon của bản vẽ 1815 (research.md §R18).
 * Bấm vào ghế trống để ngồi. Ghế của mình viền xanh.
 */

export interface CircleScene {
  setSeat(seat: number, occupant: { spec: AvatarSpec | null; nickname: string; mine: boolean } | null): void;
  /** Ghế ở vị trí bấm (toạ độ màn hình), hoặc null. */
  pick(clientX: number, clientY: number): number | null;
  setFacilitator(on: boolean, label?: string): void;
  dispose(): void;
}

const mat = (color: string, rough = 0.85) => new THREE.MeshStandardMaterial({ color, roughness: rough });
const ROOM_R = 7.5;
const SEAT_R = 3.3;

export function seatPosition(seat: number, maxSeats: number): { x: number; z: number; rotY: number } {
  const a = (seat / maxSeats) * Math.PI * 2 + Math.PI / 2; // ghế 0 ở phía gần camera
  const x = Math.cos(a) * SEAT_R;
  const z = Math.sin(a) * SEAT_R;
  return { x, z, rotY: Math.atan2(-x, -z) }; // quay mặt vào giữa
}

export function buildCircleRoom(engine: Engine, maxSeats: number): CircleScene {
  const root = new THREE.Group();
  engine.scene.add(root);
  engine.scene.background = new THREE.Color("#efe6d6");

  root.add(new THREE.HemisphereLight("#fff6e8", "#b9a68a", 1.0));
  const sun = new THREE.DirectionalLight("#ffe9c7", 1.0);
  sun.position.set(-4, 9, 5);
  sun.castShadow = engine.preset.shadows;
  root.add(sun);

  // Sàn gỗ tròn + thảm vòng.
  const floor = new THREE.Mesh(new THREE.CircleGeometry(ROOM_R, 48), mat("#cfa978"));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  const rug = new THREE.Mesh(new THREE.RingGeometry(SEAT_R - 1.1, SEAT_R + 1.1, 48), mat("#cdb4db"));
  rug.rotation.x = -Math.PI / 2;
  rug.position.y = 0.01;
  root.add(floor, rug);

  // Tường cong nửa sau (nửa trước để trống cho camera) với cửa sổ cao.
  const wall = new THREE.Mesh(
    new THREE.CylinderGeometry(ROOM_R, ROOM_R, 4, 48, 1, true, Math.PI / 2, Math.PI),
    new THREE.MeshStandardMaterial({ color: "#f3e9dc", side: THREE.BackSide, roughness: 0.95 }),
  );
  wall.position.y = 2;
  root.add(wall);
  for (let i = 0; i < 5; i++) {
    const a = Math.PI + (i + 0.5) * (Math.PI / 5);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2), new THREE.MeshBasicMaterial({ color: "#bfe3f5" }));
    win.position.set(Math.cos(a) * (ROOM_R - 0.05), 2.2, Math.sin(a) * (ROOM_R - 0.05));
    win.lookAt(0, 2.2, 0);
    root.add(win);
  }
  // Tường thấp nửa trước (không che vòng ghế).
  const lowWall = new THREE.Mesh(
    new THREE.CylinderGeometry(ROOM_R, ROOM_R, 0.6, 48, 1, true, -Math.PI / 2, Math.PI),
    new THREE.MeshStandardMaterial({ color: "#e6d9c6", side: THREE.DoubleSide }),
  );
  lowWall.position.y = 0.3;
  root.add(lowWall);

  // Bàn trà + chậu cây ở giữa.
  const table = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 0.4, 32), mat("#a98a68"));
  table.position.y = 0.2;
  const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.18, 0.3, 16), mat("#d98c5f"));
  pot.position.y = 0.55;
  const leaves = new THREE.Mesh(new THREE.SphereGeometry(0.38, 16, 12), mat("#6aa84f"));
  leaves.position.y = 0.95;
  root.add(table, pot, leaves);

  // Ghế xếp vòng.
  const chairMat = mat("#8fc1b5");
  const mineMat = mat("#2e7d6b");
  const chairs: THREE.Group[] = [];
  const hit: THREE.Mesh[] = [];
  for (let i = 0; i < maxSeats; i++) {
    const { x, z, rotY } = seatPosition(i, maxSeats);
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.12, 0.62), chairMat);
    seat.position.y = 0.42;
    const back = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.6, 0.1), chairMat);
    back.position.set(0, 0.75, 0.27);
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.5), mat("#7a6a58"));
    legs.position.y = 0.18;
    seat.castShadow = back.castShadow = true;
    // Vùng bấm rộng hơn ghế cho dễ chạm trên điện thoại.
    const zone = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 1.6, 12), new THREE.MeshBasicMaterial({ visible: false }));
    zone.position.y = 0.8;
    zone.userData.seat = i;
    g.add(seat, back, legs, zone);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    root.add(g);
    chairs.push(g);
    hit.push(zone);
  }

  const occupants = new Map<number, { avatar: Avatar | null; label: THREE.Sprite }>();
  let facilitator: { avatar: Avatar; label: THREE.Sprite } | null = null;

  // Màn ngang: nhìn chéo từ phía trước. Màn dọc (điện thoại): khung chat chiếm nửa dưới, nên camera lên cao
  // và nhìn xuống điểm phía dưới vòng ghế để cả vòng nằm gọn ở nửa trên màn hình.
  let aspect = 0;
  const placeCamera = () => {
    if (engine.camera.aspect === aspect) return;
    aspect = engine.camera.aspect;
    if (aspect >= 1) {
      engine.camera.position.set(0, 7.2, 8.8);
      engine.camera.lookAt(0, 0.4, 0.3);
    } else {
      engine.camera.position.set(0, 15.5, 7.5);
      engine.camera.lookAt(0, 0, 5.2);
    }
  };
  placeCamera();
  const stop = engine.onFrame((dt) => {
    placeCamera();
    for (const o of occupants.values()) o.avatar?.update(dt);
    facilitator?.avatar.update(dt);
  });

  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  function clearSeat(seat: number) {
    const o = occupants.get(seat);
    if (!o) return;
    if (o.avatar) {
      root.remove(o.avatar.group);
      o.avatar.dispose();
    }
    disposeLabel(o.label);
    occupants.delete(seat);
    for (const m of chairs[seat].children) if ((m as THREE.Mesh).material === mineMat) (m as THREE.Mesh).material = chairMat;
  }

  return {
    setSeat(seat, occ) {
      if (seat < 0 || seat >= maxSeats) return;
      clearSeat(seat);
      if (!occ) return;
      const { x, z, rotY } = seatPosition(seat, maxSeats);
      let avatar: Avatar | null = null;
      if (occ.spec) {
        avatar = buildAvatar(occ.spec);
        avatar.group.position.set(x, 0.18, z);
        avatar.group.rotation.y = rotY;
        avatar.setAnim("sit");
        root.add(avatar.group);
      }
      const label = makeLabel(occ.nickname, occ.mine ? { bg: "rgba(46,125,107,0.95)", color: "#ffffff" } : {});
      label.position.set(x, 1.95, z);
      root.add(label);
      occupants.set(seat, { avatar, label });
      if (occ.mine) for (const m of chairs[seat].children.slice(0, 2)) (m as THREE.Mesh).material = mineMat;
    },
    pick(clientX, clientY) {
      const r = engine.canvas.getBoundingClientRect();
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(ndc, engine.camera);
      const first = ray.intersectObjects(hit, false)[0];
      return first ? (first.object.userData.seat as number) : null;
    },
    setFacilitator(on, label) {
      if (facilitator) {
        root.remove(facilitator.avatar.group);
        facilitator.avatar.dispose();
        disposeLabel(facilitator.label);
        facilitator = null;
      }
      if (!on) return;
      // Bác sĩ AI đứng cạnh bàn, phía xa camera, có nhãn "AI".
      const avatar = buildAvatar({
        parts: { head: "round", hair: "short", outfit: "coat", accessory: "glasses" },
        colors: { skin: "#e8c39e", hair: "#3b2f2f", outfit: "#ffffff" },
      } as AvatarSpec);
      avatar.group.position.set(0, 0, -1.4);
      root.add(avatar.group);
      const l = makeLabel(`AI · ${label ?? ""}`, { bg: "rgba(43,43,43,0.9)", color: "#ffffff" });
      l.position.set(0, 1.9, -1.4);
      root.add(l);
      facilitator = { avatar, label: l };
    },
    dispose() {
      stop();
      for (const s of [...occupants.keys()]) clearSeat(s);
      this.setFacilitator(false);
      root.traverse((o) => {
        const m = o as THREE.Mesh;
        if (m.isMesh) m.geometry.dispose();
      });
      engine.scene.remove(root);
    },
  };
}
