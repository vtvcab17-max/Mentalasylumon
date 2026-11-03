import vi from "./vi.json";
import en from "./en.json";

/** Song ngữ vi/en (T036, FR-036, Constitution V). Khóa giữa hai file được kiểm bởi `pnpm i18n:check`. */

export type Locale = "vi" | "en";
const dicts = { vi, en } as const;
const STORAGE_KEY = "bvo.locale";
let current: Locale = detect();
const listeners = new Set<(l: Locale) => void>();

function readStored(): Locale | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === "vi" || v === "en" ? v : null;
  } catch {
    return null;
  }
}

/** Ngôn ngữ đã chọn; chưa chọn thì gợi ý theo trình duyệt. */
function detect(): Locale {
  return readStored() ?? (navigator.language?.toLowerCase().startsWith("vi") ? "vi" : "en");
}

export const hasChosenLocale = () => readStored() !== null;
export const getLocale = () => current;

export function setLocale(l: Locale) {
  current = l;
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    /* trình duyệt chặn storage: vẫn chạy được trong phiên này */
  }
  document.documentElement.lang = l;
  for (const fn of listeners) fn(l);
}

export const onLocaleChange = (fn: (l: Locale) => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

/** t("help.emergency", { number: "115" }) */
export function t(key: string, vars: Record<string, string> = {}): string {
  let node: unknown = dicts[current];
  for (const part of key.split(".")) node = (node as Record<string, unknown> | undefined)?.[part];
  const s = typeof node === "string" ? node : key;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? `{${k}}`);
}
