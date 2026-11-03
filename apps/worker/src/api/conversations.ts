import { DoctorMessageBody, FeedbackBody } from "@bvo/shared";
import type { Context, Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { doctorReply, HISTORY_LIMIT, type DoctorRow } from "../ai/doctor";
import { AiUnavailableError, type ChatMessage } from "../ai/gateway";
import { decrypt, encrypt } from "../crypto/aes";
import type { PatientRecord } from "../do/patient-record";
import { chatKey } from "../do/key-vault";
import { getSettings } from "../db/settings";
import { createFlag, notifyAdmins } from "../safety/flags";
import { respondSafely, type SafetyDeps } from "../safety/pipeline";
import { loadResourceRows, toPublic } from "../safety/resources";
import { nowIso, type AppEnv } from "../types";
import { apiError } from "./errors";
import { requireOnboarded, requireUser } from "./guards";

/** Phòng riêng ↔ bác sĩ AI (T051, T052, contracts/http-api.md "Bác sĩ AI"). */

/** Ngày theo giờ Việt Nam (lượt hỏi reset lúc 00:00 giờ VN). */
export function vnDate(now = new Date()) {
  return new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}
function vnMidnightIso(now = new Date()) {
  const d = new Date(`${vnDate(now)}T00:00:00+07:00`);
  return new Date(d.getTime() + 86400_000).toISOString();
}

export function recordOf(c: Context<AppEnv>, userId: string) {
  return c.env.PATIENT_RECORD.get(c.env.PATIENT_RECORD.idFromName(userId)) as DurableObjectStub<PatientRecord>;
}

async function loadDoctor(db: D1Database, id: string) {
  return db.prepare("SELECT * FROM doctors WHERE id = ? AND active = 1").bind(id).first<DoctorRow>();
}

function publicDoctor(d: DoctorRow, locale: "vi" | "en") {
  const display = JSON.parse(d.display) as Record<"vi" | "en", { title: string; bio: string }>;
  return { id: d.id, name: d.name, topic: d.topic, title: display[locale].title, bio: display[locale].bio, avatar: JSON.parse(d.avatar), label: "AI" as const };
}

const DoctorIdBody = z.object({ doctorId: z.string().min(1).max(64) });

export function registerConversations(app: Hono<AppEnv>) {
  const guard = [requireUser, requireOnboarded] as const;

  app.get("/api/doctors", ...guard, async (c) => {
    const { results } = await c.env.DB.prepare("SELECT * FROM doctors WHERE active = 1 ORDER BY sort").all<DoctorRow>();
    return c.json(results.map((d) => publicDoctor(d, c.get("user")!.locale)));
  });

  app.get("/api/usage", ...guard, async (c) => {
    const { daily_message_limit } = await getSettings(c.env.DB);
    const used = await recordOf(c, c.get("user")!.id).usage(vnDate());
    return c.json({ used, limit: daily_message_limit, resetsAt: vnMidnightIso() });
  });

  app.get("/api/conversations", ...guard, async (c) => {
    const list = await recordOf(c, c.get("user")!.id).listConversations();
    return c.json(list.map((x) => ({ id: x.id, doctorId: x.doctor_id, startedAt: x.started_at, lastMessageAt: x.last_message_at })));
  });

  app.post("/api/conversations", ...guard, async (c) => {
    const parsed = DoctorIdBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success || !(await loadDoctor(c.env.DB, parsed.data.doctorId))) return apiError(c, "VALIDATION", 400);
    const conversationId = await recordOf(c, c.get("user")!.id).createConversation(parsed.data.doctorId);
    return c.json({ conversationId }, 201);
  });

  app.get("/api/conversations/:id/messages", ...guard, async (c) => {
    const rec = recordOf(c, c.get("user")!.id);
    const conv = await rec.getConversation(c.req.param("id"));
    if (!conv) return apiError(c, "NOT_FOUND", 404);
    const rows = await rec.pageMessages(conv.id, c.req.query("before") ?? null, 50);
    const key = await chatKey(c.env);
    const messages = await Promise.all(
      rows.map(async (m) => ({
        id: m.id,
        role: m.role,
        text: await decrypt(key, m.content),
        lang: m.lang,
        createdAt: m.created_at,
        ...(m.role !== "user" ? { label: "AI" } : {}),
      })),
    );
    return c.json({ conversationId: conv.id, doctorId: conv.doctor_id, messages });
  });

  app.delete("/api/conversations/:id", ...guard, async (c) => {
    await recordOf(c, c.get("user")!.id).deleteConversation(c.req.param("id"));
    return c.body(null, 204);
  });

  app.delete("/api/conversations", ...guard, async (c) => {
    await recordOf(c, c.get("user")!.id).deleteAll();
    return c.body(null, 204);
  });

  app.post("/api/conversations/:id/messages", ...guard, async (c) => {
    const user = c.get("user")!;
    const parsed = DoctorMessageBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return apiError(c, "VALIDATION", 400, { fields: ["text"] });
    const text = parsed.data.text;
    const rec = recordOf(c, user.id);
    const conv = await rec.getConversation(c.req.param("id"));
    if (!conv) return apiError(c, "NOT_FOUND", 404);
    const doctor = await loadDoctor(c.env.DB, conv.doctor_id);
    if (!doctor) return apiError(c, "NOT_FOUND", 404);

    const settings = await getSettings(c.env.DB);
    const today = vnDate();
    const slot = await rec.reserveMessage(today, settings.daily_message_limit);
    if (!slot.ok) return apiError(c, "DAILY_LIMIT_REACHED", 429, { resetsAt: vnMidnightIso() });

    const key = await chatKey(c.env);
    // Lịch sử đã giải mã để làm ngữ cảnh (chỉ cuộc hiện tại, tối đa 20 tin).
    const history: ChatMessage[] = await Promise.all(
      (await rec.recentMessages(conv.id, HISTORY_LIMIT)).map(async (m) => ({
        role: m.role === "user" ? ("user" as const) : ("assistant" as const),
        content: await decrypt(key, m.content),
      })),
    );

    const deps: SafetyDeps = {
      ai: c.env,
      classifierModel: settings.model_classifier,
      loadResources: async (l) => toPublic(await loadResourceRows(c.env.DB), l, new Date()),
      onFlag: async (f) => {
        const id = await createFlag(c.env, {
          userId: user.id,
          source: "doctor_chat",
          level: f.level,
          category: f.category,
          excerpt: { previous: history.slice(-2).map((h) => ({ role: h.role, text: h.content })), message: f.text, reply: f.reply },
        });
        c.executionCtx.waitUntil(notifyAdmins(c.env.DB, { id, level: f.level, source: "doctor_chat" }));
      },
    };

    return streamSSE(c, async (stream) => {
      const send = (event: string, data: unknown) => stream.writeSSE({ event, data: JSON.stringify(data) });
      const messageId = crypto.randomUUID();
      await send("meta", { messageId, lang: user.locale, label: "AI", doctorId: doctor.id });
      try {
        const result = await respondSafely(deps, { text, locale: user.locale, history }, (extra) =>
          doctorReply(c.env, settings.model_chat, doctor, user.locale, history, text, extra),
        );
        const reply = result.kind === "crisis" ? result.message : result.text;
        await rec.appendMessage(conv.id, "user", await encrypt(key, text), result.lang, result.level);
        await rec.appendMessage(
          conv.id,
          result.kind === "crisis" ? "safety" : "doctor",
          await encrypt(key, reply),
          result.lang,
          result.level,
        );

        if (result.kind === "crisis") {
          await send("crisis", { message: result.message, resources: result.resources, lang: result.lang });
        } else {
          // Câu trả lời đã qua kiểm tra đầu ra; gửi theo từng đoạn để client hiện dần.
          for (const piece of result.text.match(/[\s\S]{1,48}(\s|$)|[\s\S]{1,48}/g) ?? [result.text]) await send("token", { text: piece });
        }
        await send("done", {
          usage: { used: slot.used, limit: settings.daily_message_limit },
          resources: result.kind === "reply" ? result.resources : null,
        });
      } catch (e) {
        await rec.refundMessage(today);
        const code = e instanceof AiUnavailableError ? "AI_UNAVAILABLE" : "AI_UNAVAILABLE";
        if (!(e instanceof AiUnavailableError)) console.error("doctor chat failed", e);
        await send("error", { code });
      }
    });
  });

  app.post("/api/feedback", ...guard, async (c) => {
    const user = c.get("user")!;
    const parsed = FeedbackBody.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return apiError(c, "VALIDATION", 400);
    const rec = recordOf(c, user.id);
    const conv = await rec.getConversation(parsed.data.conversationId);
    if (!conv) return apiError(c, "NOT_FOUND", 404);
    if (!(await rec.markFeedback(conv.id))) return apiError(c, "CONFLICT", 409);
    await c.env.DB.prepare("INSERT INTO feedback (id, doctor_id, felt_heard, locale, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), conv.doctor_id, parsed.data.feltHeard, user.locale, nowIso())
      .run();
    return c.body(null, 204);
  });
}
