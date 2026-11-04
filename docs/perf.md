# Hiệu năng (SC-004, SC-009)

## Realtime — `pnpm load:zones` (server local, 2 CPU, mọi zone chạy chung một luồng workerd)

Mỗi người giả đi lại ngẫu nhiên 5 lần/giây trong sảnh (trường hợp xấu nhất: ai cũng trong tầm nhìn của nhau).

| Lần đo (2026-11-04) | Kết nối | Zone | Snapshot/giây/người | Khoảng cách snapshot p50 / p95 | Băng thông xuống / người |
|---|---|---|---|---|---|
| 150 người, 1 zone | 150/150 | lobby-1: 150 | 3,9 | 254 / 285 ms | 20 KB/s |
| 500 người, 4 zone | 500/500 | 150 / 150 / 150 / 50 | 2,1 | 488 / 647 ms | 10 KB/s |

- Một zone đầy (150) đạt mục tiêu (p95 < 500 ms; zone > 80 người chủ ý hạ xuống 5 snapshot/giây).
- 500 người ở local chưa đạt p95 < 500 ms vì 4 zone + 500 client giả dùng chung 2 CPU. Trên Cloudflare mỗi zone là
  một Durable Object riêng. **Còn phải đo lại trên staging** trước khi coi SC-004 là đạt.
- Đã tối ưu: snapshot chỉ gửi phần thay đổi, tầm nhìn tối đa 60 người gần nhất, lưu vị trí xuống bộ nhớ bền tối đa
  2 giây/lần mỗi người, giới hạn tốc độ kiểu "xô token".

## Đồ họa — SC-009

- Mức thấp: pixel ratio 1, không đổ bóng, tầm nhìn 40 m, tối đa 30 nhân vật đầy đủ; người xa vẽ bằng 1 InstancedMesh.
- Hình khối và vật liệu của nhân vật dùng chung (cache).
- e2e chạy trong Chromium không GPU (SwiftShader) qua được toàn bộ luồng US1/US2.
- **Chưa đo trên điện thoại Android tầm trung thật** — việc này cần làm tay trước khi mời người thử.
