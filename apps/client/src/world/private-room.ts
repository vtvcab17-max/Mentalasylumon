import type { AvatarSpec } from "@bvo/shared";
import * as THREE from "three";
import { Atmosphere } from "../engine/atmosphere";
import { placeProp } from "./props";
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

  // Ánh sáng theo ngày/đêm; trong phòng ban đêm có đèn cây (research.md §R19).
  const atm = new Atmosphere(engine, root, { outdoor: false, span: 6, indoorLight: 1 });

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
  const winMat = new THREE.MeshBasicMaterial({ color: "#bfe3f5" });
  atm.addWindow(winMat);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.1), winMat);
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
  // Giường, kệ sách, cây, khung tranh: model CC0 (KayKit); lỗi tải thì giữ khối đơn giản.
  void placeProp(engine, root, "bed_single_A", 2.1, -1.2, { width: 2.1, rotY: 0 }).then((o) => {
    if (!o) root.add(bed);
  });
  // Tủ nhỏ có đồ trang trí sát tường trái, cây góc phải sau — không che camera.
  void placeProp(engine, root, "cabinet_small_decorated", -2.6, -0.9, { width: 1.1, rotY: Math.PI / 2 });
  void placeProp(engine, root, "pictureframe_large_A", 0.9, -2.45, { height: 0.9, y: 1.1 });
  void placeProp(engine, root, "pot_large", 2.6, -2.15, { height: 0.5 });
  void placeProp(engine, root, "plant_bush", 2.6, -2.15, { height: 0.8, y: 0.4, noShadow: true });

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

  // Đèn cây: sáng ấm khi trời tối.
  void placeProp(engine, root, "lamp_standing", -2.4, -2.0, { height: 1.75 });
  const bulbMat = new THREE.MeshStandardMaterial({ color: "#fff4d6", emissive: "#ffcf8a", emissiveIntensity: 0.3 });
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), bulbMat);
  bulb.position.set(-2.4, 1.5, -2.0);
  root.add(bulb);
  atm.addLamp({ position: new THREE.Vector3(-2.4, 1.3, -2.0), bulb: bulbMat, color: "#ffd9a0", range: 6 });
  // Đèn trần dịu cho cả phòng lúc tối.
  atm.addLamp({ position: new THREE.Vector3(0, 2.7, 0), color: "#ffe6c0", range: 8 });

  // Người chơi ngồi ghế trái
  const player = buildAvatar(avatar);
  player.group.position.set(-1.2, 0.18, 0.4);
  player.group.rotation.y = Math.PI / 2;
  player.setAnim("sit");
  root.add(player.group);

  let doctor: Avatar | null = null;
  // Màn ngang nhìn ngang tầm; màn dọc (điện thoại) lùi xa và cao hơn để thấy cả hai ghế lẫn giường.
  let aspect = 0;
  const placeCamera = () => {
    if (engine.camera.aspect === aspect) return;
    aspect = engine.camera.aspect;
    if (aspect >= 1) {
      engine.camera.position.set(0.2, 2.4, 4.2);
      engine.camera.lookAt(-0.3, 0.9, 0);
    } else {
      engine.camera.position.set(0.1, 3.6, 5.6);
      engine.camera.lookAt(-0.2, 0.5, -0.2);
    }
  };
  placeCamera();
  const stop = engine.onFrame((dt) => {
    placeCamera();
    player.update(dt);
    doctor?.update(dt);
  });

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
      atm.dispose();
      engine.scene.remove(root);
      player.dispose();
      doctor?.dispose();
    },
  };
}
