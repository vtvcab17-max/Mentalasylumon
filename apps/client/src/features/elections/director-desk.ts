import { t } from "../../i18n";
import { api, ApiError } from "../../net/api";
import { h, toast } from "../../ui/dom";
import type { WorldState } from "./council";

/**
 * Bàn làm việc Viện trưởng (002 US5, FR-022–FR-024): đúng 5 quyền trong game, chọn từ danh mục đã duyệt.
 * Không có nút nào đọc dữ liệu người khác hay khóa người chơi — và máy chủ cũng không có API như vậy.
 */

interface Item {
  id: string;
  title: string;
  desc: string;
}

export async function openDirectorDesk(root: HTMLElement, onChange: () => void) {
  root.querySelector(".bvo-desk")?.remove();
  const closeBtn = h("button", { class: "bvo-x", type: "button", "aria-label": t("world.close") }, "×");
  const body = h("div", { class: "bvo-doctors" }, h("p", { class: "bvo-muted" }, t("circle.loading")));
  const panel = h(
    "aside",
    { class: "bvo-panel bvo-desk", role: "dialog", "aria-label": t("director.desk") },
    h("header", {}, h("h2", {}, `🪑 ${t("director.desk")}`), closeBtn),
    body,
  );
  closeBtn.addEventListener("click", () => panel.remove());
  root.append(panel);

  let state: WorldState;
  let themes: Item[], decors: Item[], quests: Item[];
  try {
    [state, themes, decors, quests] = await Promise.all([
      api<WorldState>("/api/world/state"),
      api<Item[]>("/api/catalog?kind=theme"),
      api<Item[]>("/api/catalog?kind=decor"),
      api<Item[]>("/api/catalog?kind=weekly_quest"),
    ]);
  } catch {
    body.replaceChildren(h("p", { class: "bvo-error" }, t("errors.network")));
    return;
  }

  const send = async (path: string, payload: unknown, ok = t("director.saved")) => {
    try {
      await api(path, { body: payload });
      toast(ok);
      onChange();
      return true;
    } catch (e) {
      toast(e instanceof ApiError ? e.message : t("errors.network"));
      return false;
    }
  };

  const pick = (name: string, items: Item[], current: string | null, path: string, key: string) =>
    h(
      "div",
      { class: "bvo-quest" },
      h("div", { class: "bvo-qtitle" }, t(`director.power.${name}`)),
      h(
        "div",
        { class: "bvo-chips" },
        ...items.map((i) =>
          h(
            "button",
            {
              class: "bvo-chip",
              type: "button",
              title: i.desc,
              "aria-pressed": String(i.id === current),
              on: {
                click: async (ev: Event) => {
                  // currentTarget mất sau lần await đầu tiên — giữ lại trước.
                  const btn = ev.currentTarget as HTMLElement;
                  if (await send(path, { [key]: i.id })) {
                    btn.parentElement!.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", "false"));
                    btn.setAttribute("aria-pressed", "true");
                  }
                },
              },
            },
            i.title,
          ),
        ),
      ),
    );

  // Nhiệm vụ tuần: tối đa 3.
  const qBoxes = quests.map((q) => {
    const input = h("input", { type: "checkbox", value: q.id }) as HTMLInputElement;
    return h("label", { class: "bvo-chip", title: q.desc }, input, ` ${q.title}`);
  });
  const qSave = h("button", { class: "bvo-btn secondary", type: "button" }, t("progress.save"));
  qSave.addEventListener("click", () => {
    const ids = qBoxes.map((b) => b.querySelector("input")!).filter((i) => i.checked).map((i) => i.value);
    if (ids.length > 3) return toast(t("council.max3"));
    void send("/api/director/quests", { questIds: ids });
  });

  const ann = h("textarea", { class: "bvo-input", maxlength: "200", rows: "2", placeholder: t("director.announcePh") }) as HTMLTextAreaElement;
  const annBtn = h("button", { class: "bvo-btn secondary", type: "button" }, `📢 ${t("director.announceSend")}`);
  annBtn.addEventListener("click", async () => {
    if (ann.value.trim() && (await send("/api/director/announce", { text: ann.value.trim() }, t("director.announced")))) ann.value = "";
  });

  const hon = [0, 1].map(() => h("input", { class: "bvo-input", maxlength: "20", placeholder: t("director.honoraryPh") }) as HTMLInputElement);
  state.honorary.forEach((n, i) => {
    if (hon[i]) hon[i].value = n;
  });
  const honBtn = h("button", { class: "bvo-btn secondary", type: "button" }, t("progress.save"));
  honBtn.addEventListener("click", () => void send("/api/director/honorary", { nicknames: hon.map((i) => i.value.trim()).filter(Boolean) }));

  body.replaceChildren(
    h("p", { class: "bvo-muted" }, t("director.intro")),
    pick("theme", themes, state.theme?.id ?? null, "/api/director/theme", "themeId"),
    pick("decor", decors, state.decor?.id ?? null, "/api/director/decor", "decorId"),
    h("div", { class: "bvo-quest" }, h("div", { class: "bvo-qtitle" }, t("director.power.quests")), h("div", { class: "bvo-chips" }, ...qBoxes), qSave),
    h("div", { class: "bvo-quest" }, h("div", { class: "bvo-qtitle" }, t("director.power.announce")), h("div", { class: "bvo-muted" }, t("director.announceRule")), ann, annBtn),
    h("div", { class: "bvo-quest" }, h("div", { class: "bvo-qtitle" }, t("director.power.honorary")), ...hon, honBtn),
    h("p", { class: "bvo-muted", style: "font-size:12px" }, t("director.limits")),
  );
}
