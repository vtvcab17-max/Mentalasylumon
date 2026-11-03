-- 0003_world_doctors: khu/tầng/phòng, bác sĩ AI, phản hồi "được lắng nghe" (T044, data-model.md)

CREATE TABLE wings (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  sort        INTEGER NOT NULL UNIQUE,
  floor_count INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL
);

CREATE TABLE floors (
  id           TEXT PRIMARY KEY,
  wing_id      TEXT NOT NULL REFERENCES wings(id),
  floor_number INTEGER NOT NULL CHECK (floor_number BETWEEN 1 AND 10),
  UNIQUE (wing_id, floor_number)
);

CREATE TABLE rooms (
  id            TEXT PRIMARY KEY,
  floor_id      TEXT NOT NULL REFERENCES floors(id),
  room_number   INTEGER NOT NULL CHECK (room_number BETWEEN 1 AND 40),
  owner_user_id TEXT UNIQUE REFERENCES users(id),
  assigned_at   TEXT,
  UNIQUE (floor_id, room_number)
);
CREATE INDEX rooms_free ON rooms (owner_user_id, floor_id, room_number);

CREATE TABLE doctors (
  id             TEXT PRIMARY KEY,
  name           TEXT NOT NULL,
  topic          TEXT NOT NULL,
  display        TEXT NOT NULL,                     -- JSON {vi:{title,bio}, en:{title,bio}}
  avatar         TEXT NOT NULL,                     -- JSON AvatarSpec
  persona_prompt TEXT NOT NULL,                     -- tính cách; quy tắc an toàn dùng chung nằm trong code
  active         INTEGER NOT NULL DEFAULT 1,
  sort           INTEGER NOT NULL DEFAULT 0
);

-- Không có user_id, không có nội dung (SC-007, Constitution III).
CREATE TABLE feedback (
  id         TEXT PRIMARY KEY,
  doctor_id  TEXT NOT NULL REFERENCES doctors(id),
  felt_heard TEXT NOT NULL CHECK (felt_heard IN ('yes','somewhat','no')),
  locale     TEXT NOT NULL CHECK (locale IN ('vi','en')),
  created_at TEXT NOT NULL
);

-- lower() của SQLite chỉ xử lý ASCII ("Ă" ≠ "ă"); biệt danh viết thường được tính ở Worker (Unicode).
ALTER TABLE users ADD COLUMN nickname_lc TEXT;
CREATE UNIQUE INDEX users_nickname_lc ON users (nickname_lc) WHERE nickname_lc IS NOT NULL;
