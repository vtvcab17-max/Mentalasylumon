import type { SupportResource } from "@bvo/shared";

/**
 * Mẫu phản hồi khủng hoảng tất định (T030, contracts/doctor-ai.md §4, Constitution I).
 * Mọi số điện thoại đến từ `resources` (bảng support_resources). AI không tham gia vào văn bản này.
 */

export interface CrisisResponse {
  message: string;
  resources: SupportResource[];
}

const DAY_LABEL = {
  vi: ["Chủ nhật", "thứ Hai", "thứ Ba", "thứ Tư", "thứ Năm", "thứ Sáu", "thứ Bảy"],
  en: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
};

function line(r: SupportResource) {
  const contact = r.phone ?? r.url ?? "";
  return `• ${r.name}: **${contact}** (${r.hours})`;
}

function emergencyNumbers(resources: SupportResource[]) {
  return resources.filter((r) => r.scope === "emergency" && r.phone);
}

function nextOpeningText(locale: "vi" | "en", closed: SupportResource[], now: Date): string {
  const best = closed
    .filter((r) => r.nextOpening)
    .sort((a, b) => a.nextOpening!.dayOffset - b.nextOpening!.dayOffset || a.nextOpening!.from.localeCompare(b.nextOpening!.from))[0];
  if (!best) return "";
  const { dayOffset, from } = best.nextOpening!;
  const vnDay = new Date(now.getTime() + 7 * 3600_000).getUTCDay();
  const day = DAY_LABEL[locale][(vnDay + dayOffset) % 7];
  const when =
    locale === "vi"
      ? dayOffset === 0 ? `hôm nay lúc ${from}` : dayOffset === 1 ? `ngày mai lúc ${from}` : `${day} lúc ${from}`
      : dayOffset === 0 ? `today at ${from}` : dayOffset === 1 ? `tomorrow at ${from}` : `${day} at ${from}`;
  return locale === "vi" ? ` ${best.name} mở lại ${when}.` : ` ${best.name} opens again ${when}.`;
}

export function buildCrisisResponse(locale: "vi" | "en", resources: SupportResource[], now: Date): CrisisResponse {
  const emergency = emergencyNumbers(resources);
  const emergencyText = (emergency.find((r) => r.id === "emergency-115") ?? emergency[0])?.phone ?? "115";
  const crisisLines = resources.filter((r) => r.scope === "crisis");
  const onDuty = crisisLines.filter((r) => r.onDutyNow);
  const closed = crisisLines.filter((r) => !r.onDutyNow);
  const intl = locale === "en" ? resources.filter((r) => r.scope === "international") : [];

  const linesBlock = onDuty.length
    ? onDuty.map(line).join("\n")
    : (locale === "vi"
        ? `Các đường dây hỗ trợ đang ngoài giờ; hãy gọi **${emergencyText}** nếu bạn đang gặp nguy hiểm.`
        : `The support lines are closed right now; please call **${emergencyText}** if you are in danger.`) +
      nextOpeningText(locale, closed, now);

  const message =
    locale === "vi"
      ? [
          "Cảm ơn bạn đã nói ra, mình biết điều đó không dễ. Nghe như bạn đang rất đau khổ, và bạn không phải đối mặt chuyện này một mình.",
          `Mình là AI nên không thể ở bên bạn như một người thật. Nếu bạn đang gặp nguy hiểm ngay lúc này, hãy gọi **${emergencyText}** hoặc đến phòng cấp cứu gần nhất.`,
          onDuty.length ? "Bạn cũng có thể nói chuyện với người đang trực ở:" : "",
          linesBlock,
          "Nếu được, hãy nhắn hoặc gọi cho một người bạn tin tưởng ngay bây giờ. Mình vẫn ở đây nếu bạn muốn kể tiếp.",
        ]
      : [
          "Thank you for telling me — I know that isn't easy. It sounds like you're in a lot of pain, and you don't have to face this alone.",
          `I'm an AI, so I can't be with you the way a person can. If you're in danger right now, please call **${emergencyText}** or go to the nearest emergency room.`,
          onDuty.length ? "You can also talk to someone at:" : "",
          linesBlock,
          ...intl.map((r) => `If you're outside Vietnam: ${r.url}`),
          "If you can, reach out to someone you trust right now. I'm still here if you want to keep talking.",
        ];

  return {
    message: message.filter(Boolean).join("\n\n"),
    resources: [...emergency, ...onDuty, ...closed, ...intl],
  };
}
