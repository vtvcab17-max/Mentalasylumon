import { DurableObject } from "cloudflare:workers";
import type { Env } from "../env";

/**
 * PatientRecord — mỗi người chơi một object (id = userId) (T049, research.md §R3, Constitution III).
 * Lưu lịch sử trò chuyện (nội dung đã mã hóa ở Worker trước khi gửi vào) và bộ đếm lượt hỏi.
 * Các thao tác SQL chạy đồng bộ trong một object, nên reserveMessage là nguyên tử (không vượt giới hạn
 * kể cả khi gửi đồng thời).
 */

export type ConversationRow = {
  id: string;
  doctor_id: string;
  started_at: string;
  last_message_at: string;
  feedback_asked: number;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  role: "user" | "doctor" | "safety";
  content: string; // ciphertext
  lang: "vi" | "en";
  safety_level: "none" | "concern" | "acute";
  created_at: string;
};

const SCHEMA = `
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY, doctor_id TEXT NOT NULL, started_at TEXT NOT NULL, last_message_at TEXT NOT NULL,
  feedback_asked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id),
  role TEXT NOT NULL, content TEXT NOT NULL, lang TEXT NOT NULL, safety_level TEXT NOT NULL, created_at TEXT NOT NULL,
  seq INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS messages_conv ON messages (conversation_id, seq);
CREATE TABLE IF NOT EXISTS usage_daily (date TEXT PRIMARY KEY, count INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS selfcare (id TEXT PRIMARY KEY, kind TEXT NOT NULL, value TEXT NOT NULL, day TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS selfcare_day ON selfcare (day);`;

export class PatientRecord extends DurableObject<Env> {
  private sql: SqlStorage;
  private seq = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.ensureSchema();
  }

  private ensureSchema() {
    this.sql.exec(SCHEMA);
    this.seq = (this.sql.exec<{ s: number | null }>("SELECT MAX(seq) AS s FROM messages").one().s ?? 0) as number;
  }

  reserveMessage(date: string, limit: number): { ok: boolean; used: number } {
    const used = this.sql.exec<{ count: number }>("SELECT count FROM usage_daily WHERE date = ?", date).toArray()[0]?.count ?? 0;
    if (used >= limit) return { ok: false, used };
    this.sql.exec(
      "INSERT INTO usage_daily (date, count) VALUES (?, 1) ON CONFLICT(date) DO UPDATE SET count = count + 1",
      date,
    );
    return { ok: true, used: used + 1 };
  }

  /** Trả lại lượt khi AI không trả lời được (không tính lượt cho lỗi của hệ thống). */
  refundMessage(date: string): void {
    this.sql.exec("UPDATE usage_daily SET count = MAX(count - 1, 0) WHERE date = ?", date);
  }

  usage(date: string): number {
    return this.sql.exec<{ count: number }>("SELECT count FROM usage_daily WHERE date = ?", date).toArray()[0]?.count ?? 0;
  }

  createConversation(doctorId: string): string {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.sql.exec("INSERT INTO conversations (id, doctor_id, started_at, last_message_at) VALUES (?, ?, ?, ?)", id, doctorId, now, now);
    return id;
  }

  getConversation(id: string): ConversationRow | null {
    return (this.sql.exec<ConversationRow>("SELECT * FROM conversations WHERE id = ?", id).toArray()[0] as ConversationRow) ?? null;
  }

  listConversations(): ConversationRow[] {
    return this.sql.exec<ConversationRow>("SELECT * FROM conversations ORDER BY last_message_at DESC").toArray() as ConversationRow[];
  }

  appendMessage(conversationId: string, role: MessageRow["role"], content: string, lang: MessageRow["lang"], safetyLevel: MessageRow["safety_level"]): string {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    this.sql.exec(
      "INSERT INTO messages (id, conversation_id, role, content, lang, safety_level, created_at, seq) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      id, conversationId, role, content, lang, safetyLevel, now, ++this.seq,
    );
    this.sql.exec("UPDATE conversations SET last_message_at = ? WHERE id = ?", now, conversationId);
    return id;
  }

  /** n tin gần nhất, theo thứ tự cũ → mới. */
  recentMessages(conversationId: string, n: number): MessageRow[] {
    const rows = this.sql
      .exec<MessageRow>(
        "SELECT id, conversation_id, role, content, lang, safety_level, created_at FROM messages WHERE conversation_id = ? ORDER BY seq DESC LIMIT ?",
        conversationId, n,
      )
      .toArray() as MessageRow[];
    return rows.reverse();
  }

  /** Trang tin nhắn cũ hơn `beforeId` (hoặc mới nhất), tối đa `limit`, theo thứ tự cũ → mới. */
  pageMessages(conversationId: string, beforeId: string | null, limit: number): MessageRow[] {
    const before = beforeId
      ? (this.sql.exec<{ seq: number }>("SELECT seq FROM messages WHERE id = ? AND conversation_id = ?", beforeId, conversationId).toArray()[0]?.seq ?? 0)
      : Number.MAX_SAFE_INTEGER;
    const rows = this.sql
      .exec<MessageRow>(
        "SELECT id, conversation_id, role, content, lang, safety_level, created_at FROM messages WHERE conversation_id = ? AND seq < ? ORDER BY seq DESC LIMIT ?",
        conversationId, before, limit,
      )
      .toArray() as MessageRow[];
    return rows.reverse();
  }

  deleteConversation(id: string): void {
    this.sql.exec("DELETE FROM messages WHERE conversation_id = ?", id);
    this.sql.exec("DELETE FROM conversations WHERE id = ?", id);
  }

  async deleteAll(): Promise<void> {
    await this.ctx.storage.deleteAll();
    this.ensureSchema();
  }

  // ── Nhật ký tự chăm sóc (002 FR-006): `value` đã mã hóa ở Worker; chỉ chủ tài khoản đọc. ──
  addSelfCare(kind: "mood" | "gratitude", value: string, day: string): string {
    const id = crypto.randomUUID();
    this.sql.exec("INSERT INTO selfcare (id, kind, value, day, created_at) VALUES (?, ?, ?, ?, ?)", id, kind, value, day, new Date().toISOString());
    return id;
  }

  listSelfCare(sinceDay: string): { id: string; kind: string; value: string; day: string }[] {
    return this.sql.exec<{ id: string; kind: string; value: string; day: string }>(
      "SELECT id, kind, value, day FROM selfcare WHERE day >= ? ORDER BY created_at DESC LIMIT 200", sinceDay,
    ).toArray() as { id: string; kind: string; value: string; day: string }[];
  }

  clearSelfCare(): void {
    this.sql.exec("DELETE FROM selfcare");
  }

  /** true nếu lần đầu hỏi "được lắng nghe" cho cuộc này. */
  markFeedback(conversationId: string): boolean {
    const r = this.sql.exec("UPDATE conversations SET feedback_asked = 1 WHERE id = ? AND feedback_asked = 0", conversationId);
    return r.rowsWritten > 0;
  }
}
