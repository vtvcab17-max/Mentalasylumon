import { z } from "zod";

/** Body HTTP (contracts/http-api.md). */

export const Nickname = z
  .string()
  .trim()
  .min(2)
  .max(20)
  .regex(/^[\p{L}\p{N} _]+$/u, "letters, numbers, spaces and _ only");

export const AvatarSpec = z.object({
  parts: z.object({ head: z.string(), hair: z.string(), outfit: z.string(), accessory: z.string().nullable() }),
  colors: z.object({
    skin: z.string().regex(/^#[0-9a-f]{6}$/i),
    hair: z.string().regex(/^#[0-9a-f]{6}$/i),
    outfit: z.string().regex(/^#[0-9a-f]{6}$/i),
  }),
});
export type AvatarSpec = z.infer<typeof AvatarSpec>;

export const LocaleBody = z.object({ locale: z.enum(["vi", "en"]) });
export const AgeBody = z.object({ isAdult: z.boolean() });
export const ConsentBody = z.object({
  termsVersion: z.string(),
  items: z.object({
    ai_disclosure: z.literal(true),
    sensitive_data: z.literal(true),
    admin_flag_review: z.literal(true),
    overseas_ai_processing: z.literal(true),
  }),
});
export const ProfileBody = z.object({ nickname: Nickname, avatar: AvatarSpec });

export const DoctorMessageBody = z.object({ text: z.string().trim().min(1).max(1000) });
export const FeedbackBody = z.object({ conversationId: z.string(), feltHeard: z.enum(["yes", "somewhat", "no"]) });
export const ReportBody = z.object({
  reportedUserId: z.string(),
  context: z.object({ circleId: z.string(), messageId: z.string() }),
  reason: z.enum(["harassment", "harmful", "spam", "other"]),
});
export const BlockBody = z.object({ userId: z.string() });
export const DeleteAccountBody = z.object({ confirm: z.enum(["XOA", "DELETE"]) });
