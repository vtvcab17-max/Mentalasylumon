import { z } from "zod";
import { complete, type ChatMessage, type GatewayEnv } from "../ai/gateway";

/**
 * Lớp 2: phân loại an toàn bằng AI (T029, contracts/doctor-ai.md §3).
 * Lỗi, hết thời gian hoặc đầu ra không hợp lệ → mặc định `concern` (Constitution I).
 */

export const ClassifierResult = z.object({
  level: z.enum(["none", "concern", "acute"]),
  category: z.enum(["none", "self_harm", "suicide", "violence", "abuse", "other"]),
  asks_diagnosis: z.boolean(),
  asks_medication: z.boolean(),
  lang: z.enum(["vi", "en"]),
  // Chỉ dùng ở chế độ "community" (phòng sinh hoạt, hỏi đáp công khai).
  harassment: z.boolean().optional(),
  harmful_content: z.boolean().optional(),
});
export type ClassifierResult = z.infer<typeof ClassifierResult>;

const SYSTEM = (mode: "chat" | "community") => `You are a safety classifier for a mental-wellbeing app used in Vietnamese and English. Classify ONLY the latest user message (earlier turns are context). Output a single JSON object and nothing else.

Fields:
- "level": "acute" if there is intent, a plan, means or a time for self-harm or suicide, imminent violence, or ongoing abuse; "concern" for passive thoughts, hopelessness, wishing to disappear, or self-harm mentioned without a plan; otherwise "none". Figurative speech ("tired to death", "cười muốn chết", "this is killing me") is "none".
- "category": one of "none","self_harm","suicide","violence","abuse","other".
- "asks_diagnosis": true if the user asks what condition they have.
- "asks_medication": true if the user asks about medication, doses or how to take drugs.
- "lang": "vi" or "en" — the language of the latest message.${
  mode === "community"
    ? `
- "harassment": true if the message insults, threatens or demeans another person.
- "harmful_content": true if it describes self-harm or suicide methods, encourages harm, or contains sexual or hateful content.`
    : ""
}

When unsure between two levels, choose the more serious one.`;

function fallback(text: string): ClassifierResult {
  const vi = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(text);
  return { level: "concern", category: "other", asks_diagnosis: false, asks_medication: false, lang: vi ? "vi" : "en" };
}

export async function classify(
  env: GatewayEnv,
  model: string,
  text: string,
  opts: { history?: ChatMessage[]; mode?: "chat" | "community" } = {},
): Promise<{ result: ClassifierResult; fromFallback: boolean }> {
  const context = (opts.history ?? []).slice(-4);
  try {
    const raw = await complete(env, {
      model,
      system: SYSTEM(opts.mode ?? "chat"),
      messages: [
        {
          role: "user",
          content:
            (context.length
              ? `Earlier conversation (context only):\n${context.map((m) => `${m.role}: ${m.content}`).join("\n")}\n\n`
              : "") + `Latest user message to classify:\n<<<\n${text}\n>>>`,
        },
      ],
      maxTokens: 200,
      temperature: 0,
      timeoutMs: 8_000,
    });
    const json = raw.slice(raw.indexOf("{"), raw.lastIndexOf("}") + 1);
    const parsed = ClassifierResult.safeParse(JSON.parse(json));
    if (!parsed.success) return { result: fallback(text), fromFallback: true };
    return { result: parsed.data, fromFallback: false };
  } catch {
    return { result: fallback(text), fromFallback: true };
  }
}
