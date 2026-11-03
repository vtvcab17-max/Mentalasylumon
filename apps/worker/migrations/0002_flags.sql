-- 0002_flags: cờ khủng hoảng và nhật ký xem cờ (FR-018, Constitution III)

CREATE TABLE crisis_flags (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL REFERENCES users(id),
  source      TEXT NOT NULL CHECK (source IN ('doctor_chat','circle','lecture_qa')),
  level       TEXT NOT NULL CHECK (level IN ('concern','acute')),
  category    TEXT NOT NULL CHECK (category IN ('self_harm','suicide','violence','abuse','other')),
  excerpt     TEXT,                                    -- mã hóa AES-GCM; xóa 90 ngày sau khi resolved
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_review','resolved')),
  resolved_by TEXT,
  resolved_at TEXT,
  note        TEXT,
  created_at  TEXT NOT NULL
);
CREATE INDEX crisis_flags_status ON crisis_flags (status, created_at);

CREATE TABLE flag_access_log (
  id            TEXT PRIMARY KEY,
  flag_id       TEXT NOT NULL REFERENCES crisis_flags(id),
  admin_user_id TEXT NOT NULL REFERENCES users(id),
  action        TEXT NOT NULL CHECK (action IN ('view','resolve')),
  at            TEXT NOT NULL
);

-- Nhật ký không sửa, không xóa được từ ứng dụng.
CREATE TRIGGER flag_access_log_no_update BEFORE UPDATE ON flag_access_log
BEGIN SELECT RAISE(ABORT, 'flag_access_log is append-only'); END;
CREATE TRIGGER flag_access_log_no_delete BEFORE DELETE ON flag_access_log
BEGIN SELECT RAISE(ABORT, 'flag_access_log is append-only'); END;
