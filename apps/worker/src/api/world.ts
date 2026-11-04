import { AVATAR_CATALOG } from "@bvo/shared";
import type { Hono } from "hono";
import { z } from "zod";
import { getSettings } from "../db/settings";
import type { WorldZone } from "../do/world-zone";
import type { AppEnv } from "../types";
import { DEFAULT_LAYOUT, findRoom } from "../world/rooms";
import { apiError } from "./errors";
import { requireOnboarded, requireUser } from "./guards";

/** Thế giới chung (T066, contracts/http-api.md "Thế giới"). */

/** Tên zone hợp lệ: lobby-N, garden-N, wing<A..>-floor<1..10>-N. */
export const ZONE_RE = /^(lobby|garden|wing[A-Z]{1,3}-floor(?:[1-9]|10))-([1-9]\d{0,2})$/;
const MAX_INSTANCES = 50;

const JoinBody = z.discriminatedUnion("area", [
  z.object({ area: z.literal("lobby") }),
  z.object({ area: z.literal("garden") }),
  z.object({ area: z.literal("floor"), wing: z.string().regex(/^[A-Z]{1,3}$/), floor: z.number().int().min(1).max(10) }),
]);

export function registerWorld(app: Hono<AppEnv>) {
  const guard = [requireUser, requireOnboarded] as const;

  app.get("/api/avatar-catalog", ...guard, (c) => c.json(AVATAR_CATALOG));

  app.get("/api/world/layout", ...guard, async (c) => {
    const { results } = await c.env.DB.prepare(
      "SELECT w.name AS wing, f.floor_number AS floor FROM wings w JOIN floors f ON f.wing_id = w.id ORDER BY w.sort, f.floor_number",
    ).all<{ wing: string; floor: number }>();
    const wings = new Map<string, number[]>();
    for (const r of results) wings.set(r.wing, [...(wings.get(r.wing) ?? []), r.floor]);
    const room = await findRoom(c.env.DB, c.get("user")!.id);
    return c.json({
      wings: [...wings].map(([name, floors]) => ({ name, floors })),
      roomsPerFloor: DEFAULT_LAYOUT.roomsPerFloor,
      myRoom: room ? { wing: room.wing, floor: room.floor, roomNumber: room.roomNumber } : null,
    });
  });

  app.post("/api/world/join", ...guard, async (c) => {
    const parsed = JoinBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return apiError(c, "VALIDATION", 400);
    const body = parsed.data;
    let base: string;
    if (body.area === "floor") {
      const exists = await c.env.DB.prepare(
        "SELECT 1 FROM floors f JOIN wings w ON w.id = f.wing_id WHERE w.name = ? AND f.floor_number = ?",
      )
        .bind(body.wing, body.floor)
        .first();
      if (!exists) return apiError(c, "VALIDATION", 400, { fields: ["wing", "floor"] });
      base = `wing${body.wing}-floor${body.floor}`;
    } else {
      base = body.area;
    }

    const { zone_capacity } = await getSettings(c.env.DB);
    const userId = c.get("user")!.id;
    let zoneId = `${base}-1`;
    for (let n = 1; n <= MAX_INSTANCES; n++) {
      zoneId = `${base}-${n}`;
      const stub = c.env.WORLD_ZONE.get(c.env.WORLD_ZONE.idFromName(zoneId)) as DurableObjectStub<WorldZone>;
      if ((await stub.count(userId)) < zone_capacity) break;
    }
    return c.json({ zoneId, wsUrl: `/ws/zone/${zoneId}` });
  });
}
