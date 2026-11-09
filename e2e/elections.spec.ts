import { expect, test } from "@playwright/test";
import { localSql, openAs, testUsers, timeTravel, type TestUser } from "./helpers";

/**
 * 002 US4/US5 e2e: Trưởng khoa ứng cử → 3 Thực tập sinh bỏ phiếu kín → công bố → Viện trưởng chọn trang trí,
 * gửi thông báo → người khác thấy. Đồng hồ máy chủ được tua (server local, ALLOW_TIME_TRAVEL=1).
 */

test.describe.configure({ mode: "serial" });
let users: TestUser[];
// Tuần riêng cho mỗi lượt chạy để không đụng dữ liệu cũ.
const year = 2031 + Math.floor(Math.random() * 60);
const W = `${year}-W10`;
const mon = new Date(Date.UTC(year, 0, 4 - ((new Date(Date.UTC(year, 0, 4)).getUTCDay() || 7) - 1)) + 9 * 7 * 86400_000 - 7 * 3600_000);
const at = (days: number, hours: number) => new Date(mon.getTime() + days * 86400_000 + hours * 3600_000).toISOString();

test.beforeAll(async () => {
  users = await testUsers(4);
  if (!users[0].id) return;
  const created = new Date(mon.getTime() - 60 * 86400_000).toISOString();
  localSql(
    users
      .map((u, i) => `INSERT OR REPLACE INTO user_progress (user_id, rank, updated_at) VALUES ('${u.id}', ${i === 0 ? 6 : 5}, '${created}'); UPDATE users SET created_at = '${created}' WHERE id = '${u.id}';`)
      .join("\n"),
  );
});

test("bầu Viện trưởng và một tuần làm Viện trưởng", async ({ browser, baseURL }) => {
  test.skip(!users[0].room, "cần server local");
  test.setTimeout(180_000);
  const [head, ...interns] = users;

  // Thứ Năm: Trưởng khoa ứng cử.
  const hp = await openAs(browser, baseURL!, head.token);
  await timeTravel(hp, at(3, 3));
  await hp.getByRole("button", { name: /Bản đồ/ }).click();
  await hp.getByRole("button", { name: /Hội đồng & bầu cử/ }).click();
  await expect(hp.getByText(`Kỳ bầu cử ${W}`)).toBeVisible({ timeout: 15_000 });
  await hp.getByPlaceholder(/Lời hứa của bạn/).fill("Mình sẽ chọn chủ đề Giấc ngủ và treo đèn lồng");
  await hp.getByText("Chủ đề tuần", { exact: true }).click();
  await hp.getByText("Trang trí viện", { exact: true }).click();
  await hp.getByRole("button", { name: "Ứng cử", exact: true }).click();
  await expect(hp.getByText("Đã ghi danh ứng cử.")).toBeVisible();

  // Thứ Bảy: 3 thành viên Hội đồng bỏ phiếu kín.
  for (const u of interns) {
    const p = await openAs(browser, baseURL!, u.token);
    await timeTravel(p, at(5, 4));
    await p.getByRole("button", { name: /Bản đồ/ }).click();
    await p.getByRole("button", { name: /Hội đồng & bầu cử/ }).click();
    await expect(p.getByText("Mình sẽ chọn chủ đề Giấc ngủ", { exact: false })).toBeVisible({ timeout: 15_000 });
    await p.getByRole("button", { name: "Bầu cho người này" }).click();
    await expect(p.getByRole("button", { name: /Phiếu của bạn/ })).toBeVisible();
    await p.context().close();
  }

  // Chủ Nhật 20:10: công bố.
  await timeTravel(hp, at(6, 20.2));
  await hp.locator(".bvo-council .bvo-x").click();
  await hp.getByRole("button", { name: /Bản đồ/ }).click();
  await hp.getByRole("button", { name: /Hội đồng & bầu cử/ }).click();
  await expect(hp.getByText(`Viện trưởng tuần tới: ${head.nickname}`)).toBeVisible({ timeout: 15_000 });

  // Thứ Hai tuần sau: nhận chức, mở bàn làm việc.
  await timeTravel(hp, at(7, 9));
  await hp.locator(".bvo-council .bvo-x").click();
  await hp.getByRole("button", { name: /Bản đồ/ }).click();
  await hp.getByRole("button", { name: /Hội đồng & bầu cử/ }).click();
  await expect(hp.getByText(`Viện trưởng tuần này: ${head.nickname}`)).toBeVisible({ timeout: 15_000 });
  await hp.getByRole("button", { name: /Bàn làm việc Viện trưởng/ }).first().click();
  await hp.getByRole("button", { name: "Giấc ngủ" }).click();
  await hp.getByRole("button", { name: "Đèn lồng" }).click();
  await hp.getByPlaceholder(/Lời nhắn tới cả viện/).fill("Tuần này mình cùng ngủ sớm nhé!");
  await hp.getByRole("button", { name: /Gửi thông báo/ }).click();
  await expect(hp.getByText("Đã gửi thông báo.")).toBeVisible();
  await hp.screenshot({ path: `test-results/elections-${test.info().project.name}-desk.png` });

  // Một Thực tập sinh vào sảnh: thấy thông báo và đèn lồng.
  const vp = await openAs(browser, baseURL!, interns[0].token);
  await timeTravel(vp, at(7, 10));
  await vp.getByRole("button", { name: /Bản đồ/ }).click();
  await vp.getByRole("button", { name: /Sảnh chính/ }).click();
  await expect(vp.getByText("Tuần này mình cùng ngủ sớm nhé!")).toBeVisible({ timeout: 15_000 });
  await vp.waitForTimeout(1000);
  await vp.screenshot({ path: `test-results/elections-${test.info().project.name}-lobby.png` });
  await vp.context().close();
  await hp.context().close();
});
