import { expect, test } from "@playwright/test";
import { openAs, testUsers, walkUntil, type TestUser } from "./helpers";

/**
 * 002 US1/US2 e2e: mở Sổ nhiệm vụ, thấy 3 nhiệm vụ hôm nay + bước tiếp theo, dùng Dẫn đường tới hàng cột
 * ở sân trước — máy chủ xác nhận và báo hoàn thành nhiệm vụ.
 */

let users: TestUser[];
test.beforeAll(async () => {
  users = await testUsers(1);
});

test("sổ nhiệm vụ: bước tiếp theo, dẫn đường, hoàn thành nhiệm vụ khám phá", async ({ browser, baseURL }) => {
  test.skip(!users[0].room, "cần server local");
  test.setTimeout(120_000);
  const p = await openAs(browser, baseURL!, users[0].token);
  await p.getByRole("button", { name: "Sổ nhiệm vụ" }).click();
  await expect(p.getByText("Nhiệm vụ hôm nay")).toBeVisible({ timeout: 15_000 });
  await expect(p.locator(".bvo-quest")).toHaveCount(7); // 3 hôm nay + 4 bước "Ngày đầu ở viện"
  await expect(p.getByText("Bước tiếp theo: Nhân viên lau dọn")).toBeVisible();
  await expect(p.getByText(/Điểm cống hiến: 0\/100/)).toBeVisible();
  await p.screenshot({ path: `test-results/progress-${test.info().project.name}-book.png` });

  // Bước 1 của chuỗi: đứng dưới hàng cột ở sân trước.
  await p.locator('[data-quest="firstday-1"]').getByRole("button", { name: /Dẫn đường/ }).click();
  await expect(p.getByText(/Sân trước ·/)).toBeVisible({ timeout: 15_000 });
  await walkUntil(p, "KeyW", p.getByText(/Hoàn thành nhiệm vụ/), 60_000);
  await p.screenshot({ path: `test-results/progress-${test.info().project.name}-guide.png` });

  await p.getByRole("button", { name: "Sổ nhiệm vụ" }).click();
  await expect(p.locator('[data-quest="firstday-1"]')).toHaveClass(/done/);
  await expect(p.getByText(/Chuỗi “Ngày đầu ở viện”: 1\/4 bước/)).toBeVisible();
});
