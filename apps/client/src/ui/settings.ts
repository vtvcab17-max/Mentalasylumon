import type { Engine, Quality } from "../engine/renderer";
import { dayMode, setDayMode, type DayMode } from "../engine/atmosphere";
import { getLocale, setLocale, t, type Locale } from "../i18n";
import { api } from "../net/api";
import { h, toast } from "./dom";

/** Cài đặt (T060): ngôn ngữ, mức đồ họa, xóa lịch sử, xóa tài khoản, đăng xuất (FR-005, FR-006a, FR-036). */
export function openSettings(root: HTMLElement, engine: Engine, opts: { onLocale(l: Locale): void }) {
  const closeBtn = h("button", { class: "bvo-x", type: "button", "aria-label": t("settings.close") }, "×");
  const panel = h(
    "aside",
    { class: "bvo-panel", role: "dialog", "aria-label": t("settings.title") },
    h("header", {}, h("h2", {}, t("settings.title")), closeBtn),
    h(
      "div",
      { class: "bvo-doctors" },
      h("h3", {}, t("settings.language")),
      h(
        "div",
        { class: "bvo-row" },
        ...(["vi", "en"] as const).map((l) =>
          h(
            "button",
            {
              class: `bvo-btn ${getLocale() === l ? "" : "secondary"}`,
              type: "button",
              lang: l,
              on: {
                click: async () => {
                  setLocale(l);
                  await api("/api/me/locale", { method: "PUT", body: { locale: l } }).catch(() => undefined);
                  panel.remove();
                  opts.onLocale(l);
                },
              },
            },
            t(`lang.${l}`),
          ),
        ),
      ),
      h("h3", {}, t("quality.label")),
      h(
        "div",
        { class: "bvo-row" },
        ...(["low", "medium", "high"] as Quality[]).map((q) => {
          const b = h("button", { class: `bvo-btn ${engine.quality === q ? "" : "secondary"}`, type: "button" }, t(`quality.${q}`));
          b.addEventListener("click", () => {
            engine.setQuality(q);
            panel.querySelectorAll<HTMLButtonElement>("[data-q]").forEach((x) => x.classList.toggle("secondary", x.dataset.q !== q));
          });
          b.dataset.q = q;
          return b;
        }),
      ),
      h("h3", {}, t("daynight.label")),
      h(
        "div",
        { class: "bvo-row" },
        ...(["auto", "day", "night"] as DayMode[]).map((m) => {
          const b = h("button", { class: `bvo-btn ${dayMode() === m ? "" : "secondary"}`, type: "button" }, t(`daynight.${m}`));
          b.dataset.dm = m;
          b.addEventListener("click", () => {
            setDayMode(m);
            panel.querySelectorAll<HTMLButtonElement>("[data-dm]").forEach((x) => x.classList.toggle("secondary", x.dataset.dm !== m));
          });
          return b;
        }),
      ),
      h("p", { class: "bvo-muted" }, t("daynight.hint")),
      h(
        "button",
        {
          class: "bvo-btn danger",
          type: "button",
          on: {
            click: async () => {
              if (!confirm(t("settings.confirmDeleteHistory"))) return;
              await api("/api/conversations", { method: "DELETE" });
              toast(t("settings.done"));
            },
          },
        },
        t("settings.deleteHistory"),
      ),
      h(
        "button",
        {
          class: "bvo-btn danger",
          type: "button",
          on: {
            click: async () => {
              const word = prompt(t("settings.confirmDeleteAccount"));
              if (word?.trim().toUpperCase() !== t("settings.confirmWord")) return;
              await api("/api/me", { method: "DELETE", body: { confirm: getLocale() === "vi" ? "XOA" : "DELETE" } });
              location.href = "/";
            },
          },
        },
        t("settings.deleteAccount"),
      ),
      h(
        "button",
        {
          class: "bvo-btn secondary",
          type: "button",
          on: {
            click: async () => {
              await api("/auth/logout", { method: "POST" }).catch(() => undefined);
              location.href = "/";
            },
          },
        },
        t("settings.logout"),
      ),
    ),
  );
  closeBtn.addEventListener("click", () => panel.remove());
  root.append(panel);
}
