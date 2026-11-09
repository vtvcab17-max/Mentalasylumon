# AGENTS.md — hướng dẫn cho agent lập trình (Antigravity, Claude Code, Codex…)

Đọc hết file này trước khi sửa code. Trả lời người dùng bằng **tiếng Việt**.

## Dự án là gì

**Bệnh viện tâm thần online** (repo `vtvcab17-max/Mentalasylumon`): không gian hỗ trợ tinh thần dạng game 3D
chibi trên trình duyệt, song ngữ Tiếng Việt / English. Người chơi từ 18 tuổi đăng nhập Google, có phòng riêng
để trò chuyện với **bác sĩ AI** (không phải bác sĩ thật), đi dạo trong viện, ngồi vòng sinh hoạt và nghe bác sĩ
AI thuyết trình. Đang ở giai đoạn **thử nghiệm kín**.

## Luật bắt buộc (đọc trước mọi thay đổi)

`.specify/memory/constitution.md` v1.0.0 đứng trên mọi thứ. Tóm tắt — vi phạm là lỗi nghiêm trọng:

1. **An toàn trên hết.** Mọi chữ người chơi gửi tới AI hoặc người khác PHẢI đi qua
   `apps/worker/src/safety/pipeline.ts` (từ khóa → phân loại AI → mẫu khủng hoảng tất định → kiểm tra đầu ra).
   AI KHÔNG BAO GIỜ tự viết số điện thoại; số lấy từ bảng `support_resources`. Phân loại lỗi ⇒ coi là `concern`.
   Nút "Cần giúp đỡ ngay" (`apps/client/src/ui/help-button.ts`) luôn hiện, kể cả khi mọi thứ khác lỗi.
2. **Minh bạch AI.** Bác sĩ luôn có nhãn "AI", không chẩn đoán, không kê thuốc/liều, không nhập vai lãng mạn.
3. **Riêng tư.** Chat mã hóa AES-GCM, tách từng người (`PatientRecord` DO). Admin chỉ xem đoạn bị gắn cờ, mỗi lần
   xem ghi `flag_access_log` (append-only). Không bao giờ trả email cho người chơi khác.
4. **Chỉ 18+, chưa mở công khai** khi chưa có ý kiến luật sư (giấy phép G1, xác thực SĐT VN, lưu dữ liệu tại VN —
   xem `specs/001-online-mental-hospital/research.md` §R13–R14).
5. **Song ngữ ngang nhau.** Thiếu chuỗi dịch ⇒ `pnpm i18n:check` fail. An toàn phải như nhau ở vi và en.
6. **Đơn giản, chạy tốt trên điện thoại.** Ưu tiên Cloudflare; tải lần đầu ≤ 15 MB ở mức đồ họa thấp.

Code trong `safety/`, `ai/`, `crypto/`, `identity/`, `admin/` hoặc mẫu khủng hoảng: **phải có người thật duyệt**,
và chạy lại `pnpm eval:safety` khi đổi model/prompt/quy tắc.

## Quy trình: Spec Kit

Mọi tính năng đi theo `specify → clarify → plan → tasks → implement → converge`. Tài liệu của tính năng hiện tại:

```text
specs/001-online-mental-hospital/
  spec.md        yêu cầu (FR-001…FR-039, SC-001…SC-011)
  plan.md        kiến trúc + Constitution Check
  research.md    quyết định kỹ thuật R1–R17 (kèm nguồn)
  data-model.md  bảng D1 + Durable Object
  contracts/     http-api.md, ws-protocol.md, doctor-ai.md
  quickstart.md  kịch bản nghiệm thu
  tasks.md       105 việc; đánh dấu [X] ngay khi xong
```

Khi làm một task: đọc task trong `tasks.md` → viết test trước (bắt buộc cho phần an toàn) → code → chạy kiểm tra
→ đánh dấu `[X]` → commit. Không tự ý đổi spec/plan; chỗ nào mâu thuẫn thì hỏi người dùng.

## Trạng thái (2026-11-09)

- **78/105 task xong.** Phase 1–2, US1 (phòng riêng + bác sĩ AI), US2 (đi dạo 3D nhiều người, `WorldZone`) và
  US3 (vòng sinh hoạt, `CircleRoom`) đã chạy; 126 unit test, e2e desktop + mobile xanh.
- **Bố cục viện theo bản vẽ 1815** (research.md §R18): sân trước → sảnh chính → cầu thang chính lên gallery các tầng
  → vườn sau. Phòng sinh hoạt vào từ cổng tây của sảnh hoặc bản đồ.
- **Vòng sinh hoạt:** mọi tin qua `moderatePublic` trước khi phát; chặn/báo cáo/tắt tiếng; admin ẩn tin, khóa tạm/vĩnh
  viễn (`/admin/api/reports`); bác sĩ AI dẫn dắt theo `circle_sessions` (alarm của DO), nói ngôn ngữ của vòng.
- **Model giả cho test/máy:** model `@test/…` hoặc `FAKE_AI=1` (chỉ khi APP_ENV ≠ production) — `ai/gateway.ts`.
  `pnpm dev:local` bật sẵn. Lớp từ khóa an toàn vẫn chạy thật.
- **Còn mở:**
  - T022, T023 — bộ mẫu eval an toàn/kiểm duyệt cần người có chuyên môn duyệt và bổ sung (kiểm duyệt mới 24/400 mẫu).
  - T057, T067, T082 — model 3D GLB (hiện dựng bằng khối hình trong code).
  - T062 + `pnpm eval:moderation` — chạy eval với Workers AI thật (cần CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN).
  - SC-004 (500 người cùng lúc) chưa kiểm trên staging — xem `docs/perf.md`.
- **Tiếp theo:**
  1. **Tính năng 002 — cấp bậc & nhiệm vụ** (`specs/002-ranks-quests/`, đang làm). Xong: US1 nhiệm vụ ngày + Sổ nhiệm vụ,
     US2 thăng cấp, US4 bầu cử (cron `*/10`, phiếu kín HMAC, bảng Hội đồng ở sảnh), US5 Viện trưởng (bàn làm việc, trang
     trí, thông báo, nhiệm vụ tuần). Còn: T019 đồng phục, US3 mini-game (T022–T026), T036/T038/T039.
     Test/máy cục bộ tua đồng hồ bầu cử bằng header `X-Test-Now` (chỉ khi `ALLOW_TIME_TRAVEL=1`). Quyết định đã chốt:
     Bệnh nhân → Nhân viên lau dọn → Hộ lý → Điều dưỡng → Thực tập sinh → Trưởng khoa → Viện trưởng.
     Nhiệm vụ hỗn hợp (tự chăm sóc hằng ngày, mini-game lau dọn, cộng đồng, khám phá), giới hạn điểm mỗi ngày,
     không thưởng thời gian online. Hội đồng (Thực tập sinh + Trưởng khoa) bầu Viện trưởng mỗi tuần, ứng viên là
     Trưởng khoa, không làm 2 tuần liền. Viện trưởng chỉ có **quyền trong game** (chủ đề tuần, nhiệm vụ tuần, trang
     trí, thông báo qua kiểm duyệt, bổ nhiệm danh dự) — KHÔNG xem dữ liệu riêng/cờ, KHÔNG khóa người chơi, KHÔNG đổi
     quy tắc an toàn. Cấp "bác sĩ" của người chơi không được khuyên y khoa (Constitution II).
  2. US4 thuyết trình (T086–T097), Phase 7 hoàn thiện.

## Kiến trúc nhanh

- **Một Cloudflare Worker** `mentalasylumon` (cấu hình `wrangler.jsonc` ở **thư mục gốc**): phục vụ client
  (`apps/client/dist`), API (Hono), WebSocket → Durable Objects.
- **Durable Objects:** `PatientRecord` (lịch sử chat từng người, giới hạn lượt/ngày), `KeyVault` (khóa mã hóa tự tạo —
  **không bao giờ xóa**, mất khóa = mất lịch sử), `WorldZone`, `CircleRoom` (tin nhắn trong SQLite của DO, tự xóa sau 30 ngày), `LectureHall` (chưa làm).
- **D1** `benh-vien-dev` (id `1c8ae363-563b-4881-9f5d-8ba99adec4ce`, APAC): migration 0001–0003 đã áp lên bản thật; `pnpm --filter worker deploy` tự áp migration mới (0004+) trước khi deploy.
- **R2: đang tắt** vì tài khoản chưa bật R2 — bật lại binding trong `wrangler.jsonc` khi cần tài sản 3D/audio.
- **Đăng nhập:** Google Identity Services (nút "Sign in with Google") → ID token → `POST /auth/google/token`, server
  kiểm RS256 bằng JWKS của Google. Chỉ cần `GOOGLE_CLIENT_ID` (công khai, nằm trong `vars`). **Không có client secret.**
- **AI:** Workers AI qua binding `AI`, qua AI Gateway `default`. Chat: `@cf/aisingapore/gemma-sea-lion-v4-27b-it`;
  phân loại: `@cf/google/gemma-4-26b-a4b-it`. Đổi model trong bảng `settings`, không sửa code.
- **Không cần secret nào** để chạy web. Tùy chọn: `CHAT_ENCRYPTION_KEY` (ghi đè KeyVault), `ANTHROPIC_API_KEY`
  (chỉ khi đổi model sang Claude).

```text
apps/client     Vite + TypeScript + Three.js (không framework UI; DOM dựng bằng ui/dom.ts, chữ luôn qua textContent)
apps/worker     Hono + Durable Objects; src/{api,auth,ai,safety,do,world,admin,crypto,identity,content,i18n}
packages/shared schema zod dùng chung (protocol.ts, api.ts, avatar.ts)
evals/          eval an toàn + bộ mẫu
specs/          Spec Kit
```

## Lệnh

```bash
pnpm install
pnpm test                 # Vitest trong môi trường Workers (148 test) — phải xanh
pnpm lint && pnpm --filter worker typecheck
pnpm build                # build client
pnpm i18n:check
pnpm eval:safety --lang vi,en   # cần CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN (Workers AI Read)
pnpm eval:moderation            # kiểm duyệt vòng sinh hoạt, ngưỡng chặn ≥ 95% (SC-006)
# chạy ở máy:
npx wrangler d1 migrations apply benh-vien-dev --local
npx wrangler d1 execute benh-vien-dev --local --file apps/worker/seed/dev.sql
npx wrangler dev          # http://localhost:8787
```

Migration mới lên bản thật: `npx wrangler d1 migrations apply benh-vien-dev --remote` (bảng `d1_migrations` đã ghi
0001–0003).

## Deploy

Push lên `main` ⇒ Cloudflare Workers Builds tự build (`pnpm install && pnpm build`) và deploy (`npx wrangler deploy`
ở thư mục gốc). Không deploy tay trừ khi người dùng yêu cầu.

## Bẫy đã gặp

- `lower()` của SQLite chỉ xử lý ASCII → biệt danh dùng cột `nickname_lc` tính bằng JS.
- Từ khóa an toàn: "từ từ" ≠ "tự tử" khi bỏ dấu — xem `safety/keywords.ts` (không thêm cụm `tu tu` đứng một mình).
- Bộ kiểm tra số điện thoại chỉ coi 111–115 và chuỗi ≥ 7 chữ số là số điện thoại (để không xóa nhầm năm, số lượng).
- Lọc biệt danh chỉ so nguyên từ (để không chặn tên thật như "Điền").
- Workers AI có thể trả `{response}` hoặc dạng OpenAI `{choices}`; `ai/gateway.ts` xử lý cả hai và bỏ `<think>`.

## Commit

Tiếng Anh, dạng `feat(us2): …`, nêu task ID. Kết thúc message bằng dòng Co-Authored-By của agent đang dùng.
Không commit `.dev.vars`, secret, hay `node_modules`.
