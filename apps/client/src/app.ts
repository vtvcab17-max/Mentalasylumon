import type { AvatarSpec } from "@bvo/shared";
import * as THREE from "three";
import { buildAvatar } from "./avatar/avatar";
import { Crowd } from "./engine/crowd";
import type { Engine } from "./engine/renderer";
import { openDoctorChat } from "./features/doctor-chat/doctor-chat";
import { showCreateAvatar } from "./features/onboarding/create-avatar";
import { showLanguagePicker } from "./features/onboarding/language-picker";
import { showAgeGate, showLogin, showTerms } from "./features/onboarding/onboarding";
import { hasChosenLocale, setLocale, t } from "./i18n";
import { api, ApiError } from "./net/api";
import { ZoneClient } from "./net/zone-client";
import { h, toast } from "./ui/dom";
import { openMap, placeName, type Layout } from "./ui/map";
import { openSettings } from "./ui/settings";
import { doorAction, nearestDoor } from "./world/doors";
import { buildArea, type Area, type Place } from "./world/hospital-builder";
import { PlayerController } from "./world/player-controller";
import { buildPrivateRoom } from "./world/private-room";

/**
 * Luồng chơi: chọn ngôn ngữ → đăng nhập → 18+ → điều khoản → nhân vật → phòng riêng (US1),
 * rồi đi lại tự do giữa phòng riêng, hành lang các tầng, sảnh chính và vườn cùng người chơi khác (US2).
 */

interface Me {
  id: string;
  nickname: string | null;
  avatar: AvatarSpec | null;
  locale: "vi" | "en";
  room: { id: string; wing: string; floor: number; roomNumber: number } | null;
  onboarding: { age: boolean; consent: boolean; profile: boolean };
}

export async function startApp(ui: HTMLElement, engine: Engine) {
  if (!hasChosenLocale()) await showLanguagePicker(ui);

  let me: Me;
  try {
    me = await api<Me>("/api/me");
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) return showLogin(ui);
    ui.replaceChildren(h("div", { class: "bvo-screen" }, h("div", { class: "bvo-card" }, h("p", {}, t("errors.network")))));
    return;
  }
  // Ngôn ngữ đã chọn ở màn đầu được ghi vào tài khoản khi đăng nhập; sau đó tài khoản là nguồn chính.
  setLocale(me.locale);

  if (!me.onboarding.age) await showAgeGate(ui);
  if (!me.onboarding.consent) await showTerms(ui);
  if (!me.onboarding.profile) {
    await showCreateAvatar(ui, engine);
    me = await api<Me>("/api/me");
  }
  await new Navigator(ui, engine, me).go({ kind: "room" });
}

interface Stage {
  place: Place;
  dispose(): void;
}

class Navigator {
  private stage: Stage | null = null;
  private layout: Layout | null = null;
  private busy = false;

  constructor(
    private ui: HTMLElement,
    private engine: Engine,
    private me: Me,
  ) {}

  async go(place: Place): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const from = this.stage?.place ?? null;
    try {
      this.stage?.dispose();
      this.stage = null;
      this.ui.replaceChildren();
      this.layout = await api<Layout>("/api/world/layout");
      this.stage = place.kind === "room" ? this.enterRoom() : await this.enterArea(place, from);
    } catch {
      toast(t("errors.network"));
      if (place.kind !== "room") {
        this.busy = false;
        return this.go({ kind: "room" });
      }
    } finally {
      this.busy = false;
    }
  }

  private topBar(title: HTMLElement, place: Place) {
    const mapBtn = h("button", { class: "bvo-btn secondary", type: "button" }, `🗺 ${t("world.map")}`);
    const settingsBtn = h("button", { class: "bvo-btn secondary", type: "button" }, `⚙ ${t("room.settings")}`);
    mapBtn.addEventListener("click", () => this.layout && openMap(this.ui, { layout: this.layout, current: place, go: (p) => this.go(p) }));
    settingsBtn.addEventListener("click", () => openSettings(this.ui, this.engine, { onLocale: () => this.go(place) }));
    return h("div", { class: "bvo-hud" }, title, h("div", { class: "bvo-row", style: "flex-wrap:nowrap" }, mapBtn, settingsBtn));
  }

  // ── Phòng riêng (US1) ───────────────────────────────────────────────
  private enterRoom(): Stage {
    const me = this.me;
    this.engine.scene.background = new THREE.Color("#f4efe6");
    const room = buildPrivateRoom(this.engine, me.avatar!);
    const r = me.room!;
    const title = h("div", { class: "bvo-pill" }, `${me.nickname} · ${t("room.label", { wing: r.wing, floor: String(r.floor), room: String(r.roomNumber).padStart(2, "0") })}`);
    const call = h("button", { class: "bvo-btn", type: "button" }, `🩺 ${t("room.callDoctor")}`);
    const out = h("button", { class: "bvo-btn secondary", type: "button" }, `🚪 ${t("world.leaveRoom")}`);
    const dock = h("div", { class: "bvo-dock bvo-row", style: "flex-wrap:nowrap" }, call, out);
    this.ui.append(this.topBar(title, { kind: "room" }), dock);

    call.addEventListener("click", () => {
      dock.remove();
      openDoctorChat(this.ui, { onDoctor: (spec) => room.showDoctor(spec), onClose: () => this.ui.append(dock) });
    });
    out.addEventListener("click", () => this.go({ kind: "floor", wing: r.wing, floor: r.floor }));
    return { place: { kind: "room" }, dispose: () => room.dispose() };
  }

  // ── Khu chung, nhiều người (US2) ───────────────────────────────────
  private async enterArea(place: Exclude<Place, { kind: "room" }>, from: Place | null): Promise<Stage> {
    const join = await api<{ zoneId: string }>("/api/world/join", {
      body: place.kind === "floor" ? { area: "floor", wing: place.wing, floor: place.floor } : { area: place.kind },
    });
    const layout = this.layout!;
    const area = buildArea(this.engine, place, layout);
    const controller = new PlayerController(this.engine, buildAvatar(this.me.avatar!), area, entrySpawn(area, from), this.ui);
    const crowd = new Crowd(this.engine);

    const title = h("div", { class: "bvo-pill" });
    const status = h("div", { class: "bvo-pill", style: "display:none" }, t("world.reconnecting"));
    const renderTitle = () => (title.textContent = `${placeName(place)} · ${t("world.online", { n: String(crowd.size + 1) })}`);
    renderTitle();
    const action = h("button", { class: "bvo-btn", type: "button", style: "display:none" });
    const wave = h("button", { class: "bvo-btn secondary", type: "button", "aria-label": t("world.wave") }, "👋");
    const dock = h("div", { class: "bvo-dock bvo-row", style: "flex-wrap:nowrap" }, action, wave);
    const top = this.topBar(h("div", { class: "bvo-row", style: "flex-wrap:nowrap" }, title, status), place);
    this.ui.append(top, dock);
    if (!window.matchMedia("(pointer: coarse)").matches) {
      const hint = h("div", { class: "bvo-pill bvo-muted", style: "position:absolute;left:16px;bottom:24px" }, t("world.moveHint"));
      this.ui.append(hint);
      setTimeout(() => hint.remove(), 7000);
    }

    const zone = new ZoneClient(join.zoneId, () => [controller.position.x, controller.position.z], {
      onMessage: (m) => {
        if (m.t === "welcome") {
          crowd.clear();
          for (const p of m.players) crowd.upsert(p as Parameters<Crowd["upsert"]>[0]);
        } else if (m.t === "join") crowd.upsert(m.player as Parameters<Crowd["upsert"]>[0]);
        else if (m.t === "leave") crowd.remove(m.id);
        else if (m.t === "snapshot") crowd.applySnapshot(m.players, m.gone);
        else if (m.t === "emote") crowd.emote(m.id);
        renderTitle();
      },
      onStatus: (s) => (status.style.display = s === "reconnecting" ? "" : "none"),
      onRedirect: () => toast(t("world.redirected")),
      onKicked: () => {
        this.stage?.dispose();
        this.ui.replaceChildren(h("div", { class: "bvo-screen" }, h("div", { class: "bvo-card" }, h("p", {}, t("world.kicked")))));
      },
    });
    zone.connect();

    // Nút ngữ cảnh: cửa phòng, lối ra vườn/sảnh, thang máy.
    let onAction: (() => void) | null = null;
    const setAction = (label: string | null, fn: (() => void) | null, locked = false) => {
      onAction = fn;
      action.style.display = label ? "" : "none";
      if (label && action.textContent !== label) action.textContent = label;
      action.classList.toggle("secondary", locked);
    };
    action.addEventListener("click", () => onAction?.());
    wave.addEventListener("click", () => {
      controller.wave();
      zone.emote("wave");
    });
    const onKey = (e: KeyboardEvent) => {
      if ((e.code === "KeyE" || e.code === "Enter") && onAction && !(e.target as HTMLElement)?.closest?.("input,textarea,button")) onAction();
    };
    window.addEventListener("keydown", onKey);

    let checkTimer = 0;
    const stop = this.engine.onFrame((dt) => {
      crowd.update(dt, controller.position);
      zone.move([controller.position.x, 0, controller.position.z], controller.rotation, controller.anim);
      checkTimer += dt;
      if (checkTimer < 0.2) return;
      checkTimer = 0;
      const { x, z } = controller.position;
      const door = nearestDoor(area.doors, x, z);
      if (door) {
        const act = doorAction(door);
        if (act.kind === "enter") setAction(`🚪 ${t("world.enterRoom")}`, () => this.go({ kind: "room" }));
        else {
          const label = `🔒 ${String(act.roomNumber).padStart(2, "0")}`;
          setAction(label, () => toast(t("world.lockedDoor", { room: String(act.roomNumber).padStart(2, "0") })), true);
        }
        return;
      }
      const portal = area.portals.find((p) => (p.x - x) ** 2 + (p.z - z) ** 2 <= p.radius ** 2);
      if (!portal) return setAction(null, null);
      if (portal.target === "garden") setAction(`🌳 ${t("world.goGarden")}`, () => this.go({ kind: "garden" }));
      else if (portal.target === "lobby") setAction(`🏥 ${t("world.goLobby")}`, () => this.go({ kind: "lobby" }));
      else if (portal.target === "elevator")
        setAction(`🛗 ${t("world.useElevator")}`, () => openMap(this.ui, { layout, current: place, go: (p) => this.go(p) }));
      else setAction(`⭕ ${t("world.circle")} · ${t("world.comingSoon")}`, () => toast(t("world.comingSoon")), true);
    });

    return {
      place,
      dispose: () => {
        stop();
        window.removeEventListener("keydown", onKey);
        zone.close();
        crowd.dispose();
        controller.dispose();
        area.dispose();
      },
    };
  }
}

/** Chỗ xuất hiện khi vào khu: đi từ vườn vào sảnh thì đứng ở cổng vườn, từ thang máy thì ở cổng thang máy… */
function entrySpawn(area: Area, from: Place | null): [number, number] {
  const p = area.place;
  // Lệch ngẫu nhiên một chút để nhiều người vào cùng cổng không đứng đè lên nhau.
  const j = () => (Math.random() - 0.5) * 1.2;
  if (p.kind === "lobby" && from?.kind === "garden") return [-9.6, j()];
  if (p.kind === "lobby" && (from?.kind === "floor" || from?.kind === "room")) return [9.6, j()];
  if (p.kind === "floor" && from?.kind !== "room") return [1.6, j() * 0.8];
  if (p.kind === "floor") return area.spawn;
  return [area.spawn[0] + j(), area.spawn[1] + j()];
}
