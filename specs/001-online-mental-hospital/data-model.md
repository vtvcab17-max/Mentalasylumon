# Data Model: Bệnh viện tâm thần online (bản đầu tiên)

**Plan**: [plan.md](./plan.md) · **Date**: 2026-11-03

Dữ liệu nằm ở 3 nơi: **D1** cho dữ liệu chung, **SQLite của từng Durable Object** cho dữ liệu
riêng hoặc realtime, và **R2** cho file. Các cột ghi `🔒` được mã hóa AES-GCM ở tầng ứng dụng.
Mọi thời gian lưu theo UTC, dạng ISO 8601.

---

## D1 (database `benh-vien`)

### users — Người chơi
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | text (UUID) | PK |
| google_sub | text | UNIQUE, NOT NULL |
| email | text | NOT NULL, email Google đã xác minh. **Không bao giờ** gửi cho người chơi khác |
| locale | text | `vi` \| `en`; lấy từ màn chọn ngôn ngữ, đổi được trong cài đặt (FR-036) |
| nickname | text | 2–20 ký tự (chữ có dấu, số, khoảng trắng, `_`), không chứa từ cấm, UNIQUE không phân biệt hoa thường |
| avatar | text (JSON) | `{parts:{head,hair,outfit,accessory}, colors:{skin,hair,outfit}}` theo danh mục có sẵn |
| age_confirmed_at | text | NOT NULL trước khi vào viện (FR-004) |
| role | text | `player` \| `admin` |
| status | text | `active` \| `suspended` \| `banned` \| `deleted` |
| suspended_until | text | chỉ khi `suspended` |
| room_id | text | FK → rooms.id, UNIQUE |
| created_at, last_seen_at | text | |

**Trạng thái**:

```text
active ──khóa tạm──▶ suspended ──hết hạn──▶ active
active ──cấm──▶ banned
any ──người dùng xóa──▶ deleted
```

Khi tài khoản chuyển sang `deleted`, hệ thống ẩn tài khoản ngay, giải phóng phòng, và xóa hẳn
dữ liệu trong ≤ 30 ngày (SC-008).

### consents — Đồng ý điều khoản (R14)
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | text | PK |
| user_id | text | FK → users |
| terms_version | text | ví dụ `2026-11-v1` |
| items | text (JSON) | `{ai_disclosure, sensitive_data, admin_flag_review, overseas_ai_processing}`. Mỗi mục là `true` khi người dùng tự tick; mục bắt buộc phải là `true` |
| granted_at | text | NOT NULL |
| withdrawn_at | text | nullable; rút lại thì không dùng tiếp được dịch vụ bác sĩ |

Phiên bản điều khoản đổi thì người chơi phải đồng ý lại trước khi vào viện.

### sessions — Phiên đăng nhập
`id` (hash SHA-256 của token, PK), `user_id`, `created_at`, `expires_at` (+30 ngày). Hết hạn thì
xóa bằng cron.

### blocks — Chặn người chơi khác
`blocker_id`, `blocked_id` (PK kép), `created_at`. Người chơi không chặn được chính mình.

### wings, floors, rooms — Bản đồ bệnh viện
| Bảng | Cột chính | Ghi chú |
|---|---|---|
| wings | id, name, floor_count, created_at | Khu, ví dụ "Khu A" |
| floors | id, wing_id, floor_number | UNIQUE(wing_id, floor_number) |
| rooms | id, floor_id, room_number, owner_user_id (UNIQUE, nullable), assigned_at | Mặc định 40 phòng mỗi tầng |

**Cấp phòng (FR-007, FR-008)**: Hệ thống lấy phòng trống có số nhỏ nhất. Nếu không còn phòng,
nó tạo tầng mới trong khu hiện tại; nếu khu đã đủ 10 tầng, nó tạo khu mới. Mọi bước chạy trong
một transaction.

**Trạng thái phòng**:

```text
free ──cấp──▶ assigned ──tài khoản bị xóa──▶ free
```

Biển cửa phòng chỉ hiện **số phòng**, không hiện biệt danh.

### doctors — Bác sĩ AI
`id`, `name`, `topic` (ví dụ `stress`, `sleep`, `relationships`, `grief`), `display` (JSON `{vi:{title,bio}, en:{title,bio}}`), `avatar` (JSON),
`persona_prompt` (phần tính cách, **không** chứa quy tắc an toàn vì quy tắc dùng chung),
`active`.

### support_resources — Đường dây nóng (R8)
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | text | PK |
| name_vi, name_en | text | NOT NULL |
| phone | text | chỉ gồm số và khoảng trắng; NULL khi là đường dẫn |
| url | text | dùng cho danh bạ đường dây nóng quốc tế (FR-039) |
| scope | text | `emergency` \| `crisis` \| `youth` \| `violence` \| `international` |
| locales | text (JSON) | ngôn ngữ được hiện, ví dụ `["vi","en"]`, hoặc `["en"]` cho danh bạ quốc tế |
| schedule | text (JSON) | ví dụ `{"days":[3,4,5,6,0],"from":"13:00","to":"20:30","tz":"Asia/Ho_Chi_Minh"}`; `null` nghĩa là 24/7 |
| is_free | integer | 0/1/NULL (chưa rõ) |
| verified_at | text | NOT NULL. Quá 100 ngày chưa kiểm lại thì cảnh báo ở trang admin |
| sort | integer | |

### crisis_flags — Cờ khủng hoảng (FR-018)
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | text | PK |
| user_id | text | FK → users |
| source | text | `doctor_chat` \| `circle` \| `lecture_qa` |
| level | text | `concern` \| `acute` |
| category | text | `self_harm` \| `suicide` \| `violence` \| `abuse` \| `other` |
| excerpt 🔒 | blob | **chỉ** tin nhắn bị gắn cờ, phản hồi an toàn và tối đa 2 tin liền trước |
| status | text | `open` \| `in_review` \| `resolved` |
| resolved_by, resolved_at, note | text | |
| created_at | text | |

**Trạng thái**:

```text
open ──admin mở──▶ in_review ──xử lý xong──▶ resolved
```

Phần `excerpt` bị xóa 90 ngày sau khi resolved.

### flag_access_log — Nhật ký xem cờ
`id`, `flag_id`, `admin_user_id`, `action` (`view` \| `resolve`), `at`. Không sửa hay xóa được
từ ứng dụng. Giữ 1 năm.

### reports — Báo cáo vi phạm
| Cột | Ràng buộc |
|---|---|
| id, reporter_id, reported_user_id | |
| context | JSON `{circleId, messageId}` |
| message_snapshot | bản chụp nội dung lúc báo cáo |
| reason | `harassment` \| `harmful` \| `spam` \| `other` |
| status | `open` \| `actioned` \| `dismissed` |
| action | `hide` \| `suspend` \| `ban` \| `none` |
| handled_by, handled_at, created_at | |

### circles, circle_sessions — Vòng sinh hoạt
- `circles`: `id`, `name`, `language` (`vi` \| `en`, FR-038), `max_seats` (mặc định 12, khoảng 4–20), `active`.
- `circle_sessions`: `id`, `circle_id`, `doctor_id`, `topic`, `starts_at`, `ends_at`,
  `status` (`scheduled` \| `live` \| `ended`).

### talks, talk_qa — Thuyết trình
| Cột (talks) | Ràng buộc |
|---|---|
| id, doctor_id, title, topic | |
| scripts | JSON `{vi, en}`; kịch bản đã duyệt của từng ngôn ngữ, phụ đề sinh ra từ đây (FR-037) |
| slides | JSON `{vi:[…], en:[…]}` danh sách khóa R2 |
| audio | JSON `{vi:{key,duration_s}, en:{key,duration_s}}` |
| scheduled_at | |
| capacity | mặc định 200 mỗi phòng |
| status | `draft` \| `approved` \| `scheduled` \| `live` \| `qa` \| `ended` \| `archived` \| `rejected` |
| approved_by, approved_at | NOT NULL trước khi chuyển sang `scheduled` (FR-032); duyệt là duyệt **cả hai** bản |

**Trạng thái**:

```text
draft ──duyệt──▶ approved ──tạo audio + lên lịch──▶ scheduled ──đến giờ──▶ live ──hết audio──▶ qa ──▶ ended ──▶ archived
draft ──từ chối──▶ rejected
```

`talk_qa`: `id`, `talk_id`, `language`, `asker_user_id` (chỉ dùng cho kiểm duyệt, **không** hiện
khi `anonymous`), `anonymous`, `question` (≤ 300 ký tự), `answer`, `answered_at`. Câu hỏi được
trả lời trong phòng cùng ngôn ngữ.

### feedback — "Bạn có cảm thấy được lắng nghe?" (SC-007)
`id`, `doctor_id`, `felt_heard` (`yes` \| `somewhat` \| `no`), `locale`, `created_at`. **Không** lưu
`user_id` hay nội dung trò chuyện. Mỗi cuộc trò chuyện hỏi tối đa một lần; `PatientRecord` ghi nhớ
đã hỏi chưa.

### settings — Cấu hình
Dạng key/value: `daily_message_limit` (20), `zone_capacity` (150), `lecture_capacity` (200),
`model_chat`, `model_classifier`, `terms_version`, `admin_webhook_url`, `default_locale` (`vi`).

### Dành sẵn: identity (R13)
`user_id`, `full_name`, `date_of_birth`, `phone_vn`, `phone_verified_at`. Bảng này **chưa dùng**
trong bản thử nghiệm kín. Khi cần, phần này chuyển sang Postgres đặt tại Việt Nam qua Hyperdrive.

---

## Durable Object SQLite

### PatientRecord (mỗi người chơi một object, id = user_id)
| Bảng | Cột | Ghi chú |
|---|---|---|
| conversations | id, doctor_id, started_at, last_message_at, deleted_at | |
| messages | id, conversation_id, role (`user` \| `doctor` \| `safety`), content 🔒, lang (`vi` \| `en`), safety_level (`none` \| `concern` \| `acute`), created_at | user ≤ 1.000 ký tự |
| usage_daily | date (theo giờ VN), count | so với `daily_message_limit` |

Object này xử lý tin nhắn **tuần tự**, nên tránh được hai tin cùng lúc vượt giới hạn. Xóa toàn bộ
dùng `deleteAll()`.

### WorldZone (id = `lobby-1`, `wingA-floor3-1`, `garden-1`…)
Danh sách người có mặt chỉ giữ trong bộ nhớ (vị trí, hướng, animation, biệt danh, avatar). Mỗi
socket có tag là `userId`. Storage chỉ giữ cấu hình zone.

### CircleRoom (id = circle id)
`seats` (số ghế → userId), `messages` (id, user_id, text ≤ 300 ký tự, created_at, hidden) tự xóa
sau 30 ngày, `session_state`.

### LectureHall (id = `talkId:lang:instance`, mỗi ngôn ngữ một dòng thời gian riêng)
`phase` (`waiting` \| `playing` \| `qa` \| `ended`), `started_at`, `question_queue`. Alarm dùng
để bắt đầu đúng giờ.

---

## R2 (bucket `benh-vien-assets`)

```text
models/{avatar,props,modules}/*.glb
textures/*
talks/{talkId}/{vi|en}/audio.mp3
talks/{talkId}/{vi|en}/slides/*.webp
```

File công khai được cache lâu. Không có dữ liệu cá nhân nào trong R2.

---

## Ánh xạ thực thể trong spec → lưu trữ

| Thực thể trong spec | Nơi lưu |
|---|---|
| Người chơi | `users`, `consents`, `sessions`, `blocks` |
| Khu / Tầng | `wings`, `floors` |
| Phòng riêng | `rooms` |
| Bác sĩ AI | `doctors` |
| Cuộc trò chuyện | `PatientRecord` (cờ đi vào `crisis_flags`) |
| Vòng sinh hoạt | `circles`, `circle_sessions`, `CircleRoom` |
| Buổi thuyết trình | `talks`, `talk_qa`, `LectureHall`, R2 |
| Báo cáo vi phạm | `reports` |
| Tài nguyên hỗ trợ khẩn cấp | `support_resources` |
