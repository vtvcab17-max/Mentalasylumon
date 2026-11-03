# Bệnh viện tâm thần online

Không gian hỗ trợ tinh thần dạng game 3D chibi trên trình duyệt (Tiếng Việt / English). Mỗi người
chơi có phòng riêng để trò chuyện với bác sĩ AI, có vòng sinh hoạt cộng đồng và các buổi bác sĩ
AI thuyết trình.

> ⚠️ Bác sĩ trong game là AI, không phải bác sĩ thật. Bản hiện tại chỉ dùng cho **thử nghiệm
> kín**. Xem `.specify/memory/constitution.md` (Nguyên tắc IV).

## Tài liệu

- Constitution: `.specify/memory/constitution.md`
- Spec, plan, tasks: `specs/001-online-mental-hospital/`
- Hướng dẫn chạy thử và nghiệm thu: `specs/001-online-mental-hospital/quickstart.md`

## Cấu trúc

```text
apps/client     game 3D (Vite + TypeScript + Three.js)
apps/worker     Cloudflare Worker + Durable Objects (Hono)
packages/shared schema dùng chung (zod)
evals/          bộ kiểm thử an toàn và kiểm duyệt
assets-src/     file Blender + LICENSES.md
```

## Chạy ở máy

```bash
pnpm install
pnpm dev        # build client rồi chạy worker tại http://localhost:8787
pnpm test
```

## Đưa lên GitHub và Cloudflare (Workers Builds)

1. Tạo repo trống trên GitHub tên `benh-vien-online`, rồi:
   ```bash
   git remote add origin https://github.com/<tài-khoản>/benh-vien-online.git
   git push -u origin main
   ```
2. Tạo tài nguyên Cloudflare và ghi `database_id` vào `apps/worker/wrangler.jsonc`:
   ```bash
   cd apps/worker
   npx wrangler d1 create benh-vien-dev
   npx wrangler r2 bucket create benh-vien-assets-dev
   ```
3. Trong Cloudflare dashboard: **Workers & Pages → Create → Import a repository**, chọn repo, rồi:
   - Root directory: `apps/worker`
   - Build command: `cd ../.. && pnpm install && pnpm build`
   - Deploy command: `npx wrangler deploy`
   - Bật preview cho pull request (non-production branches)
4. Đặt secret cho từng môi trường: `npx wrangler secret put GOOGLE_CLIENT_ID` (tương tự cho
   `GOOGLE_CLIENT_SECRET`, `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `CHAT_ENCRYPTION_KEY`).
5. Trên GitHub: **Settings → Secrets → Actions**, thêm `ANTHROPIC_API_KEY` và
   `AI_GATEWAY_ACCOUNT_ID` để CI chạy bộ kiểm thử an toàn.
