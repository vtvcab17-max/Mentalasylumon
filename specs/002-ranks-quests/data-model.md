# Data Model: Cấp bậc, nhiệm vụ và bầu Viện trưởng

Thời gian lưu ở dạng chuỗi ISO UTC. `day` là ngày theo giờ VN dạng `YYYY-MM-DD`, `week` là tuần ISO theo giờ VN dạng `YYYY-Www` (research.md R3).

## D1 — migration 0005_progress

### ranks — Cấu hình bậc (quản trị viên chỉnh được, FR-009)
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| level | integer | PK, 1–7 |
| key | text | `patient` \| `cleaner` \| `orderly` \| `nurse` \| `intern` \| `head` \| `director` |
| min_points | integer | ≥ 0 |
| min_active_days | integer | ≥ 0 |
| chain_id | text | NULL hoặc FK → quest_chains |
| unlocks | text | JSON `["minigame:litter","outfit:cleaner",…]` |

Mặc định: 2 → 100 điểm / 0 ngày; 3 → 400 / 3; 4 → 1000 / 7; 5 → 2000 / 14; 6 → 3500 / 28; 7 → chỉ qua bầu cử.

### user_progress — Tiến trình của người chơi
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| user_id | text | PK, FK → users |
| rank | integer | mặc định 1 |
| total_points | integer | mặc định 0 |
| active_days | integer | số ngày có ít nhất 1 nhiệm vụ hoàn thành |
| last_active_day | text | `YYYY-MM-DD` |
| council_banned | integer | 0/1 — quản trị viên tước tư cách Hội đồng (FR-013) |
| updated_at | text | |

### rank_history — Thăng/hạ cấp
`id`, `user_id`, `from_rank`, `to_rank`, `reason` (`promotion` \| `admin_demote` \| `admin_restore`), `note`, `by_user_id` (NULL nếu tự thăng), `at`.

### points_ledger — Sổ cái điểm (R2)
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | text | PK |
| user_id | text | FK → users |
| day | text | `YYYY-MM-DD` giờ VN |
| source | text | `quest` \| `chain` \| `minigame` \| `weekly` \| `thank` |
| dedupe_key | text | UNIQUE(user_id, dedupe_key) |
| points | integer | 0–100, đã cắt theo giới hạn ngày |
| created_at | text | |

Index `(user_id, day)`, `(user_id, created_at)` (dùng cho tổng 28 ngày khi hòa phiếu).

### quest_templates — Danh mục nhiệm vụ
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | text | PK, ví dụ `daily-breath`, `chain-firstday-3` |
| kind | text | `daily` \| `chain` \| `weekly` |
| category | text | `selfcare` \| `community` \| `explore` \| `work` |
| event | text | `reach` \| `wave` \| `sit` \| `thank` \| `breath` \| `mood` \| `gratitude` \| `litter` \| `water` \| `tidy` \| `guide` \| `circle_session` |
| params | text | JSON, ví dụ `{"zone":"garden","spot":"pond"}`, `{"minutes":10}` |
| target | integer | số lần/phút cần đạt |
| points | integer | |
| min_rank | integer | mặc định 1 |
| chain_id, step | text, integer | khi `kind = chain` |
| text | text | JSON `{vi:{title,how,where}, en:{…}}` |
| active | integer | |

### quest_chains — Chuỗi thăng cấp
`id` (`firstday` \| `helper` \| `gardener` \| `guide` \| `keeper`), `rank_level` (bậc mà chuỗi mở ra), `text` JSON vi/en.

### user_quests — Nhiệm vụ được giao
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| user_id, quest_id, period | text | PK kép. `period` = `day` (daily), `week` (weekly), `chain` (chuỗi, không hết hạn) |
| progress | integer | 0…target |
| target | integer | |
| status | text | `active` \| `done` |
| done_at | text | |

**Trạng thái**: `active ──progress ≥ target──▶ done` (một chiều; tự cộng điểm qua ledger).

Nhiệm vụ ngày: lần đầu mở Sổ trong ngày thì chọn 1 nhiệm vụ mỗi nhóm `selfcare`, `community`, `explore`. Chọn tất định theo `hash(user_id + day)` trong các mẫu có `min_rank ≤ rank`.

### thanks — Ai cảm ơn ai (FR-008)
`from_user_id`, `to_user_id`, `day`, `message_id`; PK `(from_user_id, to_user_id, day)`.

### garden_beds — Bồn hoa (R8)
`id`, `week`, `waterings` (integer); bảng `bed_waterings(user_id, bed_id, day)` PK kép.

## D1 — migration 0006_elections

### elections
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| id | text | PK = tuần ứng cử, ví dụ `2026-W46` |
| nominate_from, nominate_to, vote_from, vote_to, term_from, term_to | text | UTC, tính sẵn (R3) |
| status | text | `nominating` \| `voting` \| `announced` \| `vacant` |
| winner_id | text | NULL |
| tie_break | text | NULL \| `points_28d` \| `lot` |
| result | text | JSON `[{candidateId, nickname, votes}]` — chỉ có từ khi `announced` |

**Trạng thái**:
```text
(cron tạo) nominating ──vote_from──▶ voting ──vote_to──▶ announced (có người thắng)
                                                   └──▶ vacant (0 ứng viên / < 3 phiếu / người thắng bị khóa)
```

### candidates
`election_id`, `user_id` (PK kép), `pledge` (≤ 200 ký tự, đã qua kiểm duyệt), `plans` (JSON, tối đa 3 mục trong `director_powers`), `withdrawn` (0/1), `created_at`.

### ballots — Phiếu kín (R4)
`election_id`, `voter_hash` (PK kép), `candidate_id`, `cast_at`.

### election_voters
`election_id`, `voter_id` (PK kép), `voted_at`. Chỉ cho biết ai đã bầu.

### terms — Nhiệm kỳ Viện trưởng
| Cột | Kiểu | Ràng buộc |
|---|---|---|
| week | text | PK, tuần của nhiệm kỳ |
| election_id | text | FK |
| holder_id | text | NULL nếu ghế trống |
| theme_id | text | FK → catalog_items(kind=theme) |
| decor_id | text | FK → catalog_items(kind=decor) |
| weekly_quests | text | JSON `[questTemplateId ×≤3]` |
| honorary | text | JSON `[userId ×≤2]` |
| ended_reason | text | NULL \| `suspended` \| `deleted` \| `removed_by_admin` |

### term_actions — Nhật ký Viện trưởng (FR-026)
`id`, `week`, `holder_id`, `action` (`theme` \| `quests` \| `decor` \| `announce` \| `honorary`), `payload` JSON, `at`.

### announcements
`id`, `week`, `author_id`, `text` (≤ 200, đã qua kiểm duyệt), `day`, `created_at`. UNIQUE `(author_id, day)`, tức mỗi ngày tối đa 1 thông báo.

### catalog_items — Danh mục chọn sẵn (FR-024)
`id`, `kind` (`theme` \| `decor` \| `weekly_quest`), `text` JSON vi/en, `data` JSON (bảng màu, vật trang trí; với `weekly_quest` là `{event, target}` cho cả viện), `active`.

### hall_of_fame — Bảng vàng
Lấy từ `terms` có `holder_id` khác NULL và `ended_reason` là NULL, join lấy `users.nickname`. Tài khoản đã xóa thì bỏ qua (Edge Case).

## Durable Object

### PatientRecord (thêm)
Bảng `selfcare(id, kind ('mood'|'gratitude'), value (mã hóa), day, created_at)`. Chỉ chủ tài khoản đọc được. Bảng bị xóa cùng `deleteAll()`.

### WorldZone (thêm)
- `props`: danh sách rác/bồn hoa trong bộ nhớ `{id, kind, p}`.
- `hotspots`: danh sách tĩnh theo zone (từ `shared/progress.ts`).
- Mỗi socket giữ thêm `rank` và tập hotspot đã tới trong phiên.

### CircleRoom (thêm)
- Attachment có thêm `satSince` để tính phút ngồi.
- Trạng thái `tidy` (các ghế lệch) trước buổi sinh hoạt.
