import type { AvatarSpec, CircleChat, SupportResource } from "@bvo/shared";
import type { Engine } from "../../engine/renderer";
import { t } from "../../i18n";
import { api } from "../../net/api";
import { CircleClient, type CircleMsg } from "../../net/circle-client";
import { h, toast } from "../../ui/dom";
import { buildCircleRoom } from "../../world/circle-room";
import { resourcesBlock } from "../doctor-chat/doctor-chat";
import { questNudgesQuiet, quietQuestNudges } from "../progress/rank";

/**
 * Vòng sinh hoạt (T083, FR-022–FR-026, FR-038): danh sách vòng, chọn ghế, khung chat đã kiểm duyệt,
 * quy tắc cộng đồng lần đầu, báo cáo / chặn / tắt tiếng. Lời bác sĩ dẫn dắt luôn có nhãn "AI".
 */

export interface CircleInfo {
  id: string;
  name: string;
  language: "vi" | "en";
  seatsTaken: number;
  maxSeats: number;
  session: { topic: string; startsAt: string; status: "scheduled" | "live" } | null;
}

const RULES_KEY = "bvo.circleRules.v1";
const MUTE_KEY = "bvo.circleMuted";

function load<T>(key: string, def: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : def;
  } catch {
    return def;
  }
}
function store(key: string, v: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(v));
  } catch {
    /* trình duyệt chặn lưu trữ: chỉ nhớ trong phiên */
  }
}

const timeText = (iso: string) => new Date(iso).toLocaleString(undefined, { weekday: "short", hour: "2-digit", minute: "2-digit" });

function sessionText(s: CircleInfo["session"]) {
  if (!s) return t("circle.noSession");
  return s.status === "live" ? t("circle.liveNow", { topic: s.topic }) : t("circle.nextSession", { topic: s.topic, time: timeText(s.startsAt) });
}

/** Panel chọn vòng. Vòng cùng ngôn ngữ người chơi đứng trước (server đã xếp). */
export async function openCircleList(root: HTMLElement, opts: { pick(id: string): void; heading?: string; circles?: CircleInfo[] }) {
  const close = () => panel.remove();
  const closeBtn = h("button", { class: "bvo-x", type: "button", "aria-label": t("world.close") }, "×");
  closeBtn.addEventListener("click", close);
  const list = h("div", { class: "bvo-doctors" }, h("p", { class: "bvo-muted" }, t("circle.loading")));
  const panel = h(
    "aside",
    { class: "bvo-panel", role: "dialog", "aria-label": t("circle.listTitle") },
    h("header", {}, h("h2", {}, `⭕ ${opts.heading ?? t("circle.listTitle")}`), closeBtn),
    list,
  );
  root.append(panel);
  try {
    const circles = opts.circles ?? (await api<CircleInfo[]>("/api/circles"));
    list.replaceChildren(
      h("p", { class: "bvo-muted" }, t("circle.listHint")),
      ...circles.map((c) => {
        const full = c.seatsTaken >= c.maxSeats;
        return h(
          "button",
          {
            class: "bvo-doctor",
            type: "button",
            disabled: full ? true : undefined,
            on: {
              click: () => {
                close();
                opts.pick(c.id);
              },
            },
          },
          h("strong", {}, `${c.name} `, h("span", { class: "bvo-tag" }, c.language === "vi" ? "Tiếng Việt" : "English")),
          h("div", { class: "bvo-muted" }, `${t("circle.seats", { n: String(c.seatsTaken), max: String(c.maxSeats) })} · ${sessionText(c.session)}`),
        );
      }),
    );
  } catch {
    list.replaceChildren(h("p", { class: "bvo-error" }, t("errors.network")));
  }
  return close;
}

/** Quy tắc cộng đồng — bắt buộc đọc lần đầu (FR-025); xem lại bất cứ lúc nào. */
export function showRules(root: HTMLElement, force = false): Promise<void> {
  if (!force && load(RULES_KEY, false)) return Promise.resolve();
  return new Promise((resolve) => {
    const ok = h("button", { class: "bvo-btn", type: "button" }, t("circle.rulesAccept"));
    const el = h(
      "div",
      { class: "bvo-screen", role: "dialog", "aria-label": t("circle.rulesTitle") },
      h(
        "div",
        { class: "bvo-card" },
        h("h2", {}, t("circle.rulesTitle")),
        h("ol", {}, ...[1, 2, 3, 4, 5].map((i) => h("li", { style: "margin:6px 0" }, t(`circle.rule${i}`)))),
        h("p", { class: "bvo-muted" }, t("circle.rulesNote")),
        ok,
      ),
    );
    ok.addEventListener("click", () => {
      store(RULES_KEY, true);
      el.remove();
      resolve();
    });
    root.append(el);
  });
}

interface Me {
  id: string;
  avatar: AvatarSpec | null;
}

export interface CircleStage {
  dispose(): void;
}

/** Vào một vòng. Trả về null nếu vòng đầy (đã mở danh sách gợi ý). */
export async function enterCircle(
  root: HTMLElement,
  engine: Engine,
  me: Me,
  circleId: string,
  opts: { leave(): void; pick(id: string): void; topBar(title: HTMLElement): HTMLElement },
): Promise<CircleStage | null> {
  const join = await api<{ wsUrl?: string; full?: true; alternatives?: CircleInfo[] }>(`/api/circles/${circleId}/join`, { body: {} });
  if (join.full) {
    toast(t("circle.full"));
    await openCircleList(root, { pick: opts.pick, heading: t("circle.alternatives"), circles: join.alternatives ?? [] });
    return null;
  }
  await showRules(root);

  let scene: ReturnType<typeof buildCircleRoom> | null = null;
  let maxSeats = 12;
  let mySeat: number | null = null;
  const seats = new Map<number, { userId: string; nickname: string }>();
  const muted = new Set<string>(load<string[]>(MUTE_KEY, []));

  // ── HUD ────────────────────────────────────────────────────────────
  const title = h("div", { class: "bvo-pill" }, t("circle.connecting"));
  const sessionPill = h("div", { class: "bvo-pill bvo-muted", style: "display:none" });
  const status = h("div", { class: "bvo-pill", style: "display:none" }, t("world.reconnecting"));
  const top = opts.topBar(h("div", { class: "bvo-row", style: "flex-wrap:wrap" }, title, sessionPill, status));

  const sitBtn = h("button", { class: "bvo-btn", type: "button" }, `🪑 ${t("circle.sit")}`);
  const rulesBtn = h("button", { class: "bvo-btn secondary", type: "button" }, `📜 ${t("circle.rules")}`);
  const leaveBtn = h("button", { class: "bvo-btn secondary", type: "button" }, `🚪 ${t("circle.leave")}`);
  const dock = h("div", { class: "bvo-dock bvo-circle-dock bvo-row", style: "flex-wrap:nowrap" }, sitBtn, rulesBtn, leaveBtn);

  // ── khung chat ─────────────────────────────────────────────────────
  const msgs = h("div", { class: "bvo-msgs", "aria-live": "polite" });
  const input = h("textarea", { class: "bvo-input", maxlength: "300", rows: "1", disabled: true, placeholder: t("circle.sitToChat") }) as HTMLTextAreaElement;
  const send = h("button", { class: "bvo-btn", type: "button", disabled: true }, t("chat.send"));
  const chatPanel = h(
    "aside",
    { class: "bvo-panel bvo-circle-chat", "aria-label": t("circle.chat") },
    h("header", {}, h("h2", {}, `💬 ${t("circle.chat")}`)),
    msgs,
    h("div", { class: "bvo-compose" }, input, send),
  );
  root.append(top, chatPanel, dock);

  const scroll = () => (msgs.scrollTop = msgs.scrollHeight);
  const nicknameOf = (id: string) => [...seats.values()].find((s) => s.userId === id)?.nickname;
  const pending = new Map<string, HTMLElement>();
  let seq = 0;

  function menuFor(m: CircleChat, bubble: HTMLElement) {
    const pop = h("div", { class: "bvo-pop", role: "menu" });
    const closePop = () => pop.remove();
    const item = (label: string, fn: () => void, cls = "") =>
      h("button", { class: `bvo-btn secondary ${cls}`, type: "button", role: "menuitem", on: { click: () => (closePop(), fn()) } }, label);
    const isMuted = muted.has(m.from.id);
    pop.append(
      item(isMuted ? `🔈 ${t("circle.unmute")}` : `🔇 ${t("circle.mute")}`, () => {
        if (isMuted) muted.delete(m.from.id);
        else muted.add(m.from.id);
        store(MUTE_KEY, [...muted]);
        applyFilters();
        toast(isMuted ? t("circle.unmuted", { name: m.from.nickname }) : t("circle.muted", { name: m.from.nickname }));
      }),
      item(`⛔ ${t("circle.block")}`, async () => {
        if (!confirm(t("circle.confirmBlock", { name: m.from.nickname }))) return;
        await api("/api/blocks", { body: { userId: m.from.id } }).catch(() => toast(t("errors.network")));
        msgs.querySelectorAll(`[data-from="${CSS.escape(m.from.id)}"]`).forEach((n) => n.remove());
        toast(t("circle.blocked", { name: m.from.nickname }));
      }),
      item(`🚩 ${t("circle.report")}`, () => reportFlow(m), "danger"),
      item(t("world.close"), () => undefined),
    );
    bubble.append(pop);
  }

  function reportFlow(m: CircleChat) {
    const card = h("div", { class: "bvo-card" }, h("h2", {}, t("circle.reportTitle")), h("p", { class: "bvo-muted" }, `“${m.text}”`));
    const el = h("div", { class: "bvo-screen", role: "dialog" }, card);
    for (const reason of ["harassment", "harmful", "spam", "other"] as const) {
      card.append(
        h(
          "button",
          {
            class: "bvo-btn secondary",
            type: "button",
            on: {
              click: async () => {
                el.remove();
                try {
                  await api("/api/reports", { body: { reportedUserId: m.from.id, context: { circleId, messageId: m.id }, reason } });
                  toast(t("circle.reported"));
                } catch {
                  toast(t("circle.reportedAlready"));
                }
              },
            },
          },
          t(`circle.reason.${reason}`),
        ),
      );
    }
    card.append(h("button", { class: "bvo-btn", type: "button", on: { click: () => el.remove() } }, t("world.close")));
    root.append(el);
  }

  function addChat(m: CircleChat) {
    if (m.from.id === me.id) {
      const p = [...pending.entries()].find(([, el]) => el.dataset.text === m.text);
      if (p) {
        pending.delete(p[0]);
        p[1].classList.remove("pending");
        p[1].dataset.id = m.id;
        return;
      }
    }
    const mine = m.from.id === me.id;
    const bubble = h(
      "div",
      { class: `bvo-msg ${mine ? "user" : "doctor"}`, "data-id": m.id, "data-from": m.from.id },
      mine ? null : h("strong", { class: "bvo-nick" }, m.from.nickname),
      h("span", {}, m.text),
    );
    if (!mine) {
      const more = h("button", { class: "bvo-more", type: "button", "aria-label": t("circle.more", { name: m.from.nickname }) }, "⋯");
      more.addEventListener("click", (e) => {
        e.stopPropagation();
        bubble.querySelector(".bvo-pop")?.remove();
        menuFor(m, bubble);
      });
      bubble.prepend(more);
      const thanks = h("button", { class: "bvo-thank", type: "button", "aria-label": t("circle.thank", { name: m.from.nickname }) }, "🙏");
      thanks.addEventListener("click", () => {
        client.thank(m.id);
        thanks.setAttribute("disabled", "");
      });
      bubble.append(thanks);
    }
    if (muted.has(m.from.id)) bubble.style.display = "none";
    msgs.append(bubble);
    scroll();
  }

  function applyFilters() {
    msgs.querySelectorAll<HTMLElement>("[data-from]").forEach((n) => (n.style.display = muted.has(n.dataset.from!) ? "none" : ""));
  }

  function system(text: string, cls = "bvo-system") {
    msgs.append(h("div", { class: cls }, text));
    scroll();
  }

  function renderSeat(seat: number, userId: string | null, nickname?: string, avatar?: unknown) {
    if (userId) seats.set(seat, { userId, nickname: nickname ?? "" });
    else seats.delete(seat);
    if (userId === me.id) mySeat = seat;
    else if (mySeat === seat) mySeat = null;
    scene?.setSeat(seat, userId ? { spec: (avatar as AvatarSpec) ?? null, nickname: nickname ?? nicknameOf(userId) ?? "", mine: userId === me.id } : null);
    const seated = mySeat !== null;
    input.disabled = !seated;
    if (seated) send.removeAttribute("disabled");
    else send.setAttribute("disabled", "");
    input.placeholder = seated ? t("circle.placeholder") : t("circle.sitToChat");
    sitBtn.textContent = seated ? `🧍 ${t("circle.stand")}` : `🪑 ${t("circle.sit")}`;
    title.textContent = `${circleName} · ${t("circle.seats", { n: String(seats.size), max: String(maxSeats) })}`;
  }

  let circleName = "";
  const client = new CircleClient(circleId, {
    onMessage: (m: CircleMsg) => {
      switch (m.t) {
        case "welcome": {
          maxSeats = m.circle.maxSeats;
          circleName = m.circle.name;
          scene?.dispose();
          scene = buildCircleRoom(engine, maxSeats);
          seats.clear();
          mySeat = null;
          msgs.replaceChildren(h("div", { class: "bvo-system" }, t("circle.welcome", { name: m.circle.name })));
          if (m.circle.language !== (document.documentElement.lang === "en" ? "en" : "vi")) system(t("circle.otherLanguage"));
          for (const s of m.seats) renderSeat(s.seat, s.userId, s.nickname, s.avatar);
          renderSeat(-1, null);
          for (const c of m.recent) addChat(c);
          if (m.session) {
            sessionPill.style.display = "";
            sessionPill.textContent = sessionText({ ...m.session, status: m.session.status === "ended" ? "scheduled" : m.session.status });
            scene.setFacilitator(m.session.status === "live", "");
          }
          break;
        }
        case "seat_update":
          renderSeat(m.seat, m.userId, m.nickname, m.avatar);
          break;
        case "chat":
          addChat(m);
          break;
        case "chat_hidden":
          msgs.querySelector(`[data-id="${CSS.escape(m.id)}"]`)?.remove();
          break;
        case "chat_rejected": {
          const el = pending.get(m.clientMsgId);
          pending.delete(m.clientMsgId);
          if (el) {
            el.classList.remove("pending");
            el.classList.add("rejected");
            el.append(h("div", { class: "bvo-muted" }, t(`circle.rejected.${m.reason}`)));
          }
          break;
        }
        case "support": {
          quietQuestNudges();
          const b = h("div", { class: "bvo-msg safety" }, h("span", {}, m.message), resourcesBlock(m.resources as SupportResource[]));
          msgs.append(b);
          scroll();
          break;
        }
        case "facilitator": {
          scene?.setFacilitator(true, m.doctor.name);
          msgs.append(h("div", { class: "bvo-msg doctor facilitator" }, h("span", { class: "bvo-ai" }, t("chat.aiLabel")), h("strong", { class: "bvo-nick" }, m.doctor.name), h("span", {}, m.text)));
          scroll();
          break;
        }
        case "thanked": {
          const b = msgs.querySelector(`[data-id="${CSS.escape(m.messageId)}"]`);
          let badge = b?.querySelector<HTMLElement>(".bvo-thanks");
          if (b && !badge) {
            badge = h("span", { class: "bvo-thanks" });
            b.append(badge);
          }
          if (badge) badge.textContent = `🙏 ${m.count}`;
          break;
        }
        case "quest_progress":
          if (m.status === "done" && !questNudgesQuiet()) toast(m.awarded ? t("progress.questDone", { n: String(m.awarded) }) : t("progress.questDoneNoPoints"));
          break;
        case "session":
          sessionPill.style.display = "";
          sessionPill.textContent = m.status === "live" ? t("circle.liveNow", { topic: m.topic }) : t("circle.ended");
          if (m.status === "ended") scene?.setFacilitator(false);
          break;
        case "warn":
          if (m.code === "SEAT_TAKEN") toast(t("circle.seatTaken"));
          else if (m.code === "NOT_SEATED") toast(t("circle.sitToChat"));
          else toast(t("errors.RATE_LIMITED"));
          break;
      }
    },
    onStatus: (s) => (status.style.display = s === "reconnecting" ? "" : "none"),
    onKicked: (reason) => {
      toast(reason === "CIRCLE_FULL" ? t("circle.full") : reason === "DUPLICATE" ? t("world.kicked") : t("errors.SUSPENDED"));
      opts.leave();
    },
  });
  client.connect();

  const submit = () => {
    const text = input.value.trim();
    if (!text || mySeat === null) return;
    input.value = "";
    const id = `c${Date.now()}-${seq++}`;
    const el = h("div", { class: "bvo-msg user pending", "data-text": text }, h("span", {}, text));
    pending.set(id, el);
    msgs.append(el);
    scroll();
    client.chat(text, id);
  };
  send.addEventListener("click", submit);
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  });

  const firstFree = () => {
    for (let i = 0; i < maxSeats; i++) if (!seats.has(i)) return i;
    return null;
  };
  sitBtn.addEventListener("click", () => {
    if (mySeat !== null) return client.stand();
    const s = firstFree();
    if (s === null) toast(t("circle.noFreeSeat"));
    else client.sit(s);
  });
  rulesBtn.addEventListener("click", () => void showRules(root, true));
  leaveBtn.addEventListener("click", () => opts.leave());

  // Bấm vào ghế trong cảnh để ngồi.
  const onPointer = (e: PointerEvent) => {
    const seat = scene?.pick(e.clientX, e.clientY);
    if (seat === null || seat === undefined) return;
    if (seats.has(seat)) return seats.get(seat)!.userId === me.id ? undefined : toast(t("circle.seatTaken"));
    client.sit(seat);
  };
  engine.canvas.addEventListener("pointerup", onPointer);
  const closePops = () => msgs.querySelectorAll(".bvo-pop").forEach((p) => p.remove());
  document.addEventListener("click", closePops);

  return {
    dispose() {
      engine.canvas.removeEventListener("pointerup", onPointer);
      document.removeEventListener("click", closePops);
      client.close();
      scene?.dispose();
      chatPanel.remove();
      dock.remove();
      top.remove();
    },
  };
}
