import { AVATAR_CATALOG, type AvatarSpec } from "@bvo/shared";
import { buildAvatar, type Avatar } from "../../avatar/avatar";
import type { Engine } from "../../engine/renderer";
import { t } from "../../i18n";
import { api, ApiError } from "../../net/api";
import { h } from "../../ui/dom";

/** Tạo biệt danh + nhân vật chibi, xem trước trực tiếp trong cảnh 3D (T056, FR-003). */

export interface Room {
  roomId: string;
  wing: string;
  floor: number;
  roomNumber: number;
}

const pick = <T,>(arr: readonly T[]) => arr[Math.floor(Math.random() * arr.length)];

export function showCreateAvatar(root: HTMLElement, engine: Engine): Promise<Room> {
  const c = AVATAR_CATALOG;
  const spec: AvatarSpec = {
    model: pick(c.model),
    parts: { head: "round", hair: pick(c.hair), outfit: pick(c.outfit), accessory: null },
    colors: { skin: pick(c.skin), hair: pick(c.hairColor), outfit: pick(c.outfitColor) },
  };

  let preview: Avatar | null = null;
  const refresh = () => {
    if (preview) {
      engine.scene.remove(preview.group);
      preview.dispose();
    }
    preview = buildAvatar(spec);
    preview.group.position.set(0, 0, 0);
    engine.scene.add(preview.group);
  };
  refresh();
  engine.camera.position.set(0, 1.3, 3.2);
  engine.camera.lookAt(0, 0.9, 0);
  const stopSpin = engine.onFrame((dt) => {
    if (!preview) return;
    preview.update(dt);
    preview.group.rotation.y += dt * 0.5;
  });

  const chips = (
    label: string,
    options: readonly (string | null)[],
    get: () => string | null,
    set: (v: string | null) => void,
    swatch = false,
    name?: (o: string | null) => string,
  ) => {
    const wrap = h("div", { class: "bvo-chips" });
    const render = () =>
      wrap.replaceChildren(
        ...options.map((o) =>
          h(
            "button",
            {
              type: "button",
              class: `bvo-chip ${swatch ? "bvo-swatch" : ""}`,
              "aria-pressed": String(get() === o),
              "aria-label": name ? name(o) : (o ?? t("avatar.none")),
              style: swatch ? `background:${o}` : undefined,
              on: {
                click: () => {
                  set(o);
                  render();
                  refresh();
                },
              },
            },
            swatch ? "" : name ? name(o) : o === null ? t("avatar.none") : o,
          ),
        ),
      );
    render();
    return h("div", { class: "bvo-field" }, h("span", {}, label), wrap);
  };

  return new Promise((resolve) => {
    const nick = h("input", { class: "bvo-input", maxlength: "20", minlength: "2", autocomplete: "off" }) as HTMLInputElement;
    const err = h("p", { class: "bvo-error" });
    const done = h("button", { class: "bvo-btn", type: "button" }, t("avatar.done"));
    done.addEventListener("click", async () => {
      err.textContent = "";
      done.setAttribute("disabled", "");
      try {
        const room = await api<Room>("/api/onboarding/profile", { body: { nickname: nick.value.trim(), avatar: spec } });
        stopSpin();
        if (preview) engine.scene.remove(preview.group);
        root.replaceChildren();
        resolve(room);
      } catch (e) {
        err.textContent = e instanceof ApiError && e.code === "NICKNAME_TAKEN" ? t("avatar.taken") : e instanceof ApiError && e.code === "VALIDATION" ? t("avatar.invalid") : t("errors.network");
        done.removeAttribute("disabled");
      }
    });

    root.replaceChildren(
      h(
        "div",
        { class: "bvo-screen", style: "background:transparent;align-items:flex-end" },
        h(
          "div",
          { class: "bvo-card", style: "max-height:62vh" },
          h("h2", {}, t("avatar.title")),
          h("label", { class: "bvo-field" }, h("span", {}, t("avatar.nickname")), nick, h("small", { class: "bvo-muted" }, t("avatar.nicknameHint"))),
          // Nhân vật 3D có cử động (Kenney Mini Characters, CC0). Các tùy chọn khối cũ chỉ còn dùng làm dự phòng.
          chips(
            t("avatar.character"),
            c.model,
            () => spec.model ?? null,
            (v) => (spec.model = v ?? undefined),
            false,
            (o) => t("avatar.characterN", { n: String(c.model.indexOf(o as (typeof c.model)[number]) + 1) }),
          ),
          err,
          done,
        ),
      ),
    );
    nick.focus();
  });
}
