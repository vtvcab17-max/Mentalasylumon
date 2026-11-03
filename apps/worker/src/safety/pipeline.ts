import type { SupportResource } from "@bvo/shared";
import { CONCERN_INSTRUCTION, NO_DIAGNOSIS_REMINDER } from "../ai/rules";
import type { ChatMessage, GatewayEnv } from "../ai/gateway";
import { classify, type ClassifierResult } from "./classifier";
import { buildCrisisResponse } from "./crisis-template";
import { scanKeywords, type KeywordResult } from "./keywords";
import { checkOutput, type Violation } from "./output-check";

/**
 * Pipeline an toàn 4 lớp (T032, research.md §R7, Constitution I). Mọi đường gửi chữ của người chơi
 * — trò chuyện, vòng sinh hoạt, hỏi đáp — đều đi qua đây.
 *   1 từ khóa → 2 phân loại AI → 3 acute: mẫu khủng hoảng tất định / không acute: gọi model → 4 kiểm tra đầu ra
 */

export type Level = "none" | "concern" | "acute";
export type FlagCategory = "self_harm" | "suicide" | "violence" | "abuse" | "other";

export interface SafetyDeps {
  ai: GatewayEnv;
  classifierModel: string;
  loadResources: (locale: "vi" | "en") => Promise<SupportResource[]>;
  /** Tạo cờ cho quản trị viên (FR-018). Không được làm hỏng phản hồi nếu lỗi. */
  onFlag?: (flag: { level: "concern" | "acute"; category: FlagCategory; text: string; reply: string }) => Promise<void>;
  now?: () => Date;
}

export interface Assessment {
  level: Level;
  category: FlagCategory | "none";
  lang: "vi" | "en";
  keyword: KeywordResult;
  classifier: ClassifierResult;
  classifierFallback: boolean;
}

const RANK: Record<Level, number> = { none: 0, concern: 1, acute: 2 };
const maxLevel = (a: Level, b: Level): Level => (RANK[a] >= RANK[b] ? a : b);

export async function assess(
  deps: SafetyDeps,
  text: string,
  opts: { history?: ChatMessage[]; mode?: "chat" | "community" } = {},
): Promise<Assessment> {
  const keyword = scanKeywords(text);
  const { result: classifier, fromFallback } = await classify(deps.ai, deps.classifierModel, text, opts);
  const level = maxLevel(keyword.level, classifier.level);
  const category: Assessment["category"] =
    keyword.category !== "none" ? keyword.category : classifier.category === "none" && level !== "none" ? "other" : classifier.category;
  return { level, category, lang: classifier.lang, keyword, classifier, classifierFallback: fromFallback };
}

const FALLBACK_REPLY = {
  vi: "Mình chưa thể trả lời câu này một cách an toàn. Mình không chẩn đoán bệnh hay hướng dẫn dùng thuốc được — bác sĩ hoặc chuyên gia tâm lý thật sẽ giúp bạn tốt hơn. Bạn có muốn kể thêm điều đang làm bạn bận tâm không?",
  en: "I can't answer that safely. I can't diagnose conditions or give medication advice — a real doctor or psychologist can help with that. Would you like to tell me more about what's on your mind?",
};

export type SafeResult =
  | { kind: "crisis"; level: "acute"; category: FlagCategory; lang: "vi" | "en"; message: string; resources: SupportResource[] }
  | {
      kind: "reply";
      level: "none" | "concern";
      category: Assessment["category"];
      lang: "vi" | "en";
      text: string;
      /** Có khi `concern` hoặc khi đã xóa số điện thoại do AI viết. */
      resources: SupportResource[] | null;
      violationsSeen: Violation[];
    };

/**
 * `generate(extraInstructions)` gọi model trò chuyện và trả về toàn bộ câu trả lời.
 * Nó chỉ được gọi khi tin nhắn không ở mức acute.
 */
export async function respondSafely(
  deps: SafetyDeps,
  input: { text: string; locale: "vi" | "en"; history?: ChatMessage[] },
  generate: (extraInstructions: string[]) => Promise<string>,
): Promise<SafeResult> {
  const now = (deps.now ?? (() => new Date()))();
  const a = await assess(deps, input.text, { history: input.history });
  const lang = a.lang ?? input.locale;

  if (a.level === "acute") {
    const crisis = buildCrisisResponse(lang, await deps.loadResources(lang), now);
    const category = a.category === "none" ? "other" : a.category;
    await safeFlag(deps, { level: "acute", category, text: input.text, reply: crisis.message });
    return { kind: "crisis", level: "acute", category, lang, message: crisis.message, resources: crisis.resources };
  }

  const instructions: string[] = [];
  if (a.level === "concern") instructions.push(CONCERN_INSTRUCTION);
  if (a.classifier.asks_diagnosis || a.classifier.asks_medication) instructions.push(NO_DIAGNOSIS_REMINDER);

  const violationsSeen: Violation[] = [];
  let reply = await generate(instructions);
  let check = checkOutput(reply);
  violationsSeen.push(...check.violations);
  if (check.violations.some((v) => v !== "phone")) {
    reply = await generate([...instructions, NO_DIAGNOSIS_REMINDER]);
    check = checkOutput(reply);
    violationsSeen.push(...check.violations);
    if (check.violations.some((v) => v !== "phone")) {
      reply = FALLBACK_REPLY[lang];
      check = checkOutput(reply);
    }
  }

  const needResources = a.level === "concern" || check.violations.includes("phone");
  const resources = needResources ? await deps.loadResources(lang) : null;
  if (a.level === "concern") {
    await safeFlag(deps, { level: "concern", category: a.category === "none" ? "other" : a.category, text: input.text, reply: check.sanitized });
  }
  return { kind: "reply", level: a.level, category: a.category, lang, text: check.sanitized, resources, violationsSeen };
}

export type ModerationResult =
  | { action: "allow"; level: Level; support: { message: string; resources: SupportResource[] } | null }
  | { action: "block"; reason: "harmful" | "harassment"; level: Level; support: { message: string; resources: SupportResource[] } | null };

/** Kiểm duyệt tin công khai (vòng sinh hoạt, câu hỏi thuyết trình) trước khi phát (FR-027, research.md §R11). */
export async function moderatePublic(deps: SafetyDeps, text: string, locale: "vi" | "en"): Promise<ModerationResult> {
  const now = (deps.now ?? (() => new Date()))();
  const a = await assess(deps, text, { mode: "community" });
  const lang = a.lang ?? locale;
  const support = a.level !== "none" ? buildCrisisResponse(lang, await deps.loadResources(lang), now) : null;
  if (a.level !== "none") {
    await safeFlag(deps, {
      level: a.level === "acute" ? "acute" : "concern",
      category: a.category === "none" ? "other" : a.category,
      text,
      reply: support!.message,
    });
  }
  if (a.classifier.harmful_content || a.level === "acute") return { action: "block", reason: "harmful", level: a.level, support };
  if (a.classifier.harassment) return { action: "block", reason: "harassment", level: a.level, support };
  // Khi phân loại lỗi: an toàn hơn là không phát tin công khai.
  if (a.classifierFallback) return { action: "block", reason: "harmful", level: a.level, support };
  return { action: "allow", level: a.level, support };
}

async function safeFlag(deps: SafetyDeps, flag: Parameters<NonNullable<SafetyDeps["onFlag"]>>[0]) {
  try {
    await deps.onFlag?.(flag);
  } catch (e) {
    console.error("flag creation failed", e);
  }
}
