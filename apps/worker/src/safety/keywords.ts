/**
 * Lớp 1 của pipeline an toàn (T027, research.md §R7): lọc từ khóa tiếng Việt + tiếng Anh, chạy tức thì,
 * không gọi AI. Mục tiêu là bắt chắc các câu rõ ràng; câu ẩn ý để lớp phân loại AI xử lý.
 * Từ khóa khớp → tối thiểu `concern`; có thêm dấu hiệu thời điểm/kế hoạch → `acute`.
 *
 * Danh sách này là dữ liệu an toàn: mọi thay đổi phải chạy lại `pnpm eval:safety` (Constitution I).
 */

export type Level = "none" | "concern" | "acute";
export type Category = "none" | "suicide" | "self_harm" | "abuse" | "violence";

export interface KeywordResult {
  level: Level;
  category: Category;
  matched: string[];
}

const DIACRITIC_RE = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

/** Viết tắt / teencode phổ biến → dạng đầy đủ không dấu. */
const TEENCODE: Record<string, string> = {
  ko: "khong", k: "khong", kh: "khong", hk: "khong", hok: "khong", khg: "khong", kg: "khong", hong: "khong",
  mun: "muon", mog: "muon", j: "gi", dc: "duoc", dk: "duoc", ns: "noi", bjo: "bay gio", bh: "bay gio",
  wa: "qua", lun: "luon", dont: "don t", wanna: "want to", gonna: "going to",
  im: "i m", ive: "i ve", cant: "can t",
};

export function normalize(text: string): string {
  const stripped = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return stripped
    .split(/\s+/)
    .map((w) => TEENCODE[w] ?? w)
    .join(" ");
}

// Cụm thường dùng theo nghĩa bóng — gỡ ra trước khi so khớp để tránh báo nhầm.
const FIGURATIVE = [
  "cuoi muon chet", "met chet", "chet di duoc", "chet mat", "so chet", "dep chet", "ngon chet", "nong chet",
  "doi chet", "buon cuoi chet", "killing me lol", "is killing me", "are killing me", "dying to", "to die for",
  "killed it", "dead tired", "i m dead lol",
];

// Dạng có dấu, chỉ dùng khi câu có dấu (tránh "từ từ" ↔ "tự tử").
const DIACRITIC_PATTERNS: [Category, string][] = [
  ["suicide", "tự tử"],
  ["suicide", "tự sát"],
  ["self_harm", "tự hại"],
  ["self_harm", "tự làm đau"],
  ["self_harm", "tự làm hại"],
];

// Dạng không dấu, đã chuẩn hóa. Không chứa cụm mơ hồ như "tu tu" đứng một mình.
const PLAIN_PATTERNS: [Category, string][] = [
  // tự tử — tiếng Việt
  ["suicide", "muon chet"], ["suicide", "khong muon song"], ["suicide", "chang muon song"],
  ["suicide", "song de lam gi"], ["suicide", "ket thuc cuoc doi"], ["suicide", "ket thuc tat ca"],
  ["suicide", "ket lieu ban than"], ["suicide", "chet cho xong"], ["suicide", "bien mat mai mai"],
  ["suicide", "tu sat"], ["suicide", "muon tu tu"], ["suicide", "se tu tu"], ["suicide", "dinh tu tu"],
  ["suicide", "nghi den tu tu"], ["suicide", "nghi toi tu tu"], ["suicide", "tinh tu tu"], ["suicide", "chuan bi tu tu"],
  ["suicide", "nhay cau"], ["suicide", "nhay lau"], ["suicide", "khong con ly do de song"],
  // suicide — English
  ["suicide", "kill myself"], ["suicide", "killing myself"], ["suicide", "kms"], ["suicide", "suicide"],
  ["suicide", "suicidal"], ["suicide", "end my life"], ["suicide", "ending my life"], ["suicide", "end it all"],
  ["suicide", "want to die"], ["suicide", "don t want to live"], ["suicide", "no reason to live"],
  ["suicide", "better off dead"], ["suicide", "unalive"], ["suicide", "take my own life"],
  // tự hại
  ["self_harm", "tu lam dau ban than"], ["self_harm", "tu lam hai ban than"], ["self_harm", "rach tay"],
  ["self_harm", "cat tay"], ["self_harm", "tu hai"], ["self_harm", "lam dau ban than"],
  ["self_harm", "cut myself"], ["self_harm", "cutting myself"], ["self_harm", "hurt myself"],
  ["self_harm", "hurting myself"], ["self_harm", "self harm"], ["self_harm", "selfharm"], ["self_harm", "burn myself"],
  // bị xâm hại
  ["abuse", "bi bao hanh"], ["abuse", "bi xam hai"], ["abuse", "bi hiep"], ["abuse", "bi cuong hiep"],
  ["abuse", "bi danh dap"], ["abuse", "danh toi"], ["abuse", "danh minh"], ["abuse", "being abused"],
  ["abuse", "abused me"], ["abuse", "abusing me"], ["abuse", "hits me"], ["abuse", "beats me"], ["abuse", "raped"],
  // bạo lực với người khác
  ["violence", "muon giet"], ["violence", "giet no"], ["violence", "giet chet"], ["violence", "dam chet"],
  ["violence", "kill him"], ["violence", "kill her"], ["violence", "kill them"], ["violence", "hurt someone"],
];

// Dấu hiệu thời điểm / kế hoạch / lời từ biệt → acute khi đi kèm tự tử hoặc tự hại.
const ACUTE_MARKERS = [
  "toi nay", "dem nay", "hom nay", "ngay mai", "bay gio", "ngay luc nay", "sap", "se", "chuan bi", "da chuan bi",
  "ke hoach", "vinh biet", "tam biet moi nguoi", "lan cuoi", "tonight", "today", "right now", "going to",
  "i will", "i ll", "plan", "planned", "goodbye", "last time",
];

const PRIORITY: Category[] = ["suicide", "self_harm", "abuse", "violence"];

function containsPhrase(haystack: string, phrase: string) {
  return ` ${haystack} `.includes(` ${phrase} `);
}

export function scanKeywords(text: string): KeywordResult {
  const lower = text.toLowerCase().normalize("NFC");
  let plain = normalize(text);
  for (const f of FIGURATIVE) plain = ` ${plain} `.replaceAll(` ${f} `, " ").trim();

  const hits = new Map<Category, string[]>();
  const add = (c: Category, p: string) => hits.set(c, [...(hits.get(c) ?? []), p]);

  if (DIACRITIC_RE.test(text)) {
    for (const [c, p] of DIACRITIC_PATTERNS) if (lower.includes(p)) add(c, p);
  }
  for (const [c, p] of PLAIN_PATTERNS) {
    // Câu có dấu mà khớp "tu tu"/"tu sat" dạng bỏ dấu thì chỉ tin dạng có dấu ở trên.
    if (DIACRITIC_RE.test(text) && /\btu (tu|sat)\b/.test(p)) continue;
    if (containsPhrase(plain, p)) add(c, p);
  }

  const category = PRIORITY.find((c) => hits.has(c)) ?? "none";
  if (category === "none") return { level: "none", category, matched: [] };

  const acute =
    (category === "suicide" || category === "self_harm") && ACUTE_MARKERS.some((m) => containsPhrase(plain, m));
  return { level: acute ? "acute" : "concern", category, matched: [...hits.values()].flat() };
}
