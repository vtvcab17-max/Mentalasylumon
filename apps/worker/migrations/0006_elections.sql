-- 0006_elections: bầu Viện trưởng hằng tuần, nhiệm kỳ, danh mục chọn sẵn (specs/002-ranks-quests/data-model.md, T028)

CREATE TABLE elections (
  id            TEXT PRIMARY KEY,                    -- tuần ứng cử, ví dụ '2026-W46'
  nominate_from TEXT NOT NULL,
  nominate_to   TEXT NOT NULL,
  vote_from     TEXT NOT NULL,
  vote_to       TEXT NOT NULL,
  term_week     TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'nominating' CHECK (status IN ('nominating','voting','announced','vacant')),
  winner_id     TEXT,
  tie_break     TEXT CHECK (tie_break IS NULL OR tie_break IN ('points_28d','lot')),
  vacant_reason TEXT CHECK (vacant_reason IS NULL OR vacant_reason IN ('no_candidates','few_votes','winner_unavailable')),
  result        TEXT                                  -- JSON [{candidateId, nickname, votes}] khi đã công bố
);

CREATE TABLE candidates (
  election_id TEXT NOT NULL REFERENCES elections(id),
  user_id     TEXT NOT NULL REFERENCES users(id),
  pledge      TEXT NOT NULL CHECK (length(pledge) BETWEEN 1 AND 200),
  plans       TEXT NOT NULL DEFAULT '[]',
  withdrawn   INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  PRIMARY KEY (election_id, user_id)
);

-- Phiếu kín: không lưu id người bầu, chỉ HMAC (research.md R4).
CREATE TABLE ballots (
  election_id  TEXT NOT NULL REFERENCES elections(id),
  voter_hash   TEXT NOT NULL,
  candidate_id TEXT NOT NULL,
  cast_at      TEXT NOT NULL,
  PRIMARY KEY (election_id, voter_hash)
);

CREATE TABLE election_voters (
  election_id TEXT NOT NULL REFERENCES elections(id),
  voter_id    TEXT NOT NULL,
  voted_at    TEXT NOT NULL,
  PRIMARY KEY (election_id, voter_id)
);

CREATE TABLE catalog_items (
  id     TEXT PRIMARY KEY,
  kind   TEXT NOT NULL CHECK (kind IN ('theme','decor','weekly_quest')),
  text   TEXT NOT NULL,                              -- JSON {vi:{title,desc}, en:{…}}
  data   TEXT NOT NULL DEFAULT '{}',
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE terms (
  week          TEXT PRIMARY KEY,                    -- tuần của nhiệm kỳ
  election_id   TEXT REFERENCES elections(id),
  holder_id     TEXT,
  theme_id      TEXT REFERENCES catalog_items(id),
  decor_id      TEXT REFERENCES catalog_items(id),
  weekly_quests TEXT NOT NULL DEFAULT '[]',
  honorary      TEXT NOT NULL DEFAULT '[]',
  ended_reason  TEXT CHECK (ended_reason IS NULL OR ended_reason IN ('suspended','deleted','removed_by_admin'))
);

CREATE TABLE term_actions (
  id        TEXT PRIMARY KEY,
  week      TEXT NOT NULL,
  holder_id TEXT NOT NULL,
  action    TEXT NOT NULL CHECK (action IN ('theme','quests','decor','announce','honorary')),
  payload   TEXT NOT NULL,
  at        TEXT NOT NULL
);
CREATE INDEX term_actions_week ON term_actions (week, at);

CREATE TABLE announcements (
  id         TEXT PRIMARY KEY,
  week       TEXT NOT NULL,
  author_id  TEXT NOT NULL,
  text       TEXT NOT NULL CHECK (length(text) BETWEEN 1 AND 200),
  day        TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (author_id, day)
);

-- Nhiệm vụ tuần của cả viện: đếm chung + người góp sức (được thưởng khi đạt mục tiêu).
CREATE TABLE weekly_counters (
  week    TEXT NOT NULL,
  item_id TEXT NOT NULL,
  count   INTEGER NOT NULL DEFAULT 0,
  done_at TEXT,
  PRIMARY KEY (week, item_id)
);
CREATE TABLE weekly_contributors (
  week    TEXT NOT NULL,
  item_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  PRIMARY KEY (week, item_id, user_id)
);

-- ── Danh mục chọn sẵn (vi/en) ───────────────────────────────────────
INSERT INTO catalog_items (id, kind, text, data) VALUES
 ('theme-sleep', 'theme', '{"vi":{"title":"Giấc ngủ","desc":"Cùng nói về giấc ngủ và nghỉ ngơi."},"en":{"title":"Sleep","desc":"Talking about sleep and rest."}}', '{}'),
 ('theme-gratitude', 'theme', '{"vi":{"title":"Biết ơn","desc":"Những điều nhỏ làm mình thấy ấm lòng."},"en":{"title":"Gratitude","desc":"Small things that warm our hearts."}}', '{}'),
 ('theme-connection', 'theme', '{"vi":{"title":"Kết nối","desc":"Giữ liên lạc với người mình thương."},"en":{"title":"Connection","desc":"Staying in touch with people we care about."}}', '{}'),
 ('theme-stress', 'theme', '{"vi":{"title":"Áp lực học tập & công việc","desc":"Chia sẻ cách mỗi người vượt qua áp lực."},"en":{"title":"Study & work pressure","desc":"How each of us handles pressure."}}', '{}'),
 ('theme-nature', 'theme', '{"vi":{"title":"Ra ngoài thiên nhiên","desc":"Đi bộ, cây xanh, ánh nắng."},"en":{"title":"Getting outdoors","desc":"Walks, trees and sunlight."}}', '{}'),
 ('theme-kindness', 'theme', '{"vi":{"title":"Tử tế với bản thân","desc":"Nói với mình như nói với một người bạn."},"en":{"title":"Self-kindness","desc":"Talking to ourselves like to a friend."}}', '{}'),
 ('decor-lanterns', 'decor', '{"vi":{"title":"Đèn lồng","desc":"Đèn lồng đỏ vàng dọc sảnh và sân."},"en":{"title":"Lanterns","desc":"Red and gold lanterns along the lobby and court."}}', '{"style":"lanterns","colors":["#d94f3d","#f6c445"]}'),
 ('decor-flags', 'decor', '{"vi":{"title":"Cờ dây","desc":"Cờ dây nhiều màu."},"en":{"title":"Bunting","desc":"Colourful bunting."}}', '{"style":"flags","colors":["#8fc1b5","#f2b5a7","#f6d186","#a3c4f3"]}'),
 ('decor-flowers', 'decor', '{"vi":{"title":"Hoa tươi","desc":"Chậu hoa trước cửa và trong sảnh."},"en":{"title":"Fresh flowers","desc":"Flower pots at the doors and in the lobby."}}', '{"style":"flowers","colors":["#e57399","#f6d186","#ffffff"]}'),
 ('decor-lights', 'decor', '{"vi":{"title":"Đèn dây ấm","desc":"Đèn dây vàng ấm buổi tối."},"en":{"title":"Warm string lights","desc":"Warm yellow string lights."}}', '{"style":"lights","colors":["#ffe08a"]}'),
 ('wq-breath', 'weekly_quest', '{"vi":{"title":"Cả viện thở chậm 300 lần","desc":"Mỗi bài thở 3 phút được tính 1 lần."},"en":{"title":"300 slow breaths together","desc":"Each 3-minute breathing exercise counts once."}}', '{"event":"breath","target":300,"points":30}'),
 ('wq-water', 'weekly_quest', '{"vi":{"title":"Tưới 500 lượt hoa","desc":"Mỗi lượt tưới bồn hoa ở vườn sau."},"en":{"title":"Water 500 times","desc":"Each watering in the back garden."}}', '{"event":"water","target":500,"points":30}'),
 ('wq-litter', 'weekly_quest', '{"vi":{"title":"Nhặt 800 vật rác","desc":"Giữ viện sạch đẹp."},"en":{"title":"Pick up 800 pieces of litter","desc":"Keep the hospital tidy."}}', '{"event":"litter","target":800,"points":30}'),
 ('wq-thank', 'weekly_quest', '{"vi":{"title":"400 lời cảm ơn","desc":"Cảm ơn tin chia sẻ trong vòng sinh hoạt."},"en":{"title":"400 thank-yous","desc":"Thank messages in circles."}}', '{"event":"thank","target":400,"points":30}'),
 ('wq-mood', 'weekly_quest', '{"vi":{"title":"500 lần hỏi thăm cảm xúc","desc":"Mỗi lần ghi cảm xúc trong ngày."},"en":{"title":"500 mood check-ins","desc":"Each daily mood check-in."}}', '{"event":"mood","target":500,"points":30}');
