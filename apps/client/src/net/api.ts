import { getLocale } from "../i18n";

/** Gọi API (T039): header chống CSRF, lỗi chung, đọc Server-Sent Events. Xem contracts/http-api.md. */

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "ApiError";
  }
}

function withLang(path: string) {
  return path + (path.includes("?") ? "&" : "?") + `lang=${getLocale()}`;
}

async function toError(res: Response): Promise<ApiError> {
  try {
    const body = (await res.json()) as { error?: { code: string; message: string } & Record<string, unknown> };
    if (body.error) {
      const { code, message, ...extra } = body.error;
      return new ApiError(res.status, code, message, extra);
    }
  } catch {
    /* không phải JSON */
  }
  return new ApiError(res.status, "HTTP_" + res.status, res.statusText);
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(withLang(path), {
      method: init.method ?? (init.body === undefined ? "GET" : "POST"),
      credentials: "same-origin",
      headers: {
        "X-Requested-With": "bvo",
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiError(0, "NETWORK", "network");
  }
  if (!res.ok) throw await toError(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export interface SseEvent {
  event: string;
  data: unknown;
}

/** POST rồi đọc luồng SSE (dùng cho trò chuyện với bác sĩ AI). */
export async function* postSse(path: string, body: unknown): AsyncGenerator<SseEvent> {
  const res = await fetch(withLang(path), {
    method: "POST",
    credentials: "same-origin",
    headers: { "X-Requested-With": "bvo", "content-type": "application/json", accept: "text/event-stream" },
    body: JSON.stringify(body),
  });
  if (!res.ok || !res.body) throw await toError(res);
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let buf = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += value;
    let i: number;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      let event = "message";
      const data: string[] = [];
      for (const line of chunk.split("\n")) {
        if (line.startsWith("event:")) event = line.slice(6).trim();
        else if (line.startsWith("data:")) data.push(line.slice(5).trimStart());
      }
      if (!data.length) continue;
      const raw = data.join("\n");
      let parsed: unknown = raw;
      try {
        parsed = JSON.parse(raw);
      } catch {
        /* để nguyên chuỗi */
      }
      yield { event, data: parsed };
    }
  }
}
