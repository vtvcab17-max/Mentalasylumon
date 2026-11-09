// Tạo người chơi giả đã qua onboarding — CHỈ cho server local (wrangler dev + D1 --local).
// Phần 18+ và đồng ý được ghi thẳng vào D1 local; biệt danh + nhân vật đi qua API thật để được cấp phòng.
import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export const BASE = process.env.BASE_URL ?? "http://127.0.0.1:8787";

const HAIR = ["short", "bob", "long", "spiky", "bun", "curly"];
const OUTFIT = ["hoodie", "cardigan", "pajamas", "tshirt", "coat"];
const SKIN = ["#f6dcc3", "#f1c9a5", "#e0b48f", "#c68e65"];
const HAIR_C = ["#1d1d1d", "#3b2a20", "#5a3a22", "#d4a373"];
const OUTFIT_C = ["#8fc1b5", "#f2b5a7", "#f6d186", "#a3c4f3", "#cdb4db"];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function assertLocal() {
  if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(BASE)) {
    throw new Error(`Chỉ chạy với server local (BASE_URL=${BASE}). Không dùng cho bản thật.`);
  }
}

export const headers = (cookie) => ({ cookie, "X-Requested-With": "bvo", "content-type": "application/json" });

async function pool(items, size, fn) {
  const out = [];
  let i = 0;
  await Promise.all(
    Array.from({ length: size }, async () => {
      while (i < items.length) {
        const k = i++;
        out[k] = await fn(items[k], k);
      }
    }),
  );
  return out;
}

export async function createUsers(n, { prefix = "sim", locale = "vi" } = {}) {
  assertLocal();
  const terms = await (await fetch(`${BASE}/api/terms?lang=vi`)).json();
  const now = new Date().toISOString();
  const exp = new Date(Date.now() + 7 * 86400e3).toISOString();
  const items = JSON.stringify({ ai_disclosure: true, sensitive_data: true, admin_flag_review: true, overseas_ai_processing: true });
  const users = [];
  const sql = [];
  for (let i = 0; i < n; i++) {
    const id = randomUUID();
    const token = randomUUID() + randomUUID();
    const hash = createHash("sha256").update(token).digest("hex");
    sql.push(
      `INSERT INTO users (id, google_sub, email, locale, age_confirmed_at, created_at) VALUES ('${id}','sim-${id}','${id}@sim.local','${locale}','${now}','${now}');`,
      `INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES ('${hash}','${id}','${now}','${exp}');`,
      `INSERT INTO consents (id, user_id, terms_version, items, granted_at) VALUES ('${randomUUID()}','${id}','${terms.version}','${items}','${now}');`,
    );
    users.push({ id, token, cookie: `sid=${token}`, nickname: `${prefix}${i}_${id.replace(/-/g, "").slice(0, 8)}`.slice(0, 20) });
  }
  const file = join(mkdtempSync(join(tmpdir(), "bvo-sim-")), "users.sql");
  writeFileSync(file, sql.join("\n"));
  execFileSync("npx", ["wrangler", "d1", "execute", "benh-vien-dev", "--local", "--file", file], { stdio: "pipe" });

  await pool(users, 8, async (u) => {
    const avatar = {
      parts: { head: "round", hair: pick(HAIR), outfit: pick(OUTFIT), accessory: null },
      colors: { skin: pick(SKIN), hair: pick(HAIR_C), outfit: pick(OUTFIT_C) },
    };
    const res = await fetch(`${BASE}/api/onboarding/profile`, { method: "POST", headers: headers(u.cookie), body: JSON.stringify({ nickname: u.nickname, avatar }) });
    if (!res.ok) throw new Error(`profile ${res.status}: ${await res.text()}`);
    u.room = await res.json();
  });
  return users;
}

/** Chạy SQL trên D1 local (chỉ dùng cho test/mô phỏng ở máy). */
export function localSql(sql) {
  assertLocal();
  const file = join(mkdtempSync(join(tmpdir(), "bvo-sql-")), "q.sql");
  writeFileSync(file, sql);
  execFileSync("npx", ["wrangler", "d1", "execute", "benh-vien-dev", "--local", "--file", file], { stdio: "pipe" });
}
