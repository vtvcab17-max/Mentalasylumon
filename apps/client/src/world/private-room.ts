import type { AvatarSpec } from "@bvo/shared";
import * as THREE from "three";
import { buildAvatar, type Avatar } from "../avatar/avatar";
import type { Engine } from "../engine/renderer";

/**
 * Cảnh phòng riêng (T058). Phòng dựng bằng khối đơn giản (tường, sàn gỗ, giường, cửa sổ, đèn, ghế bác sĩ)
 * cho tới khi có model GLB từ assets-src/room (T057). Chỉ chủ phòng ở đây — không có kết nối realtime.
 */

export interface PrivateRoom {
  player: Avatar;
  showDoctor(spec: AvatarSpec | null): void;
  dispose(): void;
}

const mat = (color: string, rough = 0.9) => new THREE.MeshStandardMaterial({ color, roughness: rough });

export function buildPrivateRoom(engine: Engine, avatar: AvatarSpec): PrivateRoom {
  const root = new THREE.Group();
  engine.scene.add(root);

  // Ánh sáng ấm
  root.add(new THREE.HemisphereLight("#fff6e8", "#b9a68a", 0.9));
  const sun = new THREE.DirectionalLight("#ffe9c7", 1.1);
  sun.position.set(-3, 5, 2);
  sun.castShadow = engine.preset.shadows;
  root.add(sun);

  // Sàn + tường (phòng 6 × 5 m)
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(6, 5), mat("#d9b98f"));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  root.add(floor);
  const wallMat = mat("#f3e9dc");
  const back = new THREE.Mesh(new THREE.PlaneGeometry(6, 3), wallMat);
  back.position.set(0, 1.5, -2.5);
  root.add(back);
  const left = new THREE.Mesh(new THREE.PlaneGeometry(5, 3), wallMat);
  left.rotation.y = Math.PI / 2;
  left.position.set(-3, 1.5, 0);
  root.add(left);
  const right = left.clone();
  right.rotation.y = -Math.PI / 2;
  right.position.x = 3;
  root.add(right);

  // Cửa sổ có ánh trời
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), new THREE.MeshBasicMaterial({ color: "#bfe3f5" }));
  win.position.set(-1.2, 1.7, -2.49);
  root.add(win);
  const frame = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.06, 0.05), mat("#ffffff"));
  frame.position.set(-1.2, 1.7, -2.47);
  root.add(frame);

  // Giường
  const bed = new THREE.Group();
  const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.35, 2), mat("#a3c4f3"));
  base.position.y = 0.25;
  const pillow = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.12, 0.35), mat("#ffffff"));
  pillow.position.set(0, 0.48, -0.75);
  bed.add(base, pillow);
  bed.position.set(2.1, 0, -1.3);
  root.add(bed);

  // Thảm tròn + 2 ghế (một cho bác sĩ)
  const rug = new THREE.Mesh(new THREE.CircleGeometry(1.1, 32), mat("#cdb4db"));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(-0.4, 0.01, 0.4);
  root.add(rug);
  const chair = (x: number, z: number, rotY: number) => {
    const g = new THREE.Group();
    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.12, 0.6), mat("#8fc1b5"));
    seat.position.y = 0.42;
    const backrest = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.6, 0.1), mat("#8fc1b5"));
    backrest.position.set(0, 0.75, -0.25);
    g.add(seat, backrest);
    g.position.set(x, 0, z);
    g.rotation.y = rotY;
    root.add(g);
  };
  chair(-1.2, 0.4, Math.PI / 2);
  chair(0.5, 0.4, -Math.PI / 2);

  // Đèn cây
  const lamp = new THREE.Mesh(new THREE.ConeGeometry(0.25, 0.3, 20, 1, true), mat("#f6d186"));
  lamp.position.set(-2.4, 1.6, -2.0);
  const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.5), mat("#555"));
  pole.position.set(-2.4, 0.75, -2.0);
  root.add(lamp, pole);
  const glow = new THREE.PointLight("#ffd9a0", 0.6, 4);
  glow.position.set(-2.4, 1.5, -2.0);
  root.add(glow);

  // Người chơi ngồi ghế trái
  const player = buildAvatar(avatar);
  player.group.position.set(-1.2, 0.18, 0.4);
  player.group.rotation.y = Math.PI / 2;
  player.setAnim("sit");
  root.add(player.group);

  let doctor: Avatar | null = null;
  const stop = engine.onFrame((dt) => {
    player.update(dt);
    doctor?.update(dt);
  });

  engine.camera.position.set(0.2, 2.4, 4.2);
  engine.camera.lookAt(-0.3, 0.9, 0);

  return {
    player,
    showDoctor(spec) {
      if (doctor) {
        root.remove(doctor.group);
        doctor.dispose();
        doctor = null;
      }
      if (!spec) return;
      doctor = buildAvatar(spec);
      doctor.group.position.set(0.5, 0.18, 0.4);
      doctor.group.rotation.y = -Math.PI / 2;
      doctor.setAnim("sit");
      root.add(doctor.group);
    },
    dispose() {
      stop();
      engine.scene.remove(root);
      player.dispose();
      doctor?.dispose();
    },
  };
}
