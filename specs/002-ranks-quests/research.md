# Research: Cấp bậc, nhiệm vụ và bầu Viện trưởng

## R1. Xác nhận nhiệm vụ bằng sự kiện phía máy chủ (FR-003)

- **Decision**: Mỗi hành động có thể hoàn thành nhiệm vụ được xác nhận ở nơi máy chủ đã biết nó:

  | Sự kiện | Nơi xác nhận | Cách xác nhận |
  |---|---|---|
  | `reach` (tới một điểm) | `WorldZone` | Vị trí `move` nằm trong bán kính 2 m của hotspot thuộc zone đó |
  | `wave` | `WorldZone` | `emote` có người khác trong bán kính 8 m |
  | `litter`, `water` | `WorldZone` | Người chơi đủ bậc, đứng gần vật dưới 1,5 m |
  | `sit` | `CircleRoom` | Phút ngồi được cộng khi đứng dậy hoặc rời vòng, và mỗi 5 phút nếu ngồi lâu |
  | `thank` | `CircleRoom` | Cảm ơn tin của người khác |
  | `tidy` | `CircleRoom` | Sắp ghế trước buổi sinh hoạt |
  | `breath` | API | `POST start` trả mã; `POST finish` chỉ chấp nhận khi đã qua ≥ 170 giây và ≤ 30 phút |
  | `mood`, `gratitude` | API | Ghi vào `PatientRecord`; chỉ việc hoàn thành được tính điểm |

  DO gọi `recordEvent(env, userId, event)` (D1) trong `ctx.waitUntil` để không làm chậm vòng xử lý tin.
- **Rationale**: Không tin client (FR-003). Các DO đã có vị trí và danh tính đã xác thực.
- **Alternatives considered**: Client tự báo "đã xong" (dễ gian lận). DO tự tính điểm (lặp logic ở nhiều nơi).

## R2. Sổ cái điểm chống trùng và giới hạn ngày (FR-004, FR-008)

- **Decision**: Bảng `points_ledger` có `UNIQUE(user_id, dedupe_key)`. Ví dụ:
  - `quest:<day>:<questId>`
  - `thank:<day>:<toUserId>`
  - `litter:<zone>:<itemId>`

  Hàm `award()` làm ba việc:
  1. Đọc tổng điểm của ngày.
  2. Cắt số điểm theo phần còn lại của giới hạn 100.
  3. `INSERT … ON CONFLICT DO NOTHING`, rồi cập nhật `user_progress` (tổng điểm, ngày hoạt động).

  Khi đã đủ giới hạn, khoản điểm vẫn được ghi với `points = 0` để nhiệm vụ vẫn tính là hoàn thành.
- **Rationale**: Hai thiết bị cùng hoàn thành một nhiệm vụ chỉ được tính một lần (Edge Case). D1 có ràng buộc UNIQUE sẵn.
- **Alternatives considered**: Đếm trong DO theo người (thêm một DO cho mỗi người, phức tạp hơn).

## R3. Ngày và tuần theo giờ Việt Nam

- **Decision**: `vnDay(date)` = ngày ISO của `date + 7h`. `vnWeek(date)` = tuần ISO (`2026-W46`) theo giờ VN. Mốc của tuần:
  - Ứng cử: thứ Năm 00:00 tới thứ Sáu 23:59.
  - Bỏ phiếu: thứ Bảy 00:00 tới Chủ Nhật 20:00.
  - Công bố: Chủ Nhật 20:00.
  - Nhiệm kỳ: thứ Hai 00:00 tới Chủ Nhật 23:59 của tuần kế tiếp.

  Mọi mốc được tính sẵn khi tạo kỳ bầu cử và lưu ở dạng UTC.
- **Rationale**: Việt Nam không có giờ mùa hè, nên cộng cố định 7 giờ là đúng.

## R4. Phiếu kín (FR-019)

- **Decision**:
  - `ballots(election_id, voter_hash, candidate_id)` với `voter_hash = HMAC-SHA256(khóa KeyVault, election_id + ":" + voter_id)`. Người bầu đổi phiếu được bằng `INSERT OR REPLACE` trên khóa `(election_id, voter_hash)`.
  - `election_voters(election_id, voter_id, voted_at)` cho biết ai đã bầu, để quản trị viên điều tra gian lận.
  - Không API nào ghép hai bảng.
  - Kết quả chỉ trả tổng số phiếu và chỉ sau khi kỳ bầu cử ở trạng thái `announced`.
- **Rationale**: Có người truy cập thẳng cơ sở dữ liệu cũng không đọc được ai bầu cho ai nếu không có khóa. Khóa nằm trong DO, không có trong D1.
- **Alternatives considered**: Lưu `voter_id` trực tiếp (lộ phiếu nếu D1 bị đọc). Phiếu ẩn danh hoàn toàn (không đổi được phiếu, không chống bầu hai lần).

## R5. Lịch bầu cử bằng Cron Trigger

- **Decision**: Thêm cron `*/10 * * * *` vào `wrangler.jsonc`, giữ cron dọn dẹp hằng ngày đã có. Mỗi lần chạy, `tickElections(now)` làm các việc sau, việc nào cũng an toàn khi chạy lặp lại:
  1. Tạo kỳ của tuần nếu chưa có.
  2. Chuyển `nominating → voting → announced`, hoặc `→ vacant` theo mốc giờ.
  3. Lúc công bố: kiểm phiếu, phân định hòa phiếu (R6) và tạo `terms` cho tuần sau.
  4. Đầu nhiệm kỳ: phát thông báo ở sảnh.

  Cron bị trễ vẫn đúng, vì lần chạy kế tiếp sẽ làm tiếp các bước còn thiếu.
- **Rationale**: Không cần DO riêng. Độ trễ 10 phút chấp nhận được (SC-005 tính theo giờ công bố trên bảng tin).
- **Alternatives considered**: DO alarm (cần một DO giữ lịch toàn cục; cron đơn giản hơn).

## R6. Phân định hòa phiếu và ghế trống (FR-020)

- **Decision**:
  1. Nhiều phiếu nhất thì thắng.
  2. Hòa thì xét tổng điểm cống hiến trong 28 ngày tính tới giờ đóng phiếu.
  3. Vẫn hòa thì bốc thăm bằng hash của `election_id + candidate_id`. Cách này tất định và ai cũng kiểm lại được.

  Tuần đó ghế để trống nếu không có ứng viên, có ít hơn 3 phiếu hợp lệ, hoặc người thắng đã bị khóa hay xóa tài khoản trước khi nhiệm kỳ bắt đầu.

## R7. Quyền Viện trưởng là danh sách đóng (FR-022, SC-006)

- **Decision**: Chỉ có 5 API dưới `/api/director/*`: `theme`, `quests`, `decor`, `announce`, `honorary`. Mỗi API kiểm `terms.holder_id = user.id`, nhiệm kỳ đang chạy và người đó không bị khóa. Giá trị chọn phải thuộc danh mục đã duyệt. API chỉ ghi vào các bảng `terms`, `term_actions` và `announcements`.

  Test bảo mật gọi mọi route `/api/*` và `/admin/*` bằng phiên của Viện trưởng và khẳng định:
  - route admin trả 404;
  - không route người chơi nào trả dữ liệu riêng của người khác.
- **Rationale**: Danh sách trắng dễ kiểm tra hơn danh sách đen.

## R8. Mini-game nhiều người trong WorldZone

- **Decision**:
  - **Rác**: WorldZone giữ tối đa 12 vật rác mỗi zone (sân trước, sảnh, vườn sau). Nhặt hết một vật thì 3 phút sau có vật mới ở chỗ ngẫu nhiên khác.
  - **Bồn hoa**: trạng thái lấy từ D1. Đếm số lượt tưới trong tuần của cả viện, mỗi bồn 1 lượt/người/ngày.
  - **Tin mới**: client nhận `props` (danh sách vật) và gửi `act {kind, id}`. Server kiểm bậc (header `X-User-Rank`) và khoảng cách, phát `prop_update` cho cả zone rồi ghi sự kiện. Rác chỉ giữ trong bộ nhớ; ngủ thì mất rác, lúc thức dậy sinh lại. Chấp nhận được.
  - **Sắp ghế & rót trà**: trong `CircleRoom`, 30 phút trước buổi sinh hoạt theo lịch, các ghế lệch được hiện ra. Người chơi bậc 3 trở lên bấm vào để chỉnh.
  - **Đón người mới**: người có bậc 5 trở lên bấm "Dẫn tham quan" cho người chơi tạo tài khoản dưới 24 giờ ở cùng zone. Người mới nhận `guide_invite` để đồng ý hoặc từ chối. Nhiệm vụ của người dẫn hoàn thành khi người mới xong chuỗi "Ngày đầu ở viện" trong 2 giờ sau khi đồng ý.
- **Rationale**: Tận dụng realtime đã có. Không cần khu mới.
