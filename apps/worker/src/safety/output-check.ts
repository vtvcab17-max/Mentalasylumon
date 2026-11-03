/**
 * Kiểm tra đầu ra của AI trước khi gửi (T031, contracts/doctor-ai.md §5).
 * - medication_dose: tên thuốc/chung chung "thuốc" kèm liều hoặc tần suất
 * - diagnosis: câu khẳng định người chơi mắc một bệnh
 * - phone: số điện thoại do AI viết (bị xóa; tài nguyên thật được thêm từ DB)
 */

export type Violation = "medication_dose" | "diagnosis" | "phone";

export interface OutputCheck {
  ok: boolean;
  violations: Violation[];
  sanitized: string;
}

// Liều: số + đơn vị, hoặc số + "viên"/"tablet", hoặc tần suất dùng thuốc.
const DOSE_PATTERNS = [
  /\b\d+(?:[.,]\d+)?\s?(?:mg|mcg|µg|ug|ml|g)\b/i,
  /\b\d+\s?(?:viên|vien|tablets?|pills?|capsules?)\b/i,
  /\b(?:one|two|three|a|half a)\s+(?:tablets?|pills?|capsules?)\b/i,
  /\b\d+\s?lần\s?(?:\/|mỗi|một)\s?ngày\b/i,
  /\b(?:once|twice|three times)\s+(?:a|per)\s+day\b/i,
];
// Chỉ coi là vi phạm liều khi câu có nói tới thuốc/uống.
const MED_CONTEXT = /\b(?:thuốc|uống|liều|dose|dosage|take|tablet|pill|capsule|mg)\b|sertraline|fluoxetine|diazepam|xanax|alprazolam|melatonin|zolpidem|lithium|quetiapine|paracetamol/i;

const CONDITIONS =
  "(?:trầm cảm|rối loạn [\\p{L} ]{2,30}|lo âu|tâm thần phân liệt|lưỡng cực|ptsd|adhd|ocd|depression|bipolar(?: disorder)?|anxiety disorder|schizophrenia|ptsd|adhd|ocd|borderline personality disorder|an? [a-z ]{0,20}disorder)";
const DIAGNOSIS_PATTERNS = [
  new RegExp(`\\bbạn (?:đang |đã |chắc chắn |có lẽ |chắc là )?(?:bị|mắc)\\s+${CONDITIONS}`, "iu"),
  new RegExp(`\\byou (?:definitely |probably |clearly |likely )?(?:have|are suffering from|suffer from)\\s+(?:a |an )?${CONDITIONS}`, "iu"),
  /\b(?:chẩn đoán của (?:tôi|mình) là|my diagnosis is|i diagnose)\b/i,
];

// Chuỗi số giống số điện thoại: ≥ 3 chữ số liên tiếp (cho phép khoảng trắng/dấu chấm/gạch giữa nhóm).
const PHONE = /(?<![\d:])(?:\+?\d[\d .-]{1,14}\d)(?![\d:])/g;

/** Số điện thoại: mã khẩn cấp VN 111–115 hoặc ≥ 7 chữ số. Số khác (năm, số lượng) bỏ qua. */
const SHORT_CODES = new Set(["111", "112", "113", "114", "115"]);
function looksLikePhone(s: string) {
  const digits = s.replace(/\D/g, "");
  return SHORT_CODES.has(digits) || (digits.length >= 7 && digits.length <= 15);
}

export function checkOutput(text: string): OutputCheck {
  const violations: Violation[] = [];

  if (MED_CONTEXT.test(text) && DOSE_PATTERNS.some((re) => re.test(text))) violations.push("medication_dose");
  if (DIAGNOSIS_PATTERNS.some((re) => re.test(text))) violations.push("diagnosis");

  let sanitized = text;
  let phoneFound = false;
  sanitized = sanitized.replace(PHONE, (m) => {
    if (!looksLikePhone(m)) return m;
    phoneFound = true;
    return "[…]";
  });
  if (phoneFound) violations.push("phone");

  return { ok: violations.length === 0, violations, sanitized: phoneFound ? sanitized : text };
}
