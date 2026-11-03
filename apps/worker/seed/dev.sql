-- Dữ liệu khởi tạo cho dev/staging. Đường dây nóng theo research.md §R8 (nguồn kiểm tra 8/2026).
-- Constitution IV: gọi thử từng số và cập nhật verified_at trước khi phát hành.
-- schedule.days: 0 = Chủ nhật … 6 = Thứ bảy, giờ Asia/Ho_Chi_Minh.

INSERT OR REPLACE INTO support_resources (id, name_vi, name_en, phone, url, scope, schedule, is_free, locales, verified_at, sort) VALUES
('emergency-115', 'Cấp cứu y tế', 'Medical emergency', '115', NULL, 'emergency', NULL, 1, '["vi","en"]', '2026-08-31', 10),
('police-113', 'Công an', 'Police', '113', NULL, 'emergency', NULL, 1, '["vi","en"]', '2026-08-31', 20),
('ngay-mai', 'Đường dây nóng Ngày Mai', 'Ngày Mai (Tomorrow) Hotline', '096 306 1414', 'https://duongdaynongngaymai.vn', 'crisis',
  '{"days":[3,4,5,6,0],"from":"13:00","to":"20:30","tz":"Asia/Ho_Chi_Minh"}', 1, '["vi","en"]', '2026-08-31', 30),
('hope', 'Hy Vọng Sống (HOPE)', 'HOPE Suicide Prevention Hotline', '086 50 444 00', 'https://hyvongsong.com', 'crisis',
  '{"days":[0,1,2,3,4,5,6],"from":"16:30","to":"20:30","tz":"Asia/Ho_Chi_Minh"}', NULL, '["vi","en"]', '2026-08-31', 40),
('child-111', 'Tổng đài quốc gia bảo vệ trẻ em', 'National Child Protection Hotline', '111', 'https://tongdai111.vn', 'youth', NULL, 1, '["vi","en"]', '2026-08-31', 50),
('find-a-helpline', 'Danh bạ đường dây nóng quốc tế', 'Find A Helpline (outside Vietnam)', NULL, 'https://findahelpline.com', 'international', NULL, 1, '["en"]', '2026-11-03', 90);

INSERT OR IGNORE INTO settings (key, value) VALUES
('daily_message_limit', '20'),
('zone_capacity', '150'),
('lecture_capacity', '200'),
('model_chat', 'claude-haiku-5-5'),
('model_classifier', 'claude-haiku-5-5'),
('terms_version', '2026-11-v1'),
('default_locale', 'vi'),
('admin_webhook_url', '');

-- Bác sĩ AI (T045). Tên/chân dung là nhân vật hư cấu; quy tắc an toàn nằm trong apps/worker/src/ai/rules.ts.
INSERT OR REPLACE INTO doctors (id, name, topic, display, avatar, persona_prompt, active, sort) VALUES
('dr-an', 'An', 'stress',
 '{"vi":{"title":"Bác sĩ An · Căng thẳng & lo âu","bio":"Điềm tĩnh, hay gợi ý các bài thở và cách chia nhỏ việc."},"en":{"title":"Dr. An · Stress & worry","bio":"Calm; likes breathing exercises and breaking problems into small steps."}}',
 '{"parts":{"head":"round","hair":"short","outfit":"coat","accessory":"glasses"},"colors":{"skin":"#f1c9a5","hair":"#2b2b2b","outfit":"#ffffff"}}',
 'You are "Bác sĩ An", a calm, steady AI character who helps with stress and worry. You often suggest simple breathing exercises and breaking big problems into small steps.', 1, 10),
('dr-mai', 'Mai', 'sleep',
 '{"vi":{"title":"Bác sĩ Mai · Giấc ngủ","bio":"Nhẹ nhàng, quan tâm tới thói quen trước khi ngủ."},"en":{"title":"Dr. Mai · Sleep","bio":"Gentle; curious about your evening routine."}}',
 '{"parts":{"head":"round","hair":"bob","outfit":"coat","accessory":null},"colors":{"skin":"#f3d2b3","hair":"#5a3a22","outfit":"#e8f1f8"}}',
 'You are "Bác sĩ Mai", a gentle AI character who helps with sleep. You ask about evening routines and share sleep-hygiene tips.', 1, 20),
('dr-minh', 'Minh', 'relationships',
 '{"vi":{"title":"Bác sĩ Minh · Các mối quan hệ","bio":"Ấm áp, giúp bạn nghĩ cách nói chuyện với người thân và bạn bè."},"en":{"title":"Dr. Minh · Relationships","bio":"Warm; helps you think through conversations with family and friends."}}',
 '{"parts":{"head":"round","hair":"spiky","outfit":"coat","accessory":null},"colors":{"skin":"#e0b48f","hair":"#1d1d1d","outfit":"#f6efe2"}}',
 'You are "Bác sĩ Minh", a warm AI character who helps people with family, friends, partners and colleagues. You help them think about what they want to say and how.', 1, 30),
('dr-ha', 'Hà', 'grief',
 '{"vi":{"title":"Bác sĩ Hà · Mất mát","bio":"Chậm rãi, kiên nhẫn lắng nghe khi bạn nhớ một người hay một điều đã mất."},"en":{"title":"Dr. Hà · Loss & grief","bio":"Unhurried; listens patiently when you miss someone or something."}}',
 '{"parts":{"head":"round","hair":"long","outfit":"coat","accessory":"scarf"},"colors":{"skin":"#f0cfb0","hair":"#3b2a20","outfit":"#f1ece4"}}',
 'You are "Bác sĩ Hà", an unhurried, patient AI character who supports people through grief and loss. You let them talk about who or what they miss.', 1, 40);
