# Tasks: Cấp bậc, nhiệm vụ và bầu Viện trưởng

**Input**: Design documents from `specs/002-ranks-quests/`
**Prerequisites**: plan.md, spec.md, research.md, data-model.md, contracts/, quickstart.md
**Tests**: Có (Constitution I yêu cầu test trước cho phần an toàn/riêng tư; SC-006 cần test bảo mật Viện trưởng).

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [X] T001 Tạo module rỗng `apps/worker/src/progress/` và `apps/worker/src/elections/`, `apps/client/src/features/progress/`, `apps/client/src/features/elections/` theo plan.md
- [X] T002 [P] Thêm `packages/shared/src/progress.ts` (schema zod: RankKey, QuestView, NextStep, ProgressView, ElectionView, WorldState, HOTSPOTS theo zone) và export trong `packages/shared/src/index.ts`
- [X] T003 [P] Viết `apps/worker/src/progress/time.ts`: `vnDay(date)`, `vnWeek(date)`, `weekSchedule(week)` (mốc ứng cử/bỏ phiếu/công bố/nhiệm kỳ theo research.md R3) + test `apps/worker/test/progress-time.test.ts`

## Phase 2: Foundational

**⚠️ CRITICAL**: Mọi user story cần phase này.

- [X] T004 Viết migration `apps/worker/migrations/0005_progress.sql`: `ranks` (level 1–7, min_points, min_active_days, chain_id, unlocks), `user_progress`, `rank_history`, `points_ledger` (UNIQUE(user_id, dedupe_key), points 0–100), `quest_chains`, `quest_templates` (kind `daily`|`chain`|`weekly`, category `selfcare`|`community`|`explore`|`work`, event, params JSON, target, points, min_rank, text JSON vi/en), `user_quests` (PK user_id+quest_id+period, status `active`|`done`), `thanks` (PK from,to,day), `garden_beds`, `bed_waterings`; seed bậc mặc định và danh mục nhiệm vụ (vi/en)
- [X] T005 Viết `apps/worker/src/progress/ledger.ts`: `award(env, userId, {source, dedupeKey, points})` — cắt theo giới hạn ngày (setting `daily_point_cap`, mặc định 100), chống trùng, cập nhật `user_progress` và `active_days` (research.md R2) + test `apps/worker/test/ledger.test.ts` (trùng khóa chỉ tính 1 lần, giới hạn 100, không trừ điểm)
- [X] T006 Viết `apps/worker/src/progress/events.ts` + `quests.ts`: `recordEvent(env, userId, event)` cập nhật tiến độ mọi `user_quests` đang mở khớp event/params, hoàn thành → `award()`; `assignDaily(env, userId, day)` chọn tất định 1 mẫu mỗi nhóm theo `hash(user_id+day)` và `min_rank`
- [X] T007 Thêm `X-User-Rank` vào header WS ở `apps/worker/src/index.ts` và `rank` vào `PlayerPublic` (`packages/shared/src/protocol.ts`), `WorldZone` lưu rank trong attachment

**Checkpoint**: sổ cái và nhiệm vụ chạy được qua test.

## Phase 3: User Story 1 - Nhiệm vụ hằng ngày và sổ nhiệm vụ (P1) 🎯 MVP

**Goal**: 3 nhiệm vụ mỗi ngày, xác nhận bằng sự kiện thật, có Dẫn đường.
**Independent Test**: quickstart.md "US1" bước 1–5.

### Tests for User Story 1

- [X] T008 [P] [US1] Viết `apps/worker/test/quests.test.ts`: GET /api/quests giao đúng 3 nhóm, ổn định trong ngày; tới hotspot trong WorldZone → nhiệm vụ `reach` xong; vẫy tay khi có người trong 8 m → `wave`; bài thở finish trước 170 giây → 400; mood/gratitude chỉ lưu PatientRecord (không có trong D1); vượt 100 điểm/ngày bị cắt
- [X] T009 [P] [US1] Viết `apps/worker/test/circle-quests.test.ts`: ngồi đủ 10 phút (đồng hồ giả) → `sit`; cảm ơn cùng một người 2 lần/ngày chỉ tính 1; không tính khi đã chặn

### Implementation for User Story 1

- [X] T010 [US1] Thêm hotspot + phát sự kiện `reach`/`wave` trong `apps/worker/src/do/world-zone.ts` (ctx.waitUntil(recordEvent…)), tin `quest_progress` cho người liên quan
- [X] T011 [US1] Thêm phút ngồi (`satSince`) và tin `thank` → `thanked` + sự kiện trong `apps/worker/src/do/circle-room.ts`
- [X] T012 [US1] Thêm bảng `selfcare` (mã hóa) và RPC `addSelfCare/listSelfCare/clearSelfCare` trong `apps/worker/src/do/patient-record.ts`
- [X] T013 [US1] Viết `apps/worker/src/api/progress.ts`: GET /api/quests, POST /api/quests/breath/start|finish, POST/GET/DELETE /api/selfcare (contracts/http-api.md)
- [X] T014 [P] [US1] Viết `apps/client/src/world/hotspots.ts`: điểm khám phá + mũi tên Dẫn đường (cả khi điểm ở khu khác: chỉ tới cổng)
- [X] T015 [P] [US1] Viết `apps/client/src/features/progress/breathing.ts`: bài thở 3 phút có vòng tròn đếm nhịp, nút dừng
- [X] T016 [US1] Viết `apps/client/src/features/progress/quest-book.ts`: Sổ nhiệm vụ (3 nhiệm vụ, tiến độ, điểm hôm nay/giới hạn, lời nhắc nghỉ khi đủ điểm), chọn cảm xúc, dòng biết ơn; không nhắc nhiệm vụ sau khi nhận `support` trong phiên (FR-028); nút "📒 Nhiệm vụ" trên HUD ở `apps/client/src/app.ts`; chuỗi vi/en

**Checkpoint**: US1 chạy độc lập.

## Phase 4: User Story 2 - Thăng cấp theo lộ trình (P1)

**Goal**: 7 bậc, thẻ Bước tiếp theo, lễ thăng cấp ở sảnh, chức danh trên tên.
**Independent Test**: quickstart.md "US2".

- [X] T017 [P] [US2] Viết `apps/worker/test/ranks.test.ts`: next step đúng điều kiện; promote khi chưa đủ → 409 NOT_ELIGIBLE; đủ → lên 1 bậc, ghi rank_history; admin đổi ngưỡng không hạ người đã ở bậc; chuỗi nhiệm vụ mở theo bậc
- [X] T018 [US2] Viết `apps/worker/src/progress/ranks.ts` (điều kiện, `nextStep`, `promote`) và route GET /api/progress, POST /api/ranks/promote, GET /api/profile/:userId trong `apps/worker/src/api/progress.ts`; promote gọi `WorldZone.celebrate()` ở sảnh
- [ ] T019 [US2] (chức danh trên tên đã xong; còn đồng phục) Hiện chức danh dưới biệt danh (`apps/client/src/engine/crowd.ts`, label) và đồng phục mở khóa theo bậc (`apps/client/src/avatar/avatar.ts`)
- [X] T020 [US2] Viết thẻ Bước tiếp theo trong `quest-book.ts` và `apps/client/src/features/progress/ceremony.ts` (lễ ở sảnh, pháo giấy, câu chúc mẫu có nhãn AI); hồ sơ người chơi có ghi chú "chức danh trong game" (FR-012)
- [X] T021 [US2] Admin: GET/PUT /admin/api/ranks, POST /admin/api/users/:id/rank trong `apps/worker/src/admin/progress.ts`

**Checkpoint**: US1 + US2 = vòng chơi hoàn chỉnh (MVP).

## Phase 5: User Story 3 - Mini-game công việc (P2)

- [ ] T022 [P] [US3] Test `apps/worker/test/minigames.test.ts`: nhặt rác cần bậc ≥ 2 và ≤ 1,5 m, rác biến mất với cả zone; tưới 1 lần/bồn/ngày; tidy chỉ trước buổi 30 phút, bậc ≥ 3; lời mời dẫn tham quan chỉ cho người mới < 24 h, từ chối được
- [ ] T023 [US3] Rác và bồn hoa trong `apps/worker/src/do/world-zone.ts` (`props`, `act`, `prop_update`) theo research.md R8
- [ ] T024 [US3] Sắp ghế & rót trà trong `apps/worker/src/do/circle-room.ts` (`tidy`, `tidy_state`)
- [ ] T025 [US3] Đón người mới: POST /api/guide/invite|respond, tin `guide_invite`, hoàn thành theo chuỗi "Ngày đầu ở viện"
- [ ] T026 [US3] Client `apps/client/src/world/minigames.ts`: rác, bồn hoa lớn dần, hiệu ứng; gợi ý lên cấp khi chưa đủ bậc

## Phase 6: User Story 4 - Hội đồng bầu Viện trưởng (P2)

- [X] T027 [P] [US4] Test `apps/worker/test/elections.test.ts` (đồng hồ giả): tạo kỳ, ứng cử chỉ bậc 6, lời hứa xúc phạm bị chặn, bỏ phiếu chỉ Hội đồng ≥ 14 ngày, đổi phiếu, không lộ ai bầu ai, hòa → điểm 28 ngày → bốc thăm, < 3 phiếu → vacant, không 2 nhiệm kỳ liền
- [X] T028 [US4] Migration `apps/worker/migrations/0006_elections.sql`: `elections`, `candidates`, `ballots` (voter_hash), `election_voters`, `terms`, `term_actions`, `announcements` (UNIQUE author_id+day), `catalog_items` + seed danh mục vi/en
- [X] T029 [US4] Viết `apps/worker/src/elections/election.ts` (`tickElections(now)`, kiểm phiếu, phân định R6) và cron `*/10 * * * *` trong `wrangler.jsonc` + `scheduled()` ở `apps/worker/src/index.ts`
- [X] T030 [US4] Viết `apps/worker/src/api/elections.ts`: /api/elections/current, candidacy, vote, hall-of-fame
- [X] T031 [US4] Client `apps/client/src/features/elections/council.ts`: bảng tin ở sảnh, ứng viên, bỏ phiếu, kết quả, bảng vàng

## Phase 7: User Story 5 - Một tuần làm Viện trưởng (P3)

- [X] T032 [P] [US5] Test bảo mật `apps/worker/test/director-security.test.ts`: phiên Viện trưởng gọi mọi route admin → 404, không đọc được dữ liệu người khác; người không giữ nhiệm kỳ gọi /api/director/* → 403 (SC-006)
- [X] T033 [US5] Viết `apps/worker/src/elections/director.ts` + /api/director/* + /api/world/state + /api/catalog; thông báo qua `moderatePublic`, 1 lần/ngày; nhật ký `term_actions`
- [X] T034 [US5] Client `apps/client/src/features/elections/director-desk.ts` + `apps/client/src/world/decor.ts` (trang trí theo nhiệm kỳ, tên vàng, áo choàng)
- [X] T035 [US5] Admin: phế truất, nhật ký Viện trưởng, danh sách người đã bầu, CRUD danh mục trong `apps/worker/src/admin/progress.ts`

## Phase 8: Polish & Cross-Cutting

- [ ] T036 [P] E2E `e2e/progress.spec.ts`: làm nhiệm vụ, lên Nhân viên lau dọn, nhặt rác (desktop + mobile)
- [X] T037 [P] (thay bằng `localSql` + `timeTravel` trong e2e/helpers.ts) Script `scripts/sim-progress.mjs` cấp điểm/bậc và tua đồng hồ bầu cử ở máy
- [ ] T038 Xóa tài khoản dọn dữ liệu 002 (ledger, quests, candidates, phiếu qua voter list) trong `apps/worker/src/api/account.ts`
- [ ] T039 Cập nhật AGENTS.md, i18n check, chạy quickstart.md

## Dependencies & Execution Order

- Setup → Foundational → US1 → US2 (cần ledger/quests) → US3 (cần bậc) → US4 (cần bậc 5–6) → US5 (cần nhiệm kỳ) → Polish.
- Trong mỗi story: test trước, rồi worker, rồi client.

## Parallel Example: User Story 1

T008 và T009 song song; T014 và T015 song song với T010–T013.

## Implementation Strategy

MVP = US1 + US2 (vòng chơi điểm → thăng cấp). Deploy, đo SC-001–SC-004, rồi làm US3 → US4 → US5.
