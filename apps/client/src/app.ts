import type { AvatarSpec } from "@bvo/shared";
import * as THREE from "three";
import { buildAvatar } from "./avatar/avatar";
import { Crowd } from "./engine/crowd";
import type { Engine } from "./engine/renderer";
import { enterCircle, openCircleList } from "./features/circle/circle";
import { burst, showCeremony } from "./features/progress/ceremony";
import { openQuestBook } from "./features/progress/quest-book";
import { questNudgesQuiet } from "./features/progress/rank";
import { showGuide } from "./world/hotspots";
import { openCouncil, type WorldState } from "./features/elections/council";
import { applyDecor } from "./world/decor";
import { preloadProps } from "./world/props";
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
import { buildArea, type Area, type Place, type WalkPlace } from "./world/hospital-builder";
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
  /** Zone đang ở (để lễ thăng cấp bắn pháo giấy đúng sảnh). */
  private zoneId: string | null = null;
  /** Điểm cần dẫn đường tới sau khi đổi khu. */
  private pendingGuide: { zone: string; spot: string } | null = null;
  private showGuideHere: ((spot: { zone: string; spot: string }) => void) | null = null;

  constructor(
    private ui: HTMLElement,
    private engine: Engine,
    private me: Me,
  ) {
    // Tải sẵn gói đồ vật 3D (~440 KB) trong lúc người chơi ở phòng riêng.
    preloadProps(engine);
  }

  async go(place: Place): Promise<void> {
    if (this.busy) return;
    this.busy = true;
    const from = this.stage?.place ?? null;
    try {
      this.stage?.dispose();
      this.stage = null;
      this.zoneId = null;
      this.showGuideHere = null;
      this.ui.replaceChildren();
      this.layout = await api<Layout>("/api/world/layout");
      if (place.kind === "circle") {
        const circle = await enterCircle(this.ui, this.engine, this.me, place.id, {
          leave: () => void this.go({ kind: "lobby" }),
          pick: (id) => void this.go({ kind: "circle", id }),
          topBar: (title) => this.topBar(title, place),
        });
        // Vòng đầy: ở lại sảnh, danh sách vòng khác đang mở.
        this.stage = circle ? { place, dispose: () => circle.dispose() } : await this.enterArea({ kind: "lobby" }, from);
      } else this.stage = place.kind === "room" ? this.enterRoom() : await this.enterArea(place, from);
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

  private mapOpts(place: Place) {
    return {
      layout: this.layout!,
      current: place,
      go: (p: Place) => void this.go(p),
      openCircles: () => void this.openCircles(),
      openCouncil: () => openCouncil(this.ui, this.me),
    };
  }

  openCircles() {
    return openCircleList(this.ui, { pick: (id) => void this.go({ kind: "circle", id }) });
  }

  /** Sổ nhiệm vụ (002). */
  openBook(place: Place) {
    openQuestBook(this.ui, {
      inLobby: place.kind === "lobby",
      guide: (spot) => {
        if (place.kind === spot.zone && this.showGuideHere) return this.showGuideHere(spot);
        this.pendingGuide = spot;
        void this.go({ kind: spot.zone as "lobby" | "garden" | "court" });
      },
      openCircles: () => void this.openCircles(),
      goLobby: () => void this.go({ kind: "lobby" }),
      promote: async () => {
        try {
          const r = await api<{ level: number }>("/api/ranks/promote", { body: { zoneId: this.zoneId ?? undefined } });
          showCeremony(this.ui, r.level);
        } catch {
          toast(t("errors.NOT_ELIGIBLE"));
        }
      },
    });
  }

  private topBar(title: HTMLElement, place: Place) {
    const bookBtn = h("button", { class: "bvo-btn secondary", type: "button", "aria-label": t("progress.book") }, "📒");
    bookBtn.addEventListener("click", () => this.openBook(place));
    const mapBtn = h("button", { class: "bvo-btn secondary", type: "button" }, `🗺 ${t("world.map")}`);
    const settingsBtn = h("button", { class: "bvo-btn secondary", type: "button" }, `⚙ ${t("room.settings")}`);
    mapBtn.addEventListener("click", () => this.layout && openMap(this.ui, this.mapOpts(place)));
    settingsBtn.addEventListener("click", () => openSettings(this.ui, this.engine, { onLocale: () => this.go(place) }));
    return h("div", { class: "bvo-hud" }, title, h("div", { class: "bvo-row", style: "flex-wrap:nowrap" }, bookBtn, mapBtn, settingsBtn));
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
  private async enterArea(place: WalkPlace, from: Place | null): Promise<Stage> {
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
        else if (m.t === "quest_progress") {
          if (m.status === "done" && !questNudgesQuiet()) toast(m.awarded ? t("progress.questDone", { n: String(m.awarded) }) : t("progress.questDoneNoPoints"));
        } else if (m.t === "celebrate") {
          crowd.setRank(m.id, m.rank);
          if (m.id !== this.me.id) burst(this.ui);
        }
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
    this.zoneId = join.zoneId;

    // Trang trí + thông báo của Viện trưởng (002 US5).
    let stopDecor: (() => void) | null = null;
    let alive = true;
    api<WorldState>("/api/world/state")
      .then((w) => {
        if (!alive) return;
        stopDecor = applyDecor(area.root, place.kind, w.decor?.data ?? null);
        if (w.announcement && place.kind !== "floor") showAnnouncement(this.ui, w.announcement);
      })
      .catch(() => undefined);

    // Dẫn đường tới điểm khám phá (002 FR-002).
    let stopGuide: (() => void) | null = null;
    this.showGuideHere = (spot) => {
      stopGuide?.();
      stopGuide = showGuide(this.engine, spot.zone, spot.spot, () => controller.position);
    };
    if (this.pendingGuide && this.pendingGuide.zone === place.kind) this.showGuideHere(this.pendingGuide);
    this.pendingGuide = null;

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
      else if (portal.target === "court") setAction(`🏛 ${t("world.goCourt")}`, () => this.go({ kind: "court" }));
      else if (portal.target === "lobby") setAction(`🏥 ${t("world.goLobby")}`, () => this.go({ kind: "lobby" }));
      else if (portal.target === "stairs")
        setAction(`🪜 ${t("world.useElevator")}`, () => openMap(this.ui, this.mapOpts(place)));
      else if (portal.target === "council") setAction(`🏛 ${t("council.open")}`, () => openCouncil(this.ui, this.me));
      else setAction(`⭕ ${t("world.goCircle")}`, () => void this.openCircles());
    });

    return {
      place,
      dispose: () => {
        alive = false;
        stop();
        stopGuide?.();
        stopDecor?.();
        window.removeEventListener("keydown", onKey);
        zone.close();
        crowd.dispose();
        controller.dispose();
        area.dispose();
      },
    };
  }
}

/**
 * Chỗ xuất hiện khi vào khu (bố cục 1815, research.md §R18): từ sân trước vào sảnh thì đứng sau cửa chính,
 * từ vườn sau thì ở cổng phía đông, từ tầng trên xuống thì ở chân cầu thang chính…
 */
function entrySpawn(area: Area, from: Place | null): [number, number] {
  const p = area.place;
  // Lệch ngẫu nhiên một chút để nhiều người vào cùng cổng không đứng đè lên nhau.
  const j = () => (Math.random() - 0.5) * 1.2;
  if (p.kind === "lobby" && from?.kind === "court") return [j(), 6.4];
  if (p.kind === "lobby" && from?.kind === "garden") return [9.2, j()];
  if (p.kind === "lobby" && from?.kind === "circle") return [-9.2, j()];
  if (p.kind === "lobby" && (from?.kind === "floor" || from?.kind === "room")) return [j(), -3.6];
  if (p.kind === "court" && from?.kind === "lobby") return [j(), 2.4];
  if (p.kind === "floor" && from?.kind !== "room") return [j() * 0.8, -1.4];
  if (p.kind === "floor") return area.spawn;
  return [area.spawn[0] + j(), area.spawn[1] + j()];
}

/** Thông báo của Viện trưởng: hiện một lần mỗi ngày mỗi thông báo (002 FR-023). */
function showAnnouncement(ui: HTMLElement, a: { text: string; day: string; author: string }) {
  const key = `bvo.ann.${a.day}.${a.text.length}`;
  try {
    if (localStorage.getItem(key)) return;
    localStorage.setItem(key, "1");
  } catch {
    /* không lưu được thì vẫn hiện */
  }
  const el = h("div", { class: "bvo-announce", role: "status" }, `📢 ${t("council.announcementFrom", { name: a.author })}: `, h("span", {}, a.text));
  const x = h("button", { class: "bvo-x", type: "button", "aria-label": t("world.close") }, "×");
  x.addEventListener("click", () => el.remove());
  el.append(x);
  ui.append(el);
  setTimeout(() => el.remove(), 12_000);
}
