/** Cấu hình đọc từ bảng `settings`, có giá trị mặc định (T012, data-model.md "settings"). */

export interface Settings {
  daily_message_limit: number;
  daily_point_cap: number;
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
  // Điểm cống hiến tối đa mỗi ngày (002 FR-004).
  daily_point_cap: 100,
  zone_capacity: 150,
  lecture_capacity: 200,
  // Workers AI (không cần khóa). SEA-LION được huấn luyện cho tiếng Đông Nam Á, gồm tiếng Việt.
  model_chat: "@cf/aisingapore/gemma-sea-lion-v4-27b-it",
  model_classifier: "@cf/google/gemma-4-26b-a4b-it",
  terms_version: "2026-11-v1",
  default_locale: "vi",
  admin_webhook_url: "",
};

const NUMERIC: (keyof Settings)[] = ["daily_message_limit", "daily_point_cap", "zone_capacity", "lecture_capacity"];

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
