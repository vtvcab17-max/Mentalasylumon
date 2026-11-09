# Contract: WebSocket (002, bổ sung cho 001)

## WorldZone

`PlayerPublic` có thêm `rank: number` (1–7). Client hiện chức danh dưới biệt danh. Worker gắn bậc qua header nội bộ `X-User-Rank`.

**Client → Server**

| t | Trường | Giới hạn |
|---|---|---|
| `act` | `kind: "litter" \| "water"`, `id` | ≤ 2 lần/giây; server kiểm bậc và khoảng cách ≤ 1,5 m |

**Server → Client**

| t | Trường | Ghi chú |
|---|---|---|
| `props` | `items: [{id, kind, p}]` | Gửi ngay sau `welcome` |
| `prop_update` | `id, kind, p \| null` | `p = null` là vật đã được nhặt hoặc đã xong |
| `quest_progress` | `questId, progress, target, status, awarded` | Chỉ người liên quan nhận |
| `celebrate` | `id, rank` | Lễ thăng cấp: mọi người trong zone thấy hiệu ứng |
| `guide_invite` | `inviteId, from:{id,nickname,rank}` | Chỉ người mới nhận |
| `announcement` | `text, author` | Thông báo của Viện trưởng, phát cho mọi zone đang mở lúc gửi |

## CircleRoom

**Client → Server**

| t | Trường | Giới hạn |
|---|---|---|
| `thank` | `messageId` | Tin của người khác; mỗi cặp người 1 lần/ngày được tính điểm (FR-008) |
| `tidy` | `seat` | Chỉ trong 30 phút trước buổi sinh hoạt, bậc ≥ 3 |

**Server → Client**

| t | Trường | Ghi chú |
|---|---|---|
| `thanked` | `messageId, count` | Số lời cảm ơn của tin (không kèm ai cảm ơn) |
| `tidy_state` | `seats: number[]` | Các ghế còn lệch |
| `quest_progress` | như WorldZone | |
