# Contract: HTTP API (002)

Cùng quy ước với 001:
- Cần cookie phiên và đã qua onboarding.
- Lỗi có dạng `{error:{code,message}}`.
- Request ghi dữ liệu cần header `X-Requested-With: bvo`.
- Chữ trả về theo ngôn ngữ của tài khoản; danh mục trả đủ `{vi,en}` khi cần.

## Tiến trình & nhiệm vụ

| Method | Path | Trả về / Ghi chú |
|---|---|---|
| GET | `/api/progress` | `{rank:{level,key,title}, totalPoints, todayPoints, dailyCap, activeDays, next: NextStep\|null, eligible: boolean}`. `NextStep = {level,title, requirements:[{kind:"points"\|"days"\|"chain", have, need, label}], suggestion:{questId,label}\|null}` (FR-010) |
| GET | `/api/quests` | `{daily:[QuestView×3], chain: QuestView[] , weekly: QuestView[]}`. `QuestView = {id, category, title, how, where:{zone,spot}\|null, points, progress, target, status}`. Lần gọi đầu trong ngày sẽ giao nhiệm vụ ngày (FR-001) |
| POST | `/api/quests/breath/start` | → `{token, minSeconds:170}` |
| POST | `/api/quests/breath/finish` | `{token}` → `{ok, awarded}`. Gọi quá sớm → 400 `VALIDATION` |
| POST | `/api/selfcare` | `{kind:"mood", value: "great"\|"ok"\|"meh"\|"low"\|"bad"}` hoặc `{kind:"gratitude", text ≤ 200}` → `{awarded}`. Nội dung chỉ ghi vào PatientRecord (FR-006) |
| GET | `/api/selfcare?days=30` | Nhật ký của chính mình |
| DELETE | `/api/selfcare` | Xóa hết nhật ký → 204 |
| POST | `/api/ranks/promote` | Chỉ gọi khi đứng ở sảnh. → `{level,title}` hoặc 409 `NOT_ELIGIBLE` kèm `next`. Bậc 7 không thăng qua đây |
| POST | `/api/guide/invite` | `{userId}` (người mới trong cùng zone, tài khoản < 24 h) → 202. Gửi `guide_invite` qua WorldZone |
| POST | `/api/guide/respond` | `{inviteId, accept:boolean}` → 204 |
| GET | `/api/profile/:userId` | `{nickname, rank:{level,title}, inGameTitleNote, badges}` — không có điểm, không có email (FR-007, FR-012) |

## Bầu cử & Viện trưởng

| Method | Path | Trả về / Ghi chú |
|---|---|---|
| GET | `/api/elections/current` | `{id, status, schedule:{nominateFrom,…}, candidates:[{userId,nickname,pledge,plans}], myRole:{canNominate,canVote,reason?}, myVote: candidateId\|null, result?}`. `myVote` chỉ trả cho chính người bầu (đọc lại bằng HMAC). `result` chỉ có khi `announced`/`vacant` |
| POST | `/api/elections/current/candidacy` | `{pledge ≤200, plans:[≤3 power keys]}` → 201. Lời hứa bị chặn → 422 `MODERATION_BLOCKED` `{reason}`. Không đủ điều kiện → 403 `NOT_ELIGIBLE` `{reason:"rank"\|"consecutive"\|"suspended"\|"phase"}` |
| DELETE | `/api/elections/current/candidacy` | Rút ứng cử → 204 |
| POST | `/api/elections/current/vote` | `{candidateId}` → 204. Không phải Hội đồng / tài khoản < 14 ngày / sai giai đoạn → 403 |
| GET | `/api/elections/hall-of-fame` | `[{week, nickname}]` |
| GET | `/api/world/state` | `{week, director:{nickname}\|null, theme, decor, weeklyQuests, announcement:{text,day}\|null, vacantReason?}` — client dùng để trang trí và hiện bảng tin |
| GET | `/api/catalog?kind=theme\|decor\|weekly_quest` | Danh mục để Viện trưởng chọn |
| POST | `/api/director/theme` | `{themeId}` |
| POST | `/api/director/quests` | `{questIds:[≤3]}` |
| POST | `/api/director/decor` | `{decorId}` |
| POST | `/api/director/announce` | `{text ≤200}` → 201; lần 2 trong ngày → 429 `RATE_LIMITED` `{retryAt}`; bị chặn → 422 `MODERATION_BLOCKED` |
| POST | `/api/director/honorary` | `{userIds:[≤2]}` |

Mọi `/api/director/*` trả 403 `NOT_DIRECTOR` khi người gọi không giữ nhiệm kỳ đang chạy (FR-022).

## Admin

| Method | Path | Ghi chú |
|---|---|---|
| GET/PUT | `/admin/api/ranks` | Chỉnh ngưỡng (FR-009). Người đã ở bậc không bị hạ (Edge Case) |
| POST | `/admin/api/users/:id/rank` | `{level, note}` hạ/khôi phục bậc, ghi `rank_history` (FR-013) |
| POST | `/admin/api/users/:id/council` | `{banned:boolean, note}` |
| POST | `/admin/api/terms/current/remove` | `{note}` phế truất → ghế trống tới hết tuần (FR-025) |
| GET | `/admin/api/terms/:week/actions` | Nhật ký Viện trưởng (FR-026) |
| GET | `/admin/api/elections/:id/voters` | Danh sách người đã bầu (không kèm phiếu) |
| CRUD | `/admin/api/catalog`, `/admin/api/quests` | Danh mục chọn sẵn, mẫu nhiệm vụ (vi/en bắt buộc) |
