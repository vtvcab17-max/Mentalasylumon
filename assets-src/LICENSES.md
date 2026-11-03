# Giấy phép tài sản 3D và âm thanh

Mọi file trong `assets-src/` và `apps/client/public/models/` phải có một dòng ở bảng dưới trước khi
merge (Constitution — Ràng buộc kỹ thuật và vận hành).

| File | Nguồn / tác giả | Giấy phép | Link | Ghi chú |
|---|---|---|---|---|
| _(chưa có)_ | | | | |

## Quy ước đặt tên

- Nguồn Blender: `assets-src/<nhóm>/<tên>.blend` — nhóm: `avatar`, `room`, `modules`, `circle-room`, `props`
- Bản xuất: `apps/client/public/models/<nhóm>/<tên>.glb`, chữ thường, gạch nối, không dấu
- Bộ phận nhân vật: `avatar/<loại>-<tên>.glb`, ví dụ `avatar/hair-bob.glb`, `avatar/outfit-cardigan.glb`
- Không nướng chữ vào texture; biển hiệu lấy chữ theo ngôn ngữ (Constitution V)
- Ngân sách: phòng riêng ≤ 2 MB; tổng tải lần đầu ở mức thấp ≤ 15 MB (Constitution VI)
