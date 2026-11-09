#!/usr/bin/env node
// pnpm eval:moderation [--allow-seed] [--concurrency 4]
// Bundle evals/moderation-runner.ts (dùng moderatePublic thật) rồi chạy. Đạt khi chặn ≥ 95% tin xấu (SC-006).
import { build } from "esbuild";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const arg = (name, def) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : def;
};

const out = join(mkdtempSync(join(tmpdir(), "bvo-mod-")), "runner.mjs");
await build({ entryPoints: [join(here, "moderation-runner.ts")], bundle: true, platform: "node", format: "esm", target: "node20", outfile: out, logLevel: "error" });
const { run } = await import(pathToFileURL(out).href);
process.exit(await run({ root: here, allowSeed: args.includes("--allow-seed"), concurrency: Number(arg("--concurrency", "4")) }));
