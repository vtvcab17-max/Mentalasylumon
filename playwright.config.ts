import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL: process.env.BASE_URL ?? "http://127.0.0.1:8787",
    // WebGL bằng phần mềm khi chạy không có GPU (máy CI / máy chủ).
    launchOptions: { args: ["--enable-unsafe-swiftshader", "--use-angle=swiftshader", "--ignore-gpu-blocklist"] },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    // Giả lập điện thoại Android tầm trung (SC-009)
    { name: "mobile-mid", use: { ...devices["Pixel 5"] } },
  ],
});
