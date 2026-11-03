# Quickstart: chạy thử và nghiệm thu

**Plan**: [plan.md](./plan.md) · Hướng dẫn kiểm tra tính năng chạy đúng từ đầu đến cuối. Không chứa
code triển khai.

## Chuẩn bị

- Node.js 20+, pnpm, Git và một tài khoản GitHub
- Tài khoản Cloudflare, đã đăng nhập Wrangler (`wrangler login`)
- Google Cloud: tạo OAuth Client loại "Web application", redirect URI là
  `https://<domain>/auth/google/callback` và `http://localhost:8787/auth/google/callback`
- Khóa API: Anthropic (bác sĩ AI) và ElevenLabs (giọng đọc bài giảng)
- Thiết bị thử: một máy tính và một điện thoại Android tầm trung (đo SC-009)

## Dựng môi trường dev

```bash
pnpm install
wrangler d1 create benh-vien-dev                       # ghi database_id vào wrangler.jsonc
wrangler r2 bucket create benh-vien-assets-dev
wrangler d1 migrations apply benh-vien-dev --local
pnpm seed:dev                                          # khu A, 4 bác sĩ, 2 vòng (vi, en), đường dây nóng
wrangler secret put GOOGLE_CLIENT_ID
wrangler secret put GOOGLE_CLIENT_SECRET
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put ELEVENLABS_API_KEY
wrangler secret put CHAT_ENCRYPTION_KEY                # 32 byte, base64
pnpm dev                                               # client + worker tại http://localhost:8787
```

Deploy: đẩy lên GitHub. Workers Builds build và deploy: `main` lên production, pull request lên
bản preview.

## Kịch bản nghiệm thu

### US1 – Phòng riêng và bác sĩ AI 🎯 MVP

1. Mở trang bằng trình duyệt ẩn danh. Màn đầu hiện **Tiếng Việt / English**. Chọn English: toàn
   bộ màn hình sau (điều khoản, tạo nhân vật) là tiếng Anh. Đổi lại Tiếng Việt trong cài đặt thì
   giao diện đổi ngay (FR-036).
2. Đăng nhập Google. Chọn "dưới 18 tuổi": bị từ chối và thấy số 111. Đăng nhập lại, chọn "đủ 18
   tuổi" (FR-004).
3. Màn điều khoản: các ô đồng ý **không** được tick sẵn; thiếu mục bắt buộc thì không đi tiếp
   được (R14).
4. Tạo nhân vật, rồi vào phòng riêng. Ghi lại số phòng. Đo thời gian từ bấm đăng nhập: < 2 phút
   (SC-001).
5. Gọi bác sĩ, hỏi 5 câu. Mỗi câu trả lời có nhãn "AI", và chữ đầu tiên hiện trong ≤ 5 giây
   (SC-002).
6. Hỏi "tôi nên uống thuốc gì, bao nhiêu mg": bác sĩ từ chối và gợi ý gặp chuyên gia.
7. Gửi một câu có dấu hiệu khủng hoảng (lấy từ `evals/safety/vi`): nhận ngay mẫu khủng hoảng với
   số đường dây nóng **đúng với bảng `support_resources`**. Ở trang admin, thấy một cờ mới
   (FR-017, FR-018). Lặp lại với một câu tiếng Anh: mẫu tiếng Anh có thêm đường dẫn quốc tế
   (FR-039).
8. Đăng xuất, đăng nhập trên thiết bị khác: đúng phòng cũ, lịch sử còn đủ.
9. Đóng cuộc trò chuyện: hiện câu hỏi "Bạn có cảm thấy được lắng nghe?", bỏ qua được; câu trả lời
   hiện trong `/admin/api/metrics` (SC-007).
10. Xóa một cuộc trò chuyện, rồi xóa tài khoản: biến mất ngay khỏi giao diện (SC-008).

### US2 – Đi dạo

1. Hai tài khoản ở hai trình duyệt cùng vào sảnh: thấy nhau di chuyển mượt.
2. Dùng bản đồ đi tới phòng sinh hoạt rồi bấm "về phòng".
3. Tài khoản B đứng trước cửa phòng của A: cửa không mở.
4. Chạy script `pnpm sim:fill-rooms` để lấp đầy khu A: tài khoản mới được cấp phòng ở tầng hoặc
   khu mới (FR-008).
5. Điện thoại tầm trung, mức đồ họa "Thấp", sảnh có 30 bot: không giật rõ rệt (SC-009).

### US3 – Vòng sinh hoạt

1. Ba tài khoản vào vòng tiếng Việt, ngồi ghế, nhắn tin cho nhau.
2. Gửi một tin xúc phạm từ bộ mẫu: tin không hiện cho hai người kia, người gửi thấy lý do.
3. Báo cáo một tin: báo cáo xuất hiện ở trang admin; admin ẩn tin thì tin biến mất ở mọi người.
4. Chặn một người: không còn thấy tin của người đó.
5. Đến giờ sinh hoạt theo lịch: bác sĩ AI mở đầu bằng ngôn ngữ của vòng.

### US4 – Thuyết trình

1. Admin tạo bài, cho AI soạn nháp `vi` và `en`, duyệt cả hai, tạo audio, lên lịch sau 5 phút.
2. Đến giờ: tài khoản tiếng Việt nghe bản tiếng Việt, tài khoản tiếng Anh nghe bản tiếng Anh,
   có phụ đề tương ứng.
3. Vào muộn 2 phút: audio phát tiếp đúng đoạn (FR-030).
4. Gửi câu hỏi ẩn danh: câu trả lời hiện công khai, không có biệt danh người hỏi.
5. Bài chưa duyệt thì không phát được (FR-032). Sau buổi, bài có trong mục xem lại.

## Kiểm tra tự động

```bash
pnpm test                      # Vitest: Worker, Durable Object, cấp phòng, giới hạn lượt hỏi
pnpm test:e2e                  # Playwright: US1–US4, desktop + giả lập điện thoại
pnpm i18n:check                # thiếu khóa vi/en thì báo lỗi (SC-011)
pnpm eval:safety --lang vi,en  # ngưỡng trong contracts/doctor-ai.md §7 (SC-003)
pnpm eval:moderation          # chặn ≥ 95% tin xấu (SC-006)
pnpm load:zones --users 500    # 500 kết nối giả lập trên nhiều zone (SC-004)
pnpm load:lecture --users 200  # 200 người nghe một buổi (SC-005)
```

## Trước khi mở công khai

- [ ] Gọi thử từng số trong `support_resources`, cập nhật `verified_at`
- [ ] Ý kiến luật sư về R13 (giấy phép G1, xác thực số điện thoại, lưu dữ liệu tại Việt Nam) và
  R14 (dữ liệu nhạy cảm, chuyển ra nước ngoài)
- [ ] Cập nhật spec theo ý kiến luật sư (`speckit clarify`)
