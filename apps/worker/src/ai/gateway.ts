/**
 * Gọi model qua Cloudflare AI Gateway (T028, research.md §R6, Constitution: mọi lời gọi AI qua Gateway).
 * - Model "@cf/…" → Workers AI qua binding `AI` (không cần khóa), đi qua AI Gateway `AI_GATEWAY_ID`
 *   (mặc định "default", tự tạo ở lần gọi đầu).
 * - Model khác (ví dụ "claude-…") → Anthropic, cần ANTHROPIC_API_KEY.
 */

export interface GatewayEnv {
  AI?: Ai;
  ANTHROPIC_API_KEY?: string;
  AI_GATEWAY_ACCOUNT_ID?: string;
  AI_GATEWAY_ID?: string;
  APP_ENV?: string;
  /** Chỉ cho script eval chạy ngoài Worker (không có binding AI): gọi Workers AI qua REST. */
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
  /** "1" = dùng model giả cho mọi lời gọi (chỉ `pnpm dev:local`, không bao giờ ở production). */
  FAKE_AI?: string;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface CompleteOptions {
  model: string;
  system: string;
  messages: ChatMessage[];
  maxTokens: number;
  temperature?: number;
  timeoutMs?: number;
}

export class AiUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUnavailableError";
  }
}

function endpoint(env: GatewayEnv): string {
  if (env.AI_GATEWAY_ACCOUNT_ID) {
    return `https://gateway.ai.cloudflare.com/v1/${env.AI_GATEWAY_ACCOUNT_ID}/${env.AI_GATEWAY_ID}/anthropic/v1/messages`;
  }
  if (env.APP_ENV === "production") throw new AiUnavailableError("AI Gateway is required in production");
  return "https://api.anthropic.com/v1/messages";
}

function body(opts: CompleteOptions, stream: boolean) {
  return JSON.stringify({
    model: opts.model,
    max_tokens: opts.maxTokens,
    temperature: opts.temperature ?? 0.7,
    system: opts.system,
    messages: opts.messages,
    stream,
  });
}

/** Bỏ phần suy nghĩ nếu model trả kèm (<think>…</think>). */
function stripThinking(s: string) {
  return s.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
}

async function runWorkersAi(env: GatewayEnv, opts: CompleteOptions): Promise<string> {
  const run: (m: string, i: unknown, o: unknown) => Promise<unknown> = env.AI
    ? (env.AI.run as unknown as (m: string, i: unknown, o: unknown) => Promise<unknown>).bind(env.AI)
    : env.CLOUDFLARE_API_TOKEN && env.CLOUDFLARE_ACCOUNT_ID
      ? async (m, input) => {
          const res = await fetch(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/ai/run/${m}`, {
            method: "POST",
            headers: { authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, "content-type": "application/json" },
            body: JSON.stringify(input),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return ((await res.json()) as { result: unknown }).result;
        }
      : () => Promise.reject(new Error("Workers AI binding is not configured"));
  let out: unknown;
  try {
    out = await Promise.race([
      run(
        opts.model,
        {
          messages: [{ role: "system", content: opts.system }, ...opts.messages],
          max_tokens: opts.maxTokens,
          temperature: opts.temperature ?? 0.7,
          chat_template_kwargs: { enable_thinking: false },
        },
        { gateway: { id: env.AI_GATEWAY_ID || "default" } },
      ),
      new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), opts.timeoutMs ?? 25_000)),
    ]);
  } catch (e) {
    throw new AiUnavailableError(`Workers AI failed: ${(e as Error).message}`);
  }
  // Model cũ trả {response}; model mới trả dạng OpenAI {choices:[{message:{content}}]}.
  const o = out as { response?: unknown; choices?: { message?: { content?: string } }[] };
  const text = typeof o.response === "string" ? o.response : (o.choices?.[0]?.message?.content ?? "");
  if (!text) throw new AiUnavailableError("Workers AI returned no text");
  return stripThinking(text);
}

async function post(env: GatewayEnv, opts: CompleteOptions, stream: boolean): Promise<Response> {
  if (!env.ANTHROPIC_API_KEY) throw new AiUnavailableError("ANTHROPIC_API_KEY is not set");
  let res: Response;
  try {
    res = await fetch(endpoint(env), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: body(opts, stream),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 20_000),
    });
  } catch (e) {
    throw new AiUnavailableError(`AI request failed: ${(e as Error).message}`);
  }
  if (!res.ok) throw new AiUnavailableError(`AI request failed with HTTP ${res.status}`);
  return res;
}

export async function complete(env: GatewayEnv, opts: CompleteOptions): Promise<string> {
  if (env.APP_ENV !== "production" && (env.FAKE_AI === "1" || opts.model.startsWith("@test/"))) return fakeComplete(opts);
  if (opts.model.startsWith("@cf/")) return runWorkersAi(env, opts);
  const res = await post(env, opts, false);
  const data = (await res.json()) as { content?: { type: string; text?: string }[] };
  return (data.content ?? [])
    .filter((b) => b.type === "text")
    .map((b) => b.text ?? "")
    .join("");
}

/** Luồng chữ (SSE của Anthropic) → các đoạn text. */
export async function* stream(env: GatewayEnv, opts: CompleteOptions): AsyncGenerator<string> {
  const res = await post(env, opts, true);
  const reader = res.body!.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const evt = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const dataLine = evt.split("\n").find((l) => l.startsWith("data: "));
      if (!dataLine) continue;
      const data = JSON.parse(dataLine.slice(6)) as { type: string; delta?: { type: string; text?: string } };
      if (data.type === "content_block_delta" && data.delta?.type === "text_delta" && data.delta.text) {
        yield data.delta.text;
      }
    }
  }
}

// ── Model giả cho test và chạy ở máy (không mạng, kết quả tất định) ──────────
// Chỉ dùng khi APP_ENV ≠ production và model "@test/…" hoặc FAKE_AI=1. Lớp từ khóa an toàn vẫn chạy như thật.
const VI_CHARS = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
const FAKE_HARASS = /(đồ ngu|câm mồm|vô dụng|thằng điên|con điên|\bidiot\b|\bstupid\b|shut up|\bloser\b|nobody cares)/i;
const FAKE_HARMFUL = /(cách (tự tử|tự sát|cắt tay)|how to (kill|hurt|cut) (myself|yourself)|best way to die)/i;

function fakeComplete(opts: CompleteOptions): string {
  const last = opts.messages.at(-1)?.content ?? "";
  if (opts.system.includes("safety classifier")) {
    const text = last.match(/<<<\n([\s\S]*)\n>>>/)?.[1] ?? last;
    return JSON.stringify({
      level: "none",
      category: "none",
      asks_diagnosis: false,
      asks_medication: false,
      lang: VI_CHARS.test(text) ? "vi" : "en",
      harassment: FAKE_HARASS.test(text),
      harmful_content: FAKE_HARMFUL.test(text),
    });
  }
  const vi = /Vietnamese/.test(opts.system) || VI_CHARS.test(last);
  return vi ? "(AI thử nghiệm) Cảm ơn bạn đã chia sẻ. Bạn muốn kể thêm không?" : "(Test AI) Thanks for sharing. Would you like to tell me more?";
}
