import type { SupportResource } from "@bvo/shared";
import { getLocale, t } from "../../i18n";
import { api, ApiError } from "../../net/api";
import { h, screen } from "../../ui/dom";

/** Đăng nhập, xác nhận 18+, điều khoản với từng ô tick riêng không tick sẵn (T055, FR-002, FR-004, R14). */

/** Nút "Sign in with Google" (Google Identity Services) — chỉ cần Client ID, giống Vạn Linh Đảo. */
interface Gis {
  accounts: {
    id: {
      initialize(o: { client_id: string; callback: (r: { credential: string }) => void; ux_mode?: string; use_fedcm_for_button?: boolean }): void;
      renderButton(el: HTMLElement, o: Record<string, unknown>): void;
    };
  };
}

function loadGis(): Promise<Gis> {
  const w = window as unknown as { google?: Gis };
  if (w.google?.accounts) return Promise.resolve(w.google);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://accounts.google.com/gsi/client";
    s.async = true;
    s.onload = () => (w.google ? resolve(w.google) : reject(new Error("gis")));
    s.onerror = () => reject(new Error("gis"));
    document.head.append(s);
  });
}

export async function showLogin(root: HTMLElement) {
  const slot = h("div", { style: "display:flex;justify-content:center;min-height:44px;margin:16px 0" });
  const err = h("p", { class: "bvo-error" });
  screen(
    root,
    h(
      "div",
      {},
      h("h1", {}, t("login.welcome")),
      h("p", {}, t("login.intro")),
      slot,
      err,
      h("p", { class: "bvo-muted" }, t("login.adultsOnly")),
    ),
  );
  try {
    const { googleClientId } = await api<{ googleClientId: string | null }>("/api/config");
    if (!googleClientId) throw new Error("no client id");
    const gis = await loadGis();
    gis.accounts.id.initialize({
      client_id: googleClientId,
      use_fedcm_for_button: true,
      callback: async ({ credential }) => {
        try {
          await api("/auth/google/token", { body: { credential, locale: getLocale() } });
          location.reload();
        } catch {
          err.textContent = t("login.failed");
        }
      },
    });
    gis.accounts.id.renderButton(slot, { theme: "filled_blue", size: "large", shape: "pill", text: "signin_with", locale: getLocale() });
  } catch {
    err.textContent = t("login.failed");
  }
}

export function showAgeGate(root: HTMLElement): Promise<void> {
  return new Promise((resolve) => {
    const err = h("p", { class: "bvo-error" });
    const answer = async (isAdult: boolean) => {
      try {
        await api("/api/onboarding/age", { body: { isAdult } });
        resolve();
      } catch (e) {
        if (e instanceof ApiError && e.code === "UNDERAGE") showUnderage(root, (e.extra.resources as SupportResource[]) ?? []);
        else err.textContent = t("errors.network");
      }
    };
    screen(
      root,
      h(
        "div",
        {},
        h("h2", {}, t("age.title")),
        h("button", { class: "bvo-btn", type: "button", on: { click: () => answer(true) } }, t("age.yes")),
        h("button", { class: "bvo-btn secondary", type: "button", on: { click: () => answer(false) } }, t("age.no")),
        err,
      ),
    );
  });
}

function showUnderage(root: HTMLElement, resources: SupportResource[]) {
  screen(
    root,
    h(
      "div",
      {},
      h("h2", {}, t("age.underageTitle")),
      h("p", {}, t("age.underageBody")),
      h(
        "ul",
        {},
        ...resources.map((r) =>
          h("li", {}, h("strong", {}, r.name), " — ", r.phone ? h("a", { href: `tel:${r.phone.replace(/\s/g, "")}` }, r.phone) : r.url ?? ""),
        ),
      ),
    ),
  );
}

interface TermsResponse {
  version: string;
  sections: { title: string; body: string }[];
  consentItems: { key: string; label: string; required: boolean }[];
}

export async function showTerms(root: HTMLElement): Promise<void> {
  const terms = await api<TermsResponse>("/api/terms");
  return new Promise((resolve) => {
    const boxes = terms.consentItems.map((item) => ({ item, input: h("input", { type: "checkbox" }) as HTMLInputElement }));
    const err = h("p", { class: "bvo-error" });
    const submit = h("button", { class: "bvo-btn", type: "button" }, t("terms.agree"));
    submit.addEventListener("click", async () => {
      if (boxes.some((b) => b.item.required && !b.input.checked)) {
        err.textContent = t("terms.needAll");
        return;
      }
      submit.setAttribute("disabled", "");
      try {
        const items = Object.fromEntries(boxes.map((b) => [b.item.key, b.input.checked]));
        await api("/api/onboarding/consent", { body: { termsVersion: terms.version, items } });
        resolve();
      } catch {
        err.textContent = t("errors.network");
        submit.removeAttribute("disabled");
      }
    });
    screen(
      root,
      h(
        "div",
        {},
        h("h2", {}, t("terms.title")),
        ...terms.sections.map((s) => h("div", { class: "bvo-section" }, h("h3", {}, s.title), h("p", { class: "bvo-muted" }, s.body))),
        ...boxes.map((b) => h("label", { class: "bvo-check" }, b.input, h("span", {}, b.item.label))),
        err,
        submit,
      ),
    );
  });
}
