# Implementation Plan: Cấp bậc, nhiệm vụ và bầu Viện trưởng

**Branch**: `002-ranks-quests` | **Date**: 2026-11-09 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/002-ranks-quests/spec.md`. Tính năng này xây trên hạ tầng của 001
(Cloudflare Worker + Durable Objects + D1, client Three.js).

## Summary

Thêm một lớp tiến trình chơi lên trên viện đã có:

- **Điểm cống hiến** ghi vào sổ cái trong D1. Mỗi khoản có khóa chống trùng, nên một hành động chỉ được tính điểm một lần.
- **Nhiệm vụ** do máy chủ xác nhận từ các sự kiện thật. Sự kiện đến từ ba nơi:
  - `WorldZone`: tới một điểm, vẫy tay, nhặt rác, tưới hoa.
  - `CircleRoom`: ngồi đủ giờ, cảm ơn, sắp ghế.
  - API: bài thở có thời gian bắt đầu và kết thúc.
- **Cấp bậc**: tính từ sổ cái, số ngày có hoạt động và chuỗi nhiệm vụ.
- **Bầu cử**: chạy bằng Cron Trigger mỗi 10 phút. Mỗi lần chạy, các bước chuyển trạng thái đều an toàn khi chạy lặp lại.
- **Phiếu kín**: phiếu lưu dưới dạng HMAC của mã người bầu, dùng khóa từ `KeyVault`. Danh sách người đã bầu lưu ở bảng riêng.
- **Quyền Viện trưởng** là một danh sách API cố định. Máy chủ kiểm tra người gọi có phải người giữ nhiệm kỳ hiện tại không.
- **Dữ liệu tự chăm sóc** (cảm xúc, dòng biết ơn) nằm trong `PatientRecord` của từng người, mã hóa như lịch sử chat.

## Technical Context

**Language/Version**: TypeScript 5.x (client + Worker); SQLite (D1, DO storage)

**Primary Dependencies**: giữ nguyên 001 (Hono, zod, Three.js, Vite). Không thêm thư viện.

**Storage**:
- D1: cấp bậc, sổ cái điểm, nhiệm vụ, bầu cử, nhiệm kỳ, danh mục chọn sẵn.
- `PatientRecord` (SQLite trong DO, mã hóa AES-GCM): nhật ký tự chăm sóc.
- `WorldZone`: trạng thái rác/bồn hoa trong bộ nhớ, có lưu nhẹ.

**Testing**: Vitest pool Workers (dùng model giả `@test/…` cho kiểm duyệt), Playwright desktop + mobile.

**Target Platform**: như 001.

**Project Type**: web app (thêm module vào `apps/worker`, `apps/client`, `packages/shared`).

**Performance Goals**:
- Ghi điểm không làm chậm tin realtime: ghi D1 bằng `waitUntil`, không chặn vòng xử lý tin.
- Mở Sổ nhiệm vụ trong dưới 1 giây.
- Một lượt chạy cron bầu cử dưới 5 giây.

**Constraints**:
- Thời gian luôn tính theo giờ Việt Nam: UTC+7, không có giờ mùa hè.
- Toàn bộ chữ có cả vi và en.
- Không thêm dịch vụ ngoài Cloudflare.

**Scale/Scope**: thử nghiệm kín vài trăm người; thiết kế đủ cho 10.000 người, 1 kỳ bầu cử mỗi tuần.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| Nguyên tắc | Cách đáp ứng | Kết quả |
|---|---|---|
| I. An toàn trên hết | Lời hứa ứng cử, thông báo của Viện trưởng và lời chào tự viết khi dẫn người mới đều đi qua `moderatePublic`. Nút "Cần giúp đỡ ngay" vẫn hiện trên mọi màn hình mới. Client không nhắc nhiệm vụ sau khi người chơi vừa nhận `support` (FR-028). Không thưởng thời gian online, không phạt khi nghỉ (FR-005). | ✅ |
| II. Minh bạch AI | Bác sĩ AI chỉ trao huy hiệu bằng câu mẫu có nhãn AI. Chức danh y tế của người chơi có ghi chú "chức danh trong game" (FR-012). | ✅ |
| III. Riêng tư | Nhật ký tự chăm sóc mã hóa trong `PatientRecord`. Phiếu kín qua HMAC (R4). Viện trưởng không có API nào đọc dữ liệu của người khác (FR-022, kiểm thử SC-006). Không có bảng xếp hạng. Bảng vàng chỉ ghi biệt danh. | ✅ |
| IV. 18+, pháp lý | Điểm không có giá trị tiền tệ (Assumptions). Không phát sinh dữ liệu định danh mới. | ✅ |
| V. Song ngữ | Danh mục nhiệm vụ, chủ đề và trang trí lưu `{vi, en}`. Chuỗi giao diện qua `i18n:check`. | ✅ |
| VI. Đơn giản, Cloudflare | Dùng D1, DO và Cron Trigger có sẵn. Phòng Hội đồng và phòng Viện trưởng làm dạng bảng tin + panel trong sảnh, chưa dựng khu 3D mới. | ✅ |

Không có vi phạm, nên không cần mục Complexity Tracking.

## Project Structure

### Documentation (this feature)

```text
specs/002-ranks-quests/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── http-api.md
│   └── ws-protocol.md
├── checklists/requirements.md
└── tasks.md            # tạo ở bước tasks
```

### Source Code (repository root)

```text
apps/worker/
├── migrations/0005_progress.sql        # cấp bậc, sổ cái, nhiệm vụ, chuỗi nhiệm vụ
├── migrations/0006_elections.sql       # bầu cử, nhiệm kỳ, danh mục, nhật ký Viện trưởng
├── seed/progress.sql                   # danh mục nhiệm vụ, chủ đề, trang trí (vi/en)
├── src/progress/
│   ├── time.ts                         # ngày/tuần theo giờ VN
│   ├── ledger.ts                       # award(): chống trùng, giới hạn ngày, ngày hoạt động
│   ├── quests.ts                       # giao nhiệm vụ ngày, xử lý sự kiện → tiến độ
│   ├── ranks.ts                        # điều kiện bậc, "bước tiếp theo", thăng cấp
│   └── events.ts                       # kiểu sự kiện chung (reach, wave, sit, thank, breath, litter, water, tidy, guide)
├── src/elections/
│   ├── election.ts                     # lịch, chuyển trạng thái (cron), kiểm phiếu, phân định
│   └── director.ts                     # quyền Viện trưởng (danh sách cố định)
├── src/api/progress.ts                 # /api/progress, /api/quests/*, /api/ranks/*
├── src/api/elections.ts                # /api/elections/*, /api/director/*, /api/world/state
├── src/admin/progress.ts               # chỉnh ngưỡng, hạ cấp, phế truất, danh mục, nhật ký
├── src/do/world-zone.ts                # + hotspot, rác, bồn hoa, celebrate(), rank trên tên
├── src/do/circle-room.ts               # + thời gian ngồi, cảm ơn, sắp ghế
└── src/do/patient-record.ts            # + nhật ký tự chăm sóc

packages/shared/src/progress.ts         # schema: Quest, Rank, NextStep, Election, DirectorState

apps/client/src/
├── features/progress/quest-book.ts     # Sổ nhiệm vụ + thẻ Bước tiếp theo + Dẫn đường
├── features/progress/breathing.ts      # bài thở 3 phút
├── features/progress/ceremony.ts       # lễ thăng cấp
├── features/elections/council.ts       # bảng ứng viên, bỏ phiếu, kết quả, bảng vàng
├── features/elections/director-desk.ts # bàn làm việc Viện trưởng
├── world/hotspots.ts                   # điểm khám phá + chỉ dẫn đường
├── world/minigames.ts                  # rác, bồn hoa, hiệu ứng
└── world/decor.ts                      # bộ trang trí theo nhiệm kỳ
```

**Structure Decision**: giữ cấu trúc web app một repo của 001. Logic tiến trình nằm trong module mới `progress/`
và `elections/` ở Worker. Các DO hiện có chỉ phát sự kiện, không tự tính điểm.

## Phase 0 / Phase 1

- Nghiên cứu và quyết định: [research.md](./research.md) (R1–R8).
- Mô hình dữ liệu: [data-model.md](./data-model.md).
- Giao kèo: [contracts/http-api.md](./contracts/http-api.md), [contracts/ws-protocol.md](./contracts/ws-protocol.md).
- Kịch bản nghiệm thu: [quickstart.md](./quickstart.md).

**Re-check sau Phase 1**: thiết kế giữ nguyên các điểm trong bảng Constitution Check. Mọi API của Viện trưởng chỉ ghi
vào dữ liệu thuộc nhiệm kỳ (`terms`, `term_actions`, `announcements`) và không đọc bảng `users`, `crisis_flags`,
`reports` hay `PatientRecord` của người khác. ✅
