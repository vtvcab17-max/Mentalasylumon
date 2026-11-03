/** Dựng DOM an toàn: chữ luôn đi qua textContent (không innerHTML với dữ liệu người dùng/AI). */

type Child = Node | string | null | undefined | false;
type Props = Record<string, unknown> & { class?: string; on?: Record<string, (e: Event) => void> };

export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === "on") for (const [ev, fn] of Object.entries(v as Record<string, (e: Event) => void>)) el.addEventListener(ev, fn);
    else if (k === "class") el.className = String(v);
    else if (v === true) el.setAttribute(k, "");
    else if (v !== false && v != null) el.setAttribute(k, String(v));
  }
  for (const c of children) if (c) el.append(c);
  return el;
}

/** Màn hình phủ toàn bộ (onboarding) hoặc tấm panel. Trả về hàm đóng. */
export function screen(root: HTMLElement, content: HTMLElement): () => void {
  root.replaceChildren(h("div", { class: "bvo-screen" }, h("div", { class: "bvo-card" }, content)));
  return () => root.replaceChildren();
}

export function toast(text: string) {
  const el = h("div", { class: "bvo-toast", role: "status" }, text);
  document.body.append(el);
  setTimeout(() => el.remove(), 3500);
}
