# Implementation Plan: Bệnh viện tâm thần online (bản đầu tiên)

**Branch**: `001-online-mental-hospital` | **Date**: 2026-11-03 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `specs/001-online-mental-hospital/spec.md`, cộng yêu cầu
của người dùng: "dùng Cloudflare và GitHub".

## Summary

Một bệnh viện 3D phong cách chibi chạy trên trình duyệt. Màn đầu tiên cho chọn **Tiếng Việt / English**. Người chơi từ 18
tuổi đăng nhập bằng Google, mỗi người có một phòng riêng để trò chuyện với bác sĩ AI. Ngoài ra có thể đi dạo cùng
người khác, ngồi vòng sinh hoạt hình tròn và nghe bác sĩ AI thuyết trình theo lịch.

Về kỹ thuật:

- Toàn bộ chạy trên **Cloudflare**:
  - Một Worker phục vụ client 3D (Three.js), API và đăng nhập.
  - **Durable Objects** lo phần realtime: `WorldZone`, `CircleRoom`, `LectureHall`.
  - Mỗi người chơi có một Durable Object `PatientRecord` riêng giữ lịch sử trò chuyện đã mã hóa.
  - **D1** lưu dữ liệu chung; **R2** lưu model 3D và audio bài giảng.
- Bác sĩ AI gọi Claude qua **AI Gateway**, và mọi tin nhắn đi qua pipeline an toàn 4 lớp. Khi có
  khủng hoảng, hệ thống dùng mẫu phản hồi cố định kèm số đường dây nóng lấy từ cơ sở dữ liệu, rồi
  gắn cờ cho quản trị viên xem lại.
- Code đặt trên **GitHub**; Workers Builds tự deploy. Mỗi pull request phải qua bộ kiểm thử an
  toàn tiếng Việt.

⚠️ **Rủi ro pháp lý cần xử lý trước khi mở công khai**: giấy phép game G1, xác thực số điện thoại
Việt Nam và lưu dữ liệu người chơi tại Việt Nam. Xem [research.md §R13](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x cho cả client lẫn Worker; SQL (SQLite) cho D1 và Durable
Object storage

**Primary Dependencies**:
- Client: Three.js, Vite, zod (kiểm dữ liệu tin nhắn), bộ chuỗi `vi`/`en` có kiểm tra key lúc build (R17)
- Worker: Hono (router), arctic (Google OIDC), Anthropic SDK qua AI Gateway, zod
- Công cụ: Wrangler, Blender (dựng tài sản)

**Storage**:
- D1: dữ liệu chung
- Durable Object SQLite: lịch sử chat từng người và trạng thái phòng realtime
- R2: model GLB, texture, audio và slide bài giảng

**Testing**: Vitest + `@cloudflare/vitest-pool-workers`, Playwright (desktop và giả lập điện
thoại), bộ kiểm thử an toàn `evals/safety`

**Target Platform**: Cloudflare Workers; trình duyệt hỗ trợ WebGL2 trên máy tính và điện thoại
tầm trung

**Project Type**: Web app (client 3D + backend serverless) trong một repo

**Performance Goals**:
- Vào phòng trong dưới 2 phút (SC-001)
- Bác sĩ bắt đầu trả lời trong 5 giây với 95% câu hỏi (SC-002)
- 500 người cùng lúc (SC-004)
- 200 người nghe một buổi thuyết trình (SC-005)
- Chạy mượt khi có 30 nhân vật trên điện thoại tầm trung (SC-009)

**Constraints**:
- Chỉ người từ 18 tuổi
- Lịch sử chat là dữ liệu nhạy cảm: mã hóa, chỉ chủ tài khoản xem, ngoại lệ là đoạn bị gắn cờ
- Số đường dây nóng không bao giờ do AI tự viết
- Tài sản 3D tải lần đầu dưới 15 MB ở mức đồ họa thấp
- Chi phí AI bị chặn trên bởi giới hạn lượt hỏi mỗi ngày
- Hai ngôn ngữ `vi`/`en`; build thất bại nếu thiếu chuỗi dịch (SC-011)

**Scale/Scope**:
- Bản đầu: vài nghìn tài khoản, 500 người online cùng lúc
- Không giới hạn số phòng (tự mở thêm tầng)
- Khoảng 4 bác sĩ AI, 1–2 buổi thuyết trình mỗi tuần

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

Dự án **chưa có constitution** (`.specify/memory/constitution.md`). Các gate dưới đây tạm lấy từ
những yêu cầu MUST quan trọng nhất trong spec. Nên chạy `speckit constitution` để biến chúng thành
nguyên tắc chính thức.

| Gate (tạm) | Nguồn | Trước Phase 0 | Sau Phase 1 | Thiết kế đáp ứng |
|---|---|---|---|---|
| G1. Luôn nói rõ bác sĩ là AI | FR-002, FR-015 | ✅ | ✅ | Màn đồng ý điều khoản; nhãn "AI" trong `contracts/http-api.md`; system prompt cấm nhận là người (`contracts/doctor-ai.md`) |
| G2. Không chẩn đoán, không kê thuốc | FR-015 | ✅ | ✅ | Lớp phân loại cộng kiểm tra đầu ra (R7); bộ kiểm thử 100 câu dụ |
| G3. Khủng hoảng → phản hồi an toàn tất định | FR-017, FR-021, SC-003 | ✅ | ✅ | Từ khóa cộng AI phân loại; mẫu cố định kèm `support_resources`; nút "Cần giúp đỡ ngay" dùng được khi AI lỗi |
| G4. Riêng tư dữ liệu nhạy cảm | FR-018, FR-019, FR-035 | ✅ | ✅ | `PatientRecord` tách riêng từng người, mã hóa AES-GCM; admin chỉ thấy đoạn bị gắn cờ; có `flag_access_log`; đồng ý từng mục (R14) |
| G5. Chỉ từ 18 tuổi | FR-004 | ✅ | ✅ | Bước xác nhận tuổi; từ chối thì chỉ tới 111 |
| G3b. An toàn như nhau ở cả hai ngôn ngữ | FR-017, FR-039, SC-003 | ✅ | ✅ | Từ khóa và mẫu khủng hoảng cho cả `vi` và `en`; bộ kiểm thử có phần tiếng Anh (R7, R16, R17) |
| G6. Tuân thủ pháp luật Việt Nam | FR-035, R13 | ⚠️ | ⚠️ | **Chưa đạt cho bản công khai**: thiếu xác thực số điện thoại và lưu dữ liệu tại Việt Nam. Đạt cho thử nghiệm kín. Lối ra: `IdentityStore` cộng Hyperdrive (R13) |

G6 không chặn việc làm bản thử nghiệm kín, nhưng **chặn việc mở công khai** cho tới khi có ý kiến
luật sư và cập nhật spec.

## Project Structure

### Documentation (this feature)

```text
specs/001-online-mental-hospital/
├── spec.md
├── plan.md              # file này
├── research.md          # Phase 0
├── data-model.md        # Phase 1
├── quickstart.md        # Phase 1
├── contracts/           # Phase 1
│   ├── http-api.md
│   ├── ws-protocol.md
│   └── doctor-ai.md
├── checklists/requirements.md
└── tasks.md             # tạo bởi `speckit tasks`, chưa có
```

### Source Code (repository root)

```text
benh-vien-online/                  # repo GitHub mới
├── apps/
│   ├── client/                    # game 3D chạy trên trình duyệt
│   │   ├── index.html
│   │   ├── src/
│   │   │   ├── main.ts
│   │   │   ├── engine/            # renderer, mức đồ họa, LOD, loader GLB
│   │   │   ├── world/             # dựng bệnh viện từ khối module, khu/tầng, phòng riêng
│   │   │   ├── avatar/            # nhân vật chibi, ghép bộ phận, animation
│   │   │   ├── net/               # WebSocket client, nội suy vị trí
│   │   │   ├── features/
│   │   │   │   ├── onboarding/    # đăng nhập, điều khoản, 18+, tạo nhân vật
│   │   │   │   ├── doctor-chat/
│   │   │   │   ├── circle/
│   │   │   │   └── lecture/
│   │   │   ├── i18n/              # vi.json, en.json, màn chọn ngôn ngữ
│   │   │   └── ui/                # HUD, bản đồ, nút "Cần giúp đỡ ngay"
│   │   └── public/
│   └── worker/                    # Cloudflare Worker + Durable Objects
│       ├── src/
│       │   ├── index.ts           # router Hono, static assets, nâng cấp WebSocket
│       │   ├── auth/              # Google OIDC + PKCE, phiên, xác nhận tuổi
│       │   ├── api/               # các endpoint trong contracts/http-api.md
│       │   ├── do/
│       │   │   ├── world-zone.ts
│       │   │   ├── circle-room.ts
│       │   │   ├── lecture-hall.ts
│       │   │   └── patient-record.ts
│       │   ├── safety/            # từ khóa, phân loại, mẫu khủng hoảng, kiểm tra đầu ra
│       │   ├── ai/                # bác sĩ AI, prompt, gọi qua AI Gateway, TTS
│       │   ├── identity/          # IdentityStore (D1 bây giờ, Postgres VN sau)
│       │   ├── admin/             # trang và API quản trị
│       │   └── crypto/            # mã hóa nội dung chat
│       ├── migrations/            # file SQL cho D1
│       ├── test/
│       └── wrangler.jsonc
├── packages/
│   └── shared/                    # schema tin nhắn (zod) và type dùng chung
├── evals/
│   └── safety/                    # bộ kiểm thử an toàn: vi/ và en/ + script chạy
├── assets-src/                    # file Blender, LICENSES.md
└── .github/workflows/ci.yml       # lint, test, eval an toàn
```

**Structure Decision**: Một repo, hai app (`client`, `worker`) cộng một package `shared` để client
và server dùng chung định nghĩa tin nhắn. Worker phục vụ bản build của client làm static assets,
nên chỉ có một chỗ deploy qua Workers Builds.

## Requirement coverage

| Yêu cầu | Đáp ứng ở |
|---|---|
| FR-001–005 (tài khoản, 18+, đồng ý, biệt danh, xóa) | R4, R14; `users`, `consents`; http-api "Vào viện lần đầu", "Tài khoản" |
| FR-006, FR-006a, FR-009 (3D chibi, mức đồ họa, thấy nhau) | R5, R2; `WorldZone`; ws-protocol |
| FR-007, FR-008, FR-010, FR-011 (phòng riêng, tự mở tầng, khóa cửa, bản đồ) | data-model "Cấp phòng"; `/api/world/*`; client `world/`, `ui/` |
| FR-012–021 (bác sĩ AI, an toàn, khủng hoảng, lịch sử, giới hạn, nút hỗ trợ) | R6, R7, R8; `PatientRecord`; contracts/doctor-ai.md; SSE trong http-api |
| FR-022–028 (vòng tròn, ghế, dẫn dắt, quy tắc, chặn, lọc, admin) | R11, R12; `CircleRoom`; ws-protocol |
| FR-029–033, FR-037 (thuyết trình, hỏi đáp, duyệt, xem lại, hai ngôn ngữ) | R9, R10; `LectureHall`; `talks`, `talk_qa` |
| FR-034, FR-035 (quản trị, dữ liệu nhạy cảm) | R12, R13, R14; `/admin/api/*`; mã hóa 🔒 |
| FR-036, FR-038, FR-039 (chọn ngôn ngữ, vòng theo ngôn ngữ, hỗ trợ theo ngôn ngữ) | R17; `users.locale`, `circles.language`, `support_resources.locales` |
| SC-001–011 | quickstart.md "Kịch bản nghiệm thu" và "Kiểm tra tự động" |

## Complexity Tracking

Không có vi phạm gate nào cần biện minh. Gate G6 là rủi ro pháp lý bên ngoài; đường xử lý nằm ở
research.md §R13.
