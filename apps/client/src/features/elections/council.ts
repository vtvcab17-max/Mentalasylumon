import { t } from "../../i18n";
import { api, ApiError } from "../../net/api";
import { h, toast } from "../../ui/dom";
import { openDirectorDesk } from "./director-desk";

/**
 * Hội đồng & bầu cử (002 US4, FR-016–FR-021): lịch tuần, ứng viên và lời hứa, bỏ phiếu kín, kết quả, bảng vàng.
 * Mở từ bảng tin Hội đồng ở sảnh chính hoặc từ bản đồ.
 */

export interface ElectionView {
  id: string;
  status: "nominating" | "voting" | "announced" | "vacant";
  schedule: { nominateFrom: string; nominateTo: string; voteFrom: string; voteTo: string; termWeek: string };
  candidates: { userId: string; nickname: string; pledge: string; plans: string[] }[];
  myRole: { canNominate: boolean; nominateReason: string | null; canVote: boolean; voteReason: string | null; isCandidate: boolean };
  myVote: string | null;
  result: { winner: string | null; tieBreak: string | null; vacantReason: string | null; tally: { candidateId: string; nickname: string; votes: number }[] } | null;
}

export interface WorldState {
  week: string;
  director: { id: string; nickname: string } | null;
  vacantReason: string | null;
  theme: { id: string; title: string; desc: string } | null;
  decor: { id: string; title: string; desc: string; data: { style: string; colors: string[] } } | null;
  announcement: { text: string; day: string; author: string } | null;
  honorary: string[];
}

export const POWERS = ["theme", "quests", "decor", "announce", "honorary"] as const;
const when = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });

export function openCouncil(root: HTMLElement, me: { id: string }) {
  root.querySelector(".bvo-council")?.remove();
  const closeBtn = h("button", { class: "bvo-x", type: "button", "aria-label": t("world.close") }, "×");
  const body = h("div", { class: "bvo-doctors" }, h("p", { class: "bvo-muted" }, t("circle.loading")));
  const panel = h(
    "aside",
    { class: "bvo-panel bvo-council", role: "dialog", "aria-label": t("council.title") },
    h("header", {}, h("h2", {}, `🏛 ${t("council.title")}`), closeBtn),
    body,
  );
  closeBtn.addEventListener("click", () => panel.remove());
  root.append(panel);

  const render = async () => {
    try {
      const [e, w, fame] = await Promise.all([
        api<ElectionView>("/api/elections/current"),
        api<WorldState>("/api/world/state"),
        api<{ week: string; nickname: string }[]>("/api/elections/hall-of-fame"),
      ]);
      body.replaceChildren(
        directorCard(w),
        scheduleCard(e),
        ...(e.result ? [resultCard(e)] : []),
        candidatesCard(e),
        ...(e.myRole.canNominate || e.myRole.isCandidate ? [nominateCard(e)] : []),
        roleNote(e),
        fameCard(fame),
        h("p", { class: "bvo-muted", style: "font-size:12px" }, t("council.secretNote")),
      );
    } catch {
      body.replaceChildren(h("p", { class: "bvo-error" }, t("errors.network")));
    }
  };

  function directorCard(w: WorldState) {
    const card = h(
      "div",
      { class: "bvo-next" },
      h("strong", {}, w.director ? `👑 ${t("council.directorNow", { name: w.director.nickname })}` : `🪑 ${t("council.vacant")}`),
      w.theme ? h("div", {}, t("council.theme", { title: w.theme.title })) : null,
      w.announcement ? h("div", { class: "bvo-muted" }, `📢 “${w.announcement.text}”`) : null,
      w.honorary.length ? h("div", { class: "bvo-muted" }, t("council.honorary", { names: w.honorary.join(", ") })) : null,
    );
    if (w.director?.id === me.id) {
      const desk = h("button", { class: "bvo-btn", type: "button" }, `🪑 ${t("director.desk")}`);
      desk.addEventListener("click", () => openDirectorDesk(root, () => void render()));
      card.append(desk);
    }
    return card;
  }

  function scheduleCard(e: ElectionView) {
    const steps = [
      ["nominating", t("council.stepNominate"), e.schedule.nominateFrom],
      ["voting", t("council.stepVote"), e.schedule.voteFrom],
      ["announced", t("council.stepAnnounce"), e.schedule.voteTo],
    ] as const;
    return h(
      "div",
      { class: "bvo-quest" },
      h("div", { class: "bvo-qtitle" }, t("council.week", { week: e.id }), h("span", { class: "bvo-tag" }, t(`council.status.${e.status}`))),
      ...steps.map(([k, label, at]) => h("div", { class: e.status === k ? "" : "bvo-muted" }, `${e.status === k ? "▶" : "•"} ${label}: ${when(at)}`)),
      h("div", { class: "bvo-muted" }, t("council.termNote")),
    );
  }

  function resultCard(e: ElectionView) {
    const r = e.result!;
    if (!r.winner)
      return h("div", { class: "bvo-next" }, h("strong", {}, `🪑 ${t("council.vacantResult")}`), h("div", { class: "bvo-muted" }, t(`council.vacantReason.${r.vacantReason ?? "no_candidates"}`)));
    const win = r.tally.find((x) => x.candidateId === r.winner);
    return h(
      "div",
      { class: "bvo-next" },
      h("strong", {}, `🎉 ${t("council.winner", { name: win?.nickname ?? "" })}`),
      ...r.tally.map((x) => h("div", {}, `${x.nickname}: ${t("council.votes", { n: String(x.votes) })}`)),
      r.tieBreak ? h("div", { class: "bvo-muted" }, t(`council.tie.${r.tieBreak}`)) : null,
    );
  }

  function candidatesCard(e: ElectionView) {
    const wrap = h("div", {}, h("h3", { class: "bvo-qh" }, t("council.candidates")));
    if (!e.candidates.length) wrap.append(h("p", { class: "bvo-muted" }, t("council.noCandidates")));
    for (const c of e.candidates) {
      const mine = e.myVote === c.userId;
      const card = h(
        "div",
        { class: `bvo-quest${mine ? " voted" : ""}` },
        h("div", { class: "bvo-qtitle" }, c.nickname, h("span", { class: "bvo-tag" }, t("rank.head"))),
        h("div", {}, `“${c.pledge}”`),
        c.plans.length ? h("div", { class: "bvo-chips", style: "margin-top:6px" }, ...c.plans.map((p) => h("span", { class: "bvo-tag" }, t(`director.power.${p}`)))) : null,
      );
      if (e.myRole.canVote) {
        const b = h("button", { class: mine ? "bvo-btn" : "bvo-btn secondary", type: "button" }, mine ? `✅ ${t("council.yourVote")}` : t("council.vote"));
        b.addEventListener("click", async () => {
          try {
            await api("/api/elections/current/vote", { body: { candidateId: c.userId } });
            toast(t("council.voted"));
            await render();
          } catch (err) {
            toast(err instanceof ApiError ? err.message : t("errors.network"));
          }
        });
        card.append(b);
      }
      wrap.append(card);
    }
    return wrap;
  }

  function nominateCard(e: ElectionView) {
    const mine = e.candidates.find((c) => c.userId === me.id);
    const pledge = h("textarea", { class: "bvo-input", maxlength: "200", rows: "2", placeholder: t("council.pledgePh") }) as HTMLTextAreaElement;
    pledge.value = mine?.pledge ?? "";
    const boxes = POWERS.map((p) => {
      const input = h("input", { type: "checkbox", value: p }) as HTMLInputElement;
      input.checked = !!mine?.plans.includes(p);
      return h("label", { class: "bvo-chip" }, input, ` ${t(`director.power.${p}`)}`);
    });
    const err = h("div", { class: "bvo-error" });
    const submit = h("button", { class: "bvo-btn", type: "button" }, mine ? t("council.updatePledge") : t("council.nominate"));
    submit.addEventListener("click", async () => {
      const plans = boxes.map((b) => b.querySelector("input")!).filter((i) => i.checked).map((i) => i.value);
      if (plans.length > 3) return (err.textContent = t("council.max3"));
      try {
        await api("/api/elections/current/candidacy", { body: { pledge: pledge.value.trim(), plans } });
        toast(t("council.nominated"));
        await render();
      } catch (e2) {
        err.textContent = e2 instanceof ApiError ? e2.message : t("errors.network");
      }
    });
    const card = h("div", { class: "bvo-next" }, h("strong", {}, t("council.nominateTitle")), pledge, h("div", { class: "bvo-muted" }, t("council.plansHint")), h("div", { class: "bvo-chips" }, ...boxes), err, submit);
    if (mine) {
      const w = h("button", { class: "bvo-btn secondary", type: "button" }, t("council.withdraw"));
      w.addEventListener("click", async () => {
        await api("/api/elections/current/candidacy", { method: "DELETE" }).catch(() => undefined);
        await render();
      });
      card.append(w);
    }
    return card;
  }

  function roleNote(e: ElectionView) {
    const r = e.myRole;
    const reason = !r.canVote && r.voteReason && r.voteReason !== "phase" ? t(`council.reason.${r.voteReason}`) : null;
    const nom = !r.canNominate && r.nominateReason === "consecutive" ? t("council.reason.consecutive") : null;
    return h("div", { class: "bvo-muted" }, [nom, reason ?? (r.canVote ? t("council.youCanVote") : null)].filter(Boolean).join(" "));
  }

  function fameCard(list: { week: string; nickname: string }[]) {
    return h(
      "div",
      {},
      h("h3", { class: "bvo-qh" }, `🏅 ${t("council.fame")}`),
      list.length ? h("div", {}, ...list.map((x) => h("div", {}, `${x.week} · ${x.nickname}`))) : h("p", { class: "bvo-muted" }, t("council.fameEmpty")),
    );
  }

  void render();
}
