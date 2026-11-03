/**
 * Gọi model qua Cloudflare AI Gateway (T028, research.md §R6, Constitution: mọi lời gọi AI qua Gateway).
 * Khi chưa cấu hình AI_GATEWAY_ACCOUNT_ID (chỉ ở dev), gọi thẳng Anthropic.
 */

export interface GatewayEnv {
  ANTHROPIC_API_KEY: string;
  AI_GATEWAY_ACCOUNT_ID: string;
  AI_GATEWAY_ID: string;
  APP_ENV?: string;
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
