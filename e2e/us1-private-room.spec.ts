import { expect, test } from "@playwright/test";
import { testUsers } from "./helpers";

/**
 * US1 e2e (T043). Cần: server đang chạy (BASE_URL), D1 đã seed, và một phiên đăng nhập thử
 * (E2E_SESSION = giá trị cookie `sid` của tài khoản test, vì đăng nhập Google không tự động hóa được).
 */
let session: string | undefined = process.env.E2E_SESSION;

test("màn đầu cho chọn ngôn ngữ, chọn English thì giao diện tiếng Anh", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("button", { name: "English" })).toBeVisible();
  await page.getByRole("button", { name: "English" }).click();
  await expect(page.getByText("Welcome to the Online Mental Hospital")).toBeVisible();
  await expect(page.getByRole("button", { name: /Get help now/ })).toBeVisible();
});

test("nút Cần giúp đỡ ngay luôn có và hiện số 115", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Tiếng Việt" }).click();
  await page.getByRole("button", { name: /Cần giúp đỡ ngay/ }).click();
  await expect(page.getByText("115").first()).toBeVisible();
});

test.describe("đã đăng nhập", () => {
  test.beforeAll(async () => {
    session ??= (await testUsers(1))[0].token;
  });

  test.beforeEach(async ({ context, baseURL }) => {
    await context.addCookies([{ name: "sid", value: session!, url: baseURL! }]);
    await context.addInitScript(() => localStorage.setItem("bvo.locale", "vi"));
  });

  test("vào phòng, gọi bác sĩ, tin khủng hoảng nhận mẫu an toàn có nhãn AI", async ({ page }) => {
    await page.goto("/play");
    await page.getByRole("button", { name: /Gọi bác sĩ/ }).click();
    await page.getByRole("button", { name: /Bác sĩ An/ }).click();
    await page.getByPlaceholder("Viết điều bạn muốn kể…").fill("tối nay tôi sẽ tự tử");
    await page.getByRole("button", { name: "Gửi" }).click();
    await expect(page.locator(".bvo-msg.safety")).toContainText("115");
    await expect(page.locator(".bvo-msg.safety .bvo-ai")).toHaveText("AI");
  });
});
