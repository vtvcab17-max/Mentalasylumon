import type { AvatarSpec, SupportResource } from "@bvo/shared";
import { t } from "../../i18n";
import { api, ApiError, postSse } from "../../net/api";
import { h, toast } from "../../ui/dom";
import { quietQuestNudges } from "../progress/rank";

/**
 * Trò chuyện với bác sĩ AI trong phòng riêng (T059, FR-012–FR-021, SC-007).
 * Mọi lời bác sĩ mang nhãn "AI". Khối tài nguyên hỗ trợ lấy từ server (không do AI viết).
 */

interface Doctor { id: string; name: string; title: string; bio: string; avatar: AvatarSpec; label: "AI" }
interface Msg { id: string; role: "user" | "doctor" | "safety"; text: string }
interface Usage { used: number; limit: number; resetsAt: string }

const plain = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "$1");

export function resourcesBlock(resources: SupportResource[]) {
  const shown = resources.filter((r) => r.scope === "emergency" || r.onDutyNow || r.scope === "international");
  return h(
    "div",
    { class: "bvo-res" },
    h("div", {}, t("chat.resources")),
    ...shown.map((r) =>
      h(
        "div",
        {},
        "• ",
        r.name,
        ": ",
        r.phone ? h("a", { href: `tel:${r.phone.replace(/\s/g, "")}` }, r.phone) : h("a", { href: r.url!, target: "_blank", rel: "noopener" }, r.url!),
      ),
    ),
  );
}

export function openDoctorChat(root: HTMLElement, opts: { onDoctor(spec: AvatarSpec | null): void; onClose(): void }) {
  const title = h("h2", {}, t("chat.chooseDoctor"));
  const usageEl = h("span", { class: "bvo-muted" });
  const body = h("div", { style: "flex:1;display:flex;flex-direction:column;min-height:0" });
  const closeBtn = h("button", { class: "bvo-x", type: "button", "aria-label": t("chat.close") }, "×");
  const panel = h("aside", { class: "bvo-panel", role: "dialog", "aria-label": t("room.callDoctor") }, h("header", {}, title, usageEl, closeBtn), body);
  root.append(panel);

  let currentConv: string | null = null;
  let exchanged = false;

  const showUsage = (u: { used: number; limit: number }) => (usageEl.textContent = t("chat.usage", { left: String(Math.max(u.limit - u.used, 0)), limit: String(u.limit) }));
  api<Usage>("/api/usage").then(showUsage).catch(() => undefined);

  async function listDoctors() {
    title.textContent = t("chat.chooseDoctor");
    opts.onDoctor(null);
    const doctors = await api<Doctor[]>("/api/doctors");
    body.replaceChildren(
      h(
        "div",
        { class: "bvo-doctors" },
        h("p", { class: "bvo-muted" }, t("chat.disclaimer")),
        ...doctors.map((d) =>
          h(
            "button",
            { class: "bvo-doctor", type: "button", on: { click: () => openWith(d) } },
            h("strong", {}, h("span", { class: "bvo-ai" }, t("chat.aiLabel")), d.title),
            h("div", { class: "bvo-muted" }, d.bio),
          ),
        ),
      ),
    );
  }

  async function openWith(d: Doctor) {
    title.textContent = d.title;
    opts.onDoctor(d.avatar);
    const convs = await api<{ id: string; doctorId: string }[]>("/api/conversations");
    currentConv = convs.find((c) => c.doctorId === d.id)?.id ?? (await api<{ conversationId: string }>("/api/conversations", { body: { doctorId: d.id } })).conversationId;
    exchanged = false;
    const page = await api<{ messages: Msg[] }>(`/api/conversations/${currentConv}/messages`);

    const msgs = h("div", { class: "bvo-msgs", "aria-live": "polite" });
    const addBubble = (role: Msg["role"], text: string) => {
      const b = h("div", { class: `bvo-msg ${role}` }, role !== "user" ? h("span", { class: "bvo-ai" }, t("chat.aiLabel")) : null, h("span", {}, plain(text)));
      msgs.append(b);
      msgs.scrollTop = msgs.scrollHeight;
      return b;
    };
    for (const m of page.messages) addBubble(m.role, m.text);

    const input = h("textarea", { class: "bvo-input", placeholder: t("chat.placeholder"), maxlength: "1000", rows: "1" }) as HTMLTextAreaElement;
    const send = h("button", { class: "bvo-btn", type: "button" }, t("chat.send"));
    const toolbar = h(
      "div",
      { class: "bvo-row", style: "padding:8px 12px 0" },
      h("button", { class: "bvo-btn secondary", type: "button", on: { click: () => void closeConversation().then(listDoctors) } }, t("chat.back")),
      h(
        "button",
        {
          class: "bvo-btn danger",
          type: "button",
          on: {
            click: async () => {
              if (!currentConv || !confirm(t("chat.confirmDeleteConv"))) return;
              await api(`/api/conversations/${currentConv}`, { method: "DELETE" });
              currentConv = null;
              exchanged = false;
              await listDoctors();
            },
          },
        },
        t("chat.deleteConv"),
      ),
    );

    const submit = async () => {
      const text = input.value.trim();
      if (!text || !currentConv) return;
      input.value = "";
      send.setAttribute("disabled", "");
      addBubble("user", text);
      const thinking = addBubble("doctor", t("chat.thinking"));
      const out = thinking.lastElementChild as HTMLSpanElement;
      let acc = "";
      try {
        for await (const ev of postSse(`/api/conversations/${currentConv}/messages`, { text })) {
          const data = ev.data as Record<string, unknown>;
          if (ev.event === "token") {
            acc += String(data.text ?? "");
            out.textContent = acc;
          } else if (ev.event === "crisis") {
            quietQuestNudges();
            thinking.className = "bvo-msg safety";
            out.textContent = plain(String(data.message));
            thinking.append(resourcesBlock(data.resources as SupportResource[]));
          } else if (ev.event === "done") {
            exchanged = true;
            showUsage(data.usage as Usage);
            if (data.resources) thinking.append(resourcesBlock(data.resources as SupportResource[]));
          } else if (ev.event === "error") {
            out.textContent = t("chat.unavailable");
          }
          msgs.scrollTop = msgs.scrollHeight;
        }
      } catch (e) {
        out.textContent = e instanceof ApiError && e.code === "DAILY_LIMIT_REACHED" ? t("chat.limit") : t("chat.unavailable");
      } finally {
        send.removeAttribute("disabled");
        input.focus();
      }
    };
    send.addEventListener("click", submit);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void submit();
      }
    });

    body.replaceChildren(toolbar, msgs, h("div", { class: "bvo-compose" }, input, send));
    input.focus();
  }

  /** Sau khi đã trò chuyện, hỏi "được lắng nghe?" một lần, bỏ qua được (SC-007). */
  function closeConversation(): Promise<void> {
    if (!exchanged || !currentConv) return Promise.resolve();
    const conv = currentConv;
    exchanged = false;
    return new Promise((resolve) => {
      const answer = async (v: "yes" | "somewhat" | "no" | null) => {
        if (v) {
          await api("/api/feedback", { body: { conversationId: conv, feltHeard: v } }).catch(() => undefined);
          toast(t("feedback.thanks"));
        }
        resolve();
      };
      body.replaceChildren(
        h(
          "div",
          { class: "bvo-doctors" },
          h("h3", {}, t("feedback.question")),
          h(
            "div",
            { class: "bvo-row" },
            ...(["yes", "somewhat", "no"] as const).map((v) => h("button", { class: "bvo-btn", type: "button", on: { click: () => answer(v) } }, t(`feedback.${v}`))),
          ),
          h("button", { class: "bvo-btn secondary", type: "button", on: { click: () => answer(null) } }, t("feedback.skip")),
        ),
      );
    });
  }

  closeBtn.addEventListener("click", async () => {
    await closeConversation();
    opts.onDoctor(null);
    panel.remove();
    opts.onClose();
  });

  void listDoctors().catch((e) => {
    body.replaceChildren(h("p", { class: "bvo-error", style: "padding:16px" }, e instanceof ApiError ? e.message : t("errors.network")));
  });
}
