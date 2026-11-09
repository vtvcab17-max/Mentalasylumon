-- 0005_progress: cấp bậc, sổ cái điểm, nhiệm vụ (specs/002-ranks-quests/data-model.md, T004)

CREATE TABLE quest_chains (
  id         TEXT PRIMARY KEY,
  rank_level INTEGER NOT NULL,                       -- bậc mà chuỗi này mở ra
  text       TEXT NOT NULL                           -- JSON {vi:{title}, en:{title}}
);

CREATE TABLE ranks (
  level           INTEGER PRIMARY KEY CHECK (level BETWEEN 1 AND 7),
  key             TEXT NOT NULL UNIQUE CHECK (key IN ('patient','cleaner','orderly','nurse','intern','head','director')),
  min_points      INTEGER NOT NULL DEFAULT 0 CHECK (min_points >= 0),
  min_active_days INTEGER NOT NULL DEFAULT 0 CHECK (min_active_days >= 0),
  chain_id        TEXT REFERENCES quest_chains(id),
  unlocks         TEXT NOT NULL DEFAULT '[]'
);

CREATE TABLE user_progress (
  user_id         TEXT PRIMARY KEY REFERENCES users(id),
  rank            INTEGER NOT NULL DEFAULT 1,
  total_points    INTEGER NOT NULL DEFAULT 0,
  active_days     INTEGER NOT NULL DEFAULT 0,
  last_active_day TEXT,
  council_banned  INTEGER NOT NULL DEFAULT 0,
  updated_at      TEXT NOT NULL
);

CREATE TABLE rank_history (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  from_rank  INTEGER NOT NULL,
  to_rank    INTEGER NOT NULL,
  reason     TEXT NOT NULL CHECK (reason IN ('promotion','admin_demote','admin_restore')),
  note       TEXT,
  by_user_id TEXT,
  at         TEXT NOT NULL
);
CREATE INDEX rank_history_user ON rank_history (user_id, at);

CREATE TABLE points_ledger (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id),
  day        TEXT NOT NULL,
  source     TEXT NOT NULL CHECK (source IN ('quest','chain','minigame','weekly','thank')),
  dedupe_key TEXT NOT NULL,
  points     INTEGER NOT NULL CHECK (points BETWEEN 0 AND 100),
  created_at TEXT NOT NULL,
  UNIQUE (user_id, dedupe_key)
);
CREATE INDEX points_ledger_day ON points_ledger (user_id, day);
CREATE INDEX points_ledger_time ON points_ledger (user_id, created_at);

CREATE TABLE quest_templates (
  id       TEXT PRIMARY KEY,
  kind     TEXT NOT NULL CHECK (kind IN ('daily','chain','weekly')),
  category TEXT NOT NULL CHECK (category IN ('selfcare','community','explore','work')),
  event    TEXT NOT NULL,
  params   TEXT NOT NULL DEFAULT '{}',
  target   INTEGER NOT NULL DEFAULT 1 CHECK (target >= 1),
  points   INTEGER NOT NULL CHECK (points BETWEEN 0 AND 100),
  min_rank INTEGER NOT NULL DEFAULT 1,
  chain_id TEXT REFERENCES quest_chains(id),
  step     INTEGER,
  text     TEXT NOT NULL,                            -- JSON {vi:{title,how,where}, en:{…}}
  active   INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE user_quests (
  user_id  TEXT NOT NULL REFERENCES users(id),
  quest_id TEXT NOT NULL REFERENCES quest_templates(id),
  period   TEXT NOT NULL,                            -- 'YYYY-MM-DD' | 'YYYY-Www' | 'chain'
  progress INTEGER NOT NULL DEFAULT 0,
  target   INTEGER NOT NULL,
  status   TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','done')),
  done_at  TEXT,
  PRIMARY KEY (user_id, quest_id, period)
);
CREATE INDEX user_quests_open ON user_quests (user_id, status);

CREATE TABLE thanks (
  from_user_id TEXT NOT NULL,
  to_user_id   TEXT NOT NULL,
  day          TEXT NOT NULL,
  message_id   TEXT NOT NULL,
  PRIMARY KEY (from_user_id, to_user_id, day)
);

CREATE TABLE breath_sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  started_at TEXT NOT NULL
);

CREATE TABLE bed_waterings (
  user_id TEXT NOT NULL,
  bed_id  TEXT NOT NULL,
  day     TEXT NOT NULL,
  PRIMARY KEY (user_id, bed_id, day)
);

-- ── Chuỗi thăng cấp ─────────────────────────────────────────────────
INSERT INTO quest_chains (id, rank_level, text) VALUES
 ('firstday', 2, '{"vi":{"title":"Ngày đầu ở viện"},"en":{"title":"First day at the hospital"}}'),
 ('helper',   3, '{"vi":{"title":"Bàn tay giúp đỡ"},"en":{"title":"A helping hand"}}'),
 ('gardener', 4, '{"vi":{"title":"Người chăm vườn"},"en":{"title":"The gardener"}}'),
 ('guide',    5, '{"vi":{"title":"Người dẫn đường"},"en":{"title":"The guide"}}'),
 ('keeper',   6, '{"vi":{"title":"Người giữ lửa"},"en":{"title":"Keeper of the flame"}}');

INSERT INTO ranks (level, key, min_points, min_active_days, chain_id, unlocks) VALUES
 (1, 'patient',  0,    0,  NULL,       '["room","daily"]'),
 (2, 'cleaner',  100,  0,  'firstday', '["minigame:litter","outfit:cleaner"]'),
 (3, 'orderly',  400,  3,  'helper',   '["minigame:tidy","badge:orderly"]'),
 (4, 'nurse',    1000, 7,  'gardener', '["minigame:water","outfit:nurse"]'),
 (5, 'intern',   2000, 14, 'guide',    '["council:vote","minigame:guide"]'),
 (6, 'head',     3500, 28, 'keeper',   '["council:nominate"]'),
 (7, 'director', 0,    0,  NULL,       '["director"]');

-- ── Nhiệm vụ hằng ngày (mỗi nhóm chọn 1) ────────────────────────────
INSERT INTO quest_templates (id, kind, category, event, params, target, points, text) VALUES
 ('daily-mood', 'daily', 'selfcare', 'mood', '{}', 1, 15,
  '{"vi":{"title":"Hôm nay bạn thấy thế nào?","how":"Chọn một biểu tượng cảm xúc trong Sổ nhiệm vụ. Chỉ mình bạn thấy.","where":"Sổ nhiệm vụ"},"en":{"title":"How are you today?","how":"Pick a mood icon in the quest book. Only you can see it.","where":"Quest book"}}'),
 ('daily-breath', 'daily', 'selfcare', 'breath', '{}', 1, 20,
  '{"vi":{"title":"Thở chậm 3 phút","how":"Mở bài thở và thở theo vòng tròn đủ 3 phút.","where":"Sổ nhiệm vụ"},"en":{"title":"Three slow minutes","how":"Open the breathing exercise and follow the circle for 3 minutes.","where":"Quest book"}}'),
 ('daily-gratitude', 'daily', 'selfcare', 'gratitude', '{}', 1, 15,
  '{"vi":{"title":"Một điều biết ơn","how":"Viết một dòng về điều bạn biết ơn hôm nay. Chỉ mình bạn đọc được.","where":"Sổ nhiệm vụ"},"en":{"title":"One thing you are grateful for","how":"Write one line about something you are grateful for today. Only you can read it.","where":"Quest book"}}'),
 ('daily-wave', 'daily', 'community', 'wave', '{}', 1, 15,
  '{"vi":{"title":"Chào một người","how":"Bấm 👋 khi có người khác ở gần bạn.","where":"Sảnh chính, sân trước hoặc vườn sau"},"en":{"title":"Say hello","how":"Press 👋 when someone else is near you.","where":"Main lobby, front court or back garden"}}'),
 ('daily-sit', 'daily', 'community', 'sit', '{}', 10, 25,
  '{"vi":{"title":"Ngồi cùng vòng 10 phút","how":"Ngồi vào một ghế trong phòng sinh hoạt đủ 10 phút. Không cần nói gì.","where":"Phòng sinh hoạt"},"en":{"title":"Sit with a circle for 10 minutes","how":"Sit on a chair in the circle room for 10 minutes. No need to talk.","where":"Circle room"}}'),
 ('daily-thank', 'daily', 'community', 'thank', '{}', 1, 15,
  '{"vi":{"title":"Gửi một lời cảm ơn","how":"Bấm 🙏 Cảm ơn dưới một tin chia sẻ của người khác.","where":"Phòng sinh hoạt"},"en":{"title":"Send a thank-you","how":"Press 🙏 Thanks under someone else''s message.","where":"Circle room"}}'),
 ('daily-pond', 'daily', 'explore', 'reach', '{"zone":"garden","spot":"pond"}', 1, 15,
  '{"vi":{"title":"Ghé ao ở vườn sau","how":"Đi tới bờ ao phía đông vườn sau.","where":"Vườn sau"},"en":{"title":"Visit the pond","how":"Walk to the pond on the east side of the back garden.","where":"Back garden"}}'),
 ('daily-portico', 'daily', 'explore', 'reach', '{"zone":"court","spot":"portico"}', 1, 15,
  '{"vi":{"title":"Đứng dưới hàng cột","how":"Đi tới bậc thềm có 6 cột trước cửa chính.","where":"Sân trước"},"en":{"title":"Stand under the columns","how":"Walk to the steps with six columns in front of the main door.","where":"Front court"}}'),
 ('daily-stairs', 'daily', 'explore', 'reach', '{"zone":"lobby","spot":"staircase"}', 1, 15,
  '{"vi":{"title":"Chân cầu thang chính","how":"Đi tới chân cầu thang chính trong sảnh.","where":"Sảnh chính"},"en":{"title":"Foot of the main staircase","how":"Walk to the foot of the main staircase in the lobby.","where":"Main lobby"}}');

-- ── Chuỗi thăng cấp (giao cả chuỗi một lần) ─────────────────────────
INSERT INTO quest_templates (id, kind, category, event, params, target, points, chain_id, step, text) VALUES
 ('firstday-1', 'chain', 'explore', 'reach', '{"zone":"court","spot":"portico"}', 1, 15, 'firstday', 1,
  '{"vi":{"title":"Ngắm mặt tiền","how":"Ra sân trước, đứng dưới hàng cột.","where":"Sân trước"},"en":{"title":"See the facade","how":"Go to the front court and stand under the columns.","where":"Front court"}}'),
 ('firstday-2', 'chain', 'explore', 'reach', '{"zone":"lobby","spot":"staircase"}', 1, 15, 'firstday', 2,
  '{"vi":{"title":"Làm quen sảnh chính","how":"Đi tới chân cầu thang chính.","where":"Sảnh chính"},"en":{"title":"Get to know the lobby","how":"Walk to the foot of the main staircase.","where":"Main lobby"}}'),
 ('firstday-3', 'chain', 'explore', 'reach', '{"zone":"garden","spot":"pond"}', 1, 15, 'firstday', 3,
  '{"vi":{"title":"Dạo vườn sau","how":"Đi tới ao ở vườn sau.","where":"Vườn sau"},"en":{"title":"Stroll the back garden","how":"Walk to the pond in the back garden.","where":"Back garden"}}'),
 ('firstday-4', 'chain', 'community', 'circle_visit', '{}', 1, 15, 'firstday', 4,
  '{"vi":{"title":"Ghé phòng sinh hoạt","how":"Vào một vòng sinh hoạt bất kỳ.","where":"Phòng sinh hoạt"},"en":{"title":"Peek into the circle room","how":"Join any circle.","where":"Circle room"}}'),
 ('helper-1', 'chain', 'community', 'sit', '{}', 10, 25, 'helper', 1,
  '{"vi":{"title":"Ngồi cùng vòng","how":"Ngồi trong vòng sinh hoạt tổng cộng 10 phút.","where":"Phòng sinh hoạt"},"en":{"title":"Sit with a circle","how":"Sit in a circle for 10 minutes in total.","where":"Circle room"}}'),
 ('helper-2', 'chain', 'community', 'thank', '{}', 2, 20, 'helper', 2,
  '{"vi":{"title":"Hai lời cảm ơn","how":"Cảm ơn tin chia sẻ của 2 người khác nhau.","where":"Phòng sinh hoạt"},"en":{"title":"Two thank-yous","how":"Thank messages from 2 different people.","where":"Circle room"}}'),
 ('helper-3', 'chain', 'work', 'litter', '{}', 5, 30, 'helper', 3,
  '{"vi":{"title":"Viện sạch đẹp","how":"Nhặt 5 vật rác ở sân trước, sảnh hoặc vườn sau.","where":"Sân trước, sảnh, vườn sau"},"en":{"title":"A tidy hospital","how":"Pick up 5 pieces of litter in the court, lobby or garden.","where":"Court, lobby, garden"}}'),
 ('gardener-1', 'chain', 'work', 'tidy', '{}', 3, 30, 'gardener', 1,
  '{"vi":{"title":"Chuẩn bị buổi sinh hoạt","how":"Trước buổi sinh hoạt, xếp lại 3 ghế lệch.","where":"Phòng sinh hoạt"},"en":{"title":"Prepare a session","how":"Before a session, straighten 3 chairs.","where":"Circle room"}}'),
 ('gardener-2', 'chain', 'selfcare', 'breath', '{}', 3, 30, 'gardener', 2,
  '{"vi":{"title":"Ba lần thở chậm","how":"Làm bài thở 3 phút vào 3 lần khác nhau.","where":"Sổ nhiệm vụ"},"en":{"title":"Three slow breaths","how":"Do the 3-minute breathing exercise 3 times.","where":"Quest book"}}'),
 ('gardener-3', 'chain', 'community', 'wave', '{}', 3, 20, 'gardener', 3,
  '{"vi":{"title":"Chào ba lần","how":"Vẫy tay chào khi có người ở gần, 3 lần.","where":"Các khu chung"},"en":{"title":"Three hellos","how":"Wave to someone nearby, 3 times.","where":"Common areas"}}'),
 ('guide-1', 'chain', 'work', 'water', '{}', 5, 30, 'guide', 1,
  '{"vi":{"title":"Tưới vườn","how":"Tưới 5 bồn hoa ở vườn sau.","where":"Vườn sau"},"en":{"title":"Water the garden","how":"Water 5 flower beds in the back garden.","where":"Back garden"}}'),
 ('guide-2', 'chain', 'community', 'guide', '{}', 1, 40, 'guide', 2,
  '{"vi":{"title":"Dẫn một người mới","how":"Mời một người mới đi tham quan và cùng họ đi hết \"Ngày đầu ở viện\".","where":"Sảnh chính"},"en":{"title":"Guide a newcomer","how":"Invite a newcomer on a tour and see them through \"First day\".","where":"Main lobby"}}'),
 ('keeper-1', 'chain', 'community', 'guide', '{}', 3, 60, 'keeper', 1,
  '{"vi":{"title":"Đón thêm ba người mới","how":"Dẫn tham quan cho 3 người mới nữa.","where":"Sảnh chính"},"en":{"title":"Welcome three more","how":"Guide 3 more newcomers.","where":"Main lobby"}}'),
 ('keeper-2', 'chain', 'community', 'circle_session', '{}', 3, 60, 'keeper', 2,
  '{"vi":{"title":"Ba buổi sinh hoạt","how":"Có mặt trong 3 buổi sinh hoạt có bác sĩ AI dẫn dắt.","where":"Phòng sinh hoạt"},"en":{"title":"Three sessions","how":"Attend 3 facilitated circle sessions.","where":"Circle room"}}');
