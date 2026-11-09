import * as THREE from "three";
import type { Anim, Avatar } from "../avatar/avatar";
import type { Engine } from "../engine/renderer";
import { constrain, type Area, type CameraView } from "./hospital-builder";

/**
 * Điều khiển nhân vật góc nhìn thứ ba (T070): W A S D / phím mũi tên trên máy tính, joystick cảm ứng
 * trên điện thoại. Camera đặt cố định phía sau-trên nhân vật và bám theo mượt.
 */

const SPEED = 3.2; // m/s
// Góc nhìn cao (~55°) để tường và cổng phía gần camera (cao ≤ 3 m) không che nhân vật.
const DEFAULT_VIEW: CameraView = { offset: [0, 9, 6.5], lookY: 1, lookAhead: 0 };
const KEYS: Record<string, [number, number]> = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};

const JOY_STYLE = `
.bvo-joy{position:absolute;left:calc(20px + env(safe-area-inset-left));bottom:calc(24px + env(safe-area-inset-bottom));width:120px;height:120px;border-radius:50%;
  background:rgba(255,253,248,.55);box-shadow:inset 0 0 0 2px rgba(0,0,0,.08);touch-action:none;pointer-events:auto}
.bvo-joy > div{position:absolute;left:50%;top:50%;width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:50%;background:rgba(46,125,107,.85)}`;

export class PlayerController {
  readonly position = new THREE.Vector3();
  rotation = 0;
  private keys = new Set<string>();
  private joy = new THREE.Vector2();
  private joyEl: HTMLDivElement | null = null;
  private waveUntil = 0;
  private stopFrame: () => void;
  private camTarget = new THREE.Vector3();
  private camOffset = new THREE.Vector3();
  private savedFar: [number, number, number] = [0, 0, 0];

  private placeCamera() {
    const v = this.area.view ?? DEFAULT_VIEW;
    this.engine.camera.position.copy(this.camTarget).add(this.camOffset);
    this.engine.camera.lookAt(this.camTarget.x, v.lookY, this.camTarget.z + v.lookAhead);
  }

  private setFar(far: number, fogNear: number, fogFar: number) {
    this.engine.camera.far = far;
    this.engine.camera.updateProjectionMatrix();
    const fog = this.engine.scene.fog as THREE.Fog | null;
    if (fog) {
      fog.near = fogNear;
      fog.far = fogFar;
    }
  }

  constructor(
    private engine: Engine,
    readonly avatar: Avatar,
    private area: Pick<Area, "walk" | "blocks" | "view">,
    spawn: [number, number],
    private ui: HTMLElement,
  ) {
    this.position.set(spawn[0], 0, spawn[1]);
    engine.scene.add(avatar.group);
    this.sync();
    this.camTarget.copy(this.position);
    const v = area.view ?? DEFAULT_VIEW;
    this.camOffset.set(...v.offset);
    // Khu ngoài trời rộng (sân trước) cần nhìn xa hơn mức đồ họa thấp để thấy mặt tiền; trả lại khi rời khu.
    this.savedFar = [engine.camera.far, (engine.scene.fog as THREE.Fog | null)?.near ?? 0, (engine.scene.fog as THREE.Fog | null)?.far ?? 0];
    if (v.far && v.far > engine.camera.far) this.setFar(v.far, v.far * 0.75, v.far);
    this.placeCamera();

    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    if (window.matchMedia("(pointer: coarse)").matches) this.mountJoystick();
    this.stopFrame = engine.onFrame((dt) => this.update(dt));
  }

  get anim(): Anim {
    return this.avatar.anim;
  }

  /** Vẫy tay 2 giây. */
  wave() {
    this.waveUntil = performance.now() + 2000;
  }

  private onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement | null)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA") return;
    if (KEYS[e.code]) {
      this.keys.add(e.code);
      e.preventDefault();
    }
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
  private onBlur = () => this.keys.clear();

  private mountJoystick() {
    const style = document.createElement("style");
    style.textContent = JOY_STYLE;
    const pad = document.createElement("div");
    pad.className = "bvo-joy";
    pad.setAttribute("aria-hidden", "true");
    const knob = document.createElement("div");
    pad.append(knob, style);
    const radius = 46;
    let pointer: number | null = null;
    const move = (e: PointerEvent) => {
      const r = pad.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const len = Math.min(Math.hypot(dx, dy), radius);
      const ang = Math.atan2(dy, dx);
      const kx = Math.cos(ang) * len;
      const ky = Math.sin(ang) * len;
      knob.style.transform = `translate(${kx}px, ${ky}px)`;
      this.joy.set(kx / radius, ky / radius);
    };
    const end = () => {
      pointer = null;
      knob.style.transform = "";
      this.joy.set(0, 0);
    };
    pad.addEventListener("pointerdown", (e) => {
      pointer = e.pointerId;
      pad.setPointerCapture(e.pointerId);
      move(e);
    });
    pad.addEventListener("pointermove", (e) => e.pointerId === pointer && move(e));
    pad.addEventListener("pointerup", end);
    pad.addEventListener("pointercancel", end);
    this.ui.append(pad);
    this.joyEl = pad;
  }

  private sync() {
    this.avatar.group.position.copy(this.position);
    this.avatar.group.rotation.y = this.rotation;
  }

  private update(dt: number) {
    let dx = this.joy.x;
    let dz = this.joy.y;
    for (const k of this.keys) {
      dx += KEYS[k][0];
      dz += KEYS[k][1];
    }
    const len = Math.hypot(dx, dz);
    let anim: Anim = performance.now() < this.waveUntil ? "wave" : "idle";
    if (len > 0.15) {
      const nx = dx / Math.max(len, 1);
      const nz = dz / Math.max(len, 1);
      const [x, z] = constrain(this.area, this.position.x + nx * SPEED * dt, this.position.z + nz * SPEED * dt);
      this.position.set(x, 0, z);
      const target = Math.atan2(nx, nz);
      let diff = target - this.rotation;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.rotation += diff * Math.min(1, dt * 12);
      anim = "walk";
      this.waveUntil = 0;
    }
    this.avatar.setAnim(anim);
    this.avatar.update(dt);
    this.sync();

    // Camera bám theo mượt.
    this.camTarget.lerp(this.position, 1 - Math.exp(-dt * 6));
    this.placeCamera();
  }

  dispose() {
    this.stopFrame();
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    this.joyEl?.remove();
    if (this.engine.camera.far !== this.savedFar[0]) this.setFar(...this.savedFar);
    this.avatar.dispose();
  }
}
