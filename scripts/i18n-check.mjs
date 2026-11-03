#!/usr/bin/env node
// pnpm i18n:check — so khóa vi.json ↔ en.json trong mọi thư mục i18n (SC-011, Constitution V).
import { readFileSync } from "node:fs";

const DIRS = ["apps/client/src/i18n", "apps/worker/src/i18n"];

function keys(obj, prefix = "") {
  return Object.entries(obj).flatMap(([k, v]) =>
    v && typeof v === "object" ? keys(v, `${prefix}${k}.`) : [`${prefix}${k}`],
  );
}

let problems = 0;
for (const dir of DIRS) {
  const vi = JSON.parse(readFileSync(`${dir}/vi.json`, "utf8"));
  const en = JSON.parse(readFileSync(`${dir}/en.json`, "utf8"));
  const kv = new Set(keys(vi));
  const ke = new Set(keys(en));
  const report = (msg) => {
    problems++;
    console.error(msg);
  };
  for (const k of kv) if (!ke.has(k)) report(`✗ ${dir}: thiếu "${k}" trong en.json`);
  for (const k of ke) if (!kv.has(k)) report(`✗ ${dir}: thiếu "${k}" trong vi.json`);
  const empty = [...keys(vi).map((k) => ["vi", k]), ...keys(en).map((k) => ["en", k])].filter(([l, k]) => {
    const v = k.split(".").reduce((o, p) => o?.[p], l === "vi" ? vi : en);
    return typeof v !== "string" || v.trim() === "";
  });
  for (const [l, k] of empty) report(`✗ ${dir}: "${k}" rỗng trong ${l}.json`);
}
if (problems) process.exit(1);
console.log(`✓ i18n: ${DIRS.length} bộ chuỗi vi/en khớp nhau`);
