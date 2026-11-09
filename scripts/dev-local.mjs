#!/usr/bin/env node
// pnpm dev:local — chạy wrangler dev không cần tài khoản Cloudflare: bỏ binding Workers AI (binding này luôn
// gọi lên Cloudflare) và bật model giả FAKE_AI=1: bác sĩ AI trả câu thử nghiệm, bộ phân loại an toàn trả kết quả
// tất định (lớp từ khóa vẫn chạy thật) để thử vòng sinh hoạt ở máy.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("wrangler.jsonc", "utf8");
const out = src.replace(/^\s*"ai":\s*\{[^}]*\},?\s*$/m, "");
if (out === src) throw new Error("không tìm thấy khối \"ai\" trong wrangler.jsonc");
const withFake = out.replace(/"vars":\s*\{\n\s*"APP_ENV": "dev",/, (m) => `${m}\n    "FAKE_AI": "1",`);
if (withFake === out) throw new Error("không tìm thấy vars APP_ENV dev trong wrangler.jsonc");
writeFileSync("wrangler.local.jsonc", withFake);
const child = spawn("npx", ["wrangler", "dev", "-c", "wrangler.local.jsonc", ...process.argv.slice(2)], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
