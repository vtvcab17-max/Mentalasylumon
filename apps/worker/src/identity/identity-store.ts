/**
 * IdentityStore (T019, research.md §R13, Constitution IV).
 * Mọi dữ liệu định danh (họ tên, ngày sinh, số điện thoại VN) chỉ đi qua interface này, để sau có thể
 * chuyển sang Postgres đặt tại Việt Nam (qua Cloudflare Hyperdrive) mà không sửa phần còn lại.
 * Bản thử nghiệm kín chưa thu các dữ liệu này.
 */

export interface IdentityRecord {
  userId: string;
  fullName: string | null;
  dateOfBirth: string | null;
  phoneVn: string | null;
  phoneVerifiedAt: string | null;
}

export interface IdentityStore {
  get(userId: string): Promise<IdentityRecord | null>;
  upsert(record: IdentityRecord): Promise<void>;
  delete(userId: string): Promise<void>;
}

export class D1IdentityStore implements IdentityStore {
  constructor(private db: D1Database) {}

  async get(userId: string): Promise<IdentityRecord | null> {
    const row = await this.db
      .prepare("SELECT user_id, full_name, date_of_birth, phone_vn, phone_verified_at FROM identity WHERE user_id = ?")
      .bind(userId)
      .first<Record<string, string | null>>();
    if (!row) return null;
    return {
      userId: row.user_id!,
      fullName: row.full_name,
      dateOfBirth: row.date_of_birth,
      phoneVn: row.phone_vn,
      phoneVerifiedAt: row.phone_verified_at,
    };
  }

  async upsert(r: IdentityRecord): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO identity (user_id, full_name, date_of_birth, phone_vn, phone_verified_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(user_id) DO UPDATE SET full_name = excluded.full_name, date_of_birth = excluded.date_of_birth,
           phone_vn = excluded.phone_vn, phone_verified_at = excluded.phone_verified_at`,
      )
      .bind(r.userId, r.fullName, r.dateOfBirth, r.phoneVn, r.phoneVerifiedAt)
      .run();
  }

  async delete(userId: string): Promise<void> {
    await this.db.prepare("DELETE FROM identity WHERE user_id = ?").bind(userId).run();
  }
}
