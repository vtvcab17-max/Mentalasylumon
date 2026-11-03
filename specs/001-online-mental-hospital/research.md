# Research: Bệnh viện tâm thần online (bản đầu tiên)

**Feature**: [spec.md](./spec.md) · **Plan**: [plan.md](./plan.md) · **Date**: 2026-11-03

Mỗi mục: *Decision / Rationale / Alternatives considered*. Thông tin về giá, giới hạn và luật
được tra cứu ngày 2026-11-03; nguồn ở cuối file. Phần pháp lý chỉ là thông tin tham khảo,
không phải tư vấn luật.

---

## R1. Kiến trúc chạy trên Cloudflare

- **Decision**: Một Cloudflare Worker duy nhất làm cả 3 việc: phục vụ game client (static assets),
  chạy API, và mở kết nối WebSocket vào các Durable Object. Code nằm trên GitHub; Workers Builds
  tự deploy khi push, giống cách repo `van-linh-dao` đang làm.
- **Rationale**: Một Worker thì một chỗ deploy, một domain, không phải cấu hình CORS. Workers
  Builds đã quen tay với người làm dự án.
- **Alternatives considered**: Pages cho client cộng Worker cho API (hai chỗ deploy, phải xử lý
  CORS). Server Node trên VPS (phải tự lo scale realtime và bảo mật).

## R2. Realtime nhiều người chơi

- **Decision**: Dùng Durable Objects với WebSocket Hibernation. Mỗi "không gian chung" là một
  Durable Object:
  - `WorldZone`: sảnh, hành lang của từng tầng, vườn.
  - `CircleRoom`: mỗi vòng sinh hoạt.
  - `LectureHall`: mỗi buổi thuyết trình và các phòng phụ khi đông.

  Khi một zone vượt ngưỡng (mặc định 150 người), hệ thống tách sang bản sao `lobby-2`,
  `lobby-3`… Client gửi vị trí tối đa 5 lần/giây và chỉ khi đang di chuyển. Server gộp vị trí
  thành một gói rồi gửi 10 lần/giây, và mỗi người chỉ nhận vị trí của những người ở gần.
- **Rationale**:
  - Mỗi Durable Object nhận được tới 32.768 WebSocket hibernation.
  - Giới hạn mềm là khoảng 1.000 request/giây cho mỗi object.
  - Khi hibernation, socket vẫn giữ kết nối nhưng không bị tính tiền thời gian lúc rảnh.
  - Cắt zone ở mức 150 người giữ mỗi object dưới ngưỡng: 150 người × 5 tin/giây = tối đa 750
    tin nhắn vào mỗi giây. Mức này cũng giữ số nhân vật cần vẽ vừa sức điện thoại.
  - 500 người cùng lúc (SC-004) chia ra khoảng 4–10 zone, mỗi zone dưới ngưỡng.
  - Phòng riêng không cần realtime: client tự vẽ phòng, còn chat với bác sĩ đi qua HTTP.
- **Alternatives considered**:
  - Một Durable Object cho cả viện: nghẽn ngay khi đông.
  - Cloudflare Realtime (WebRTC): dành cho voice và video, mà bản đầu không có voice.
  - Dịch vụ ngoài như Colyseus hay Photon: thêm hạ tầng và chi phí, rời khỏi Cloudflare.

## R3. Lưu trữ dữ liệu

- **Decision**: Chia dữ liệu theo độ nhạy cảm:
  - **D1** giữ dữ liệu chung: tài khoản, đồng ý điều khoản, bản đồ khu/tầng/phòng, bác sĩ AI,
    báo cáo, cờ khủng hoảng, lịch, đường dây nóng.
  - **`PatientRecord`** là một Durable Object riêng cho mỗi người chơi, dùng SQLite riêng, giữ
    lịch sử trò chuyện với bác sĩ và bộ đếm lượt hỏi trong ngày.
  - **R2** giữ model 3D, texture, audio và slide bài giảng.
- **Rationale**:
  - Lịch sử trò chuyện của mỗi người tách riêng một nơi. Không có truy vấn nào lấy chung được
    nhiều người, nên đúng tinh thần FR-019 và FR-035.
  - Xóa tài khoản chỉ cần xóa toàn bộ storage của object đó (SC-008).
  - Mỗi object có tới 10 GB, nên không lo D1 đầy vì tin nhắn.
  - Nội dung tin nhắn được mã hóa ở tầng ứng dụng (AES-GCM, khóa trong Worker secret) trước khi
    ghi.
- **Alternatives considered**: Để tất cả tin nhắn trong D1 (một DB, giới hạn dung lượng, quyền
  truy cập khó tách bạch). Dùng KV (không hợp với dữ liệu quan hệ và ghi nhiều).

## R4. Đăng nhập Google

- **Decision**: Tự làm luồng OpenID Connect Authorization Code + PKCE trong Worker bằng thư viện
  nhỏ (ví dụ `arctic`). Chỉ lưu `sub` của Google và email đã xác minh (email chỉ để liên hệ khi
  cần, không bao giờ gửi xuống client của người khác). Phiên đăng nhập dùng cookie
  `HttpOnly; Secure; SameSite=Lax`, bản ghi phiên lưu trong D1.
- **Rationale**: Đúng yêu cầu chỉ đăng nhập bằng Google (FR-001), ít phụ thuộc bên ngoài, chạy
  được trên Workers.
- **Alternatives considered**: Firebase Auth hoặc Auth0 (thêm một nhà cung cấp và nơi lưu dữ liệu
  cá nhân). Cloudflare Access (hợp cho trang admin, không hợp cho người chơi đại trà; xem R12).
- **⚠️ Lưu ý**: Có thể phải thêm xác thực số điện thoại Việt Nam (xem R13).

## R5. Đồ họa 3D chibi trên web

- **Decision**:
  - Client viết bằng TypeScript, Vite và **Three.js**, nạp model định dạng glTF/GLB.
  - Nhân vật chibi ghép từ các bộ phận đổi được (đầu, tóc, áo, phụ kiện) cộng màu tùy chỉnh. Ba
    animation cơ bản: đứng, đi, ngồi.
  - Bệnh viện dựng từ các khối module (hành lang, cửa phòng, cầu thang). Mỗi tầng và mỗi khu
    sinh ra từ cùng bộ khối.
  - Ba mức đồ họa (FR-006a):
    - **Thấp**: pixel ratio 1, không đổ bóng, tầm nhìn ngắn, tối đa 30 nhân vật vẽ đầy đủ.
    - **Vừa**: mức giữa.
    - **Cao**: bóng mềm, tầm nhìn xa.
  - Nhân vật ở xa vẽ bằng instancing hoặc LOD.
- **Rationale**: Three.js có cộng đồng lớn nhất, nhẹ, chạy tốt trên trình duyệt điện thoại. glTF
  là chuẩn chung, xuất thẳng được từ Blender. Phong cách chibi low-poly vừa đẹp vừa nhẹ máy
  (SC-009).
- **Alternatives considered**:
  - Babylon.js: nhiều thứ có sẵn nhưng nặng hơn.
  - PlayCanvas: có editor tốt nhưng gắn với nền tảng của họ.
  - Unity WebGL: file rất nặng, tải chậm trên điện thoại.
  - Godot web: hỗ trợ web còn hạn chế.
- **Nguồn tài sản 3D**: tự dựng bằng Blender, hoặc dùng gói tài sản giấy phép CC0, hoặc thuê
  họa sĩ. Mọi tài sản phải ghi rõ giấy phép trong `assets-src/LICENSES.md`.

## R6. "Bộ não" của bác sĩ AI

- **Decision**: Dùng model có sẵn qua **Cloudflare AI Gateway**. Bản đầu dùng **Claude Haiku 5.5**
  (`claude-haiku-5-5`) cho cả việc trò chuyện lẫn phân loại an toàn. **Claude Sonnet 5.5**
  (`claude-sonnet-5-5`) được thử song song trên cùng bộ kiểm thử; nếu Haiku không đạt SC-003
  hoặc chất lượng tiếng Việt thì chuyển phần trò chuyện sang Sonnet. Chọn model qua biến cấu
  hình, không cần sửa code.
- **Rationale**:
  - Haiku 5.5 nhanh và rẻ nhất trong dòng hiện tại, hợp với SC-002 (bắt đầu trả lời trong 5
    giây).
  - Mọi model Claude hiện tại đều hỗ trợ đa ngôn ngữ.
  - AI Gateway hỗ trợ Anthropic lẫn Workers AI. Nó cho log, cache, rate limit và chuyển hướng
    model, nên đổi nhà cung cấp mà không phải viết lại.
- **Alternatives considered**:
  - **Tự huấn luyện model từ đầu**: bị loại. Việc này cần lượng dữ liệu và máy tính cực lớn, và
    không thể đạt mức an toàn cần thiết cho người đang gặp khó khăn.
  - **Fine-tune một model mở** (LoRA trên Workers AI): để sau. Cần bộ dữ liệu tư vấn tiếng Việt có
    bản quyền rõ ràng và có chuyên gia duyệt.
  - **Model mở trên Workers AI** (dòng Llama, Qwen…): rẻ, dữ liệu ở lại Cloudflare, nhưng chất
    lượng tiếng Việt và cách xử lý khủng hoảng phải qua cùng bộ kiểm thử. Có thể làm dự phòng.
  - **Gemini, GPT**: mạnh về đa ngôn ngữ, cũng đi qua AI Gateway được. Quyết định cuối cùng nên
    dựa vào kết quả bộ kiểm thử, không dựa vào cảm tính.
- **Ước tính chi phí** (giả định mỗi lượt khoảng 3.000 token vào và 300 token ra, chưa tính
  prompt caching):
  - Haiku 5.5 ở mức giá thấp nhất ($0,10 / $0,50 mỗi triệu token): khoảng $0,0005 mỗi tin nhắn.
  - Sonnet 5.5 ($2 / $10): khoảng $0,009 mỗi tin nhắn.

  Với giới hạn 20 tin nhắn/ngày/người (FR-020), 1.000 người hỏi hết lượt mỗi ngày tốn khoảng
  $10/ngày với Haiku, hoặc khoảng $180/ngày với Sonnet. Con số thật phụ thuộc vào bảng giá bậc
  của Haiku và độ dài hội thoại.

## R7. Cơ chế an toàn cho lời bác sĩ

- **Decision**: Mỗi tin nhắn của người chơi đi qua 4 lớp, theo thứ tự:
  1. **Lọc từ khóa** tiếng Việt và tiếng Anh (chạy tức thì, không gọi AI): bắt các cụm rõ ràng về
     tự hại, tự tử, bạo lực, bị xâm hại, kể cả tiếng Việt không dấu và teencode.
  2. **Phân loại bằng AI** với đầu ra có cấu trúc:
     `{level: none|concern|acute, category, asks_diagnosis, asks_medication}`.
  3. **Nếu `acute`** hoặc từ khóa khớp: **không để AI tự viết số điện thoại**. Hệ thống ghép mẫu
     phản hồi an toàn cố định với danh sách đường dây nóng lấy từ D1, có thể kèm một câu đồng
     cảm do AI viết. Đồng thời tạo cờ khủng hoảng (FR-018).
  4. **Nếu không**, gọi bác sĩ AI với system prompt chứa các quy tắc của FR-014 đến FR-016. Sau
     đó kiểm tra đầu ra một lần nữa (không có tên thuốc kèm liều, không có câu chẩn đoán) trước
     khi gửi cho người chơi.
- **Rationale**: Số điện thoại cứu người phải luôn đúng (SC-003), nên không thể để AI tự viết. Lớp
  từ khóa vẫn hoạt động khi AI lỗi. Cách hai lớp (luật + AI) giảm cả bỏ sót lẫn báo nhầm.
- **Alternatives considered**: Llama Guard 3 8B trên Workers AI phân loại được cả đầu vào lẫn đầu
  ra, nhưng tài liệu không nêu có hỗ trợ tiếng Việt, nên chỉ dùng thử làm lớp phụ sau khi đánh
  giá. Chỉ dựa vào system prompt thì không đủ tin cậy.

## R8. Danh sách đường dây nóng (dữ liệu khởi tạo)

- **Decision**: Lưu trong bảng `support_resources`, có cột `verified_at`, quản trị viên sửa được
  (FR-034). Dữ liệu ban đầu:

  | Tên | Số | Giờ (theo nguồn, kiểm tra 8/2026) | Ghi chú |
  |---|---|---|---|
  | Cấp cứu y tế | 115 | 24/7 | Miễn phí |
  | Công an | 113 | 24/7 | Miễn phí |
  | Đường dây nóng Ngày Mai | 096 306 1414 | 13:00–20:30, thứ 4 đến CN | Hỗ trợ khủng hoảng tâm lý, miễn phí |
  | Hy Vọng Sống (HOPE) | 086 50 444 00 | 16:30–20:30 hằng ngày | Ngăn ngừa tự tử |
  | Tổng đài quốc gia bảo vệ trẻ em | 111 | 24/7 | Dùng khi người dưới 18 tuổi bị từ chối (FR-004) |
| Find A Helpline (danh bạ quốc tế) | đường dẫn `findahelpline.com` | — | Chỉ hiện cho người dùng tiếng Anh (FR-039) |

- **Rationale**: Việt Nam chưa có đường dây hỗ trợ cảm xúc chạy 24/7. Vì vậy ngoài giờ các đường
  dây nóng hoạt động, giao diện luôn hiện 115 và gợi ý tới phòng cấp cứu gần nhất. Hệ thống tự
  hiện đường dây nào đang trong giờ trực.
- **Việc phải làm**: Gọi thử từng số trước khi phát hành, sau đó kiểm tra lại mỗi quý.

## R9. Giọng đọc bài thuyết trình

- **Decision**:
  - Kịch bản bài giảng do AI soạn nháp (có thể dùng Claude Opus 5.5 vì ít khi chạy) và quản trị
    viên duyệt (FR-032).
  - Mỗi bài có hai kịch bản `vi` và `en`. AI dịch nháp, quản trị viên duyệt cả hai bản.
  - Sau khi duyệt, audio của **mỗi ngôn ngữ** được tạo **một lần** bằng ElevenLabs (Flash v2.5
    hoặc Eleven v3, cả hai đều hỗ trợ tiếng Việt) rồi lưu vào R2. Phụ đề lấy từ kịch bản.
  - Câu trả lời trong phần hỏi đáp hiện dạng chữ, kèm audio tạo ngay bằng Flash v2.5 nếu muốn.
- **Rationale**: Tạo audio trước nên không trễ và không tốn tiền lại mỗi lần phát. Bạn đã kết nối
  ElevenLabs sẵn.
- **Alternatives considered**: MeloTTS trên Workers AI (tài liệu chỉ nêu tiếng Anh và tiếng Pháp,
  không thấy tiếng Việt). Dịch vụ giọng đọc tiếng Việt trong nước như FPT.AI (đáng thử, cần kiểm
  tra giá và giấy phép). Chỉ có chữ (rẻ nhưng kém sinh động).

## R10. Đồng bộ buổi thuyết trình

- **Decision**: Mỗi ngôn ngữ có `LectureHall` riêng (`talkId:vi:1`, `talkId:en:1`), vì độ dài audio
  hai bản khác nhau nên không thể chung một dòng thời gian. Cả hai bắt đầu cùng giờ. `LectureHall`
  dùng Durable Object alarm để bắt đầu đúng giờ. Khi bắt đầu, nó gửi
  `startedAt` cho mọi người nghe; client tự tua audio đến `now - startedAt`, nên người vào muộn
  nghe tiếp đúng đoạn (FR-030). Câu hỏi được gom vào hàng đợi trong object. Đến phần hỏi đáp, bác
  sĩ AI chọn tối đa N câu, trả lời qua cùng pipeline an toàn R7, rồi gửi cho cả phòng. Khi vượt
  sức chứa (mặc định 200), hệ thống mở thêm `LectureHall` phụ cùng `startedAt`.
- **Rationale**: Không cần phát luồng trực tiếp. Đồng bộ bằng mốc thời gian vừa rẻ vừa chính xác
  tới khoảng 1 giây.
- **Alternatives considered**: Phát luồng audio trực tiếp (tốn băng thông, phức tạp hơn).

## R11. Kiểm duyệt phòng sinh hoạt

- **Decision**: Tin nhắn trong vòng đi qua cùng lớp từ khóa và phân loại AI như R7, chạy **trước
  khi** gửi cho cả vòng (FR-027). Tin bị chặn chỉ người gửi thấy, kèm lý do. Tin có dấu hiệu
  khủng hoảng thì người gửi nhận riêng thông tin hỗ trợ, và hệ thống tạo cờ. Chặn và tắt tiếng
  được lọc ngay phía `CircleRoom`. Báo cáo được ghi vào D1 cho trang admin. Tin nhắn vòng tự xóa
  sau 30 ngày bằng cron.
- **Đo SC-006**:
  - Bộ mẫu `evals/moderation` gồm ít nhất 200 tin xúc phạm hoặc có hại (vi và en) cộng 200 tin
    bình thường. Bộ lọc phải chặn ≥ 95% tin xấu.
  - Báo cáo mới gửi thông báo webhook giống cờ khủng hoảng. Trang admin tô đỏ báo cáo chờ quá 12
    giờ, để kịp xử lý trong 24 giờ.
- **Rationale**: Người tham gia có thể đang dễ tổn thương, nên lọc trước tốt hơn gỡ sau.
- **Alternatives considered**: Hậu kiểm (người khác đã kịp đọc nội dung có hại).

## R12. Trang quản trị

- **Decision**: Trang `/admin` nằm trong cùng Worker và được bảo vệ hai lớp: Cloudflare Access
  (Zero Trust) chặn từ bên ngoài, và Worker tự kiểm tra email có trong danh sách admin. Mỗi lần mở
  một cờ khủng hoảng, hệ thống ghi vào `flag_access_log` (FR-018). Khi có cờ mới, hệ thống gửi
  thông báo qua webhook (Telegram hoặc Discord, tùy cấu hình) cho người trực.
- **Rationale**: Hai lớp bảo vệ cho dữ liệu nhạy cảm nhất. Thông báo giúp đạt SC-010 (xem lại
  trong 24 giờ).

## R13. ⚠️ Pháp lý game online ở Việt Nam (rủi ro lớn nhất)

- **Phát hiện**:
  - Game nhiều người chơi tương tác realtime qua server được xếp loại **G1**. Theo Nghị định
    147/2024/NĐ-CP, G1 là loại duy nhất **phải xin giấy phép** trước khi phát hành, và người xin
    phải là **doanh nghiệp thành lập theo luật Việt Nam**.
  - Người chơi phải khai họ tên, ngày sinh và **số điện thoại di động Việt Nam**. Chỉ tài khoản
    đã xác thực mới được chơi.
  - Từ 01/7/2026 (Nghị định 174/2026), nhà phát hành G1 không xác thực tài khoản bằng số điện
    thoại Việt Nam bị phạt 40–60 triệu đồng.
  - Dữ liệu người chơi phải lưu tại Việt Nam. Theo trang tư vấn đã tra, "không có server tại Việt
    Nam" là lý do bị từ chối thường gặp.
- **Ảnh hưởng tới thiết kế**:
  - FR-001 (chỉ đăng nhập Google) có thể **không đủ**; có thể phải thêm bước xác thực số điện
    thoại.
  - D1 chỉ có gợi ý vị trí `apac`, **không đảm bảo** dữ liệu nằm tại Việt Nam.
- **Decision**:
  - Bản đầu chạy dạng **thử nghiệm kín**: không thu tiền, người chơi được mời.
  - Thiết kế sẵn một lớp `IdentityStore` tách riêng phần dữ liệu định danh (họ tên, ngày sinh, số
    điện thoại). Khi cần, lớp này chuyển sang một database Postgres đặt tại Việt Nam, nối qua
    **Cloudflare Hyperdrive**, mà phần game vẫn chạy trên Cloudflare.
  - **Trước khi mở công khai, phải hỏi luật sư** về ba việc: xếp loại (game G1 hay "không gian hỗ
    trợ tinh thần" có tính năng mạng xã hội), pháp nhân, và yêu cầu lưu trữ trong nước.
- **Việc phải làm**: Chạy lại `clarify` để cập nhật FR-001 sau khi có ý kiến luật sư.

## R14. Dữ liệu sức khỏe là dữ liệu cá nhân nhạy cảm

- **Phát hiện**: Theo Nghị định 356/2025/NĐ-CP hướng dẫn Luật Bảo vệ dữ liệu cá nhân (hiệu lực
  01/01/2026), tình trạng sức khỏe là dữ liệu nhạy cảm. Khi xin đồng ý phải nói rõ đó là dữ liệu
  nhạy cảm. Sự đồng ý phải kiểm chứng được, có thời điểm và nội dung, và không được mặc định đồng
  ý.
- **Decision**:
  - Bảng `consents` lưu phiên bản điều khoản, thời điểm và từng mục đã đồng ý. Mỗi mục là một ô
    tick riêng, không tick sẵn:
    - xử lý dữ liệu nhạy cảm;
    - quản trị viên xem đoạn bị gắn cờ;
    - gửi nội dung tới nhà cung cấp AI ở nước ngoài.
  - Mã hóa nội dung chat (R3), giới hạn quyền truy cập (R12), cho phép xóa (FR-005).
- **Còn mở**: Quy định về chuyển dữ liệu ra nước ngoài khi gửi tin nhắn tới AI và hồ sơ đánh giá
  tác động. Phần này nên hỏi luật sư cùng lúc với R13.

## R15. Quy trình GitHub và Cloudflare

- **Decision**:
  - Tạo repo GitHub mới, nối Workers Builds: nhánh `main` lên production; pull request được một
    bản preview riêng.
  - GitHub Actions chạy lint, test và **bộ kiểm thử an toàn** (R16) trên mỗi pull request.
  - Ba môi trường `dev`, `staging`, `production`, mỗi môi trường có D1 và R2 riêng.
  - Secret lưu bằng `wrangler secret`, không bao giờ đưa vào repo: khóa Anthropic, ElevenLabs,
    Google OAuth, khóa mã hóa.
- **Rationale**: Giống cách `van-linh-dao` đang deploy. Preview giúp xem thử trước khi lên thật.

## R16. Kiểm thử

- **Decision**:
  - Dùng Vitest với `@cloudflare/vitest-pool-workers` cho Worker và Durable Object, và Playwright
    cho luồng trên trình duyệt, kể cả giả lập điện thoại tầm trung.
  - Thư mục `evals/safety/` chứa bộ kiểm thử an toàn:
    - ít nhất 200 tình huống khủng hoảng bằng tiếng Việt (có dấu, không dấu, teencode, ẩn ý);
    - 100 câu dụ chẩn đoán hoặc kê thuốc;
    - 50 câu jailbreak;
    - phần tiếng Anh tương ứng: ít nhất 100 tình huống khủng hoảng, 50 câu dụ chẩn đoán hoặc kê
      thuốc, 25 câu jailbreak.

    Bộ kiểm thử chạy với cấu hình model thật và **chặn merge** nếu không đạt SC-003.
- **Rationale**: Đây là phần duy nhất mà sai sót có thể gây hại thật cho người dùng, nên phải được
  kiểm tự động mỗi lần thay đổi.

## R17. Hai ngôn ngữ (tiếng Việt / English)

- **Decision**:
  - Màn đầu tiên, trước đăng nhập, cho chọn ngôn ngữ. Lựa chọn lưu ở trình duyệt; sau khi đăng
    nhập thì lưu vào `users.locale`. Lần đầu, hệ thống gợi ý theo ngôn ngữ của trình duyệt.
  - Chuỗi giao diện nằm trong `vi.json`/`en.json`. Một script lúc build so khóa hai file và **làm
    build thất bại** nếu thiếu (SC-011). Không dùng thư viện i18n nặng.
  - Bác sĩ AI nhận `locale` trong system prompt và trả lời bằng ngôn ngữ người chơi vừa viết.
  - Mẫu khủng hoảng và từ khóa có bản cho cả hai ngôn ngữ.
  - Người dùng tiếng Anh thấy thêm đường dẫn tới danh bạ đường dây nóng quốc tế (FR-039).
  - Vòng sinh hoạt có trường `language`; thuyết trình theo R9 và R10.
  - Nội dung 3D (biển hiệu trong viện) dùng texture theo ngôn ngữ hoặc chữ vẽ bằng UI chồng lên,
    tránh nướng chữ cứng vào model.
- **Rationale**: Hai ngôn ngữ cố định thì không cần hệ thống dịch phức tạp. Kiểm tra lúc build bắt
  lỗi thiếu chuỗi trước khi người dùng thấy.
- **Alternatives considered**: i18next (đủ tính năng nhưng thừa cho hai ngôn ngữ). Dịch máy lúc
  chạy (không kiểm soát được câu chữ ở phần an toàn).

---

## Sources

- [Durable Objects – WebSockets (Hibernation)](https://developers.cloudflare.com/durable-objects/api/websockets)
- [Durable Objects – Limits](https://developers.cloudflare.com/durable-objects/platform/limits)
- [D1 – Data location](https://developers.cloudflare.com/d1/configuration/data-location/)
- [AI Gateway – Providers](https://developers.cloudflare.com/ai-gateway/usage/providers/)
- [Workers AI – Llama Guard 3 8B](https://developers.cloudflare.com/ai/models/%40cf/meta/llama-guard-3-8b/index.md)
- [Workers AI – MeloTTS](https://codex-container-api-docs.previews.developers.cloudflare.com/workers-ai/models/melotts/index.md)
- [Claude – Models overview](https://platform.claude.com/docs/en/models/overview)
- [ElevenLabs – Supported languages](https://elevenlabs.io/docs/help-center/other/what-languages-do-you-support)
- [TherapyRoute – Suicide hotlines and crisis lines in Vietnam (kiểm tra 8/2026)](https://www.therapyroute.com/article/suicide-hotlines-and-crisis-lines-in-vietnam-by-therapyroute)
- [Find A Helpline – Vietnam](https://findahelpline.com/countries/vn/topics/suicidal-thoughts)
- [Luật Việt An – Giấy phép game online G1](https://luatvietan.vn/giay-phep-game-online-g1.html)
- [LSVN – Quy định về cung cấp và sử dụng dịch vụ trò chơi điện tử trực tuyến](https://lsvn.vn/mot-so-quy-dinh-dang-chu-y-lien-quan-den-hoat-dong-cung-cap-va-su-dung-dich-vu-tro-choi-dien-tu-truc-tuyen-a175748.html)
- [LuatVietnam – Thông tin về sức khỏe là dữ liệu cá nhân nhạy cảm](https://luatvietnam.vn/tin-van-ban-moi/thong-tin-ve-suc-khoe-la-du-lieu-ca-nhan-nhay-cam-186-106394-article.html)
