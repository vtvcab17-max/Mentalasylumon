---
description: "Task list for feature implementation"
---

# Tasks: Bệnh viện tâm thần online (bản đầu tiên)

**Input**: Design documents from `specs/001-online-mental-hospital/`

**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md,
`.specify/memory/constitution.md` v1.0.0

**Tests**: Có. Constitution (Nguyên tắc I, V) bắt buộc bộ kiểm thử an toàn, kiểm duyệt và i18n
chặn merge. Test cho phần an toàn được viết **trước** và phải **fail** trước khi viết code.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: US1 phòng riêng + bác sĩ AI · US2 đi dạo · US3 vòng sinh hoạt · US4 thuyết trình

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Repo, công cụ, môi trường Cloudflare

- [X] T001 Tạo repo GitHub `vtvcab17-max/Mentalasylumon` với workspace pnpm (`pnpm-workspace.yaml` gồm `apps/*`, `packages/*`) và `README.md`
- [X] T002 Khởi tạo `apps/worker` (TypeScript, Hono, zod) với `apps/worker/wrangler.jsonc` khai báo D1 `benh-vien`, R2 `benh-vien-assets`, Durable Objects `WorldZone`, `CircleRoom`, `LectureHall`, `PatientRecord`, static assets trỏ tới `apps/client/dist`, ba môi trường dev/staging/production
- [X] T003 [P] Khởi tạo `apps/client` (Vite + TypeScript + Three.js) với `apps/client/index.html` và `apps/client/src/main.ts`
- [X] T004 [P] Khởi tạo `packages/shared` (zod) với `packages/shared/src/index.ts`
- [X] T005 [P] Cấu hình ESLint + Prettier chung trong `eslint.config.js` và `.prettierrc`; tạo `.gitignore` (node_modules/, dist/, .wrangler/, .dev.vars, *.log, .env*)
- [X] T006 [P] Cấu hình Vitest với `@cloudflare/vitest-pool-workers` trong `apps/worker/vitest.config.ts`
- [X] T007 [P] Cấu hình Playwright (desktop + giả lập Android tầm trung) trong `playwright.config.ts`
- [X] T008 [P] Tạo `.github/workflows/ci.yml` chạy lint, test, `i18n:check`, `eval:safety`, `eval:moderation` trên mỗi pull request (Constitution: Quy trình)
- [ ] T009 Nối repo với Cloudflare Workers Builds (`main` → production, PR → preview) và ghi các bước vào `README.md`
- [X] T010 [P] Tạo `assets-src/LICENSES.md` và quy ước đặt tên tài sản 3D (Constitution: Ràng buộc)

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Hạ tầng dùng chung cho mọi user story

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

### Dữ liệu và cấu hình

- [X] T011 Viết migration D1 `apps/worker/migrations/0001_core.sql`: `users` (locale `vi`|`en`; nickname 2–20 ký tự, UNIQUE không phân biệt hoa thường; status `active`|`suspended`|`banned`|`deleted`), `consents`, `sessions`, `blocks`, `settings`, `support_resources` (name_vi, name_en, phone, url, scope `emergency`|`crisis`|`youth`|`violence`|`international`, schedule JSON, locales, verified_at NOT NULL)
- [X] T012 [P] Viết `apps/worker/src/db/settings.ts` đọc `settings` có giá trị mặc định (daily_message_limit 20, zone_capacity 150, lecture_capacity 200, model_chat `claude-haiku-5-5`, model_classifier `claude-haiku-5-5`, terms_version, default_locale `vi`)
- [X] T013 [P] Viết seed `apps/worker/seed/dev.sql` cho đường dây nóng theo research.md §R8 (115, 113, Ngày Mai 096 306 1414 thứ 4–CN 13:00–20:30, HOPE 086 50 444 00 16:30–20:30, 111, Find A Helpline chỉ `en`) và script `pnpm seed:dev`

### Bảo mật và đăng nhập

- [X] T014 [P] Viết test mã hóa (round-trip, IV khác nhau mỗi lần, sai khóa thì lỗi) trong `apps/worker/test/crypto.test.ts`
- [X] T015 Viết `apps/worker/src/crypto/aes.ts`: AES-GCM dùng `CHAT_ENCRYPTION_KEY`
- [X] T016 Viết `apps/worker/src/auth/google.ts`: luồng OIDC Authorization Code + PKCE bằng `arctic`, `/auth/google/start?lang=` và `/auth/google/callback`, chỉ lưu `google_sub` và email đã xác minh (research.md §R4)
- [X] T017 Viết `apps/worker/src/auth/session.ts`: cookie `sid` HttpOnly/Secure/SameSite=Lax, lưu hash token trong `sessions`, hết hạn 30 ngày, middleware kiểm `X-Requested-With: bvo`
- [X] T018 Viết `apps/worker/src/api/guards.ts`: middleware trả mã lỗi `UNAUTHENTICATED`, `AGE_REQUIRED`, `CONSENT_REQUIRED`, `PROFILE_REQUIRED`, `SUSPENDED`, `BANNED` theo contracts/http-api.md
- [X] T019 [P] Viết `apps/worker/src/identity/identity-store.ts`: interface `IdentityStore` cùng bản cài D1, để sau chuyển sang Postgres VN qua Hyperdrive (research.md §R13, Constitution IV)

### Router và schema dùng chung

- [X] T020 Viết `apps/worker/src/index.ts`: router Hono, phục vụ static assets, định dạng lỗi chung `{error:{code,message}}` theo locale, nâng cấp WebSocket tới các Durable Object
- [X] T021 [P] Định nghĩa schema zod cho tin WebSocket và body HTTP trong `packages/shared/src/protocol.ts` và `packages/shared/src/api.ts` theo contracts/

### An toàn (lõi dùng chung, Constitution I) — test trước

- [ ] T022 [P] Tạo bộ mẫu an toàn `evals/safety/vi/` (≥ 200 khủng hoảng, 100 dụ chẩn đoán/kê thuốc, 50 jailbreak, 200 bình thường) và `evals/safety/en/` (100 / 50 / 25 / 100) dạng JSONL có nhãn mong đợi
- [ ] T023 [P] Tạo bộ mẫu kiểm duyệt `evals/moderation/` (≥ 200 tin xấu và 200 tin bình thường, vi và en)
- [X] T024 [P] Viết test cho bộ lọc từ khóa (có dấu, không dấu, teencode, tiếng Anh) trong `apps/worker/test/safety/keywords.test.ts`
- [X] T025 [P] Viết test cho mẫu khủng hoảng: số điện thoại chỉ đến từ `support_resources`, chọn đường dây đang trực, câu thay thế khi ngoài giờ, bản `en` có đường dẫn quốc tế, trong `apps/worker/test/safety/crisis-template.test.ts`
- [X] T026 [P] Viết test kiểm tra đầu ra (chặn tên thuốc kèm liều, câu chẩn đoán, xóa số điện thoại do AI viết) trong `apps/worker/test/safety/output-check.test.ts`
- [X] T027 Viết `apps/worker/src/safety/keywords.ts` với danh sách `vi` và `en` (research.md §R7 lớp 1)
- [X] T028 Viết `apps/worker/src/ai/gateway.ts`: gọi model qua AI Gateway, đọc model từ `settings`, có timeout
- [X] T029 Viết `apps/worker/src/safety/classifier.ts`: trả `{level, category, asks_diagnosis, asks_medication, lang}` theo contracts/doctor-ai.md §3; lỗi hoặc hết thời gian thì mặc định `concern`
- [X] T030 Viết `apps/worker/src/safety/crisis-template.ts`: mẫu `vi`/`en` theo contracts/doctor-ai.md §4, đọc `support_resources` và tính `onDutyNow` theo giờ Asia/Ho_Chi_Minh
- [X] T031 Viết `apps/worker/src/safety/output-check.ts` theo contracts/doctor-ai.md §5
- [X] T032 Viết `apps/worker/src/safety/pipeline.ts` ghép 4 lớp (từ khóa → phân loại → mẫu khủng hoảng hoặc gọi model → kiểm tra đầu ra) dùng chung cho chat, vòng và hỏi đáp
- [X] T033 Viết migration `apps/worker/migrations/0002_flags.sql` (`crisis_flags` với excerpt mã hóa, status `open`|`in_review`|`resolved`; `flag_access_log`) và `apps/worker/src/safety/flags.ts` tạo cờ và gửi webhook admin
- [X] T034 Viết script chạy bộ kiểm thử `evals/run-safety.ts` (`pnpm eval:safety --lang vi,en`) với ngưỡng contracts/doctor-ai.md §7, trả mã lỗi khác 0 khi không đạt
- [X] T035 [P] Viết `GET /api/support-resources?lang=` (công khai, cache 5 phút) trong `apps/worker/src/api/support.ts`

### Client nền

- [X] T036 [P] Tạo `apps/client/src/i18n/vi.json`, `apps/client/src/i18n/en.json`, `apps/client/src/i18n/index.ts` và script `scripts/i18n-check.ts` (`pnpm i18n:check`) làm build thất bại khi thiếu khóa (SC-011, Constitution V)
- [X] T037 [P] Viết `apps/client/src/ui/help-button.ts`: nút "Cần giúp đỡ ngay" luôn hiện, gọi `/api/support-resources`, có danh sách dự phòng nhúng sẵn khi mất mạng (FR-021)
- [X] T038 Viết `apps/client/src/engine/renderer.ts`: Three.js, loader GLB, 3 mức đồ họa thấp/vừa/cao lưu trong trình duyệt (FR-006a, research.md §R5)
- [X] T039 [P] Viết `apps/client/src/net/api.ts`: fetch có header `X-Requested-With`, xử lý mã lỗi chung, đọc SSE

**Checkpoint**: Foundation ready — `pnpm test` xanh cho crypto và safety, `pnpm eval:safety` chạy được

---

## Phase 3: User Story 1 - Vào viện, phòng riêng, bác sĩ AI (Priority: P1) 🎯 MVP

**Goal**: Chọn ngôn ngữ → đăng nhập Google → 18+ → đồng ý → tạo nhân vật → vào phòng riêng → trò chuyện an toàn với bác sĩ AI → lịch sử còn khi quay lại → xóa được

**Independent Test**: quickstart.md "US1" bước 1–10

### Tests for User Story 1

- [X] T040 [P] [US1] Viết test cấp phòng (lấy phòng trống nhỏ nhất, hết phòng thì mở tầng, đủ 10 tầng thì mở khu, chạy song song không trùng phòng) trong `apps/worker/test/rooms.test.ts`
- [X] T041 [P] [US1] Viết test `PatientRecord` (mã hóa khi lưu, giới hạn 20 tin/ngày theo giờ VN, xử lý tuần tự, `deleteAll`) trong `apps/worker/test/patient-record.test.ts`
- [X] T042 [P] [US1] Viết test onboarding (dưới 18 → `UNDERAGE` kèm nguồn cho người trẻ; ô đồng ý bắt buộc phải `true`; đổi `terms_version` thì phải đồng ý lại) trong `apps/worker/test/onboarding.test.ts`
- [ ] T043 [P] [US1] Viết test e2e luồng US1 bằng tiếng Việt và tiếng Anh trong `e2e/us1-private-room.spec.ts`

### Implementation for User Story 1

- [X] T044 [US1] Viết migration `apps/worker/migrations/0003_world_doctors.sql`: `wings`, `floors` UNIQUE(wing_id, floor_number), `rooms` (40 phòng/tầng, owner_user_id UNIQUE), `doctors` (display JSON `{vi,en}`), `feedback` (không có user_id)
- [X] T045 [P] [US1] Seed 4 bác sĩ AI (căng thẳng, giấc ngủ, các mối quan hệ, mất mát) có `display` vi/en trong `apps/worker/seed/dev.sql`
- [X] T046 [US1] Viết `apps/worker/src/world/rooms.ts`: cấp phòng trong transaction (FR-007, FR-008)
- [X] T047 [US1] Viết `GET /api/me`, `PUT /api/me/locale`, `GET /api/terms?lang=` trong `apps/worker/src/api/me.ts`
- [X] T048 [US1] Viết `POST /api/onboarding/age`, `/consent`, `/profile` (nickname 2–20 ký tự, lọc từ cấm) trong `apps/worker/src/api/onboarding.ts`
- [X] T049 [US1] Viết Durable Object `apps/worker/src/do/patient-record.ts`: bảng `conversations`, `messages` (content mã hóa, lang, safety_level), `usage_daily`
- [X] T050 [US1] Viết `apps/worker/src/ai/doctor.ts`: quy tắc chung (contracts/doctor-ai.md §2) + `persona_prompt` + locale + 20 tin gần nhất, trả lời tối đa khoảng 400 token
- [X] T051 [US1] Viết `GET /api/doctors`, `GET /api/usage`, CRUD `/api/conversations`, `POST /api/conversations/:id/messages` (SSE `meta`/`token`/`crisis`/`done`/`error`, nhãn "AI") trong `apps/worker/src/api/conversations.ts`
- [X] T052 [US1] Viết `POST /api/feedback` trong `apps/worker/src/api/feedback.ts` (SC-007)
- [X] T053 [US1] Viết `DELETE /api/me` trong `apps/worker/src/api/account.ts`: ẩn ngay, `deleteAll` PatientRecord, giải phóng phòng, đặt lịch xóa hẳn ≤ 30 ngày (SC-008)
- [X] T054 [P] [US1] Viết màn chọn ngôn ngữ đầu tiên (gợi ý theo ngôn ngữ trình duyệt) trong `apps/client/src/features/onboarding/language-picker.ts` (FR-036)
- [X] T055 [US1] Viết màn đăng nhập, xác nhận 18+, điều khoản với từng ô tick riêng không tick sẵn trong `apps/client/src/features/onboarding/onboarding.ts`
- [X] T056 [P] [US1] Dựng nhân vật chibi ghép bộ phận, 3 animation đứng/đi/ngồi, trong `apps/client/src/avatar/avatar.ts` và màn tạo nhân vật `apps/client/src/features/onboarding/create-avatar.ts`
- [ ] T057 [P] [US1] Làm model phòng riêng chibi (GLB ≤ 2 MB) trong `assets-src/room/` và xuất ra `apps/client/public/models/room.glb`
- [X] T058 [US1] Viết cảnh phòng riêng trong `apps/client/src/world/private-room.ts`
- [X] T059 [US1] Viết giao diện trò chuyện với bác sĩ (chọn bác sĩ, luồng SSE, nhãn "AI", khối đường dây nóng khi `crisis`, đếm lượt, xem/xóa lịch sử, hỏi "được lắng nghe?") trong `apps/client/src/features/doctor-chat/doctor-chat.ts`
- [X] T060 [US1] Viết trang cài đặt (đổi ngôn ngữ, đổi mức đồ họa, xóa lịch sử, xóa tài khoản, đăng xuất) trong `apps/client/src/ui/settings.ts`
- [X] T061 [US1] Viết trang admin tối thiểu cho cờ khủng hoảng (danh sách không kèm nội dung; mở chi tiết thì ghi `flag_access_log` trước; resolve) trong `apps/worker/src/admin/flags.ts`, bảo vệ bằng Cloudflare Access + danh sách email admin (FR-018, research.md §R12)
- [ ] T062 [US1] Chạy `pnpm eval:safety --lang vi,en` với model Workers AI đang cấu hình (research.md §R6), ghi kết quả và model đã chọn vào `evals/RESULTS.md` (research.md §R6)

**Checkpoint**: US1 chạy độc lập và đạt SC-001, SC-002, SC-003, SC-007, SC-008 — đây là bản MVP có thể mời thử nghiệm kín

---

## Phase 4: User Story 2 - Đi dạo trong bệnh viện (Priority: P2)

**Goal**: Thế giới 3D chibi nhiều tầng, thấy nhau di chuyển, bản đồ, cửa phòng chỉ chủ mở được

**Independent Test**: quickstart.md "US2" bước 1–5

### Tests for User Story 2

- [ ] T063 [P] [US2] Viết test `WorldZone` (welcome/join/leave, giới hạn 5 tin/giây, snapshot 10 Hz chỉ trong 30 m, `zone_full` ở 150 người) trong `apps/worker/test/world-zone.test.ts`
- [ ] T064 [P] [US2] Viết script tải `scripts/load-zones.ts` (`pnpm load:zones --users 500`) đo SC-004

### Implementation for User Story 2

- [ ] T065 [US2] Viết Durable Object `apps/worker/src/do/world-zone.ts` với WebSocket Hibernation, tag `userId`, auto-response ping (research.md §R2)
- [ ] T066 [US2] Viết `GET /api/world/layout`, `POST /api/world/join` (chọn bản sao còn chỗ), `GET /api/avatar-catalog` trong `apps/worker/src/api/world.ts`
- [ ] T067 [P] [US2] Làm bộ khối module chibi (sảnh, hành lang, cửa phòng có biển số, cầu thang, vườn, phòng tròn bên ngoài) trong `assets-src/modules/` và xuất `apps/client/public/models/modules/*.glb`; biển hiệu không nướng chữ cứng (Constitution V)
- [ ] T068 [US2] Viết `apps/client/src/world/hospital-builder.ts` dựng khu/tầng từ khối module theo `/api/world/layout`
- [ ] T069 [US2] Viết `apps/client/src/net/zone-client.ts`: gửi `move` khi có thay đổi, nội suy snapshot, đổi zone khi `zone_full`
- [ ] T070 [US2] Viết điều khiển nhân vật góc nhìn thứ ba (bàn phím + joystick cảm ứng) trong `apps/client/src/world/player-controller.ts`
- [ ] T071 [US2] Viết instancing/LOD cho nhân vật ở xa và giới hạn 30 nhân vật vẽ đầy đủ ở mức thấp trong `apps/client/src/engine/crowd.ts` (SC-009)
- [ ] T072 [US2] Viết cửa phòng: chỉ chủ phòng vào được, người khác chỉ thấy số phòng, trong `apps/client/src/world/doors.ts` (FR-010)
- [ ] T073 [US2] Viết bản đồ, chỉ đường, nút "về phòng" và "tới phòng sinh hoạt" trong `apps/client/src/ui/map.ts` (FR-011)
- [ ] T074 [US2] Viết script `scripts/sim-fill-rooms.ts` (`pnpm sim:fill-rooms`) để kiểm tra tự mở tầng/khu
- [ ] T075 [US2] Viết test e2e US2 (hai trình duyệt thấy nhau, cửa khóa) trong `e2e/us2-walk.spec.ts` và đo trên điện thoại tầm trung ở mức thấp, ghi vào `docs/perf.md`

**Checkpoint**: US1 và US2 chạy độc lập; đạt SC-004, SC-009

---

## Phase 5: User Story 3 - Vòng sinh hoạt hình tròn (Priority: P3)

**Goal**: Ngồi ghế trong vòng tròn, chat đã kiểm duyệt, bác sĩ AI dẫn dắt theo lịch, báo cáo/chặn

**Independent Test**: quickstart.md "US3" bước 1–5

### Tests for User Story 3

- [ ] T076 [P] [US3] Viết test `CircleRoom` (ngồi/đứng, tin bị lọc không tới người khác, chỉ người gửi nhận `support` khi khủng hoảng, lọc theo danh sách chặn, giới hạn 1 tin/3 giây) trong `apps/worker/test/circle-room.test.ts`
- [ ] T077 [P] [US3] Viết script `evals/run-moderation.ts` (`pnpm eval:moderation`, chặn ≥ 95%, SC-006)

### Implementation for User Story 3

- [ ] T078 [US3] Viết migration `apps/worker/migrations/0004_circles_reports.sql`: `circles` (language `vi`|`en`, max_seats mặc định 12, khoảng 4–20), `circle_sessions`, `reports` (reason, status `open`|`actioned`|`dismissed`, action)
- [ ] T079 [US3] Viết Durable Object `apps/worker/src/do/circle-room.ts`: ghế, tin nhắn qua `safety/pipeline.ts` trước khi phát, `chat_hidden`, xóa tin sau 30 ngày bằng alarm (research.md §R11)
- [ ] T080 [US3] Viết bác sĩ dẫn dắt theo `circle_sessions` (mở đầu, mời chia sẻ, nhắc quy tắc, nói ngôn ngữ của vòng) trong `apps/worker/src/ai/facilitator.ts` (FR-024, FR-038)
- [ ] T081 [US3] Viết `GET /api/circles?lang=`, `POST /api/circles/:id/join`, `POST /api/reports`, `POST/DELETE /api/blocks` trong `apps/worker/src/api/circles.ts`
- [ ] T082 [P] [US3] Làm model phòng tròn với ghế xếp vòng trong `assets-src/circle-room/` → `apps/client/public/models/circle-room.glb`
- [ ] T083 [US3] Viết cảnh và UI vòng sinh hoạt (chọn ghế, khung chat, quy tắc cộng đồng lần đầu, báo cáo/chặn/tắt tiếng) trong `apps/client/src/features/circle/circle.ts` (FR-022–FR-026)
- [ ] T084 [US3] Viết trang admin báo cáo (ẩn tin, khóa tạm/vĩnh viễn, tô đỏ báo cáo chờ quá 12 giờ, webhook báo cáo mới) và CRUD vòng/lịch sinh hoạt trong `apps/worker/src/admin/reports.ts` và `apps/worker/src/admin/circles.ts` (FR-028)
- [ ] T085 [US3] Viết test e2e US3 trong `e2e/us3-circle.spec.ts`

**Checkpoint**: US1–US3 chạy độc lập; đạt SC-006

---

## Phase 6: User Story 4 - Bác sĩ AI thuyết trình (Priority: P4)

**Goal**: Bài giảng song ngữ đã duyệt, phát đúng giờ, vào muộn nghe tiếp, hỏi đáp ẩn danh, xem lại

**Independent Test**: quickstart.md "US4" bước 1–5

### Tests for User Story 4

- [ ] T086 [P] [US4] Viết test `LectureHall` (alarm bắt đầu đúng giờ, `lecture_state` có `startedAt`/`serverNow`, tối đa 3 câu hỏi/người, câu khủng hoảng không trả lời công khai, `overflow` ở 200 người) trong `apps/worker/test/lecture-hall.test.ts`
- [ ] T087 [P] [US4] Viết test luồng trạng thái bài giảng (không lên lịch khi chưa duyệt cả hai bản) trong `apps/worker/test/talks.test.ts`
- [ ] T088 [P] [US4] Viết script `scripts/load-lecture.ts` (`pnpm load:lecture --users 200`) đo SC-005

### Implementation for User Story 4

- [ ] T089 [US4] Viết migration `apps/worker/migrations/0005_talks.sql`: `talks` (scripts/slides/audio JSON `{vi,en}`, capacity 200, status `draft`→`approved`→`scheduled`→`live`→`qa`→`ended`→`archived` hoặc `rejected`), `talk_qa` (language, anonymous, asker_user_id ẩn)
- [ ] T090 [US4] Viết `apps/worker/src/ai/talk-writer.ts`: AI soạn nháp kịch bản `vi` và dịch `en` (model cấu hình được, ví dụ Opus 5.5)
- [ ] T091 [US4] Viết `apps/worker/src/ai/tts.ts`: tạo audio mỗi ngôn ngữ một lần bằng ElevenLabs (Flash v2.5/Eleven v3) và lưu R2 `talks/{talkId}/{vi|en}/audio.mp3`; sinh phụ đề từ kịch bản (research.md §R9)
- [ ] T092 [US4] Viết trang admin bài giảng (tạo, soạn nháp, duyệt **cả hai** bản, tạo audio, lên lịch) trong `apps/worker/src/admin/talks.ts` (FR-032, FR-037)
- [ ] T093 [US4] Viết Durable Object `apps/worker/src/do/lecture-hall.ts` id `talkId:lang:instance`: alarm, phase, hàng đợi câu hỏi qua pipeline an toàn, trả lời công khai có nhãn "AI" (research.md §R10)
- [ ] T094 [US4] Viết `GET /api/talks`, `POST /api/talks/:id/join`, `GET /api/talks/:id/replay` trong `apps/worker/src/api/talks.ts`
- [ ] T095 [P] [US4] Viết thông báo lịch thuyết trình ở sảnh và trước giờ bắt đầu trong `apps/client/src/features/lecture/schedule.ts` (FR-029)
- [ ] T096 [US4] Viết cảnh hội trường (bác sĩ ở giữa, slide, audio tua theo `serverNow - startedAt`, phụ đề theo ngôn ngữ, gửi câu hỏi ẩn danh) và trang xem lại trong `apps/client/src/features/lecture/lecture.ts` (FR-030, FR-031, FR-033)
- [ ] T097 [US4] Viết test e2e US4 (người `vi` và `en` cùng giờ, vào muộn 2 phút) trong `e2e/us4-lecture.spec.ts`

**Checkpoint**: Cả 4 user story chạy độc lập; đạt SC-005

---

## Phase 7: Polish & Cross-Cutting Concerns

- [ ] T098 [P] Viết `GET /admin/api/metrics` (tỷ lệ "được lắng nghe", cờ và báo cáo đang chờ, thời gian chờ lâu nhất) và trang tổng quan trong `apps/worker/src/admin/metrics.ts` (SC-006, SC-007, SC-010)
- [ ] T099 [P] Viết trang admin quản lý bác sĩ, đường dây nóng (cảnh báo khi `verified_at` quá 100 ngày) và settings trong `apps/worker/src/admin/resources.ts` (FR-034, Constitution IV)
- [ ] T100 [P] Viết cron trong `apps/worker/src/cron.ts`: xóa phiên hết hạn, xóa `excerpt` cờ đã resolve quá 90 ngày, xóa hẳn tài khoản `deleted` quá 30 ngày
- [ ] T101 [P] Kiểm tra ngân sách tải lần đầu ≤ 15 MB ở mức thấp, thêm bước đo vào `.github/workflows/ci.yml` (Constitution VI)
- [ ] T102 [P] Rà bảo mật: không có secret trong repo hay log, email không lộ trong bất kỳ API/WS nào, mọi route admin có Cloudflare Access; ghi kết quả vào `docs/security-review.md`
- [ ] T103 [P] Hoàn thiện bản dịch và chạy `pnpm i18n:check` cho toàn bộ client và mẫu phản hồi (SC-011)
- [ ] T104 Chạy toàn bộ quickstart.md (thủ công + tự động) trên môi trường staging, ghi kết quả vào `docs/acceptance.md`
- [ ] T105 Đi hết checklist "Trước khi mở công khai" trong quickstart.md: gọi thử từng số đường dây nóng, cập nhật `verified_at`, lấy ý kiến luật sư về research.md §R13–R14 rồi chạy `speckit clarify` (Constitution IV)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: bắt đầu ngay
- **Foundational (Phase 2)**: sau Setup — chặn mọi user story
- **US1 (Phase 3)**: sau Foundational — là MVP
- **US2 (Phase 4)**: sau Foundational; dùng phòng riêng của US1 làm điểm xuất phát nhưng test độc lập được
- **US3 (Phase 5)**: sau Foundational; vào phòng tròn qua bản đồ của US2 (hoặc lối tắt nếu làm trước US2)
- **US4 (Phase 6)**: sau Foundational; dùng mô hình phòng tròn T082 của US3
- **Polish (Phase 7)**: sau các story muốn phát hành; T105 bắt buộc trước khi mở công khai

### Within Each User Story

- Test viết trước và phải fail (T040–T043, T063, T076, T086–T087)
- Migration → Durable Object/service → API → client → e2e
- Mọi đường gửi chữ phải đi qua `safety/pipeline.ts` (T032) — Constitution I

### Parallel Opportunities

- Setup: T003–T008, T010 song song sau T001–T002
- Foundational: T012–T014, T019, T021–T026, T035–T037, T039 song song
- Tài sản 3D (T057, T067, T082) do người dựng model làm song song với code
- Sau Foundational, US2/US3/US4 có thể làm song song với US1 nếu có nhiều người

---

## Parallel Example: User Story 1

```bash
# Viết test cùng lúc:
Task: "Viết test cấp phòng trong apps/worker/test/rooms.test.ts"
Task: "Viết test PatientRecord trong apps/worker/test/patient-record.test.ts"
Task: "Viết test onboarding trong apps/worker/test/onboarding.test.ts"

# Phần client và tài sản cùng lúc:
Task: "Màn chọn ngôn ngữ trong apps/client/src/features/onboarding/language-picker.ts"
Task: "Nhân vật chibi trong apps/client/src/avatar/avatar.ts"
Task: "Model phòng riêng trong assets-src/room/"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Phase 1 Setup → Phase 2 Foundational (an toàn làm xong ở đây)
2. Phase 3 US1 → chạy quickstart US1, `pnpm eval:safety` đạt
3. **STOP and VALIDATE** → mời thử nghiệm kín một nhóm nhỏ người lớn

### Incremental Delivery

1. MVP (US1) → thử nghiệm kín
2. + US2 đi dạo → thử lại
3. + US3 vòng sinh hoạt → thử lại
4. + US4 thuyết trình → thử lại
5. Polish + T105 → chỉ mở công khai khi có ý kiến luật sư
