import type { Hono } from "hono";
import { z } from "zod";
import { apiError } from "../api/errors";
import { requireAdmin } from "../api/guards";
import { circleStub, CIRCLE_ID_RE } from "../api/circles";
import { type AppEnv } from "../types";
import { nowIso } from "../types";

/** CRUD vòng sinh hoạt và lịch sinh hoạt (T084, FR-023, FR-024, FR-034, FR-038). */

const CircleBody = z.object({
  id: z.string().regex(CIRCLE_ID_RE),
  name: z.string().trim().min(2).max(60),
  language: z.enum(["vi", "en"]),
  maxSeats: z.number().int().min(4).max(20).default(12),
  active: z.boolean().default(true),
  sort: z.number().int().default(0),
});

const SessionBody = z
  .object({
    circleId: z.string().regex(CIRCLE_ID_RE),
    doctorId: z.string().min(1).max(64),
    topic: z.string().trim().min(2).max(120),
    startsAt: z.string().datetime(),
    endsAt: z.string().datetime(),
  })
  .refine((s) => Date.parse(s.endsAt) > Date.parse(s.startsAt), { path: ["endsAt"] });

const toIso = (s: string) => new Date(s).toISOString();

export function registerAdminCircles(app: Hono<AppEnv>) {
  app.get("/admin/api/circles", requireAdmin, async (c) => {
    const { results } = await c.env.DB.prepare("SELECT id, name, language, max_seats, active, sort FROM circles ORDER BY sort, name").all();
    return c.json(results);
  });

  app.put("/admin/api/circles/:id", requireAdmin, async (c) => {
    const parsed = CircleBody.safeParse({ ...((await c.req.json().catch(() => ({}))) as object), id: c.req.param("id") });
    if (!parsed.success) return apiError(c, "VALIDATION", 400);
    const b = parsed.data;
    await c.env.DB.prepare(
      `INSERT INTO circles (id, name, language, max_seats, active, sort, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET name = excluded.name, language = excluded.language, max_seats = excluded.max_seats,
         active = excluded.active, sort = excluded.sort`,
    )
      .bind(b.id, b.name, b.language, b.maxSeats, b.active ? 1 : 0, b.sort, nowIso())
      .run();
    return c.json({ ok: true });
  });

  app.get("/admin/api/circle-sessions", requireAdmin, async (c) => {
    const { results } = await c.env.DB.prepare(
      "SELECT id, circle_id, doctor_id, topic, starts_at, ends_at, status FROM circle_sessions WHERE ends_at > ? ORDER BY starts_at LIMIT 200",
    )
      .bind(new Date(Date.now() - 7 * 86400_000).toISOString())
      .all();
    return c.json(results);
  });

  app.post("/admin/api/circle-sessions", requireAdmin, async (c) => {
    const parsed = SessionBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return apiError(c, "VALIDATION", 400);
    const b = parsed.data;
    const ok = await c.env.DB.prepare("SELECT (SELECT 1 FROM circles WHERE id = ?) AS c, (SELECT 1 FROM doctors WHERE id = ? AND active = 1) AS d")
      .bind(b.circleId, b.doctorId)
      .first<{ c: number | null; d: number | null }>();
    if (!ok?.c || !ok?.d) return apiError(c, "VALIDATION", 400, { fields: [!ok?.c ? "circleId" : "doctorId"] });
    const id = crypto.randomUUID();
    await c.env.DB.prepare("INSERT INTO circle_sessions (id, circle_id, doctor_id, topic, starts_at, ends_at, status) VALUES (?, ?, ?, ?, ?, ?, 'scheduled')")
      .bind(id, b.circleId, b.doctorId, b.topic, toIso(b.startsAt), toIso(b.endsAt))
      .run();
    await circleStub(c.env, b.circleId).refreshSchedule(b.circleId);
    return c.json({ id }, 201);
  });

  app.delete("/admin/api/circle-sessions/:id", requireAdmin, async (c) => {
    const s = await c.env.DB.prepare("SELECT circle_id FROM circle_sessions WHERE id = ? AND status = 'scheduled'")
      .bind(c.req.param("id"))
      .first<{ circle_id: string }>();
    if (!s) return apiError(c, "NOT_FOUND", 404);
    await c.env.DB.prepare("DELETE FROM circle_sessions WHERE id = ?").bind(c.req.param("id")).run();
    await circleStub(c.env, s.circle_id).refreshSchedule(s.circle_id);
    return c.body(null, 204);
  });
}
