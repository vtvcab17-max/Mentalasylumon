<!--
Sync Impact Report
- Version change: (none) → 1.0.0 (lần ban hành đầu tiên)
- Principles added:
  I. An toàn người dùng trên hết
  II. Minh bạch về AI
  III. Riêng tư theo mặc định
  IV. Chỉ người trưởng thành, tuân thủ pháp luật
  V. Hai ngôn ngữ ngang nhau
  VI. Đơn giản, nhẹ, chạy tốt trên điện thoại
- Sections added: Ràng buộc kỹ thuật và vận hành; Quy trình phát triển và cổng chất lượng; Governance
- Sections removed: none
- Dependent artifacts: plan.md của 001-online-mental-hospital đang dùng gate tạm G1–G6; các gate này
  khớp với nguyên tắc I–V (G6 ↔ IV). Lần chạy plan/tasks/analyze sau sẽ đọc file này.
- Deferred TODOs: cập nhật Nguyên tắc IV sau khi có ý kiến luật sư (research.md §R13, §R14).
-->

# Bệnh viện tâm thần online Constitution

## Core Principles

### I. An toàn người dùng trên hết (NON-NEGOTIABLE)

- Mọi đường đi của chữ do người chơi viết tới AI hoặc tới người chơi khác MUST đi qua pipeline an
  toàn: lọc từ khóa, phân loại, và kiểm tra đầu ra. Đường đi gồm trò chuyện với bác sĩ, vòng sinh
  hoạt và hỏi đáp thuyết trình. Không có ngoại lệ, kể cả cho admin hay bản thử.
- Khi có dấu hiệu khủng hoảng, phản hồi MUST là mẫu tất định có số đường dây nóng lấy từ dữ liệu
  đã kiểm. AI MUST NOT tự viết hay sửa số điện thoại.
- Nút "Cần giúp đỡ ngay" MUST dùng được trên mọi màn hình, kể cả khi AI, mạng xã hội trong game
  hay tài khoản gặp lỗi.
- Khi phân loại an toàn lỗi hoặc không chắc chắn, hệ thống MUST xử lý theo hướng an toàn hơn
  (`concern`), không bao giờ coi là `none`.
- Bộ kiểm thử an toàn MUST chạy trên mỗi pull request và mỗi lần đổi model hay prompt. Không đạt
  ngưỡng thì MUST NOT merge.

*Lý do*: Người dùng có thể đang ở thời điểm yếu đuối nhất. Một câu trả lời sai có thể gây hại
thật, nên an toàn được đặt trên tính năng, tốc độ và chi phí.

### II. Minh bạch về AI

- Mọi lời của bác sĩ AI MUST mang nhãn "AI". Bác sĩ AI MUST NOT nhận là người thật hay chuyên
  gia có giấy phép, kể cả khi người chơi yêu cầu nhập vai.
- Bác sĩ AI MUST NOT chẩn đoán, kê đơn hay nêu liều thuốc. Nó MUST gợi ý gặp chuyên gia thật khi
  vấn đề vượt phạm vi hỗ trợ.
- Bác sĩ AI MUST NOT nhập vai lãng mạn hay tình dục, và MUST NOT khuyến khích người chơi phụ thuộc
  vào nó.
- Nội dung phát công khai do AI soạn (bài thuyết trình) MUST được một người thật duyệt trước khi
  phát.

*Lý do*: Người chơi phải luôn biết mình đang nói chuyện với máy, để không thay thế việc chăm sóc
sức khỏe thật bằng một trò chơi.

### III. Riêng tư theo mặc định

- Nội dung trò chuyện và mọi dữ liệu sức khỏe MUST được coi là dữ liệu nhạy cảm: mã hóa khi lưu,
  tách riêng từng người, và chỉ chủ tài khoản đọc được.
- Ngoại lệ duy nhất: quản trị viên xem được **đoạn bị gắn cờ khủng hoảng**. Mỗi lần xem MUST được
  ghi nhật ký không xóa được.
- Sự đồng ý MUST được xin riêng từng mục, không tick sẵn, có lưu phiên bản và thời điểm. Điều
  khoản đổi thì MUST xin đồng ý lại.
- Hệ thống MUST thu ít dữ liệu nhất có thể. Tên thật và email MUST NOT hiện cho người chơi khác.
  Dữ liệu MUST NOT dùng cho quảng cáo hay bán cho bên thứ ba.
- Người chơi MUST tự xóa được lịch sử và tài khoản; dữ liệu MUST biến mất khỏi giao diện ngay và
  bị xóa hẳn trong ≤ 30 ngày.

*Lý do*: Lòng tin là điều kiện để người dùng dám nói thật. Luật Việt Nam cũng coi tình trạng sức
khỏe là dữ liệu cá nhân nhạy cảm.

### IV. Chỉ người trưởng thành, tuân thủ pháp luật

- Chỉ người từ 18 tuổi MUST được dùng dịch vụ. Người khai dưới 18 tuổi MUST bị từ chối và được chỉ
  tới nguồn hỗ trợ cho người trẻ.
- Bản công khai MUST NOT phát hành khi chưa có ý kiến luật sư về các vấn đề trong research.md
  §R13–R14: giấy phép game, xác thực số điện thoại, nơi lưu dữ liệu, chuyển dữ liệu ra nước
  ngoài. Trước khi có ý kiến đó, sản phẩm chỉ chạy dạng thử nghiệm kín.
- Dữ liệu định danh MUST nằm sau lớp `IdentityStore`, để chuyển được nơi lưu trữ mà không phải
  viết lại phần còn lại.
- Danh sách đường dây nóng MUST được gọi kiểm tra trước khi phát hành và kiểm lại ít nhất mỗi quý.

*Lý do*: Dịch vụ cho người dễ tổn thương phải hợp pháp và đáng tin. Mọi thay đổi về luật đều được
khoanh vào một chỗ để xử lý.

### V. Hai ngôn ngữ ngang nhau

- Tiếng Việt và tiếng Anh MUST có đủ cho mọi chuỗi giao diện, điều khoản, mẫu khủng hoảng và bài
  thuyết trình. Thiếu một bản dịch thì build MUST thất bại.
- Mức an toàn MUST như nhau ở cả hai ngôn ngữ: từ khóa, mẫu phản hồi và bộ kiểm thử đều có đủ bản
  `vi` và `en`.
- Chữ hiển thị MUST NOT nướng cứng vào model 3D hay hình ảnh; MUST lấy theo ngôn ngữ đang chọn.

*Lý do*: Một người dùng tiếng Anh đang khủng hoảng xứng đáng được bảo vệ như một người dùng tiếng
Việt.

### VI. Đơn giản, nhẹ, chạy tốt trên điện thoại

- Hạ tầng MUST ở trên Cloudflare (Workers, Durable Objects, D1, R2, AI Gateway), code MUST ở trên
  GitHub. Thêm dịch vụ bên ngoài MUST được ghi lý do trong research.md và mục Complexity Tracking
  của plan. Ngoại lệ đã biết: nhà cung cấp AI, giọng đọc, và nơi lưu dữ liệu định danh theo
  Nguyên tắc IV.
- Mỗi tính năng MUST giữ ngân sách hiệu năng:
  - tải lần đầu ≤ 15 MB ở mức đồ họa thấp;
  - chạy mượt với 30 nhân vật trên điện thoại tầm trung;
  - bác sĩ bắt đầu trả lời trong ≤ 5 giây với 95% câu hỏi.
- SHOULD chọn giải pháp đơn giản nhất đáp ứng spec (YAGNI). Thêm độ phức tạp MUST được ghi vào
  Complexity Tracking.

*Lý do*: Người dùng chủ yếu chơi trên điện thoại. Một người làm dự án thì cần ít thứ phải vận
hành.

## Ràng buộc kỹ thuật và vận hành

- Secret (khóa AI, OAuth, mã hóa) MUST nằm trong Worker secrets, MUST NOT có trong repo hay log.
- Mọi lời gọi model AI MUST đi qua AI Gateway để có log, giới hạn và đổi được model bằng cấu hình.
- Đổi model, prompt hay quy tắc an toàn là thay đổi liên quan an toàn: MUST chạy lại bộ kiểm thử
  an toàn và ghi kết quả vào pull request.
- Ba môi trường `dev`, `staging`, `production` MUST dùng dữ liệu riêng. Dữ liệu thật của người
  chơi MUST NOT được chép xuống `dev`.
- Tài sản 3D và âm thanh MUST có giấy phép rõ ràng, ghi trong `assets-src/LICENSES.md`.

## Quy trình phát triển và cổng chất lượng

- Mọi tính năng đi theo Spec Kit: `specify` → `clarify` → `plan` → `tasks` → `implement` →
  `converge`. Mỗi `plan` MUST có mục Constitution Check đối chiếu với file này.
- Mỗi pull request MUST qua các bước tự động sau: lint, test, `i18n:check`, `eval:safety`,
  `eval:moderation`.
- Pull request đụng tới thư mục `safety/`, `ai/`, `crypto/`, `identity/`, `admin/` hoặc mẫu khủng
  hoảng MUST có một người thật đọc và duyệt; không tự merge.
- `speckit analyze` MUST coi mọi vi phạm nguyên tắc MUST trong file này là CRITICAL.
- Trước mỗi lần phát hành MUST đi hết checklist "Trước khi mở công khai" trong quickstart.md của
  tính năng.

## Governance

- Constitution này đứng trên mọi tài liệu và thói quen khác của dự án. Khi spec, plan hay tasks
  mâu thuẫn với nó thì sửa tài liệu đó, không bẻ nguyên tắc.
- Sửa đổi constitution MUST qua một pull request riêng: chỉ sửa file này, có Sync Impact Report ở
  đầu, và chủ dự án duyệt.
- Đánh phiên bản theo semver:
  - MAJOR: bỏ hoặc định nghĩa lại một nguyên tắc;
  - MINOR: thêm nguyên tắc hay mục, hoặc mở rộng đáng kể;
  - PATCH: làm rõ câu chữ.
- Rà soát tuân thủ:
  - mỗi lần chạy `plan` và `analyze`;
  - mỗi quý (đường dây nóng, luật, kết quả bộ kiểm thử);
  - ngay khi có ý kiến luật sư về Nguyên tắc IV.

**Version**: 1.0.0 | **Ratified**: 2026-11-03 | **Last Amended**: 2026-11-03
