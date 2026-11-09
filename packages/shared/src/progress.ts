import { z } from "zod";

/** Cấp bậc & nhiệm vụ (specs/002-ranks-quests, contracts/http-api.md). Client và worker dùng chung. */

export const RANK_KEYS = ["patient", "cleaner", "orderly", "nurse", "intern", "head", "director"] as const;
export type RankKey = (typeof RANK_KEYS)[number];
export const rankKey = (level: number): RankKey => RANK_KEYS[Math.min(Math.max(level, 1), 7) - 1];

export const QuestEvent = z.enum(["reach", "wave", "sit", "thank", "breath", "mood", "gratitude", "litter", "water", "tidy", "guide", "circle_visit", "circle_session"]);
export type QuestEvent = z.infer<typeof QuestEvent>;

export const QuestView = z.object({
  id: z.string(),
  kind: z.enum(["daily", "chain", "weekly"]),
  category: z.enum(["selfcare", "community", "explore", "work"]),
  event: QuestEvent,
  title: z.string(),
  how: z.string(),
  where: z.string(),
  spot: z.object({ zone: z.string(), spot: z.string() }).nullable(),
  points: z.number(),
  progress: z.number(),
  target: z.number(),
  status: z.enum(["active", "done"]),
});
export type QuestView = z.infer<typeof QuestView>;

export const NextStep = z.object({
  level: z.number(),
  key: z.enum(RANK_KEYS),
  requirements: z.array(z.object({ kind: z.enum(["points", "days", "chain"]), have: z.number(), need: z.number(), label: z.string().optional() })),
});
export type NextStep = z.infer<typeof NextStep>;

export const ProgressView = z.object({
  rank: z.object({ level: z.number(), key: z.enum(RANK_KEYS) }),
  totalPoints: z.number(),
  todayPoints: z.number(),
  dailyCap: z.number(),
  activeDays: z.number(),
  next: NextStep.nullable(),
  eligible: z.boolean(),
});
export type ProgressView = z.infer<typeof ProgressView>;

/** Điểm khám phá trong từng khu (toạ độ khớp apps/client/src/world/hospital-builder.ts). */
export const HOTSPOTS: Record<string, { id: string; x: number; z: number; r: number }[]> = {
  court: [{ id: "portico", x: 0, z: 2.6, r: 2.4 }],
  lobby: [{ id: "staircase", x: 0, z: -4.2, r: 2 }],
  garden: [{ id: "pond", x: 9, z: -3.6, r: 2.2 }],
};

/** "garden-2" → "garden"; "wingA-floor3-1" → "floor". */
export function zoneBase(zoneId: string): string {
  const m = zoneId.match(/^(lobby|garden|court)-\d+$/);
  return m ? m[1] : "floor";
}
