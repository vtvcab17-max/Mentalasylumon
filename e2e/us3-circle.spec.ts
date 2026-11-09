import { expect, test } from "@playwright/test";
import { openAs, testUsers, type TestUser } from "./helpers";

/**
 * US3 e2e (T085, quickstart.md "US3"): hai người vào cùng vòng, ngồi ghế, nhắn tin cho nhau; tin xúc phạm bị chặn
 * chỉ người gửi thấy lý do; báo cáo và chặn. Chạy với `pnpm dev:local` (FAKE_AI=1: bộ phân loại giả, lớp từ khóa thật).
 */

test.describe.configure({ mode: "serial" });
let users: TestUser[];

test.beforeAll(async () => {
  users = await testUsers(2);
});

test("vòng sinh hoạt: ngồi ghế, trò chuyện, kiểm duyệt, báo cáo, chặn", async ({ browser, baseURL }) => {
  test.skip(!users[0].room, "cần server local (tự tạo tài khoản thử)");
  test.setTimeout(120_000);
  const a = await openAs(browser, baseURL!, users[0].token);
  const b = await openAs(browser, baseURL!, users[1].token);
  b.on("dialog", (d) => void d.accept());

  for (const p of [a, b]) {
    await p.getByRole("button", { name: /Bản đồ/ }).click();
    await p.getByRole("button", { name: /Phòng sinh hoạt/ }).click();
    await p.getByRole("button", { name: /Vòng bình yên/ }).click();
    // Quy tắc cộng đồng lần đầu (FR-025).
    await expect(p.getByRole("heading", { name: "Quy tắc của vòng sinh hoạt" })).toBeVisible({ timeout: 15_000 });
    await p.getByRole("button", { name: "Mình đồng ý" }).click();
    await expect(p.getByText(/Bạn đã vào Vòng bình yên/)).toBeVisible({ timeout: 15_000 });
    await expect(p.getByPlaceholder("Ngồi vào ghế để trò chuyện")).toBeDisabled();
    await p.getByRole("button", { name: /Ngồi xuống/ }).click();
    await expect(p.getByRole("button", { name: /Đứng dậy/ })).toBeVisible();
  }
  // Có thể có người khác (lượt chạy song song) trong cùng vòng.
  await expect(a.getByText(/([2-9]|1[0-2])\/12 ghế/)).toBeVisible({ timeout: 10_000 });

  // Tin bình thường tới người kia.
  const hello = `Chào mọi người ${Date.now() % 1000}`;
  await a.getByPlaceholder("Chia sẻ với cả vòng…").fill(hello);
  await a.keyboard.press("Enter");
  await expect(b.getByText(hello)).toBeVisible({ timeout: 10_000 });

  // Tin xúc phạm: chỉ người gửi thấy lý do (FR-027).
  await a.waitForTimeout(3100);
  await a.getByPlaceholder("Chia sẻ với cả vòng…").fill("Đồ ngu, câm mồm đi");
  await a.keyboard.press("Enter");
  await expect(a.getByText(/Tin chưa được gửi: có lời lẽ xúc phạm/)).toBeVisible({ timeout: 10_000 });
  await b.waitForTimeout(800);
  await expect(b.getByText("Đồ ngu, câm mồm đi")).toHaveCount(0);
  await a.screenshot({ path: `test-results/us3-${test.info().project.name}-circle-a.png` });

  // B báo cáo tin của A rồi chặn A (FR-026).
  const helloBubble = b.locator(".bvo-msg", { hasText: hello });
  await helloBubble.getByRole("button", { name: /Tùy chọn cho tin của/ }).click();
  await b.getByRole("menuitem", { name: /Báo cáo/ }).click();
  await b.getByRole("button", { name: "Quấy rối, xúc phạm" }).click();
  await expect(b.getByText(/Quản trị viên sẽ xem trong vòng 24 giờ/)).toBeVisible();
  await helloBubble.getByRole("button", { name: /Tùy chọn cho tin của/ }).click();
  await b.getByRole("menuitem", { name: /Chặn/ }).click();
  await expect(b.getByText(hello)).toHaveCount(0);

  await a.waitForTimeout(3100);
  const after = `Sau khi bị chặn ${Date.now() % 1000}`;
  await a.getByPlaceholder("Chia sẻ với cả vòng…").fill(after);
  await a.keyboard.press("Enter");
  await expect(a.getByText(after)).toBeVisible();
  await b.waitForTimeout(1500);
  await expect(b.getByText(after)).toHaveCount(0);
  await b.screenshot({ path: `test-results/us3-${test.info().project.name}-circle-b.png` });

  // Rời vòng → về sảnh.
  await a.getByRole("button", { name: /Rời vòng/ }).click();
  await expect(a.getByText(/Sảnh chính ·/)).toBeVisible({ timeout: 15_000 });
});
