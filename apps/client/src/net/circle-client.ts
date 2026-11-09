import { CircleServerMsg } from "@bvo/shared";

/** Kết nối tới một vòng sinh hoạt (ws-protocol.md "CircleRoom"). Mất kết nối → thử lại 1, 2, 4, 8, 15 giây. */

export type CircleMsg = CircleServerMsg;
const BACKOFF = [1000, 2000, 4000, 8000, 15000];

export class CircleClient {
  private ws: WebSocket | null = null;
  private closedByUs = false;
  private attempt = 0;

  constructor(
    private circleId: string,
    private h: { onMessage(m: CircleMsg): void; onStatus?(s: "open" | "reconnecting"): void; onKicked?(reason: string): void },
  ) {}

  connect() {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/circle/${this.circleId}`);
    this.ws = ws;
    let ping: ReturnType<typeof setInterval> | null = null;
    ws.onopen = () => {
      this.attempt = 0;
      this.h.onStatus?.("open");
      ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('{"t":"ping"}'), 25_000);
    };
    ws.onmessage = (e) => {
      let parsed;
      try {
        parsed = CircleServerMsg.safeParse(JSON.parse(String(e.data)));
      } catch {
        return;
      }
      if (!parsed.success) return;
      if (parsed.data.t === "kicked") {
        this.closedByUs = true;
        this.h.onKicked?.(parsed.data.reason);
        return;
      }
      this.h.onMessage(parsed.data);
    };
    ws.onclose = () => {
      if (ping) clearInterval(ping);
      if (this.ws !== ws || this.closedByUs) return;
      this.h.onStatus?.("reconnecting");
      setTimeout(() => !this.closedByUs && this.connect(), BACKOFF[Math.min(this.attempt++, BACKOFF.length - 1)]);
    };
  }

  private raw(m: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }
  sit(seat: number) {
    this.raw({ t: "sit", seat });
  }
  stand() {
    this.raw({ t: "stand" });
  }
  chat(text: string, clientMsgId: string) {
    this.raw({ t: "chat", text, clientMsgId });
  }
  thank(messageId: string) {
    this.raw({ t: "thank", messageId });
  }
  close() {
    this.closedByUs = true;
    this.ws?.close(1000, "leave");
    this.ws = null;
  }
}
