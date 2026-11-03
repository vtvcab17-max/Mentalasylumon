import { AgeBody, ConsentBody, ProfileBody, isValidAvatar } from "@bvo/shared";
import type { Hono } from "hono";
import { getSettings } from "../db/settings";
import { normalize } from "../safety/keywords";
import { loadResourceRows, toPublic } from "../safety/resources";
import { nowIso, type AppEnv } from "../types";
import { assignRoom } from "../world/rooms";
import { apiError, requestLocale } from "./errors";
import { requireUser } from "./guards";

/** Vào viện lần đầu: 18+ → đồng ý điều khoản → biệt danh + nhân vật → cấp phòng (T048, FR-002–FR-004, FR-007). */

// Biệt danh không được chứa từ thô tục, xúc phạm hoặc gợi khủng hoảng (so trên dạng bỏ dấu).
// Chỉ so nguyên từ, để không chặn nhầm tên thật (vd "Điền", "Buổi Sáng").
const BANNED_NICK = ["dit", "dm", "dcm", "vcl", "vl", "cc", "deo", "tu sat", "chet", "fuck", "shit", "bitch", "suicide", "kill", "admin", "bac si", "doctor", "quan tri", "moderator"];

function nicknameAllowed(nick: string) {
  const n = ` ${normalize(nick)} `;
  return !BANNED_NICK.some((w) => n.includes(` ${w} `));
}

export function registerOnboarding(app: Hono<AppEnv>) {
  app.post("/api/onboarding/age", requireUser, async (c) => {
    const parsed = AgeBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return apiError(c, "VALIDATION", 400);
    const user = c.get("user")!;
    if (!parsed.data.isAdult) {
      const locale = requestLocale(c);
      const resources = toPublic(await loadResourceRows(c.env.DB), locale, new Date()).filter(
        (r) => r.scope === "youth" || r.scope === "emergency",
      );
      return apiError(c, "UNDERAGE", 403, { resources });
    }
    await c.env.DB.prepare("UPDATE users SET age_confirmed_at = COALESCE(age_confirmed_at, ?) WHERE id = ?").bind(nowIso(), user.id).run();
    return c.body(null, 204);
  });

  app.post("/api/onboarding/consent", requireUser, async (c) => {
    const user = c.get("user")!;
    if (!user.age_confirmed_at) return apiError(c, "AGE_REQUIRED", 403);
    const parsed = ConsentBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return apiError(c, "VALIDATION", 400);
    const { terms_version } = await getSettings(c.env.DB);
    if (parsed.data.termsVersion !== terms_version) return apiError(c, "CONSENT_REQUIRED", 409, { termsVersion: terms_version });
    await c.env.DB.prepare("INSERT INTO consents (id, user_id, terms_version, items, granted_at) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), user.id, terms_version, JSON.stringify(parsed.data.items), nowIso())
      .run();
    return c.body(null, 204);
  });

  app.post("/api/onboarding/profile", requireUser, async (c) => {
    const user = c.get("user")!;
    if (!user.age_confirmed_at) return apiError(c, "AGE_REQUIRED", 403);
    const { terms_version } = await getSettings(c.env.DB);
    const consent = await c.env.DB.prepare(
      "SELECT 1 FROM consents WHERE user_id = ? AND terms_version = ? AND withdrawn_at IS NULL LIMIT 1",
    )
      .bind(user.id, terms_version)
      .first();
    if (!consent) return apiError(c, "CONSENT_REQUIRED", 403, { termsVersion: terms_version });

    const parsed = ProfileBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success || !isValidAvatar(parsed.data.avatar)) return apiError(c, "VALIDATION", 400, { fields: ["nickname", "avatar"] });
    const nickname = parsed.data.nickname.normalize("NFC").replace(/\s+/g, " ");
    if (!nicknameAllowed(nickname)) return apiError(c, "VALIDATION", 400, { fields: ["nickname"] });

    try {
      await c.env.DB.prepare("UPDATE users SET nickname = ?, nickname_lc = ?, avatar = ? WHERE id = ?")
        .bind(nickname, nickname.toLocaleLowerCase("vi"), JSON.stringify(parsed.data.avatar), user.id)
        .run();
    } catch (e) {
      if (/UNIQUE/i.test(String(e))) return apiError(c, "NICKNAME_TAKEN", 409, { fields: ["nickname"] });
      throw e;
    }
    const room = await assignRoom(c.env.DB, user.id);
    return c.json({ roomId: room.roomId, wing: room.wing, floor: room.floor, roomNumber: room.roomNumber });
  });
}
