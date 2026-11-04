import { z } from "zod";

/** Tin WebSocket (contracts/ws-protocol.md). Client và worker dùng chung. */

const Vec3 = z.tuple([z.number(), z.number(), z.number()]);
const Anim = z.enum(["idle", "walk", "sit", "wave"]);

// ── WorldZone ─────────────────────────────────────────────
export const ZoneClientMsg = z.discriminatedUnion("t", [
  z.object({ t: z.literal("move"), p: Vec3, r: z.number(), a: Anim }),
  z.object({ t: z.literal("emote"), e: z.enum(["wave", "heart", "nod"]) }),
]);
export type ZoneClientMsg = z.infer<typeof ZoneClientMsg>;

export const PlayerPublic = z.object({
  id: z.string(),
  nickname: z.string(),
  avatar: z.unknown(),
  p: Vec3,
  r: z.number(),
  a: Anim,
});

export const ZoneServerMsg = z.discriminatedUnion("t", [
  z.object({ t: z.literal("welcome"), selfId: z.string(), zoneId: z.string(), players: z.array(PlayerPublic) }),
  z.object({ t: z.literal("join"), player: PlayerPublic }),
  z.object({ t: z.literal("leave"), id: z.string() }),
  z.object({
    t: z.literal("snapshot"),
    tick: z.number(),
    /** Phần thay đổi: người vừa di chuyển hoặc vừa vào tầm nhìn. */
    players: z.array(z.object({ id: z.string(), p: Vec3, r: z.number(), a: Anim })),
    /** Người vừa ra khỏi tầm nhìn (ngoài 30 m hoặc ngoài 80 người gần nhất). */
    gone: z.array(z.string()).default([]),
  }),
  z.object({ t: z.literal("emote"), id: z.string(), e: z.string() }),
  z.object({ t: z.literal("zone_full"), redirectZoneId: z.string() }),
  z.object({ t: z.literal("warn"), code: z.literal("RATE_LIMITED") }),
  z.object({ t: z.literal("kicked"), reason: z.string() }),
]);
export type ZoneServerMsg = z.infer<typeof ZoneServerMsg>;

// ── CircleRoom ────────────────────────────────────────────
export const CircleClientMsg = z.discriminatedUnion("t", [
  z.object({ t: z.literal("sit"), seat: z.number().int().min(0).max(19) }),
  z.object({ t: z.literal("stand") }),
  z.object({ t: z.literal("chat"), text: z.string().trim().min(1).max(300), clientMsgId: z.string().max(64) }),
]);
export type CircleClientMsg = z.infer<typeof CircleClientMsg>;

export const SupportResource = z.object({
  id: z.string(),
  name: z.string(),
  phone: z.string().nullable(),
  url: z.string().nullable(),
  scope: z.enum(["emergency", "crisis", "youth", "violence", "international"]),
  hours: z.string(),
  onDutyNow: z.boolean(),
  /** Lần mở cửa kế tiếp khi đang ngoài giờ (giờ Việt Nam). */
  nextOpening: z.object({ dayOffset: z.number(), from: z.string() }).nullable().optional(),
});
export type SupportResource = z.infer<typeof SupportResource>;

export const CircleServerMsg = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("chat"),
    id: z.string(),
    from: z.object({ id: z.string(), nickname: z.string() }),
    text: z.string(),
    ts: z.string(),
  }),
  z.object({ t: z.literal("chat_rejected"), clientMsgId: z.string(), reason: z.enum(["harmful", "harassment", "spam"]) }),
  z.object({ t: z.literal("support"), message: z.string(), resources: z.array(SupportResource) }),
  z.object({ t: z.literal("chat_hidden"), id: z.string() }),
  z.object({ t: z.literal("seat_update"), seat: z.number(), userId: z.string().nullable() }),
  z.object({
    t: z.literal("facilitator"),
    doctor: z.object({ id: z.string(), name: z.string() }),
    text: z.string(),
    label: z.literal("AI"),
  }),
  z.object({ t: z.literal("session"), status: z.enum(["scheduled", "live", "ended"]), topic: z.string() }),
]);
export type CircleServerMsg = z.infer<typeof CircleServerMsg>;

// ── LectureHall ───────────────────────────────────────────
export const LectureClientMsg = z.object({
  t: z.literal("ask"),
  text: z.string().trim().min(1).max(300),
  anonymous: z.boolean(),
});
export type LectureClientMsg = z.infer<typeof LectureClientMsg>;

export const LectureServerMsg = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("lecture_state"),
    talkId: z.string(),
    lang: z.enum(["vi", "en"]),
    phase: z.enum(["waiting", "playing", "qa", "ended"]),
    startedAt: z.string().nullable(),
    audioUrl: z.string(),
    slides: z.array(z.string()),
    captionsUrl: z.string(),
    serverNow: z.string(),
  }),
  z.object({ t: z.literal("ask_ack"), accepted: z.boolean(), reason: z.string().optional() }),
  z.object({
    t: z.literal("qa_answer"),
    question: z.string(),
    askerNickname: z.string().nullable(),
    answer: z.string(),
    label: z.literal("AI"),
  }),
  z.object({ t: z.literal("overflow"), redirectInstance: z.number() }),
]);
export type LectureServerMsg = z.infer<typeof LectureServerMsg>;
