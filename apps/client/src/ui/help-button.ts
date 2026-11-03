import type { SupportResource } from "@bvo/shared";
import { getLocale, onLocaleChange, t, type Locale } from "../i18n";

/**
 * Nút "Cần giúp đỡ ngay" — luôn hiện trên mọi màn hình (T037, FR-021, Constitution I).
 * Mất mạng hoặc API lỗi thì dùng danh sách dự phòng nhúng sẵn (giữ đồng bộ với seed/dev.sql).
 */

const FALLBACK: Record<Locale, SupportResource[]> = {
  vi: [
    { id: "emergency-115", name: "Cấp cứu y tế", phone: "115", url: null, scope: "emergency", hours: "24/7", onDutyNow: true },
    { id: "police-113", name: "Công an", phone: "113", url: null, scope: "emergency", hours: "24/7", onDutyNow: true },
    { id: "ngay-mai", name: "Đường dây nóng Ngày Mai", phone: "096 306 1414", url: null, scope: "crisis", hours: "13:00–20:30 T4, T5, T6, T7, CN", onDutyNow: false },
    { id: "hope", name: "Hy Vọng Sống (HOPE)", phone: "086 50 444 00", url: null, scope: "crisis", hours: "16:30–20:30 hằng ngày", onDutyNow: false },
  ],
  en: [
    { id: "emergency-115", name: "Medical emergency", phone: "115", url: null, scope: "emergency", hours: "24/7", onDutyNow: true },
    { id: "police-113", name: "Police", phone: "113", url: null, scope: "emergency", hours: "24/7", onDutyNow: true },
    { id: "ngay-mai", name: "Ngày Mai (Tomorrow) Hotline", phone: "096 306 1414", url: null, scope: "crisis", hours: "13:00–20:30 Wed, Thu, Fri, Sat, Sun", onDutyNow: false },
    { id: "hope", name: "HOPE Suicide Prevention Hotline", phone: "086 50 444 00", url: null, scope: "crisis", hours: "16:30–20:30 daily", onDutyNow: false },
    { id: "find-a-helpline", name: "Find A Helpline (outside Vietnam)", phone: null, url: "https://findahelpline.com", scope: "international", hours: "24/7", onDutyNow: true },
  ],
};

const STYLE = `
.bvo-help-btn{position:fixed;right:16px;bottom:calc(16px + env(safe-area-inset-bottom));z-index:2147483000;
  background:#c0392b;color:#fff;border:0;border-radius:999px;padding:12px 18px;font:600 15px/1 system-ui,sans-serif;
  box-shadow:0 4px 14px rgba(0,0,0,.25);cursor:pointer}
.bvo-help-btn:focus-visible{outline:3px solid #fff;outline-offset:2px}
.bvo-help-panel{position:fixed;inset:0;z-index:2147483001;background:rgba(0,0,0,.45);display:flex;align-items:flex-end;justify-content:center}
.bvo-help-card{background:#fffdf8;color:#222;width:min(480px,100%);max-height:85vh;overflow:auto;border-radius:16px 16px 0 0;
  padding:20px 16px calc(20px + env(safe-area-inset-bottom));font:15px/1.45 system-ui,sans-serif}
.bvo-help-card h2{margin:0 0 8px;font-size:19px}
.bvo-help-card ul{list-style:none;padding:0;margin:12px 0}
.bvo-help-card li{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:10px 0;border-top:1px solid #eee}
.bvo-help-card a.bvo-act{background:#2e7d6b;color:#fff;text-decoration:none;border-radius:10px;padding:8px 12px;white-space:nowrap}
.bvo-help-card .bvo-off{color:#888;font-size:13px}.bvo-help-card .bvo-on{color:#2e7d6b;font-size:13px}
.bvo-help-card button{margin-top:8px;width:100%;padding:12px;border:0;border-radius:10px;background:#eee;font:inherit;cursor:pointer}`;

async function fetchResources(locale: Locale): Promise<{ list: SupportResource[]; offline: boolean }> {
  try {
    const res = await fetch(`/api/support-resources?lang=${locale}`, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) throw new Error(String(res.status));
    const data = (await res.json()) as { resources: SupportResource[] };
    return data.resources.length ? { list: data.resources, offline: false } : { list: FALLBACK[locale], offline: true };
  } catch {
    return { list: FALLBACK[locale], offline: true };
  }
}

function esc(s: string) {
  return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

export function mountHelpButton(root: HTMLElement = document.body) {
  const style = document.createElement("style");
  style.textContent = STYLE;
  document.head.append(style);

  const btn = document.createElement("button");
  btn.className = "bvo-help-btn";
  btn.type = "button";
  const label = () => (btn.textContent = `🆘 ${t("help.button")}`);
  label();
  onLocaleChange(label);
  root.append(btn);

  btn.addEventListener("click", async () => {
    const locale = getLocale();
    const { list, offline } = await fetchResources(locale);
    const emergency = list.find((r) => r.scope === "emergency")?.phone ?? "115";
    const panel = document.createElement("div");
    panel.className = "bvo-help-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-modal", "true");
    panel.innerHTML = `<div class="bvo-help-card">
      <h2>${esc(t("help.title"))}</h2>
      <p>${esc(t("help.emergency", { number: emergency }))}</p>
      ${offline ? `<p class="bvo-off">${esc(t("help.offline"))}</p>` : ""}
      <ul>${list
        .map((r) => {
          const href = r.phone ? `tel:${r.phone.replace(/\s/g, "")}` : r.url!;
          const act = r.phone ? `${t("help.call")} ${r.phone}` : t("help.open");
          // Ngoại tuyến thì không biết chắc đang trực hay không — chỉ hiện giờ hoạt động.
          const status = offline ? "" : `${esc(r.onDutyNow ? t("help.onDuty") : t("help.offDuty"))} · `;
          const duty = r.scope === "emergency" || r.scope === "international" ? "" : `<div class="${!offline && r.onDutyNow ? "bvo-on" : "bvo-off"}">${status}${esc(r.hours)}</div>`;
          return `<li><div><strong>${esc(r.name)}</strong>${duty}</div><a class="bvo-act" href="${esc(href)}" ${r.phone ? "" : 'target="_blank" rel="noopener"'}>${esc(act)}</a></li>`;
        })
        .join("")}</ul>
      <button type="button" data-close>${esc(t("help.close"))}</button></div>`;
    const close = () => panel.remove();
    panel.addEventListener("click", (e) => {
      if (e.target === panel || (e.target as HTMLElement).dataset.close !== undefined) close();
    });
    document.addEventListener("keydown", function onKey(e) {
      if (e.key === "Escape") {
        close();
        document.removeEventListener("keydown", onKey);
      }
    });
    root.append(panel);
    panel.querySelector<HTMLButtonElement>("[data-close]")?.focus();
  });
}
