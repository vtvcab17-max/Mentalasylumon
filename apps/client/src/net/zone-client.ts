import { ZoneServerMsg } from "@bvo/shared";

/**
 * Kết nối realtime tới một zone (T069, contracts/ws-protocol.md).
 * - Gửi `move` tối đa 5 lần/giây và chỉ khi có thay đổi.
 * - `zone_full` → tự chuyển sang bản sao kế tiếp. `kicked` → dừng, không kết nối lại.
 * - Mất kết nối → thử lại sau 1, 2, 4, 8, 15 giây.
 */

export type ZoneMsg = ZoneServerMsg;
export type ZoneStatus = "connecting" | "open" | "reconnecting" | "closed";

export interface ZoneHandlers {
  onMessage(msg: ZoneMsg): void;
  onStatus?(s: ZoneStatus): void;
  onRedirect?(zoneId: string): void;
  onKicked?(reason: string): void;
}

const MIN_INTERVAL = 200;
const BACKOFF = [1000, 2000, 4000, 8000, 15000];

export class ZoneClient {
  private ws: WebSocket | null = null;
  private closedByUs = false;
  private attempt = 0;
  private lastSent = 0;
  private last: { p: [number, number, number]; r: number; a: string } | null = null;
  private pending: { p: [number, number, number]; r: number; a: string } | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    public zoneId: string,
    private spawn: () => [number, number],
    private h: ZoneHandlers,
  ) {}

  connect() {
    this.closedByUs = false;
    const [x, z] = this.spawn();
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/ws/zone/${this.zoneId}?x=${x.toFixed(2)}&z=${z.toFixed(2)}`);
    this.ws = ws;
    this.h.onStatus?.(this.attempt ? "reconnecting" : "connecting");
    let ping: ReturnType<typeof setInterval> | null = null;
    ws.onopen = () => {
      this.attempt = 0;
      this.last = null;
      this.h.onStatus?.("open");
      ping = setInterval(() => ws.readyState === WebSocket.OPEN && ws.send('{"t":"ping"}'), 25_000);
    };
    ws.onmessage = (e) => {
      let msg: ZoneMsg;
      try {
        const parsed = ZoneServerMsg.safeParse(JSON.parse(String(e.data)));
        if (!parsed.success) return;
        msg = parsed.data;
      } catch {
        return;
      }
      if (msg.t === "zone_full") {
        this.closedByUs = true;
        this.zoneId = msg.redirectZoneId;
        this.h.onRedirect?.(msg.redirectZoneId);
        ws.close();
        this.closedByUs = false;
        this.connect();
        return;
      }
      if (msg.t === "kicked") {
        this.closedByUs = true;
        this.h.onKicked?.(msg.reason);
        return;
      }
      this.h.onMessage(msg);
    };
    ws.onclose = () => {
      if (ping) clearInterval(ping);
      if (this.ws !== ws) return;
      if (this.closedByUs) {
        this.h.onStatus?.("closed");
        return;
      }
      const delay = BACKOFF[Math.min(this.attempt, BACKOFF.length - 1)];
      this.attempt++;
      this.h.onStatus?.("reconnecting");
      setTimeout(() => !this.closedByUs && this.connect(), delay);
    };
  }

  private raw(m: unknown) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  /** Gọi mỗi khung; tự lọc trùng và giới hạn tần suất. */
  move(p: [number, number, number], r: number, a: string) {
    const prev = this.pending ?? this.last;
    const changed =
      !prev ||
      prev.a !== a ||
      Math.abs(prev.r - r) > 0.08 ||
      Math.hypot(prev.p[0] - p[0], prev.p[2] - p[2]) > 0.05;
    if (!changed) return;
    this.pending = { p: [round(p[0]), round(p[1]), round(p[2])], r: round(r), a };
    const wait = MIN_INTERVAL - (performance.now() - this.lastSent);
    if (wait <= 0) this.flush();
    else if (!this.flushTimer) this.flushTimer = setTimeout(() => this.flush(), wait);
  }

  private flush() {
    this.flushTimer = null;
    if (!this.pending || this.ws?.readyState !== WebSocket.OPEN) return;
    this.raw({ t: "move", ...this.pending });
    this.last = this.pending;
    this.pending = null;
    this.lastSent = performance.now();
  }

  emote(e: "wave" | "heart" | "nod") {
    this.raw({ t: "emote", e });
  }

  close() {
    this.closedByUs = true;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.ws?.close(1000, "leave");
    this.ws = null;
  }
}

const round = (v: number) => Math.round(v * 100) / 100;
