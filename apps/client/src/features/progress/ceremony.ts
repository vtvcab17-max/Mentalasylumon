import { t } from "../../i18n";
import { h } from "../../ui/dom";
import { rankTitle } from "./rank";

/**
 * Lễ thăng cấp ở sảnh (002 US2, FR-011). Lời chúc là câu mẫu, có nhãn AI (Constitution II).
 * Pháo giấy dựng bằng CSS (nhẹ, không cần tài sản).
 */
export function showCeremony(root: HTMLElement, level: number) {
  const confetti = h("div", { class: "bvo-confetti", "aria-hidden": "true" });
  const colors = ["#f6d186", "#8fc1b5", "#f2b5a7", "#a3c4f3", "#cdb4db"];
  for (let i = 0; i < 40; i++) {
    confetti.append(
      h("i", { style: `left:${Math.random() * 100}%;background:${colors[i % colors.length]};animation-delay:${(Math.random() * 0.8).toFixed(2)}s;animation-duration:${(2 + Math.random() * 1.5).toFixed(2)}s` }),
    );
  }
  const ok = h("button", { class: "bvo-btn", type: "button" }, t("progress.ceremonyOk"));
  const el = h(
    "div",
    { class: "bvo-screen", role: "dialog", "aria-label": t("progress.ceremonyTitle") },
    confetti,
    h(
      "div",
      { class: "bvo-card", style: "text-align:center;position:relative" },
      h("div", { style: "font-size:48px" }, "🎖"),
      h("h2", {}, t("progress.ceremonyTitle")),
      h("p", { style: "font-size:20px;font-weight:700" }, rankTitle(level)),
      h("div", { class: "bvo-msg doctor", style: "max-width:none;text-align:left" }, h("span", { class: "bvo-ai" }, t("chat.aiLabel")), t("progress.ceremonyLine", { title: rankTitle(level) })),
      h("p", { class: "bvo-muted" }, t(`progress.unlock${level}`)),
      h("p", { class: "bvo-muted", style: "font-size:12px" }, t("progress.inGameNote")),
      ok,
    ),
  );
  ok.addEventListener("click", () => el.remove());
  root.append(el);
}

/** Pháo giấy nhỏ khi người khác trong khu được thăng cấp. */
export function burst(root: HTMLElement) {
  const confetti = h("div", { class: "bvo-confetti", "aria-hidden": "true", style: "pointer-events:none" });
  for (let i = 0; i < 24; i++) confetti.append(h("i", { style: `left:${20 + Math.random() * 60}%;background:#f6d186;animation-delay:${(Math.random() * 0.5).toFixed(2)}s` }));
  root.append(confetti);
  setTimeout(() => confetti.remove(), 3500);
}
