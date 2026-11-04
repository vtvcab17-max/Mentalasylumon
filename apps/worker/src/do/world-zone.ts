import { ZoneClientMsg, type ZoneServerMsg } from "@bvo/shared";
import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env";

/**
 * WorldZone — một không gian chung (sảnh, vườn, hành lang một tầng) (T065, research.md §R2, ws-protocol.md).
 * - WebSocket Hibernation: socket gắn tag = userId; trạng thái người chơi lưu bằng serializeAttachment
 *   (≤ 2 KB) để sống qua lúc object ngủ — tối đa 2 giây/lần mỗi người (mất vài giây vị trí khi ngủ là chấp nhận được).
 * - Giới hạn tốc độ kiểu "xô token": trung bình ≤ 6 tin/giây, cho phép dồn ngắn hạn tới 10 tin.
 * - Client gửi `move` tối đa 5 lần/giây (server cho lệch tới 6 vì đồng hồ client không đều); server gộp và gửi
 *   `snapshot` tối đa 10 lần/giây (5 lần/giây khi zone > 80 người).
 * - Snapshot là phần thay đổi: chỉ người vừa di chuyển hoặc vừa vào tầm nhìn, cộng danh sách `gone` (vừa ra khỏi
 *   tầm nhìn). Tầm nhìn = tối đa 80 người gần nhất trong bán kính 30 m.
 * - Không ai di chuyển thì không có timer, object được ngủ.
 * - Đầy (zone_capacity) thì báo `zone_full` kèm bản sao kế tiếp.
 * Danh tính (X-User-*) do Worker gắn sau khi kiểm phiên; DO chỉ nhận request từ Worker.
 */

type Anim = "idle" | "walk" | "sit" | "wave";
type Vec3 = [number, number, number];

interface PlayerState {
  id: string;
  nickname: string;
  avatar: unknown;
  p: Vec3;
  r: number;
  a: Anim;
  lastEmote: number;
}

/** Trạng thái chỉ giữ trong bộ nhớ (không lưu khi ngủ). */
interface Volatile {
  tokens: number;
  refillAt: number;
  drops: number;
  lastWarn: number;
  persistedAt: number;
}

export const MOVE_PER_SECOND = 6; // client gửi ≤ 5; +1 cho độ lệch đồng hồ
export const MOVE_BURST = 10;
const PERSIST_MS = 2000;
export const SNAPSHOT_MS = 100;
export const SNAPSHOT_MS_CROWDED = 200;
export const CROWDED = 80;
export const VIEW_RADIUS = 30;
export const MAX_VIEW = 60;
const BOUND = 200;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

export function nextZoneId(zoneId: string): string {
  const m = zoneId.match(/^(.*)-(\d+)$/);
  return m ? `${m[1]}-${Number(m[2]) + 1}` : `${zoneId}-2`;
}

export class WorldZone extends DurableObject<Env> {
  private players = new Map<WebSocket, PlayerState>();
  private dirty = new Set<string>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private tick = 0;
  private views = new WeakMap<WebSocket, Set<string>>();
  private vol = new WeakMap<WebSocket, Volatile>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
  }

  private isOpen(ws: WebSocket) {
    return ws.readyState === 1;
  }

  private sockets(): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => this.isOpen(ws));
  }

  private state(ws: WebSocket): PlayerState | null {
    let s = this.players.get(ws);
    if (!s) {
      s = (ws.deserializeAttachment() as PlayerState | null) ?? undefined;
      if (s) this.players.set(ws, s);
    }
    return s ?? null;
  }

  private save(ws: WebSocket, s: PlayerState) {
    this.players.set(ws, s);
    ws.serializeAttachment(s);
    this.volatile(ws).persistedAt = Date.now();
  }

  private volatile(ws: WebSocket): Volatile {
    let v = this.vol.get(ws);
    if (!v) {
      v = { tokens: MOVE_BURST, refillAt: Date.now(), drops: 0, lastWarn: 0, persistedAt: 0 };
      this.vol.set(ws, v);
    }
    return v;
  }

  private send(ws: WebSocket, msg: ZoneServerMsg) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket vừa đóng */
    }
  }

  private broadcast(msg: ZoneServerMsg, except?: WebSocket) {
    const data = JSON.stringify(msg);
    for (const ws of this.sockets()) {
      if (ws === except) continue;
      try {
        ws.send(data);
      } catch {
        /* bỏ qua */
      }
    }
  }

  /** Số người (không tính `excludeUserId`) đang ở zone — dùng khi chọn bản sao còn chỗ. */
  count(excludeUserId?: string): number {
    const ids = new Set<string>();
    for (const ws of this.sockets()) {
      const s = this.state(ws);
      if (s && s.id !== excludeUserId) ids.add(s.id);
    }
    return ids.size;
  }

  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("expected websocket", { status: 426 });
    const userId = req.headers.get("X-User-Id");
    const zoneId = req.headers.get("X-Zone-Id") ?? "";
    if (!userId) return new Response("forbidden", { status: 403 });
    const capacity = Number(req.headers.get("X-Zone-Capacity")) || 150;
    const nickname = decodeURIComponent(req.headers.get("X-User-Nickname") ?? "");
    let avatar: unknown = null;
    try {
      avatar = JSON.parse(req.headers.get("X-User-Avatar") ?? "null");
    } catch {
      avatar = null;
    }
    const url = new URL(req.url);
    const p: Vec3 = [
      r2(clamp(Number(url.searchParams.get("x")) || 0, -BOUND, BOUND)),
      0,
      r2(clamp(Number(url.searchParams.get("z")) || 0, -BOUND, BOUND)),
    ];

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    const previous = this.ctx.getWebSockets(userId).filter((ws) => this.isOpen(ws));
    if (!previous.length && this.count() >= capacity) {
      server.accept();
      server.send(JSON.stringify({ t: "zone_full", redirectZoneId: nextZoneId(zoneId) } satisfies ZoneServerMsg));
      server.close(4000, "zone full");
      return new Response(null, { status: 101, webSocket: client });
    }

    // Cùng tài khoản mở tab mới: đóng tab cũ.
    for (const old of previous) {
      this.send(old, { t: "kicked", reason: "DUPLICATE" });
      this.players.delete(old);
      try {
        old.close(4001, "duplicate");
      } catch {
        /* đã đóng */
      }
    }

    this.ctx.acceptWebSocket(server, [userId]);
    const me: PlayerState = { id: userId, nickname, avatar, p, r: 0, a: "idle", lastEmote: 0 };
    this.save(server, me);

    const others = this.sockets()
      .filter((ws) => ws !== server)
      .map((ws) => this.state(ws))
      .filter((s): s is PlayerState => !!s && s.id !== userId)
      .map((s) => ({ id: s.id, nickname: s.nickname, avatar: s.avatar, p: s.p, r: s.r, a: s.a }));
    this.send(server, { t: "welcome", selfId: userId, zoneId, players: others });
    this.broadcast({ t: "join", player: { id: me.id, nickname: me.nickname, avatar: me.avatar, p: me.p, r: me.r, a: me.a } }, server);
    // Snapshot đầu tiên cho người mới (ai đang ở gần) và cho người khác (người mới xuất hiện).
    this.dirty.add(userId);
    this.schedule();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string" || raw.length > 512) return;
    const s = this.state(ws);
    if (!s) return;
    let parsed;
    try {
      parsed = ZoneClientMsg.safeParse(JSON.parse(raw));
    } catch {
      return;
    }
    if (!parsed.success) return;
    const msg = parsed.data;
    const now = Date.now();

    if (msg.t === "move") {
      const v = this.volatile(ws);
      v.tokens = Math.min(MOVE_BURST, v.tokens + ((now - v.refillAt) / 1000) * MOVE_PER_SECOND);
      v.refillAt = now;
      if (v.tokens < 1) {
        v.drops++;
        if (v.drops > 3 && now - v.lastWarn > 1000) {
          v.lastWarn = now;
          this.send(ws, { t: "warn", code: "RATE_LIMITED" });
        }
        return;
      }
      v.tokens -= 1;
      s.p = [r2(clamp(msg.p[0], -BOUND, BOUND)), r2(clamp(msg.p[1], -1, 20)), r2(clamp(msg.p[2], -BOUND, BOUND))];
      s.r = r2(((msg.r % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI));
      s.a = msg.a;
      this.players.set(ws, s);
      if (now - v.persistedAt > PERSIST_MS) this.save(ws, s);
      this.dirty.add(s.id);
      this.schedule();
      return;
    }

    if (msg.t === "emote") {
      if (now - s.lastEmote < 2000) return;
      s.lastEmote = now;
      this.save(ws, s);
      const out: ZoneServerMsg = { t: "emote", id: s.id, e: msg.e };
      for (const other of this.sockets()) {
        const o = this.state(other);
        if (other !== ws && o && dist2(o.p, s.p) <= VIEW_RADIUS * VIEW_RADIUS) this.send(other, out);
      }
    }
  }

  private schedule() {
    if (this.timer) return;
    const ms = this.ctx.getWebSockets().length > CROWDED ? SNAPSHOT_MS_CROWDED : SNAPSHOT_MS;
    this.timer = setTimeout(() => this.flush(), ms);
  }

  private flush() {
    this.timer = null;
    if (!this.dirty.size) return;
    this.tick++;
    const all = this.sockets()
      .map((ws) => [ws, this.state(ws)] as const)
      .filter((x): x is readonly [WebSocket, PlayerState] => !!x[1]);
    const R2 = VIEW_RADIUS * VIEW_RADIUS;
    // Mỗi người chỉ được chuyển sang JSON một lần mỗi nhịp.
    const cache = new Map<string, string>();
    const entry = (o: PlayerState) => {
      let e = cache.get(o.id);
      if (!e) {
        e = JSON.stringify({ id: o.id, p: o.p, r: o.r, a: o.a });
        cache.set(o.id, e);
      }
      return e;
    };
    for (const [ws, me] of all) {
      let near = all.map(([, o]) => o).filter((o) => o.id !== me.id && dist2(o.p, me.p) <= R2);
      if (near.length > MAX_VIEW) near = near.sort((a, b) => dist2(a.p, me.p) - dist2(b.p, me.p)).slice(0, MAX_VIEW);
      const prev = this.views.get(ws) ?? new Set<string>();
      const view = new Set(near.map((o) => o.id));
      const entries = near.filter((o) => this.dirty.has(o.id) || !prev.has(o.id)).map(entry);
      const gone = [...prev].filter((id) => !view.has(id));
      this.views.set(ws, view);
      if (!entries.length && !gone.length) continue;
      try {
        ws.send(`{"t":"snapshot","tick":${this.tick},"players":[${entries.join(",")}],"gone":${JSON.stringify(gone)}}`);
      } catch {
        /* socket vừa đóng */
      }
    }
    this.dirty.clear();
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string) {
    this.leave(ws);
    try {
      ws.close(code === 1005 ? 1000 : code, reason);
    } catch {
      /* đã đóng */
    }
  }

  async webSocketError(ws: WebSocket) {
    this.leave(ws);
  }

  private leave(ws: WebSocket) {
    const s = this.state(ws);
    this.players.delete(ws);
    if (!s) return;
    const stillHere = this.ctx.getWebSockets(s.id).some((o) => o !== ws && this.isOpen(o));
    if (!stillHere) {
      this.broadcast({ t: "leave", id: s.id }, ws);
      this.dirty.delete(s.id);
    }
  }
}

function dist2(a: Vec3, b: Vec3) {
  const dx = a[0] - b[0];
  const dz = a[2] - b[2];
  return dx * dx + dz * dz;
}
