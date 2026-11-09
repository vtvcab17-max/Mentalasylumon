import { rankKey } from "@bvo/shared";
import { t } from "../../i18n";

/** Chức danh trong game (002 US2). Bậc 1 không hiện để tên gọn. */
export const rankTitle = (level: number) => t(`rank.${rankKey(level)}`);
export const rankLabel = (nickname: string, level: number) => (level >= 2 ? `${nickname} · ${rankTitle(level)}` : nickname);

/** Sau khi người chơi vừa nhận thông tin hỗ trợ khủng hoảng, không nhắc nhiệm vụ nữa trong phiên (FR-028). */
let quiet = false;
export const questNudgesQuiet = () => quiet;
export const quietQuestNudges = () => {
  quiet = true;
};
