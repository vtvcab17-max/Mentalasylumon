import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";

/**
 * Renderer Three.js với 3 mức đồ họa (T038, FR-006a, research.md §R5, Constitution VI).
 * Mức thấp nhắm tới điện thoại tầm trung: pixel ratio 1, không đổ bóng, tầm nhìn ngắn, ≤ 30 nhân vật đầy đủ.
 */

export type Quality = "low" | "medium" | "high";

export interface QualityPreset {
  pixelRatio: number;
  shadows: boolean;
  shadowMapSize: number;
  farPlane: number;
  maxFullAvatars: number;
  antialias: boolean;
  /** Bầu trời vật lý (Sky shader) ngoài trời; mức thấp dùng màu nền chuyển dần. */
  sky: boolean;
  /** Số đèn điểm thật bật ban đêm (đèn đường, đèn cây); còn lại chỉ phát sáng bằng vật liệu. */
  maxLampLights: number;
  /** Hậu kỳ phát sáng (bloom) cho đèn ban đêm. */
  bloom: boolean;
}

export const PRESETS: Record<Quality, QualityPreset> = {
  low: { pixelRatio: 1, shadows: false, shadowMapSize: 0, farPlane: 40, maxFullAvatars: 30, antialias: false, sky: false, maxLampLights: 0, bloom: false },
  medium: { pixelRatio: 1.5, shadows: true, shadowMapSize: 1024, farPlane: 80, maxFullAvatars: 60, antialias: true, sky: true, maxLampLights: 4, bloom: false },
  high: { pixelRatio: 2, shadows: true, shadowMapSize: 2048, farPlane: 150, maxFullAvatars: 120, antialias: true, sky: true, maxLampLights: 8, bloom: true },
};

const STORAGE_KEY = "bvo.quality";

export function storedQuality(): Quality {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "low" || v === "medium" || v === "high") return v;
  } catch {
    /* ignore */
  }
  // Mặc định: máy ít nhân hoặc màn hình nhỏ → thấp.
  const cores = navigator.hardwareConcurrency ?? 4;
  return cores <= 4 || window.innerWidth < 768 ? "low" : "medium";
}

export class Engine {
  readonly scene = new THREE.Scene();
  readonly camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
  renderer: THREE.WebGLRenderer;
  quality: Quality;
  private loader = new GLTFLoader();
  private cache = new Map<string, Promise<GLTF>>();
  private frameCallbacks = new Set<(dt: number) => void>();
  private clock = new THREE.Clock();
  private composer: EffectComposer | null = null;
  private bloomPass: UnrealBloomPass | null = null;
  /** Độ phát sáng hiện tại (0 = tắt hậu kỳ, render thẳng). Bầu trời đêm đặt giá trị này. */
  bloom = 0;

  constructor(readonly canvas: HTMLCanvasElement, quality: Quality = storedQuality()) {
    this.quality = quality;
    this.renderer = this.createRenderer();
    this.scene.background = new THREE.Color("#f4efe6");
    this.applyQuality();
    window.addEventListener("resize", () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** Antialias chỉ đặt được khi tạo WebGL context, nên đổi giữa thấp ↔ vừa/cao thì tạo lại renderer. */
  private createRenderer() {
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: PRESETS[this.quality].antialias, powerPreference: "high-performance" });
    // Tone mapping "Neutral" giữ màu pastel của game nhưng cho vùng sáng (nắng, đèn) mềm hơn.
    r.toneMapping = THREE.NeutralToneMapping;
    r.toneMappingExposure = 1.05;
    r.outputColorSpace = THREE.SRGBColorSpace;
    return r;
  }

  get preset(): QualityPreset {
    return PRESETS[this.quality];
  }

  setQuality(q: Quality) {
    const needNewContext = PRESETS[q].antialias !== PRESETS[this.quality].antialias;
    this.quality = q;
    try {
      localStorage.setItem(STORAGE_KEY, q);
    } catch {
      /* ignore */
    }
    if (needNewContext) {
      this.renderer.setAnimationLoop(null);
      this.renderer.dispose();
      this.renderer = this.createRenderer();
      this.renderer.setAnimationLoop(() => this.frame());
    }
    this.applyQuality();
    this.resize();
  }

  private applyQuality() {
    const p = this.preset;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.pixelRatio));
    this.renderer.shadowMap.enabled = p.shadows;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera.far = p.farPlane;
    this.scene.fog = new THREE.Fog("#f4efe6", p.farPlane * 0.6, p.farPlane);
    this.scene.traverse((o) => {
      if ((o as THREE.DirectionalLight).isDirectionalLight) {
        const l = o as THREE.DirectionalLight;
        l.castShadow = p.shadows;
        if (p.shadows) l.shadow.mapSize.set(p.shadowMapSize, p.shadowMapSize);
      }
    });
    this.camera.updateProjectionMatrix();
    this.composer?.dispose();
    this.composer = null;
    this.bloomPass = null;
    if (p.bloom) {
      this.composer = new EffectComposer(this.renderer);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      // Ngưỡng 1.0: chỉ bóng đèn (phát sáng mạnh) mới lóa, chữ/nhãn trắng thì không.
      this.bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.45, 0.35, 1.0);
      this.composer.addPass(this.bloomPass);
      this.composer.addPass(new OutputPass());
    }
  }

  private resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.composer?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  onFrame(fn: (dt: number) => void) {
    this.frameCallbacks.add(fn);
    return () => this.frameCallbacks.delete(fn);
  }

  private frame() {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    for (const fn of this.frameCallbacks) fn(dt);
    if (this.composer && this.bloomPass && this.bloom > 0.02) {
      this.bloomPass.strength = this.bloom;
      this.composer.render(dt);
    } else this.renderer.render(this.scene, this.camera);
  }

  /** Nạp GLB có cache; mỗi lần trả về bản clone để dùng nhiều chỗ. */
  async loadGLB(url: string): Promise<THREE.Group> {
    let p = this.cache.get(url);
    if (!p) {
      p = this.loader.loadAsync(url);
      this.cache.set(url, p);
    }
    return (await p).scene.clone(true);
  }
}
