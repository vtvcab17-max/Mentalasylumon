# Quickstart: nghiệm thu 002

## Chuẩn bị

```bash
pnpm install
npx wrangler d1 migrations apply benh-vien-dev --local -c wrangler.local.jsonc
npx wrangler d1 execute benh-vien-dev --local --file apps/worker/seed/progress.sql
pnpm dev:local                      # FAKE_AI=1: kiểm duyệt bằng model giả
pnpm test                           # unit + tích hợp (Vitest pool Workers)
pnpm test:e2e --project desktop     # và --project mobile-mid
```

Script `scripts/sim-progress.mjs` (chỉ chạy ở máy) cấp điểm, ngày và bậc cho tài khoản thử, rồi tua đồng hồ bầu cử
bằng `?now=` (chỉ khi APP_ENV ≠ production).

## US1 – Nhiệm vụ hằng ngày

1. Tài khoản mới mở Sổ nhiệm vụ: thấy 3 nhiệm vụ thuộc 3 nhóm, mỗi nhiệm vụ có cách làm, nơi làm và điểm.
2. Bấm Dẫn đường ở nhiệm vụ khám phá: mũi tên chỉ tới đúng chỗ. Tới nơi thì nhiệm vụ tự xong, điểm tăng.
3. Làm bài thở và dừng ở giây thứ 60: không được điểm. Làm đủ 3 phút: được điểm.
4. Cấp 120 điểm trong ngày: tổng chỉ cộng tới 100 và có lời nhắc nghỉ ngơi.
5. Kiểm tra cơ sở dữ liệu: không bảng D1 nào chứa biểu tượng cảm xúc hay dòng biết ơn.

## US2 – Thăng cấp

1. Bệnh nhân mở thẻ Bước tiếp theo: thấy 100 điểm và chuỗi "Ngày đầu ở viện" kèm tiến độ.
2. Đi hết chuỗi rồi tới sảnh, bấm Nhận lễ thăng cấp: chức danh đổi, người cùng sảnh thấy pháo giấy.
3. Người chơi khác mở hồ sơ một Điều dưỡng: có dòng "chức danh trong game".

## US3 – Mini-game

1. Nhân viên lau dọn nhặt rác ở sảnh: rác biến mất trên màn hình người thứ hai cùng sảnh, điểm tăng.
2. Bệnh nhân tới gần rác: thấy gợi ý lên cấp, không nhặt được.
3. Thực tập sinh mời người mới dẫn tham quan: người mới thấy lời mời và từ chối được.

## US4 – Bầu cử

1. Sim tạo 1 Trưởng khoa và 3 Thực tập sinh (tài khoản ≥ 14 ngày tuổi).
2. Tua tới thứ Năm: Trưởng khoa ứng cử. Lời hứa "Đồ ngu…" bị chặn; lời hứa bình thường được nhận.
3. Tua tới thứ Bảy: 3 phiếu. Tài khoản 3 ngày tuổi không bỏ phiếu được.
4. Tua tới Chủ Nhật 20:10: bảng ở sảnh hiện kết quả. Thứ Hai: người thắng thành Viện trưởng, có tên vàng.
5. Tuần sau, người đó không ứng cử được (lý do: nghỉ một nhiệm kỳ).
6. Tuần không có ứng viên: bảng ghi "ghế Viện trưởng để trống".

## US5 – Viện trưởng

1. Viện trưởng chọn bộ trang trí: người khác vào sảnh thấy trang trí mới.
2. Gửi thông báo lần 2 trong ngày: bị từ chối, có giờ được gửi lần tới.
3. Chạy `pnpm test -- director-security`: mọi route admin hoặc route dữ liệu người khác đều bị từ chối với phiên Viện trưởng (SC-006).
4. Admin khóa Viện trưởng: bảng tin chuyển thành "ghế để trống", trang trí giữ nguyên.
