#!/usr/bin/env node
// pnpm dev:local — chạy wrangler dev không cần tài khoản Cloudflare: bỏ binding Workers AI (binding này luôn
// gọi lên Cloudflare). Bác sĩ AI sẽ báo "tạm không trả lời được"; mọi phần khác chạy bình thường.
import { spawn } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const src = readFileSync("wrangler.jsonc", "utf8");
const out = src.replace(/^\s*"ai":\s*\{[^}]*\},?\s*$/m, "");
if (out === src) throw new Error("không tìm thấy khối \"ai\" trong wrangler.jsonc");
writeFileSync("wrangler.local.jsonc", out);
const child = spawn("npx", ["wrangler", "dev", "-c", "wrangler.local.jsonc", ...process.argv.slice(2)], { stdio: "inherit" });
child.on("exit", (code) => process.exit(code ?? 0));
