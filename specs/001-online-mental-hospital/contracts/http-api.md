# Contract: HTTP API

Base: cùng domain với game. Mọi body đều là JSON (UTF-8). Xác thực dùng cookie phiên `sid`
(`HttpOnly; Secure; SameSite=Lax`). Request đổi dữ liệu phải có header `X-Requested-With: bvo`
để chống CSRF.

**Lỗi** luôn có dạng:

```json
{ "error": { "code": "DAILY_LIMIT_REACHED", "message": "…theo locale…" } }
```

| code | HTTP | Khi nào |
|---|---|---|
| `UNAUTHENTICATED` | 401 | chưa đăng nhập hoặc phiên hết hạn |
| `AGE_REQUIRED` | 403 | chưa xác nhận đủ 18 tuổi |
| `UNDERAGE` | 403 | đã khai dưới 18 tuổi |
| `CONSENT_REQUIRED` | 403 | chưa đồng ý điều khoản, hoặc điều khoản đã đổi phiên bản |
| `PROFILE_REQUIRED` | 403 | chưa có biệt danh hoặc avatar |
| `SUSPENDED` / `BANNED` | 403 | kèm `until` nếu là khóa tạm |
| `DAILY_LIMIT_REACHED` | 429 | kèm `resetsAt` (00:00 giờ Việt Nam) |
| `RATE_LIMITED` | 429 | gửi quá nhanh |
| `VALIDATION` | 400 | kèm `fields` |
| `AI_UNAVAILABLE` | 503 | AI lỗi. Client **vẫn** hiện nút hỗ trợ khẩn cấp |

Thông báo lỗi trả theo `users.locale`. Khi chưa đăng nhập, ngôn ngữ lấy từ header
`Accept-Language` hoặc query `?lang=vi|en`.

---

## Công khai (không cần đăng nhập)

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/support-resources?lang=vi\|en` | Danh sách đường dây nóng theo ngôn ngữ, mỗi mục có `onDutyNow: boolean`. Cache 5 phút. Dùng cho nút "Cần giúp đỡ ngay" ở **mọi** màn hình (FR-021, FR-039) |
| GET | `/api/terms?lang=vi\|en` | Điều khoản hiện hành: `{version, sections[], consentItems[]}` |
| GET | `/auth/google/start?lang=vi\|en` | Chuyển hướng sang Google (PKCE, `state`); ngôn ngữ đã chọn đi theo |
| GET | `/auth/google/callback` | Tạo hoặc tìm user, đặt cookie, chuyển về `/play` |

## Vào viện lần đầu

| Method | Path | Body → Response |
|---|---|---|
| GET | `/api/me` | → `{id, nickname, avatar, locale, roomId, status, onboarding: {age, consent, profile}}`. **Không** trả email |
| PUT | `/api/me/locale` | `{locale: "vi"\|"en"}` → 204 (FR-036) |
| POST | `/api/onboarding/age` | `{isAdult: boolean}` → 204, hoặc `UNDERAGE` kèm danh sách nguồn hỗ trợ cho người trẻ (FR-004) |
| POST | `/api/onboarding/consent` | `{termsVersion, items: {ai_disclosure, sensitive_data, admin_flag_review, overseas_ai_processing}}`; mục bắt buộc phải là `true` → 204 |
| POST | `/api/onboarding/profile` | `{nickname, avatar}` → `{roomId, wing, floor, roomNumber}`. Cấp phòng ngay (FR-007, FR-008) |

## Thế giới

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/world/layout` | Danh sách khu, tầng và số phòng để vẽ bản đồ. Không có thông tin chủ phòng |
| POST | `/api/world/join` | `{area: "lobby"\|"garden"\|"floor", wing?, floor?}` → `{zoneId, wsUrl}`. Server chọn bản sao còn chỗ |
| GET | `/api/avatar-catalog` | Danh mục bộ phận và màu nhân vật |

## Bác sĩ AI (phòng riêng)

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/doctors` | `[{id, name, topic, title, bio, avatar}]`, `title`/`bio` theo locale |
| GET | `/api/usage` | `{used, limit, resetsAt}` |
| GET | `/api/conversations` | Danh sách cuộc trò chuyện của chính người chơi |
| POST | `/api/conversations` | `{doctorId}` → `{conversationId}` |
| GET | `/api/conversations/:id/messages?before=` | Tối đa 50 tin mỗi trang, đã giải mã. Chỉ chủ tài khoản gọi được |
| POST | `/api/conversations/:id/messages` | `{text}` (1–1.000 ký tự) → **Server-Sent Events**, xem bên dưới |
| DELETE | `/api/conversations/:id` | Xóa một cuộc (FR-019) |
| DELETE | `/api/conversations` | Xóa tất cả |
| POST | `/api/feedback` | `{conversationId, feltHeard: "yes"\|"somewhat"\|"no"}` → 204. Hiện sau khi người chơi đóng cuộc trò chuyện, bỏ qua được (SC-007) |

**Các sự kiện SSE** khi gửi tin nhắn:

```text
event: meta     data: {"messageId":"…","lang":"vi","label":"AI"}
event: token    data: {"text":"…"}                       # lặp lại, chỉ khi không khủng hoảng
event: crisis   data: {"message":"…mẫu cố định…","resources":[…],"lang":"vi"}   # thay cho token
event: done     data: {"usage":{"used":7,"limit":20},"resources":[…] | null}   # resources khi mức concern
event: error    data: {"code":"AI_UNAVAILABLE"}
```

Mọi phản hồi của bác sĩ đều mang nhãn `"label":"AI"` (FR-015). Sự kiện `crisis` không bao giờ
chứa số điện thoại do AI viết; `resources` lấy từ `support_resources` (R7, R8).

## Cộng đồng

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/circles?lang=` | `[{id, name, language, seatsTaken, maxSeats, session?}]`; ngôn ngữ của người chơi xếp trước (FR-038) |
| POST | `/api/circles/:id/join` | → `{wsUrl}` hoặc `{full: true, alternatives: [...]}` |
| POST | `/api/reports` | `{reportedUserId, context: {circleId, messageId}, reason}` → 201 (FR-026) |
| POST | `/api/blocks` | `{userId}` → 204 |
| DELETE | `/api/blocks/:userId` | → 204 |

## Thuyết trình

| Method | Path | Mô tả |
|---|---|---|
| GET | `/api/talks?status=upcoming\|past` | `[{id, title, topic, doctor, scheduledAt, languages}]`, theo locale (FR-029) |
| POST | `/api/talks/:id/join` | `{lang}` → `{wsUrl}`; vào hội trường của ngôn ngữ đó, tự sang phòng phụ khi đầy |
| GET | `/api/talks/:id/replay?lang=` | `{audioUrl, slides, captions, qa: [...]}` cho bài đã `ended` (FR-033) |

## Tài khoản

| Method | Path | Mô tả |
|---|---|---|
| POST | `/auth/logout` | Xóa phiên |
| DELETE | `/api/me` | Body `{confirm: "XOA"}` hoặc `{confirm: "DELETE"}` → 202. Ẩn ngay, xóa `PatientRecord` ngay, xóa hẳn phần còn lại trong ≤ 30 ngày (FR-005, SC-008) |

## Quản trị (`/admin/api/*`, có Cloudflare Access và danh sách email admin)

| Method | Path | Mô tả |
|---|---|---|
| GET | `/admin/api/flags?status=open` | Danh sách cờ, **không** kèm nội dung |
| GET | `/admin/api/flags/:id` | Nội dung `excerpt` đã giải mã. **Ghi `flag_access_log`** trước khi trả (FR-018) |
| POST | `/admin/api/flags/:id/resolve` | `{note}` |
| GET | `/admin/api/reports?status=open` | |
| POST | `/admin/api/reports/:id/action` | `{action: "hide"\|"suspend"\|"ban"\|"none", days?}` (FR-028) |
| CRUD | `/admin/api/talks` | Tạo nháp; `POST …/:id/draft-script` (AI soạn bản `vi` và dịch `en`); `POST …/:id/approve`; `POST …/:id/generate-audio`; `POST …/:id/schedule` (FR-032, FR-037) |
| CRUD | `/admin/api/doctors`, `/admin/api/circles`, `/admin/api/circle-sessions`, `/admin/api/support-resources` | (FR-034) |
| GET/PUT | `/admin/api/settings` | |
| GET | `/admin/api/metrics` | Tỷ lệ "được lắng nghe", số cờ và báo cáo đang chờ kèm thời gian chờ lâu nhất (SC-006, SC-007, SC-010) |
