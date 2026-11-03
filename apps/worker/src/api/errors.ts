import type { Context } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";
import vi from "../i18n/vi.json";
import en from "../i18n/en.json";

export type Locale = "vi" | "en";
export type ErrorCode = keyof typeof vi.errors;

const messages = { vi: vi.errors, en: en.errors } as const;

/** Ngôn ngữ của request: user.locale → ?lang → Accept-Language → vi. */
export function requestLocale(c: Context): Locale {
  const fromUser = (c.get("user") as { locale?: Locale } | undefined)?.locale;
  if (fromUser) return fromUser;
  const q = c.req.query("lang");
  if (q === "vi" || q === "en") return q;
  const al = c.req.header("Accept-Language") ?? "";
  return /^\s*en\b/i.test(al) ? "en" : "vi";
}

export function apiError(
  c: Context,
  code: ErrorCode,
  status: ContentfulStatusCode,
  extra: Record<string, unknown> = {},
) {
  return c.json({ error: { code, message: messages[requestLocale(c)][code], ...extra } }, status);
}
