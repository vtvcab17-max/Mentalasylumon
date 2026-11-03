/** Cấu hình đọc từ bảng `settings`, có giá trị mặc định (T012, data-model.md "settings"). */

export interface Settings {
  daily_message_limit: number;
  zone_capacity: number;
  lecture_capacity: number;
  model_chat: string;
  model_classifier: string;
  terms_version: string;
  default_locale: "vi" | "en";
  admin_webhook_url: string;
}

export const DEFAULT_SETTINGS: Settings = {
  daily_message_limit: 20,
  zone_capacity: 150,
  lecture_capacity: 200,
  model_chat: "claude-haiku-5-5",
  model_classifier: "claude-haiku-5-5",
  terms_version: "2026-11-v1",
  default_locale: "vi",
  admin_webhook_url: "",
};

const NUMERIC: (keyof Settings)[] = ["daily_message_limit", "zone_capacity", "lecture_capacity"];

export async function getSettings(db: D1Database): Promise<Settings> {
  const { results } = await db.prepare("SELECT key, value FROM settings").all<{ key: string; value: string }>();
  const s: Record<string, unknown> = { ...DEFAULT_SETTINGS };
  for (const { key, value } of results) {
    if (!(key in DEFAULT_SETTINGS)) continue;
    if (NUMERIC.includes(key as keyof Settings)) {
      const n = Number(value);
      if (Number.isFinite(n) && n > 0) s[key] = n;
    } else if (key === "default_locale") {
      if (value === "vi" || value === "en") s[key] = value;
    } else {
      s[key] = value;
    }
  }
  return s as unknown as Settings;
}
