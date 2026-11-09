import { CircleClientMsg, type CircleChat, type CircleSeat, type CircleServerMsg } from "@bvo/shared";
import { DurableObject } from "cloudflare:workers";
import { facilitatorLine, type FacilitatorCue } from "../ai/facilitator";
import { getSettings } from "../db/settings";
import type { Env } from "../env";
import { createFlag, notifyAdmins } from "../safety/flags";
import { moderatePublic, type SafetyDeps } from "../safety/pipeline";
import { loadResourceRows, toPublic } from "../safety/resources";

/**
 * CircleRoom — một vòng sinh hoạt (T079, ws-protocol.md "CircleRoom", research.md §R11, FR-022–FR-027).
 * - Ghế: mỗi socket (tag = userId) giữ ghế trong attachment; ngồi ghế mới chat được.
 * - Mọi tin đi qua `moderatePublic` TRƯỚC khi phát (FR-027). Tin bị chặn chỉ người gửi biết lý do;
 *   tin có dấu hiệu khủng hoảng → người gửi nhận riêng `support` và hệ thống tạo cờ (source "circle").
 * - Không phát tin cho người đã chặn người gửi; `recent` lọc theo danh sách chặn của người nhận.
 * - ≤ 1 tin mỗi 3 giây. Tin lưu ở SQLite của DO và tự xóa sau 30 ngày (alarm).
 * - Bác sĩ AI dẫn dắt theo `circle_sessions` (alarm lúc bắt đầu/kết thúc).
 */

interface Member {
  id: string;
  nickname: string;
  avatar: unknown;
  locale: "vi" | "en";
  seat: number | null;
  lastChat: number;
}

interface CircleRow {
  id: string;
  name: string;
  language: "vi" | "en";
  max_seats: number;
  active: number;
}

interface SessionRow {
  id: string;
  doctor_id: string;
  topic: string;
  starts_at: string;
  ends_at: string;
  status: "scheduled" | "live" | "ended";
}

export const CHAT_INTERVAL_MS = 3000;
export const RETENTION_MS = 30 * 24 * 3600 * 1000;
const RECENT = 50;
const DAY = 24 * 3600 * 1000;

export class CircleRoom extends DurableObject<Env> {
  private sql: SqlStorage;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"t":"ping"}', '{"t":"pong"}'));
    ctx.blockConcurrencyWhile(async () => {
      this.sql.exec(`CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY, user_id TEXT NOT NULL, nickname TEXT NOT NULL, text TEXT NOT NULL,
        created_at INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0)`);
      this.sql.exec("CREATE INDEX IF NOT EXISTS messages_time ON messages (created_at)");
      this.sql.exec("CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL)");
    });
  }

  // ── tiện ích ────────────────────────────────────────────────────────
  private kvGet(k: string): string | null {
    const row = this.sql.exec<{ v: string }>("SELECT v FROM kv WHERE k = ?", k).toArray()[0];
    return row?.v ?? null;
  }
  private kvSet(k: string, v: string) {
    this.sql.exec("INSERT OR REPLACE INTO kv (k, v) VALUES (?, ?)", k, v);
  }

  private sockets(): WebSocket[] {
    return this.ctx.getWebSockets().filter((ws) => ws.readyState === 1);
  }
  private member(ws: WebSocket): Member | null {
    return (ws.deserializeAttachment() as Member | null) ?? null;
  }
  private send(ws: WebSocket, msg: CircleServerMsg) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      /* socket vừa đóng */
    }
  }
  private broadcast(msg: CircleServerMsg, skip?: (m: Member) => boolean) {
    const data = JSON.stringify(msg);
    for (const ws of this.sockets()) {
      const m = this.member(ws);
      if (!m || skip?.(m)) continue;
      try {
        ws.send(data);
      } catch {
        /* bỏ qua */
      }
    }
  }

  private async circle(): Promise<CircleRow | null> {
    const id = this.kvGet("circleId");
    if (!id) return null;
    return this.env.DB.prepare("SELECT id, name, language, max_seats, active FROM circles WHERE id = ?").bind(id).first<CircleRow>();
  }

  private seats(): CircleSeat[] {
    const out: CircleSeat[] = [];
    for (const ws of this.sockets()) {
      const m = this.member(ws);
      if (m && m.seat !== null) out.push({ seat: m.seat, userId: m.id, nickname: m.nickname, avatar: m.avatar });
    }
    return out.sort((a, b) => a.seat - b.seat);
  }

  // ── RPC cho Worker ──────────────────────────────────────────────────
  /** Số người đang ở trong vòng (không tính `excludeUserId`). */
  members(excludeUserId?: string): number {
    const ids = new Set<string>();
    for (const ws of this.sockets()) {
      const m = this.member(ws);
      if (m && m.id !== excludeUserId) ids.add(m.id);
    }
    return ids.size;
  }

  /** Dùng khi tạo báo cáo: chụp nội dung tin. */
  getMessage(id: string): { userId: string; text: string; hidden: boolean } | null {
    const r = this.sql.exec<{ user_id: string; text: string; hidden: number }>("SELECT user_id, text, hidden FROM messages WHERE id = ?", id).toArray()[0];
    return r ? { userId: r.user_id, text: r.text, hidden: !!r.hidden } : null;
  }

  /** Quản trị viên ẩn tin (FR-028): biến mất ở mọi người. */
  hide(id: string): boolean {
    const r = this.sql.exec("UPDATE messages SET hidden = 1 WHERE id = ? AND hidden = 0", id);
    if (!r.rowsWritten) return false;
    this.broadcast({ t: "chat_hidden", id });
    return true;
  }

  /** Người bị khóa/cấm: ngắt ngay. */
  kick(userId: string, reason = "SUSPENDED") {
    for (const ws of this.ctx.getWebSockets(userId)) {
      const m = this.member(ws);
      if (m) ws.serializeAttachment({ ...m, seat: null });
      this.send(ws, { t: "kicked", reason });
      try {
        ws.close(4003, reason.toLowerCase());
      } catch {
        /* đã đóng */
      }
      if (m?.seat !== null && m?.seat !== undefined) this.broadcast({ t: "seat_update", seat: m.seat, userId: null });
    }
  }

  /** Lịch sinh hoạt vừa đổi ở trang admin. */
  async refreshSchedule(circleId?: string) {
    if (circleId && !this.kvGet("circleId")) this.kvSet("circleId", circleId);
    await this.planAlarm();
  }

  // ── kết nối ─────────────────────────────────────────────────────────
  async fetch(req: Request): Promise<Response> {
    if (req.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("expected websocket", { status: 426 });
    const userId = req.headers.get("X-User-Id");
    const circleId = req.headers.get("X-Zone-Id");
    if (!userId || !circleId) return new Response("forbidden", { status: 403 });
    if (!this.kvGet("circleId")) this.kvSet("circleId", circleId);
    const circle = await this.circle();
    if (!circle || !circle.active) return new Response("not found", { status: 404 });

    let avatar: unknown = null;
    try {
      avatar = JSON.parse(req.headers.get("X-User-Avatar") ?? "null");
    } catch {
      avatar = null;
    }
    const me: Member = {
      id: userId,
      nickname: decodeURIComponent(req.headers.get("X-User-Nickname") ?? ""),
      avatar,
      locale: req.headers.get("X-User-Locale") === "en" ? "en" : "vi",
      seat: null,
      lastChat: 0,
    };

    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

    const previous = this.ctx.getWebSockets(userId).filter((ws) => ws.readyState === 1);
    if (!previous.length && this.members() >= circle.max_seats) {
      server.accept();
      this.send(server, { t: "kicked", reason: "CIRCLE_FULL" });
      server.close(4000, "circle full");
      return new Response(null, { status: 101, webSocket: client });
    }
    for (const old of previous) {
      const m = this.member(old);
      if (m) old.serializeAttachment({ ...m, seat: null });
      this.send(old, { t: "kicked", reason: "DUPLICATE" });
      try {
        old.close(4001, "duplicate");
      } catch {
        /* đã đóng */
      }
      if (m?.seat !== null && m?.seat !== undefined) this.broadcast({ t: "seat_update", seat: m.seat, userId: null });
    }

    this.ctx.acceptWebSocket(server, [userId]);
    server.serializeAttachment(me);

    const blocked = await this.blockedBy(userId);
    const recent = this.sql
      .exec<{ id: string; user_id: string; nickname: string; text: string; created_at: number }>(
        "SELECT id, user_id, nickname, text, created_at FROM messages WHERE hidden = 0 AND created_at > ? ORDER BY created_at DESC LIMIT ?",
        Date.now() - RETENTION_MS,
        RECENT,
      )
      .toArray()
      .reverse()
      .filter((r) => !blocked.has(r.user_id))
      .map((r): CircleChat => ({ t: "chat", id: r.id, from: { id: r.user_id, nickname: r.nickname }, text: r.text, ts: new Date(r.created_at).toISOString() }));

    const session = await this.currentSession(circle.id);
    this.send(server, {
      t: "welcome",
      selfId: userId,
      circle: { id: circle.id, name: circle.name, language: circle.language, maxSeats: circle.max_seats },
      seats: this.seats(),
      recent,
      session: session ? { status: session.status, topic: session.topic, startsAt: session.starts_at } : null,
    });
    // Mỗi lần có người vào: chắc chắn đã hẹn giờ cho buổi sinh hoạt kế tiếp và lần dọn tin.
    this.ctx.waitUntil(this.planAlarm());
    return new Response(null, { status: 101, webSocket: client });
  }

  /** Những người mà `userId` đã chặn. */
  private async blockedBy(userId: string): Promise<Set<string>> {
    const { results } = await this.env.DB.prepare("SELECT blocked_id FROM blocks WHERE blocker_id = ?").bind(userId).all<{ blocked_id: string }>();
    return new Set(results.map((r) => r.blocked_id));
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== "string" || raw.length > 2048) return;
    const me = this.member(ws);
    if (!me) return;
    let parsed;
    try {
      parsed = CircleClientMsg.safeParse(JSON.parse(raw));
    } catch {
      return;
    }
    if (!parsed.success) return;
    const msg = parsed.data;

    if (msg.t === "sit") {
      const circle = await this.circle();
      if (!circle || msg.seat >= circle.max_seats) return;
      if (me.seat === msg.seat) return;
      const taken = this.seats().some((s) => s.seat === msg.seat && s.userId !== me.id);
      if (taken) return this.send(ws, { t: "warn", code: "SEAT_TAKEN" });
      const old = me.seat;
      me.seat = msg.seat;
      ws.serializeAttachment(me);
      if (old !== null) this.broadcast({ t: "seat_update", seat: old, userId: null });
      this.broadcast({ t: "seat_update", seat: msg.seat, userId: me.id, nickname: me.nickname, avatar: me.avatar });
      return;
    }

    if (msg.t === "stand") {
      if (me.seat === null) return;
      const old = me.seat;
      me.seat = null;
      ws.serializeAttachment(me);
      this.broadcast({ t: "seat_update", seat: old, userId: null });
      return;
    }

    // chat
    if (me.seat === null) return this.send(ws, { t: "warn", code: "NOT_SEATED" });
    const now = Date.now();
    if (now - me.lastChat < CHAT_INTERVAL_MS) return this.send(ws, { t: "chat_rejected", clientMsgId: msg.clientMsgId, reason: "spam" });
    me.lastChat = now;
    ws.serializeAttachment(me);

    const circle = await this.circle();
    const result = await moderatePublic(await this.safetyDeps(me.id), msg.text, circle?.language ?? me.locale);
    if (result.support) this.send(ws, { t: "support", message: result.support.message, resources: result.support.resources });
    if (result.action === "block") return this.send(ws, { t: "chat_rejected", clientMsgId: msg.clientMsgId, reason: result.reason });

    const id = crypto.randomUUID();
    this.sql.exec("INSERT INTO messages (id, user_id, nickname, text, created_at) VALUES (?, ?, ?, ?, ?)", id, me.id, me.nickname, msg.text, now);
    // Ai đã chặn người gửi thì không nhận tin này.
    const { results } = await this.env.DB.prepare("SELECT blocker_id FROM blocks WHERE blocked_id = ?").bind(me.id).all<{ blocker_id: string }>();
    const blockers = new Set(results.map((r) => r.blocker_id));
    this.broadcast(
      { t: "chat", id, from: { id: me.id, nickname: me.nickname }, text: msg.text, ts: new Date(now).toISOString() },
      (m) => blockers.has(m.id),
    );
  }

  private async safetyDeps(userId: string): Promise<SafetyDeps> {
    const settings = await getSettings(this.env.DB);
    return {
      ai: this.env,
      classifierModel: settings.model_classifier,
      loadResources: async (l) => toPublic(await loadResourceRows(this.env.DB), l, new Date()),
      onFlag: async (f) => {
        const id = await createFlag(this.env, {
          userId,
          source: "circle",
          level: f.level,
          category: f.category,
          excerpt: { message: f.text, reply: f.reply },
        });
        this.ctx.waitUntil(notifyAdmins(this.env.DB, { id, level: f.level, source: "circle" }));
      },
    };
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
    const m = this.member(ws);
    if (!m || m.seat === null) return;
    ws.serializeAttachment({ ...m, seat: null });
    this.broadcast({ t: "seat_update", seat: m.seat, userId: null }, (o) => o.id === m.id);
  }

  // ── lịch sinh hoạt + dọn tin (alarm) ────────────────────────────────
  private async currentSession(circleId: string): Promise<SessionRow | null> {
    return this.env.DB.prepare(
      `SELECT id, doctor_id, topic, starts_at, ends_at, status FROM circle_sessions
        WHERE circle_id = ? AND status <> 'ended' AND ends_at > ? ORDER BY starts_at LIMIT 1`,
    )
      .bind(circleId, new Date().toISOString())
      .first<SessionRow>();
  }

  private async planAlarm() {
    const circleId = this.kvGet("circleId");
    if (!circleId) return;
    const now = Date.now();
    let next = now + DAY; // dọn tin cũ mỗi ngày
    const s = await this.currentSession(circleId);
    if (s) next = Math.min(next, Math.max(now + 50, Date.parse(s.status === "live" ? s.ends_at : s.starts_at)));
    // Phiên đã quá giờ kết thúc nhưng chưa đóng → xử lý ngay.
    const stale = await this.env.DB.prepare("SELECT 1 FROM circle_sessions WHERE circle_id = ? AND status <> 'ended' AND ends_at <= ? LIMIT 1")
      .bind(circleId, new Date(now).toISOString())
      .first();
    if (stale) next = now + 50;
    const current = await this.ctx.storage.getAlarm();
    if (current === null || current > next || current < now) await this.ctx.storage.setAlarm(next);
  }

  async alarm() {
    this.sql.exec("DELETE FROM messages WHERE created_at < ?", Date.now() - RETENTION_MS);
    const circleId = this.kvGet("circleId");
    const circle = await this.circle();
    if (circleId && circle) await this.runSchedule(circle);
    await this.planAlarm();
  }

  private async runSchedule(circle: CircleRow) {
    const nowIso = new Date().toISOString();
    // Đóng các phiên đã hết giờ.
    const { results: ending } = await this.env.DB.prepare(
      "SELECT id, doctor_id, topic, starts_at, ends_at, status FROM circle_sessions WHERE circle_id = ? AND status <> 'ended' AND ends_at <= ?",
    )
      .bind(circle.id, nowIso)
      .all<SessionRow>();
    for (const s of ending) {
      await this.env.DB.prepare("UPDATE circle_sessions SET status = 'ended' WHERE id = ?").bind(s.id).run();
      if (s.status === "live") {
        await this.say(circle, s, ["closing"]);
        this.broadcast({ t: "session", status: "ended", topic: s.topic });
      }
    }
    // Mở phiên tới giờ.
    const s = await this.currentSession(circle.id);
    if (s && s.status === "scheduled" && s.starts_at <= nowIso) {
      await this.env.DB.prepare("UPDATE circle_sessions SET status = 'live' WHERE id = ?").bind(s.id).run();
      this.broadcast({ t: "session", status: "live", topic: s.topic });
      await this.say(circle, s, ["opening", "rules", "invite"]);
    }
  }

  /** Bác sĩ AI nói các câu dẫn dắt (mỗi câu chỉ một lần mỗi phiên). */
  private async say(circle: CircleRow, s: SessionRow, cues: FacilitatorCue[]) {
    const doctor = await this.env.DB.prepare("SELECT id, display, persona_prompt FROM doctors WHERE id = ?")
      .bind(s.doctor_id)
      .first<{ id: string; display: string; persona_prompt: string }>();
    let name = s.doctor_id;
    try {
      name = (JSON.parse(doctor?.display ?? "{}") as Record<string, { title?: string }>)[circle.language]?.title ?? name;
    } catch {
      /* giữ id */
    }
    const { model_chat } = await getSettings(this.env.DB);
    for (const cue of cues) {
      const key = `said:${s.id}:${cue}`;
      if (this.kvGet(key)) continue;
      this.kvSet(key, "1");
      const text = await facilitatorLine(this.env, model_chat, { cue, lang: circle.language, topic: s.topic, doctorName: name, persona: doctor?.persona_prompt });
      this.broadcast({ t: "facilitator", doctor: { id: s.doctor_id, name }, text, label: "AI" });
    }
  }
}
