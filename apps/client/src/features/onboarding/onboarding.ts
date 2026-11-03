import type { SupportResource } from "@bvo/shared";
import { getLocale, t } from "../../i18n";
import { api, ApiError } from "../../net/api";
import { h, screen } from "../../ui/dom";

/** Đăng nhập, xác nhận 18+, điều khoản với từng ô tick riêng không tick sẵn (T055, FR-002, FR-004, R14). */

export function showLogin(root: HTMLElement) {
  screen(
    root,
    h(
      "div",
      {},
      h("h1", {}, t("login.welcome")),
      h("p", {}, t("login.intro")),
      h("a", { class: "bvo-btn", href: `/auth/google/start?lang=${getLocale()}`, style: "text-align:center;text-decoration:none" }, t("login.google")),
      h("p", { class: "bvo-muted" }, t("login.adultsOnly")),
    ),
  );
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
