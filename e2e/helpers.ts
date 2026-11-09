import type { Browser, Locator, Page } from "@playwright/test";
// @ts-expect-error — script .mjs dùng chung với các công cụ local
import { createUsers, localSql } from "../scripts/lib/fake-users.mjs";

export { localSql };

export interface TestUser {
  id: string;
  nickname: string;
  token: string;
  room: { wing: string; floor: number; roomNumber: number };
}

/**
 * Người chơi thử: dùng E2E_SESSION(_2) nếu có (môi trường thật), nếu không thì tự tạo trên server local.
 * Đăng nhập Google không tự động hóa được, nên test dùng phiên có sẵn.
 */
export async function testUsers(n: number): Promise<TestUser[]> {
  const fromEnv = [process.env.E2E_SESSION, process.env.E2E_SESSION_2].filter(Boolean) as string[];
  if (fromEnv.length >= n) return fromEnv.slice(0, n).map((token) => ({ id: "", nickname: "", token, room: null as never }));
  return createUsers(n, { prefix: "e2e" });
}

export async function openAs(browser: Browser, baseURL: string, token: string, locale: "vi" | "en" = "vi"): Promise<Page> {
  const ctx = await browser.newContext();
  await ctx.addCookies([{ name: "sid", value: token, url: baseURL }]);
  await ctx.addInitScript((l) => localStorage.setItem("bvo.locale", l), locale);
  const page = await ctx.newPage();
  page.on("pageerror", (e) => {
    throw e;
  });
  await page.goto("/play");
  return page;
}

/** Vị trí đứng trước cửa phòng (giống apps/client/src/world/doors.ts). */
export function doorStand(roomNumber: number): [number, number] {
  // Gallery một bên (apps/client/src/world/doors.ts): 1–20 phía tây, 21–40 phía đông, cửa ở phía bắc.
  const x = roomNumber <= 20 ? -(7 + (20 - roomNumber) * 2.5) : 7 + (roomNumber - 21) * 2.5;
  return [x, -1.1];
}

/** Giữ phím từng đoạn ngắn cho tới khi `until` hiện ra (trình duyệt không GPU chạy ít khung hình nên đi chậm). */
export async function walkUntil(page: Page, key: string, until: Locator, maxMs = 30_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    if (await until.isVisible()) return;
    await page.keyboard.down(key);
    await page.waitForTimeout(300);
    await page.keyboard.up(key);
  }
}

/** Giữ phím trong một khoảng thời gian (tốc độ đi 3,2 m/s). */
export async function walk(page: Page, key: string, meters: number) {
  if (meters <= 0) return;
  await page.keyboard.down(key);
  await page.waitForTimeout((meters / 3.2) * 1000);
  await page.keyboard.up(key);
}

/** Tua đồng hồ máy chủ cho trang này (chỉ server local có ALLOW_TIME_TRAVEL=1). */
export async function timeTravel(page: Page, iso: string) {
  await page.unroute("**/api/**").catch(() => undefined);
  await page.route("**/api/**", (route) => route.continue({ headers: { ...route.request().headers(), "x-test-now": iso } }));
}
