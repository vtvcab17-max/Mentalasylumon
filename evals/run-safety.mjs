#!/usr/bin/env node
// pnpm eval:safety [--lang vi,en] [--allow-seed] [--concurrency 4]
// Bundle evals/safety-runner.ts (dùng code pipeline thật) rồi chạy. Thoát mã ≠ 0 khi không đạt ngưỡng.
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

const out = join(mkdtempSync(join(tmpdir(), "bvo-eval-")), "runner.mjs");
await build({
  entryPoints: [join(here, "safety-runner.ts")],
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node20",
  outfile: out,
  logLevel: "error",
});

const { run } = await import(pathToFileURL(out).href);
const code = await run({
  root: here,
  langs: arg("--lang", "vi,en").split(","),
  allowSeed: args.includes("--allow-seed"),
  concurrency: Number(arg("--concurrency", "4")),
});
process.exit(code);
