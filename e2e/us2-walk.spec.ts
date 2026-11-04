import { expect, test } from "@playwright/test";
import { doorStand, openAs, testUsers, walk, walkUntil, type TestUser } from "./helpers";

/**
 * US2 e2e (T075): hai người cùng tầng thấy nhau, cửa phòng người khác bị khóa, dùng bản đồ xuống sảnh và
 * ra vườn — vẫn thấy nhau. Chạy với server local: `pnpm dev:local` rồi `pnpm test:e2e --project desktop`.
 */

test.describe.configure({ mode: "serial" });
let users: TestUser[];

test.beforeAll(async () => {
  users = await testUsers(2);
});

test("hành lang → sảnh → vườn cùng người khác; cửa người khác khóa", async ({ browser, baseURL }) => {
  test.skip(!users[0].room, "cần tài khoản có thông tin phòng (server local)");
  test.setTimeout(120_000);
  const [ua, ub] = users;
  const a = await openAs(browser, baseURL!, ua.token);
  const b = await openAs(browser, baseURL!, ub.token);

  // Từ phòng riêng ra hành lang tầng của mình.
  for (const p of [a, b]) await p.getByRole("button", { name: /Ra hành lang/ }).click();
  const sameFloor = ua.room.wing === ub.room.wing && ua.room.floor === ub.room.floor;
  if (sameFloor) {
    await expect(a.getByText(/2 người ở đây/)).toBeVisible({ timeout: 15_000 });
    await expect(b.getByText(/2 người ở đây/)).toBeVisible({ timeout: 15_000 });
  }
  await expect(a.getByRole("button", { name: /Vào phòng của bạn/ })).toBeVisible();
  await a.screenshot({ path: `test-results/us2-${test.info().project.name}-corridor.png` });

  // A đi tới cửa phòng bên cạnh → cửa khóa (FR-010).
  const neighbour = ua.room.roomNumber % 2 === 1 ? ua.room.roomNumber + 1 : ua.room.roomNumber - 1;
  const [ax, az] = doorStand(ua.room.roomNumber);
  const [nx, nz] = doorStand(neighbour);
  await walk(a, nz > az ? "KeyS" : "KeyW", Math.abs(nz - az));
  await walk(a, nx > ax ? "KeyD" : "KeyA", Math.abs(nx - ax));
  const locked = a.getByRole("button", { name: new RegExp(`🔒 ${String(neighbour).padStart(2, "0")}`) });
  await expect(locked).toBeVisible();
  await locked.click();
  await expect(a.getByText(/cửa khóa, chỉ chủ phòng vào được/)).toBeVisible();

  // Bản đồ → sảnh chính (FR-011): cả hai cùng ở sảnh và thấy nhau.
  for (const p of [a, b]) {
    await p.getByRole("button", { name: /Bản đồ/ }).click();
    await p.getByRole("button", { name: /Sảnh chính/ }).click();
    await expect(p.getByText(/Sảnh chính ·/)).toBeVisible({ timeout: 15_000 });
  }
  await expect(a.getByText(/2 người ở đây/)).toBeVisible({ timeout: 15_000 });
  await b.getByRole("button", { name: "Vẫy tay" }).click();
  await a.waitForTimeout(800);
  await a.screenshot({ path: `test-results/us2-${test.info().project.name}-lobby.png` });

  // Từ cổng thang máy (đông) đi thẳng sang cổng vườn (tây).
  const toGarden = a.getByRole("button", { name: /Ra vườn/ });
  await walkUntil(a, "KeyA", toGarden);
  await toGarden.click();
  await expect(a.getByText(/Vườn ·/)).toBeVisible({ timeout: 15_000 });
  await a.waitForTimeout(800);
  await a.screenshot({ path: `test-results/us2-${test.info().project.name}-garden.png` });

  // Về phòng riêng qua bản đồ.
  await a.getByRole("button", { name: /Bản đồ/ }).click();
  await a.getByRole("button", { name: /Phòng của tôi/ }).click();
  await expect(a.getByRole("button", { name: /Gọi bác sĩ/ })).toBeVisible({ timeout: 15_000 });
});
