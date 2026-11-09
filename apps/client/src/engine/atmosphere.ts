import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import type { Engine } from "./renderer";

/**
 * Ngày và đêm theo giờ Việt Nam (UTC+7): mặt trời mọc ~6:00, lặn ~18:00.
 * Mỗi khu tạo một Atmosphere: ánh sáng trời + mặt trời/mặt trăng, bầu trời (Sky shader ở mức vừa/cao, màu nền
 * chuyển dần ở mức thấp), sao ban đêm, đèn bật khi trời tối, cửa sổ đổi màu. Người chơi chọn được "Theo giờ thật",
 * "Luôn ban ngày" hoặc "Luôn ban đêm" (một số người thấy cảnh tối khó chịu — Constitution VI).
 */

export type DayMode = "auto" | "day" | "night";
const MODE_KEY = "bvo.dayMode";

export function dayMode(): DayMode {
  try {
    const v = localStorage.getItem(MODE_KEY);
    if (v === "day" || v === "night" || v === "auto") return v;
  } catch {
    /* ignore */
  }
  return "auto";
}

const listeners = new Set<() => void>();
export function setDayMode(m: DayMode) {
  try {
    localStorage.setItem(MODE_KEY, m);
  } catch {
    /* chỉ nhớ trong phiên */
  }
  listeners.forEach((fn) => fn());
}

/** Giờ hiện tại ở Việt Nam, dạng số thập phân 0–24. */
export function vnHour(now = new Date()): number {
  const ms = (now.getTime() + 7 * 3600_000) % 86400_000;
  return ms / 3600_000;
}

/** Giờ dùng để vẽ theo chế độ người chơi chọn. */
export function sceneHour(now = new Date()): number {
  const m = dayMode();
  return m === "day" ? 11 : m === "night" ? 22 : vnHour(now);
}

export interface SunState {
  /** Độ cao mặt trời (-1 nửa đêm … 1 giữa trưa). */
  elevation: number;
  /** 0 = đêm hẳn, 1 = ngày hẳn (có hoàng hôn ở giữa). */
  day: number;
  /** 0–1, mạnh nhất lúc bình minh/hoàng hôn. */
  golden: number;
  /** Góc phương vị (0 = đông lúc 6 giờ, π = tây lúc 18 giờ). */
  azimuth: number;
}

export function sunState(hour: number): SunState {
  const elevation = Math.sin(((hour - 6) / 12) * Math.PI);
  const day = THREE.MathUtils.smoothstep(elevation, -0.12, 0.18);
  const golden = Math.max(0, 1 - Math.abs(elevation) / 0.3) * (elevation > -0.2 ? 1 : 0);
  return { elevation, day, golden, azimuth: ((hour - 6) / 12) * Math.PI };
}

const C = (hex: string) => new THREE.Color(hex);
const PALETTE = {
  skyDay: C("#cfe8f3"),
  skyGolden: C("#f4b88a"),
  skyNight: C("#101a33"),
  indoorDay: C("#f4efe6"),
  indoorNight: C("#2a2a3a"),
  hemiSkyDay: C("#fff8ee"),
  hemiSkyNight: C("#43507a"),
  hemiGroundDay: C("#b9a68a"),
  hemiGroundNight: C("#26283a"),
  sunDay: C("#fff1d6"),
  sunGolden: C("#ffb070"),
  moon: C("#a9bfff"),
  indoorLamp: C("#f1d9b5"),
  windowDay: C("#bfe3f5"),
  windowNight: C("#1d2b55"),
};

export interface Lamp {
  /** Vị trí đặt đèn điểm (toạ độ thế giới). */
  position: THREE.Vector3;
  /** Vật liệu bóng đèn, phát sáng khi tối. */
  bulb?: THREE.MeshStandardMaterial;
  color?: string;
  range?: number;
}

export class Atmosphere {
  private hemi: THREE.HemisphereLight;
  private sun: THREE.DirectionalLight;
  private sky: Sky | null = null;
  private stars: THREE.Points | null = null;
  private lamps: { lamp: Lamp; light: THREE.PointLight | null }[] = [];
  private windows: THREE.Material[] = [];
  private stop: () => void;
  private unlisten: () => void;
  private lastHour = -1;
  private scratch = new THREE.Color();

  constructor(
    private engine: Engine,
    private root: THREE.Object3D,
    private opts: { outdoor: boolean; span: number; indoorLight?: number },
  ) {
    this.hemi = new THREE.HemisphereLight("#fff8ee", "#b9a68a", 0.95);
    this.sun = new THREE.DirectionalLight("#ffeccc", 1.0);
    this.sun.castShadow = engine.preset.shadows;
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -opts.span;
    cam.right = cam.top = opts.span;
    cam.far = 120;
    this.sun.shadow.bias = -0.0005;
    this.sun.shadow.normalBias = 0.02;
    root.add(this.hemi, this.sun, this.sun.target);

    if (opts.outdoor) {
      if (engine.preset.sky) {
        this.sky = new Sky();
        const u = this.sky.material.uniforms;
        u.turbidity.value = 4;
        u.rayleigh.value = 1.6;
        u.mieCoefficient.value = 0.004;
        u.mieDirectionalG.value = 0.8;
        root.add(this.sky);
      }
      this.stars = makeStars(engine.preset.sky ? 900 : 400);
      root.add(this.stars);
    }
    this.stop = engine.onFrame(() => {
      // Bầu trời và sao đi theo camera, luôn nằm trong tầm nhìn (far plane khác nhau theo mức đồ họa).
      const cam = engine.camera;
      const r = cam.far * 0.9;
      if (this.sky) {
        this.sky.position.copy(cam.position);
        this.sky.scale.setScalar(r);
      }
      if (this.stars) {
        this.stars.position.copy(cam.position);
        this.stars.scale.setScalar(r / 180);
      }
      this.update();
    });
    this.unlisten = (() => {
      const fn = () => {
        this.lastHour = -1;
        this.update();
      };
      listeners.add(fn);
      return () => listeners.delete(fn);
    })();
    this.update();
  }

  /** Đèn bật lúc trời tối. Chỉ vài đèn đầu (theo mức đồ họa) có ánh sáng thật; còn lại chỉ phát sáng. */
  addLamp(lamp: Lamp) {
    let light: THREE.PointLight | null = null;
    if (this.lamps.filter((l) => l.light).length < this.engine.preset.maxLampLights) {
      light = new THREE.PointLight(lamp.color ?? "#ffd28a", 0, lamp.range ?? 9, 1.6);
      light.position.copy(lamp.position);
      this.root.add(light);
    }
    this.lamps.push({ lamp, light });
    this.lastHour = -1;
  }

  /** Vật liệu kính cửa sổ: xanh trời ban ngày, xanh đêm khi tối. */
  addWindow(m: THREE.Material) {
    this.windows.push(m);
    this.lastHour = -1;
  }

  /** 0–1: trời tối tới mức nào (để khu khác dùng, ví dụ bật đèn trong phòng riêng). */
  night() {
    return 1 - sunState(sceneHour()).day;
  }

  update() {
    const hour = sceneHour();
    // Đổi rất chậm theo giờ thật: chỉ tính lại khi lệch quá ~20 giây.
    if (Math.abs(hour - this.lastHour) < 0.005) return;
    this.lastHour = hour;
    const s = sunState(hour);
    const night = 1 - s.day;
    const e = this.engine;

    // Mặt trời ban ngày, mặt trăng (ánh xanh nhạt) ban đêm.
    const sunUp = s.elevation > -0.05;
    const elev = sunUp ? Math.max(0.08, s.elevation) : Math.max(0.35, -s.elevation);
    const az = sunUp ? s.azimuth : s.azimuth - Math.PI;
    const r = this.opts.span * 1.4;
    this.sun.position.set(Math.cos(az) * r * 0.9, elev * r + 6, Math.sin(az) * r * 0.35 + r * 0.25);
    this.sun.target.position.set(0, 0, 0);
    if (sunUp) {
      this.sun.color.copy(PALETTE.sunDay).lerp(PALETTE.sunGolden, s.golden * 0.8);
      this.sun.intensity = 0.25 + 1.0 * THREE.MathUtils.smoothstep(s.elevation, -0.05, 0.35);
    } else {
      this.sun.color.copy(PALETTE.moon);
      this.sun.intensity = 0.28;
    }

    const indoor = this.opts.indoorLight ?? 0;
    // Trong nhà ban đêm vẫn có đèn trần (ánh vàng ấm): không tối và xanh như ngoài trời.
    this.hemi.color.copy(PALETTE.hemiSkyNight).lerp(PALETTE.indoorLamp, indoor * 0.65).lerp(PALETTE.hemiSkyDay, s.day);
    this.hemi.groundColor.copy(PALETTE.hemiGroundNight).lerp(PALETTE.hemiGroundDay, s.day * 0.9 + indoor * 0.1);
    this.hemi.intensity = THREE.MathUtils.lerp(0.32 + indoor * 0.5, 0.95, s.day);

    const bg = this.opts.outdoor
      ? this.scratch.copy(PALETTE.skyNight).lerp(PALETTE.skyDay, s.day).lerp(PALETTE.skyGolden, s.golden * 0.45 * s.day + s.golden * 0.25)
      : this.scratch.copy(PALETTE.indoorNight).lerp(PALETTE.indoorDay, s.day);
    if (!this.sky) e.scene.background = bg.clone();
    else e.scene.background = PALETTE.skyNight.clone().lerp(PALETTE.skyDay, s.day);
    const fog = e.scene.fog as THREE.Fog | null;
    fog?.color.copy(bg);

    if (this.sky) {
      const u = this.sky.material.uniforms;
      const phi = Math.PI / 2 - Math.asin(THREE.MathUtils.clamp(s.elevation, -1, 1)) * 0.9;
      (u.sunPosition.value as THREE.Vector3).setFromSphericalCoords(1, phi, s.azimuth + Math.PI / 2);
      this.sky.visible = s.day > 0.02;
      this.sky.material.uniforms.rayleigh.value = 1.2 + s.golden * 1.6;
    }
    if (this.stars) {
      (this.stars.material as THREE.PointsMaterial).opacity = THREE.MathUtils.smoothstep(night, 0.4, 0.95);
      this.stars.visible = night > 0.4;
    }

    const lampsOn = THREE.MathUtils.smoothstep(night, 0.35, 0.7);
    for (const { lamp, light } of this.lamps) {
      if (light) light.intensity = lampsOn * 6;
      if (lamp.bulb) {
        lamp.bulb.emissive.set(lamp.color ?? "#ffd28a");
        lamp.bulb.emissiveIntensity = 0.15 + lampsOn * 1.6;
      }
    }
    for (const m of this.windows) {
      const mm = m as THREE.MeshBasicMaterial;
      mm.color?.copy(PALETTE.windowNight).lerp(PALETTE.windowDay, s.day);
    }
    // Bloom chỉ khi tối và mức đồ họa cao.
    e.bloom = e.preset.bloom ? lampsOn * 0.45 : 0;
  }

  dispose() {
    this.stop();
    this.unlisten();
    this.engine.bloom = 0;
    for (const { light } of this.lamps) light?.dispose();
    this.sky?.geometry.dispose();
    this.sky?.material.dispose();
    if (this.stars) {
      this.stars.geometry.dispose();
      (this.stars.material as THREE.Material).dispose();
    }
    this.sun.dispose();
    this.hemi.dispose();
  }
}

function makeStars(n: number) {
  const pos = new Float32Array(n * 3);
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < n; i++) {
    // Nửa trên của một mặt cầu lớn.
    const theta = rnd() * Math.PI * 2;
    const y = 0.15 + rnd() * 0.85;
    const rr = Math.sqrt(1 - y * y);
    pos.set([Math.cos(theta) * rr * 180, y * 180, Math.sin(theta) * rr * 180], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const m = new THREE.PointsMaterial({ color: "#ffffff", size: 1.6, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false });
  return new THREE.Points(g, m);
}
