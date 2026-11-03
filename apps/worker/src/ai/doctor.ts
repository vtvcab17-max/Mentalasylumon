import { complete, type ChatMessage, type GatewayEnv } from "./gateway";
import { SAFETY_RULES, languageLine } from "./rules";

/**
 * Bác sĩ AI trong phòng riêng (T050, contracts/doctor-ai.md §1–2).
 * Quy tắc an toàn chung đặt TRƯỚC tính cách, để tính cách không ghi đè được quy tắc.
 */

export interface DoctorRow {
  id: string;
  name: string;
  topic: string;
  display: string;
  avatar: string;
  persona_prompt: string;
  active: number;
  sort: number;
}

export const HISTORY_LIMIT = 20;
export const MAX_REPLY_TOKENS = 400;

export function doctorSystemPrompt(doctor: DoctorRow, locale: "vi" | "en", extra: string[] = []) {
  return [SAFETY_RULES, `Your character: ${doctor.persona_prompt}`, languageLine(locale), ...extra].join("\n\n");
}

export function doctorReply(
  ai: GatewayEnv,
  model: string,
  doctor: DoctorRow,
  locale: "vi" | "en",
  history: ChatMessage[],
  text: string,
  extra: string[],
): Promise<string> {
  // Lịch sử phải bắt đầu bằng lượt "user" và xen kẽ; gộp các lượt liền nhau cùng vai.
  const msgs: ChatMessage[] = [];
  for (const m of [...history.slice(-HISTORY_LIMIT), { role: "user" as const, content: text }]) {
    const last = msgs.at(-1);
    if (last && last.role === m.role) last.content += `\n\n${m.content}`;
    else msgs.push({ ...m });
  }
  while (msgs[0]?.role === "assistant") msgs.shift();
  return complete(ai, {
    model,
    system: doctorSystemPrompt(doctor, locale, extra),
    messages: msgs,
    maxTokens: MAX_REPLY_TOKENS,
    temperature: 0.7,
  });
}
