import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: process.env.BASE_URL ?? "http://localhost:8787" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Giả lập điện thoại Android tầm trung (SC-009)
    { name: "mobile-mid", use: { ...devices["Pixel 5"] } },
  ],
});
