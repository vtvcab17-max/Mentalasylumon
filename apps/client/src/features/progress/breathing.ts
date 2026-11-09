import { t } from "../../i18n";
import { api } from "../../net/api";
import { h, toast } from "../../ui/dom";

/**
 * Bài thở 3 phút (002 US1): hít 4 giây — thở ra 6 giây theo vòng tròn. Máy chủ chỉ tính khi đã qua ≥ 170 giây
 * kể từ lúc bắt đầu (research.md R1). Dừng giữa chừng không sao, chỉ là không được điểm.
 */
const TOTAL = 180;

export async function openBreathing(root: HTMLElement, onDone?: (awarded: number) => void) {
  let token: string;
  try {
    token = (await api<{ token: string }>("/api/quests/breath/start", { body: {} })).token;
  } catch {
    return toast(t("errors.network"));
  }
  const circle = h("div", { class: "bvo-breath-circle" });
  const phase = h("div", { class: "bvo-breath-phase" }, t("progress.breathIn"));
  const clock = h("div", { class: "bvo-muted" });
  const stop = h("button", { class: "bvo-btn secondary", type: "button" }, t("progress.breathStop"));
  const el = h(
    "div",
    { class: "bvo-screen", role: "dialog", "aria-label": t("progress.breathTitle") },
    h("div", { class: "bvo-card", style: "text-align:center" }, h("h2", {}, t("progress.breathTitle")), circle, phase, clock, stop),
  );
  root.append(el);
  const started = performance.now();
  const timer = setInterval(async () => {
    const s = (performance.now() - started) / 1000;
    const cycle = s % 10;
    const inhale = cycle < 4;
    phase.textContent = inhale ? t("progress.breathIn") : t("progress.breathOut");
    circle.style.transform = `scale(${inhale ? 0.6 + (cycle / 4) * 0.4 : 1 - ((cycle - 4) / 6) * 0.4})`;
    const left = Math.max(0, Math.ceil(TOTAL - s));
    clock.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
    if (s >= TOTAL) {
      clearInterval(timer);
      el.remove();
      try {
        const r = await api<{ awarded: number }>("/api/quests/breath/finish", { body: { token } });
        toast(r.awarded ? t("progress.breathDoneAward", { n: String(r.awarded) }) : t("progress.breathDone"));
        onDone?.(r.awarded);
      } catch {
        toast(t("progress.breathDone"));
      }
    }
  }, 100);
  stop.addEventListener("click", () => {
    clearInterval(timer);
    el.remove();
  });
}
