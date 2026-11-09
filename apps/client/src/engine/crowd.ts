import type { AvatarSpec } from "@bvo/shared";
import * as THREE from "three";
import { buildAvatar, type Anim, type Avatar } from "../avatar/avatar";
import { disposeLabel, makeLabel } from "./label";
import { rankLabel } from "../features/progress/rank";
import type { Engine } from "./renderer";

/**
 * Người chơi khác trong cùng zone (T071, SC-009).
 * - Nội suy vị trí giữa các snapshot (server gửi tối đa 10 lần/giây).
 * - LOD: chỉ N người gần nhất (theo mức đồ họa: thấp 30) được vẽ nhân vật đầy đủ + biệt danh; người xa hơn vẽ
 *   bằng một InstancedMesh hình viên nang (1 lần vẽ cho tất cả).
 * - Snapshot là phần thay đổi: người có trong `players` hiện ra/cập nhật; người trong `gone` bị ẩn.
 *   Người biết từ welcome/join chỉ hiện khi server báo họ trong tầm nhìn.
 */

export interface RemoteInfo {
  id: string;
  nickname: string;
  avatar: unknown;
  p: [number, number, number];
  r: number;
  a: Anim;
  rank?: number;
}

interface Remote {
  id: string;
  nickname: string;
  rank: number;
  spec: AvatarSpec | null;
  pos: THREE.Vector3;
  target: THREE.Vector3;
  rot: number;
  targetRot: number;
  anim: Anim;
  emoteUntil: number;
  visible: boolean;
  full: Avatar | null;
  label: THREE.Sprite | null;
}

const MAX_INSTANCES = 256;
const LOD_EVERY = 0.4; // giây

export class Crowd {
  private remotes = new Map<string, Remote>();
  private proxies: THREE.InstancedMesh;
  private lodTimer = 0;
  private dummy = new THREE.Object3D();
  private color = new THREE.Color();

  constructor(private engine: Engine) {
    const geo = new THREE.CapsuleGeometry(0.3, 0.8, 3, 8);
    geo.translate(0, 0.7, 0);
    this.proxies = new THREE.InstancedMesh(geo, new THREE.MeshStandardMaterial({ roughness: 0.9 }), MAX_INSTANCES);
    this.proxies.count = 0;
    this.proxies.frustumCulled = false;
    engine.scene.add(this.proxies);
  }

  get size() {
    return this.remotes.size;
  }

  upsert(info: RemoteInfo) {
    const existing = this.remotes.get(info.id);
    if (existing) {
      existing.nickname = info.nickname;
      if (info.rank && info.rank !== existing.rank) this.setRank(info.id, info.rank);
      return;
    }
    this.remotes.set(info.id, {
      id: info.id,
      nickname: info.nickname,
      rank: info.rank ?? 1,
      spec: (info.avatar as AvatarSpec) ?? null,
      pos: new THREE.Vector3(...info.p),
      target: new THREE.Vector3(...info.p),
      rot: info.r,
      targetRot: info.r,
      anim: info.a,
      emoteUntil: 0,
      visible: false,
      full: null,
      label: null,
    });
    this.lodTimer = LOD_EVERY; // xếp lại LOD ngay khung kế tiếp
  }

  remove(id: string) {
    const r = this.remotes.get(id);
    if (!r) return;
    this.demote(r);
    this.remotes.delete(id);
    this.lodTimer = LOD_EVERY;
  }

  applySnapshot(players: { id: string; p: [number, number, number]; r: number; a: Anim }[], gone: string[] = []) {
    for (const p of players) {
      const r = this.remotes.get(p.id);
      if (!r) continue;
      if (!r.visible) r.pos.set(...p.p); // vừa vào tầm nhìn: đặt thẳng, không trượt từ xa tới
      r.target.set(...p.p);
      r.targetRot = p.r;
      r.anim = p.a;
      r.visible = true;
    }
    for (const id of gone) {
      const r = this.remotes.get(id);
      if (r) r.visible = false;
    }
    this.lodTimer = LOD_EVERY;
  }

  /** Lễ thăng cấp: đổi chức danh trên tên ngay. */
  setRank(id: string, rank: number) {
    const r = this.remotes.get(id);
    if (!r) return;
    r.rank = rank;
    if (r.full && r.label) {
      disposeLabel(r.label);
      r.label = this.makeNameLabel(r);
      r.full.group.add(r.label);
    }
  }

  private makeNameLabel(r: Remote) {
    const l = makeLabel(rankLabel(r.nickname, r.rank), r.rank === 7 ? { height: 0.3, bg: "rgba(201,162,39,0.95)", color: "#ffffff" } : { height: 0.28 });
    l.position.y = 2.0;
    return l;
  }

  emote(id: string) {
    const r = this.remotes.get(id);
    if (r) r.emoteUntil = performance.now() + 2000;
  }

  private promote(r: Remote) {
    if (r.full || !r.spec) return;
    r.full = buildAvatar(r.spec);
    r.label = this.makeNameLabel(r);
    r.full.group.add(r.label);
    this.engine.scene.add(r.full.group);
  }

  private demote(r: Remote) {
    if (r.label) disposeLabel(r.label);
    r.full?.dispose();
    r.full = null;
    r.label = null;
  }

  update(dt: number, viewer: THREE.Vector3) {
    const k = 1 - Math.exp(-dt * 12);
    for (const r of this.remotes.values()) {
      r.pos.lerp(r.target, k);
      let diff = r.targetRot - r.rot;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      r.rot += diff * k;
    }

    this.lodTimer += dt;
    if (this.lodTimer >= LOD_EVERY) {
      this.lodTimer = 0;
      const max = this.engine.preset.maxFullAvatars;
      const visible = [...this.remotes.values()].filter((r) => r.visible);
      visible.sort((a, b) => a.pos.distanceToSquared(viewer) - b.pos.distanceToSquared(viewer));
      const fullIds = new Set(visible.slice(0, max).map((r) => r.id));
      for (const r of this.remotes.values()) {
        if (fullIds.has(r.id)) this.promote(r);
        else this.demote(r);
      }
    }

    let n = 0;
    const now = performance.now();
    for (const r of this.remotes.values()) {
      if (r.full) {
        r.full.group.visible = r.visible;
        r.full.group.position.copy(r.pos);
        r.full.group.rotation.y = r.rot;
        r.full.setAnim(now < r.emoteUntil ? "wave" : r.anim);
        r.full.update(dt);
      } else if (r.visible && n < MAX_INSTANCES) {
        this.dummy.position.copy(r.pos);
        this.dummy.rotation.y = r.rot;
        this.dummy.updateMatrix();
        this.proxies.setMatrixAt(n, this.dummy.matrix);
        this.proxies.setColorAt(n, this.color.set(r.spec?.colors.outfit ?? "#8fc1b5"));
        n++;
      }
    }
    this.proxies.count = n;
    this.proxies.instanceMatrix.needsUpdate = true;
    if (this.proxies.instanceColor) this.proxies.instanceColor.needsUpdate = true;
  }

  clear() {
    for (const r of this.remotes.values()) this.demote(r);
    this.remotes.clear();
    this.proxies.count = 0;
  }

  dispose() {
    this.clear();
    this.proxies.geometry.dispose();
    (this.proxies.material as THREE.Material).dispose();
    this.engine.scene.remove(this.proxies);
  }
}
