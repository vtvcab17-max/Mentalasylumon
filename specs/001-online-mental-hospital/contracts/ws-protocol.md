# Contract: WebSocket protocol

Ba loại kết nối, mỗi loại nối vào một Durable Object. Xác thực bằng cookie phiên khi nâng cấp
kết nối. Mỗi khung tin là JSON có trường `t` (loại tin). Schema định nghĩa bằng zod trong
`packages/shared` và client lẫn server dùng chung.

| Đường dẫn | Durable Object |
|---|---|
| `/ws/zone/:zoneId` | `WorldZone` |
| `/ws/circle/:circleId` | `CircleRoom` |
| `/ws/lecture/:talkId/:lang/:instance` | `LectureHall` |

**Quy ước chung**:

- Vị trí `p: [x, y, z]` tính bằng mét, làm tròn 2 chữ số. Hướng `r` tính bằng radian.
- `a` là animation: `"idle"` \| `"walk"` \| `"sit"` \| `"wave"`.
- Tin vượt giới hạn tần suất bị bỏ qua. Vượt quá 3 lần thì server gửi `{"t":"warn","code":"RATE_LIMITED"}`.
- Người bị khóa hoặc cấm bị ngắt với `{"t":"kicked","reason":"SUSPENDED"}` rồi đóng mã 4003.
- Ping ở tầng ứng dụng `{"t":"ping"}` được runtime tự trả `{"t":"pong"}`, không đánh thức object.

---

## WorldZone (sảnh, hành lang, vườn)

**Client → Server**

| t | Trường | Giới hạn |
|---|---|---|
| `move` | `p, r, a` | ≤ 5 lần/giây, chỉ gửi khi có thay đổi (server cho lệch tới 6/giây) |
| `emote` | `e` (`wave` \| `heart` \| `nod`) | ≤ 1 lần mỗi 2 giây |

**Server → Client**

| t | Trường | Ghi chú |
|---|---|---|
| `welcome` | `selfId, zoneId, players: [{id, nickname, avatar, p, r, a}]` | ngay sau khi kết nối |
| `join` / `leave` | `player` / `id` | |
| `snapshot` | `tick, players: [{id, p, r, a}], gone: [id]` | Phần thay đổi, ≤ 10 lần/giây (5 lần/giây khi zone > 80 người). `players` = người vừa di chuyển hoặc vừa vào tầm nhìn; `gone` = người vừa ra khỏi tầm nhìn. Tầm nhìn = tối đa 80 người gần nhất trong 30 m. Người trong `welcome`/`join` chỉ hiện khi có trong snapshot. Client nội suy giữa các snapshot |
| `emote` | `id, e` | |
| `zone_full` | `redirectZoneId` | khi zone đã đủ người (mặc định 150) |

Trong zone chung không có chat chữ ở bản đầu, để tránh quấy rối không kiểm duyệt được. Trò chuyện
diễn ra ở vòng sinh hoạt.

## CircleRoom (vòng sinh hoạt)

**Client → Server**

| t | Trường | Giới hạn |
|---|---|---|
| `sit` | `seat` (0…maxSeats-1) | |
| `stand` | — | |
| `chat` | `text` (1–300 ký tự), `clientMsgId` | ≤ 1 tin mỗi 3 giây |

**Server → Client**

| t | Trường | Ghi chú |
|---|---|---|
| `welcome` | `circle: {id, name, language, maxSeats}, seats: [{seat, userId, nickname, avatar}], recent: [chat…]` | `recent` đã lọc theo danh sách chặn của người nhận |
| `seat_update` | `seat, userId \| null` | |
| `chat` | `id, from: {id, nickname}, text, ts` | chỉ gửi tin **đã qua kiểm duyệt** (FR-027); không gửi cho người đã chặn người gửi |
| `chat_rejected` | `clientMsgId, reason: "harmful" \| "harassment" \| "spam"` | chỉ người gửi nhận |
| `support` | `message, resources` | chỉ người gửi nhận, khi tin của họ có dấu hiệu khủng hoảng |
| `chat_hidden` | `id` | quản trị viên đã ẩn tin |
| `facilitator` | `doctor: {id, name}, text, label: "AI"` | bác sĩ AI dẫn dắt, nói ngôn ngữ của vòng (FR-024, FR-038) |
| `session` | `status: "scheduled" \| "live" \| "ended", topic` | |

## LectureHall (thuyết trình, mỗi ngôn ngữ một hội trường)

**Client → Server**

| t | Trường | Giới hạn |
|---|---|---|
| `ask` | `text` (1–300 ký tự), `anonymous: boolean` | ≤ 3 câu mỗi buổi; chỉ khi `phase` là `playing` hoặc `qa` |

**Server → Client**

| t | Trường | Ghi chú |
|---|---|---|
| `lecture_state` | `talkId, lang, phase: "waiting" \| "playing" \| "qa" \| "ended", startedAt, audioUrl, slides, captionsUrl, serverNow` | gửi khi kết nối và khi đổi `phase`. Client tua audio tới `serverNow - startedAt` (FR-030) |
| `ask_ack` | `accepted: boolean, reason?` | câu hỏi có hại bị từ chối; câu có dấu hiệu khủng hoảng nhận kèm `support` |
| `qa_answer` | `question, askerNickname \| null, answer, label: "AI"` | `askerNickname` là `null` khi ẩn danh (FR-031) |
| `overflow` | `redirectInstance` | khi hội trường đầy (mặc định 200) |
