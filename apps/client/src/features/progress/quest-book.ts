import type { ProgressView, QuestView, SupportResource } from "@bvo/shared";
import { t } from "../../i18n";
import { api, ApiError } from "../../net/api";
import { h, toast } from "../../ui/dom";
import { resourcesBlock } from "../doctor-chat/doctor-chat";
import { openBreathing } from "./breathing";
import { quietQuestNudges, rankTitle } from "./rank";

/**
 * Sổ nhiệm vụ (002 US1/US2, FR-001, FR-002, FR-010): tiến trình, thẻ "Bước tiếp theo", 3 nhiệm vụ hằng ngày,
 * chuỗi thăng cấp. Mỗi nhiệm vụ ghi rõ làm gì, ở đâu, bao nhiêu điểm; có nút hành động phù hợp.
 */

export interface QuestBookOpts {
  inLobby: boolean;
  guide(spot: { zone: string; spot: string }): void;
  openCircles(): void;
  goLobby(): void;
  promote(): Promise<void>;
}

const MOODS = [
  ["great", "😄"],
  ["ok", "🙂"],
  ["meh", "😐"],
  ["low", "😔"],
  ["bad", "😢"],
] as const;

const CAT_ICON: Record<QuestView["category"], string> = { selfcare: "🌿", community: "🤝", explore: "🧭", work: "🧹" };

export function openQuestBook(root: HTMLElement, opts: QuestBookOpts) {
  root.querySelector(".bvo-questbook")?.remove();
  const closeBtn = h("button", { class: "bvo-x", type: "button", "aria-label": t("world.close") }, "×");
  const body = h("div", { class: "bvo-doctors" }, h("p", { class: "bvo-muted" }, t("circle.loading")));
  const panel = h(
    "aside",
    { class: "bvo-panel bvo-questbook", role: "dialog", "aria-label": t("progress.book") },
    h("header", {}, h("h2", {}, `📒 ${t("progress.book")}`), closeBtn),
    body,
  );
  closeBtn.addEventListener("click", () => panel.remove());
  root.append(panel);

  const render = async () => {
    try {
      const [p, q] = await Promise.all([
        api<ProgressView>("/api/progress"),
        api<{ daily: QuestView[]; chain: QuestView[]; weekly: QuestView[] }>("/api/quests"),
      ]);
      body.replaceChildren(header(p), nextCard(p), h("h3", { class: "bvo-qh" }, t("progress.today")), ...q.daily.map(card));
      if (q.chain.length) body.append(h("h3", { class: "bvo-qh" }, t("progress.chain", { name: p.next ? rankTitle(p.next.level) : "" })), ...q.chain.map(card));
      if (q.weekly.length) body.append(h("h3", { class: "bvo-qh" }, t("progress.weekly")), ...q.weekly.map(card));
    } catch {
      body.replaceChildren(h("p", { class: "bvo-error" }, t("errors.network")));
    }
  };

  function header(p: ProgressView) {
    const capped = p.todayPoints >= p.dailyCap;
    return h(
      "div",
      { class: "bvo-qhead" },
      h("div", { class: "bvo-rank" }, h("span", { class: "bvo-tag" }, t("progress.rankLabel")), ` ${rankTitle(p.rank.level)}`),
      h("div", { class: "bvo-muted" }, t("progress.points", { total: String(p.totalPoints), today: String(p.todayPoints), cap: String(p.dailyCap) })),
      capped ? h("div", { class: "bvo-rest" }, t("progress.capped")) : null,
    );
  }

  function bar(have: number, need: number) {
    const pct = need ? Math.min(100, Math.round((have / need) * 100)) : 100;
    return h("div", { class: "bvo-bar", role: "progressbar", "aria-valuenow": String(pct), "aria-valuemin": "0", "aria-valuemax": "100" }, h("span", { style: `width:${pct}%` }));
  }

  function nextCard(p: ProgressView) {
    if (!p.next) return h("div", { class: "bvo-next" }, h("strong", {}, t("progress.topRank")), h("div", { class: "bvo-muted" }, t("progress.topRankHint")));
    const rows = p.next.requirements.filter((r) => r.need > 0).map((r) => {
      const label =
        r.kind === "points"
          ? t("progress.reqPoints", { have: String(r.have), need: String(r.need) })
          : r.kind === "days"
            ? t("progress.reqDays", { have: String(r.have), need: String(r.need) })
            : t("progress.reqChain", { name: t(`chain.${r.label}`), have: String(r.have), need: String(r.need) });
      const ok = r.have >= r.need;
      return h("div", { class: "bvo-req" }, h("div", {}, ok ? "✅ " : "⬜ ", label), bar(r.have, r.need));
    });
    let action: HTMLElement;
    if (p.eligible && opts.inLobby) {
      action = h("button", { class: "bvo-btn", type: "button" }, `🎉 ${t("progress.promote")}`);
      action.addEventListener("click", async () => {
        action.setAttribute("disabled", "");
        await opts.promote();
        panel.remove();
      });
    } else if (p.eligible) {
      action = h("button", { class: "bvo-btn", type: "button" }, `🏥 ${t("progress.goLobbyForCeremony")}`);
      action.addEventListener("click", () => {
        panel.remove();
        opts.goLobby();
      });
    } else action = h("div", { class: "bvo-muted" }, t("progress.keepGoing"));
    return h("div", { class: "bvo-next" }, h("strong", {}, t("progress.next", { title: rankTitle(p.next.level) })), ...rows, action);
  }

  function card(q: QuestView) {
    const done = q.status === "done";
    const el = h(
      "div",
      { class: `bvo-quest${done ? " done" : ""}`, "data-quest": q.id },
      h("div", { class: "bvo-qtitle" }, `${done ? "✅" : CAT_ICON[q.category]} ${q.title}`, h("span", { class: "bvo-tag" }, `+${q.points}`)),
      h("div", {}, q.how),
      h("div", { class: "bvo-muted" }, `📍 ${q.where}${q.target > 1 ? ` · ${q.progress}/${q.target}` : ""}`),
      q.target > 1 && !done ? bar(q.progress, q.target) : null,
    );
    if (done) return el;
    const actions = h("div", { class: "bvo-row" });
    if (q.event === "reach" && q.spot) {
      actions.append(btn(`🧭 ${t("progress.guide")}`, () => (panel.remove(), opts.guide(q.spot!))));
    } else if (q.event === "mood") {
      actions.append(
        ...MOODS.map(([v, icon]) =>
          h("button", { class: "bvo-chip", type: "button", "aria-label": t(`progress.mood.${v}`), on: { click: () => void selfcare({ kind: "mood", value: v }) } }, icon),
        ),
      );
    } else if (q.event === "gratitude") {
      const input = h("input", { class: "bvo-input", maxlength: "200", placeholder: t("progress.gratitudePh") }) as HTMLInputElement;
      actions.append(input, btn(t("progress.save"), () => input.value.trim() && void selfcare({ kind: "gratitude", text: input.value.trim() })));
    } else if (q.event === "breath") {
      actions.append(btn(`🌬 ${t("progress.breathStart")}`, () => void openBreathing(root, () => void render())));
    } else if (["sit", "thank", "circle_visit", "circle_session", "tidy"].includes(q.event)) {
      actions.append(btn(`⭕ ${t("world.goCircle")}`, () => (panel.remove(), opts.openCircles())));
    }
    if (actions.childElementCount) el.append(actions);
    return el;
  }

  function btn(label: string, fn: () => void) {
    return h("button", { class: "bvo-btn secondary", type: "button", on: { click: fn } }, label);
  }

  async function selfcare(payload: { kind: "mood"; value: string } | { kind: "gratitude"; text: string }) {
    try {
      const r = await api<{ awarded: number; support: { message: string; resources: SupportResource[] } | null }>("/api/selfcare", { body: payload });
      if (r.support) {
        // Dòng tự viết có dấu hiệu khủng hoảng: hiện thông tin hỗ trợ ngay, không nói chuyện điểm.
        quietQuestNudges();
        showSupport(r.support);
        return;
      }
      toast(r.awarded ? t("progress.awarded", { n: String(r.awarded) }) : t("progress.saved"));
      await render();
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("errors.network"));
    }
  }

  function showSupport(s: { message: string; resources: SupportResource[] }) {
    body.prepend(h("div", { class: "bvo-msg safety" }, h("span", {}, s.message), resourcesBlock(s.resources)));
    body.scrollTop = 0;
  }

  void render();
  return { refresh: render, close: () => panel.remove() };
}
