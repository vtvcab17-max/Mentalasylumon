-- 0001_core: tài khoản, đồng ý, phiên, chặn, cấu hình, đường dây nóng, định danh (data-model.md)

CREATE TABLE users (
  id               TEXT PRIMARY KEY,
  google_sub       TEXT NOT NULL UNIQUE,
  email            TEXT NOT NULL,                      -- không bao giờ gửi cho người chơi khác
  locale           TEXT NOT NULL DEFAULT 'vi' CHECK (locale IN ('vi','en')),
  nickname         TEXT CHECK (nickname IS NULL OR length(nickname) BETWEEN 2 AND 20),
  avatar           TEXT,                               -- JSON
  age_confirmed_at TEXT,
  role             TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player','admin')),
  status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','banned','deleted')),
  suspended_until  TEXT,
  room_id          TEXT UNIQUE,
  created_at       TEXT NOT NULL,
  last_seen_at     TEXT
);
CREATE UNIQUE INDEX users_nickname_ci ON users (lower(nickname)) WHERE nickname IS NOT NULL;

CREATE TABLE consents (
  id            TEXT PRIMARY KEY,
  user_id       TEXT NOT NULL REFERENCES users(id),
  terms_version TEXT NOT NULL,
  items         TEXT NOT NULL,                         -- JSON {ai_disclosure, sensitive_data, admin_flag_review, overseas_ai_processing}
  granted_at    TEXT NOT NULL,
  withdrawn_at  TEXT
);
CREATE INDEX consents_user ON consents (user_id, terms_version);

CREATE TABLE sessions (
  id         TEXT PRIMARY KEY,                         -- SHA-256 hex của token
  user_id    TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);
CREATE INDEX sessions_expires ON sessions (expires_at);

CREATE TABLE blocks (
  blocker_id TEXT NOT NULL REFERENCES users(id),
  blocked_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL,
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE support_resources (
  id          TEXT PRIMARY KEY,
  name_vi     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  phone       TEXT CHECK (phone IS NULL OR (phone <> '' AND phone NOT GLOB '*[^0-9 ]*')),
  url         TEXT,
  scope       TEXT NOT NULL CHECK (scope IN ('emergency','crisis','youth','violence','international')),
  schedule    TEXT,                                    -- JSON; NULL = 24/7
  is_free     INTEGER,
  locales     TEXT NOT NULL DEFAULT '["vi","en"]',     -- JSON
  verified_at TEXT NOT NULL,
  sort        INTEGER NOT NULL DEFAULT 0,
  CHECK (phone IS NOT NULL OR url IS NOT NULL)
);

-- Dành sẵn cho IdentityStore (research.md §R13). Chưa dùng trong thử nghiệm kín.
CREATE TABLE identity (
  user_id           TEXT PRIMARY KEY REFERENCES users(id),
  full_name         TEXT,
  date_of_birth     TEXT,
  phone_vn          TEXT,
  phone_verified_at TEXT
);
