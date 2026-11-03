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
