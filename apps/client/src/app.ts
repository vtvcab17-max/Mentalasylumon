import type { AvatarSpec } from "@bvo/shared";
import { Engine } from "./engine/renderer";
import { openDoctorChat } from "./features/doctor-chat/doctor-chat";
import { showCreateAvatar } from "./features/onboarding/create-avatar";
import { showLanguagePicker } from "./features/onboarding/language-picker";
import { showAgeGate, showLogin, showTerms } from "./features/onboarding/onboarding";
import { hasChosenLocale, setLocale, t } from "./i18n";
import { api, ApiError } from "./net/api";
import { h } from "./ui/dom";
import { openSettings } from "./ui/settings";
import { buildPrivateRoom } from "./world/private-room";

/** Luồng US1: chọn ngôn ngữ → đăng nhập → 18+ → điều khoản → nhân vật → phòng riêng + bác sĩ AI. */

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
  enterRoom(ui, engine, me);
}

function enterRoom(ui: HTMLElement, engine: Engine, me: Me) {
  const room = buildPrivateRoom(engine, me.avatar!);
  const render = () => {
    const r = me.room!;
    const label = h("div", { class: "bvo-pill" }, `${me.nickname} · ${t("room.label", { wing: r.wing, floor: String(r.floor), room: String(r.roomNumber).padStart(2, "0") })}`);
    const settingsBtn = h("button", { class: "bvo-btn secondary", type: "button" }, `⚙ ${t("room.settings")}`);
    const call = h("button", { class: "bvo-btn", type: "button" }, `🩺 ${t("room.callDoctor")}`);
    const dock = h("div", { class: "bvo-dock" }, call);
    ui.replaceChildren(h("div", { class: "bvo-hud" }, label, settingsBtn), dock);

    call.addEventListener("click", () => {
      dock.remove();
      openDoctorChat(ui, {
        onDoctor: (spec) => room.showDoctor(spec),
        onClose: () => ui.append(dock),
      });
    });
    settingsBtn.addEventListener("click", () => openSettings(ui, engine, { onLocale: () => render() }));
  };
  render();
}
