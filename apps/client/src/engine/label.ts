import * as THREE from "three";

/** Nhãn chữ nổi trong cảnh 3D (biệt danh, biển hiệu). Chữ vẽ lúc chạy theo ngôn ngữ đang chọn — không nướng sẵn. */
export function makeLabel(text: string, opts: { size?: number; bg?: string; color?: string; height?: number } = {}): THREE.Sprite {
  const size = opts.size ?? 28;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = `600 ${size}px system-ui, -apple-system, "Segoe UI", Roboto, sans-serif`;
  ctx.font = font;
  const w = Math.ceil(ctx.measureText(text).width) + size;
  const h = Math.ceil(size * 1.6);
  canvas.width = w;
  canvas.height = h;
  ctx.font = font;
  ctx.fillStyle = opts.bg ?? "rgba(255,253,248,0.88)";
  const r = h / 2;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, r);
  ctx.fill();
  ctx.fillStyle = opts.color ?? "#2b2b2b";
  ctx.textBaseline = "middle";
  ctx.textAlign = "center";
  ctx.fillText(text, w / 2, h / 2 + 1);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  const worldH = opts.height ?? 0.32;
  sprite.scale.set((worldH * w) / h, worldH, 1);
  return sprite;
}

export function disposeLabel(sprite: THREE.Sprite) {
  sprite.material.map?.dispose();
  sprite.material.dispose();
  sprite.removeFromParent();
}
