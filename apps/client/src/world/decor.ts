import * as THREE from "three";

/**
 * Trang trí theo nhiệm kỳ Viện trưởng (002 US5, FR-024): đèn lồng / cờ dây / hoa / đèn dây trong sảnh, sân trước,
 * vườn sau. Chỉ dựng từ bộ chọn sẵn, không có chữ (Constitution V). Nhẹ: vài chục khối nhỏ dùng chung vật liệu.
 */

type Kind = "lobby" | "court" | "garden";
const LINES: Record<Kind, [number, number, number, number, number][]> = {
  // [x1, z1, x2, z2, cao]
  lobby: [
    [-11, -8.4, 11, -8.4, 3.2],
    [-11.4, -8, -11.4, 8, 3.0],
    [11.4, -8, 11.4, 8, 3.0],
  ],
  court: [
    [-26, 27, -8, 27, 2.6],
    [8, 27, 26, 27, 2.6],
    [-12, 3, 12, 3, 4.2],
  ],
  garden: [
    [-15, 15, -3, 15, 2.4],
    [3, 15, 15, 15, 2.4],
    [-15, -15, 15, -15, 2.6],
  ],
};

export function applyDecor(root: THREE.Object3D, place: string, decor: { style: string; colors: string[] } | null): () => void {
  if (!decor || !(place in LINES)) return () => undefined;
  const group = new THREE.Group();
  const mats = decor.colors.map((c) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, emissive: decor.style === "lights" ? c : "#000000", emissiveIntensity: decor.style === "lights" ? 0.8 : 0 }));
  const geos: THREE.BufferGeometry[] = [];
  const geo = (g: THREE.BufferGeometry) => (geos.push(g), g);
  const lantern = geo(new THREE.SphereGeometry(0.22, 10, 8));
  const flag = geo(new THREE.ConeGeometry(0.22, 0.4, 3));
  const bulb = geo(new THREE.SphereGeometry(0.08, 6, 4));
  const pot = geo(new THREE.CylinderGeometry(0.25, 0.2, 0.35, 10));
  const bloom = geo(new THREE.SphereGeometry(0.28, 10, 8));
  const potMat = new THREE.MeshStandardMaterial({ color: "#c97d4e" });
  const cord = new THREE.LineBasicMaterial({ color: "#6b5a48" });

  for (const [x1, z1, x2, z2, y] of LINES[place as Kind]) {
    const len = Math.hypot(x2 - x1, z2 - z1);
    if (decor.style === "flowers") {
      const n = Math.max(2, Math.floor(len / 4));
      for (let i = 0; i <= n; i++) {
        const x = x1 + ((x2 - x1) * i) / n;
        const z = z1 + ((z2 - z1) * i) / n;
        const p = new THREE.Mesh(pot, potMat);
        p.position.set(x, 0.18, z);
        const b = new THREE.Mesh(bloom, mats[i % mats.length]);
        b.position.set(x, 0.55, z);
        group.add(p, b);
      }
      continue;
    }
    const pts = [new THREE.Vector3(x1, y, z1), new THREE.Vector3(x2, y, z2)];
    group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), cord));
    const step = decor.style === "lights" ? 0.8 : decor.style === "flags" ? 1 : 2.2;
    const n = Math.max(1, Math.floor(len / step));
    for (let i = 0; i <= n; i++) {
      const x = x1 + ((x2 - x1) * i) / n;
      const z = z1 + ((z2 - z1) * i) / n;
      const sag = Math.sin((i / n) * Math.PI) * 0.35;
      const m = new THREE.Mesh(decor.style === "lanterns" ? lantern : decor.style === "flags" ? flag : bulb, mats[i % mats.length]);
      m.position.set(x, y - sag - (decor.style === "flags" ? 0.22 : decor.style === "lanterns" ? 0.3 : 0.05), z);
      if (decor.style === "flags") m.rotation.x = Math.PI;
      group.add(m);
    }
  }
  root.add(group);
  return () => {
    root.remove(group);
    group.traverse((o) => (o as THREE.Line).geometry?.dispose());
    geos.forEach((g) => g.dispose());
    mats.forEach((m) => m.dispose());
    potMat.dispose();
    cord.dispose();
  };
}
