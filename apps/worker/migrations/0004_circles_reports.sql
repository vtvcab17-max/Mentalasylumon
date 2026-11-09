-- 0004_circles_reports: vòng sinh hoạt, lịch sinh hoạt, báo cáo vi phạm (T078, data-model.md, FR-022–FR-028, FR-038)

CREATE TABLE circles (
  id         TEXT PRIMARY KEY,
  name       TEXT NOT NULL CHECK (length(name) BETWEEN 2 AND 60),
  language   TEXT NOT NULL CHECK (language IN ('vi','en')),
  max_seats  INTEGER NOT NULL DEFAULT 12 CHECK (max_seats BETWEEN 4 AND 20),
  active     INTEGER NOT NULL DEFAULT 1,
  sort       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE circle_sessions (
  id         TEXT PRIMARY KEY,
  circle_id  TEXT NOT NULL REFERENCES circles(id),
  doctor_id  TEXT NOT NULL REFERENCES doctors(id),
  topic      TEXT NOT NULL CHECK (length(topic) BETWEEN 2 AND 120),
  starts_at  TEXT NOT NULL,
  ends_at    TEXT NOT NULL,
  status     TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','live','ended')),
  CHECK (ends_at > starts_at)
);
CREATE INDEX circle_sessions_next ON circle_sessions (circle_id, status, starts_at);

CREATE TABLE reports (
  id               TEXT PRIMARY KEY,
  reporter_id      TEXT NOT NULL REFERENCES users(id),
  reported_user_id TEXT NOT NULL REFERENCES users(id),
  context          TEXT NOT NULL,                     -- JSON {circleId, messageId}
  message_snapshot TEXT,                              -- nội dung tin lúc báo cáo (đã qua kiểm duyệt, công khai trong vòng)
  reason           TEXT NOT NULL CHECK (reason IN ('harassment','harmful','spam','other')),
  status           TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','actioned','dismissed')),
  action           TEXT CHECK (action IS NULL OR action IN ('hide','suspend','ban','none')),
  handled_by       TEXT REFERENCES users(id),
  handled_at       TEXT,
  created_at       TEXT NOT NULL,
  CHECK (reporter_id <> reported_user_id)
);
CREATE INDEX reports_status ON reports (status, created_at);
-- Mỗi người chỉ báo cáo một tin một lần.
CREATE UNIQUE INDEX reports_once ON reports (reporter_id, context);

-- Vòng mặc định (mỗi ngôn ngữ một vòng); quản trị viên thêm/sửa ở trang admin.
INSERT INTO circles (id, name, language, max_seats, active, sort, created_at) VALUES
  ('vong-chia-se', 'Vòng chia sẻ', 'vi', 12, 1, 10, '2026-11-09T00:00:00Z'),
  ('vong-binh-yen', 'Vòng bình yên', 'vi', 12, 1, 20, '2026-11-09T00:00:00Z'),
  ('sharing-circle', 'Sharing circle', 'en', 12, 1, 30, '2026-11-09T00:00:00Z');
