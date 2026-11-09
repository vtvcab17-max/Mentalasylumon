import { complete, type GatewayEnv } from "./gateway";
import { SAFETY_RULES } from "./rules";
import { checkOutput } from "../safety/output-check";

/**
 * Bác sĩ AI dẫn dắt vòng sinh hoạt (T080, FR-024, FR-038).
 * Nói ngôn ngữ của vòng (không theo ngôn ngữ người chơi). Mỗi lời dẫn sinh bằng model và đi qua kiểm tra đầu ra;
 * model lỗi hoặc vi phạm thì dùng câu mẫu viết sẵn — buổi sinh hoạt không bao giờ bị kẹt vì AI.
 */

export type FacilitatorCue = "opening" | "invite" | "rules" | "closing";
type Lang = "vi" | "en";

export const COMMUNITY_RULES: Record<Lang, string[]> = {
  vi: [
    "Tôn trọng và tử tế với mọi người.",
    "Chuyện của ai ở lại với người đó — không chụp lại, không kể ra ngoài.",
    "Không mô tả cách làm hại bản thân.",
    "Không xin hay chia sẻ thông tin cá nhân (tên thật, địa chỉ, số điện thoại).",
    "Bác sĩ dẫn dắt là AI, không phải bác sĩ thật. Khi nguy cấp, hãy bấm “Cần giúp đỡ ngay”.",
  ],
  en: [
    "Be respectful and kind to everyone.",
    "What's shared here stays here — no screenshots, no retelling.",
    "Don't describe ways of self-harm.",
    "Don't ask for or share personal details (real name, address, phone number).",
    "The facilitator is an AI, not a real doctor. In an emergency, press “Need help now”.",
  ],
};

const TEMPLATES: Record<Lang, Record<FacilitatorCue, (topic: string, name: string) => string>> = {
  vi: {
    opening: (topic, name) =>
      `Chào mọi người, mình là ${name} — một bác sĩ AI, không phải bác sĩ thật. Hôm nay vòng mình cùng nói về: “${topic}”. Mình sẽ giữ nhịp, còn câu chuyện là của các bạn.`,
    invite: (topic) => `Ai muốn mở lời trước không? Bạn có thể kể một điều nhỏ liên quan tới “${topic}”, hoặc chỉ cần chào mọi người cũng được.`,
    rules: () => `Nhắc nhẹ quy tắc của vòng: ${COMMUNITY_RULES.vi.slice(0, 3).join(" ")}`,
    closing: () => `Buổi sinh hoạt hôm nay đến đây là hết. Cảm ơn mọi người đã lắng nghe và chia sẻ. Hãy nhẹ nhàng với bản thân nhé.`,
  },
  en: {
    opening: (topic, name) =>
      `Hi everyone, I'm ${name} — an AI doctor, not a real one. Today our circle talks about: “${topic}”. I'll keep the pace; the stories are yours.`,
    invite: (topic) => `Would anyone like to start? You can share one small thing about “${topic}”, or simply say hello.`,
    rules: () => `A gentle reminder of our circle rules: ${COMMUNITY_RULES.en.slice(0, 3).join(" ")}`,
    closing: () => `That's all for today's session. Thank you for listening and sharing. Please be gentle with yourselves.`,
  },
};

const CUE_INSTRUCTION: Record<FacilitatorCue, string> = {
  opening: "Open the group session: greet everyone, say clearly you are an AI (not a real doctor), introduce today's topic in one or two sentences.",
  invite: "Gently invite members to share something about the topic. Make clear sharing is optional.",
  rules: "Briefly remind members of the circle rules: be kind, keep others' stories private, never describe self-harm methods, no personal details.",
  closing: "Close the session warmly: thank everyone and encourage self-care and reaching out to people they trust.",
};

export function templateLine(cue: FacilitatorCue, lang: Lang, topic: string, doctorName: string) {
  return TEMPLATES[lang][cue](topic, doctorName);
}

export async function facilitatorLine(
  ai: GatewayEnv,
  model: string,
  input: { cue: FacilitatorCue; lang: Lang; topic: string; doctorName: string; persona?: string },
): Promise<string> {
  const fallback = templateLine(input.cue, input.lang, input.topic, input.doctorName);
  try {
    const text = await complete(ai, {
      model,
      system: [
        SAFETY_RULES,
        input.persona ? `Persona: ${input.persona}` : "",
        `You are "${input.doctorName}", facilitating a small peer-support circle (group text chat). Speak ONLY ${
          input.lang === "vi" ? "Vietnamese" : "English"
        } — the circle's language. Today's topic: "${input.topic}". Write 1–3 short sentences for the whole group, no lists, no phone numbers.`,
      ]
        .filter(Boolean)
        .join("\n\n"),
      messages: [{ role: "user", content: CUE_INSTRUCTION[input.cue] }],
      maxTokens: 160,
      temperature: 0.6,
      timeoutMs: 15_000,
    });
    const check = checkOutput(text.trim());
    if (!check.sanitized || check.violations.length || check.sanitized.length > 600) return fallback;
    return check.sanitized;
  } catch {
    return fallback;
  }
}
