/** Danh mục bộ phận nhân vật chibi (dùng chung client + worker để kiểm dữ liệu). */
export const AVATAR_CATALOG = {
  head: ["round", "oval"],
  hair: ["short", "bob", "long", "spiky", "bun", "curly"],
  outfit: ["hoodie", "cardigan", "pajamas", "tshirt", "coat"],
  accessory: ["glasses", "scarf", "beanie", "headphones"],
  skin: ["#f6dcc3", "#f1c9a5", "#e0b48f", "#c68e65", "#8d5a3b", "#5c3a24"],
  hairColor: ["#1d1d1d", "#3b2a20", "#5a3a22", "#a0522d", "#d4a373", "#9aa0a6", "#7b5ea7", "#4f86c6"],
  outfitColor: ["#8fc1b5", "#f2b5a7", "#f6d186", "#a3c4f3", "#cdb4db", "#e8e8e8", "#6c757d"],
} as const;

export function isValidAvatar(a: {
  parts: { head: string; hair: string; outfit: string; accessory: string | null };
  colors: { skin: string; hair: string; outfit: string };
}): boolean {
  const c = AVATAR_CATALOG;
  return (
    (c.head as readonly string[]).includes(a.parts.head) &&
    (c.hair as readonly string[]).includes(a.parts.hair) &&
    (c.outfit as readonly string[]).includes(a.parts.outfit) &&
    (a.parts.accessory === null || (c.accessory as readonly string[]).includes(a.parts.accessory)) &&
    (c.skin as readonly string[]).includes(a.colors.skin.toLowerCase()) &&
    (c.hairColor as readonly string[]).includes(a.colors.hair.toLowerCase()) &&
    (c.outfitColor as readonly string[]).includes(a.colors.outfit.toLowerCase())
  );
}
