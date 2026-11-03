import { LocaleBody } from "@bvo/shared";
import type { Hono } from "hono";
import { TERMS } from "../content/terms";
import { getSettings } from "../db/settings";
import type { AppEnv } from "../types";
import { findRoom } from "../world/rooms";
import { apiError, requestLocale } from "./errors";
import { requireUser } from "./guards";

/** GET /api/me, PUT /api/me/locale, GET /api/terms (T047). Không bao giờ trả email. */
export function registerMe(app: Hono<AppEnv>) {
  app.get("/api/terms", async (c) => {
    const locale = requestLocale(c);
    const { terms_version } = await getSettings(c.env.DB);
    return c.json({ version: terms_version, locale, ...TERMS[locale] });
  });

  app.get("/api/me", requireUser, async (c) => {
    const u = c.get("user")!;
    const { terms_version } = await getSettings(c.env.DB);
    const consent = await c.env.DB.prepare(
      "SELECT 1 FROM consents WHERE user_id = ? AND terms_version = ? AND withdrawn_at IS NULL LIMIT 1",
    )
      .bind(u.id, terms_version)
      .first();
    const room = await findRoom(c.env.DB, u.id);
    return c.json({
      id: u.id,
      nickname: u.nickname,
      avatar: u.avatar ? JSON.parse(u.avatar) : null,
      locale: u.locale,
      role: u.role,
      status: u.status,
      room: room ? { id: room.roomId, wing: room.wing, floor: room.floor, roomNumber: room.roomNumber } : null,
      termsVersion: terms_version,
      onboarding: { age: !!u.age_confirmed_at, consent: !!consent, profile: !!(u.nickname && u.avatar) },
    });
  });

  app.put("/api/me/locale", requireUser, async (c) => {
    const parsed = LocaleBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return apiError(c, "VALIDATION", 400);
    await c.env.DB.prepare("UPDATE users SET locale = ? WHERE id = ?").bind(parsed.data.locale, c.get("user")!.id).run();
    return c.body(null, 204);
  });
}
