# Feature Specification: Bệnh viện tâm thần online (bản đầu tiên)

**Feature Branch**: `001-online-mental-hospital`

**Created**: 2026-11-03

**Status**: Draft

**Input**: User description: "tôi muốn tạo 1 bệnh viện tâm thần online những người chơi sẽ đăng nhập bằng tài khoản google, giống game đi chùa online vậy và các bác sĩ sẽ chạy 1 model AI riêng hoặc bạn sẽ tự code 1 model có thể trả lời câu hỏi của bệnh nhân, và bệnh viện phải to lớn để mỗi người 1 phòng có phòng sinh hoạt cộng đồng vòng tròn, nghe bác sĩ thuyết trình"

**Bổ sung (2026-11-03)**: "tạo thêm cả bản tiếng anh vào mở đầu cho chọn ngôn ngữ luôn"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Vào viện, nhận phòng riêng và trò chuyện với bác sĩ AI (Priority: P1)

Người chơi mở trang và chọn ngôn ngữ (Tiếng Việt hoặc English), rồi đăng nhập bằng tài khoản Google. Lần đầu vào, họ đọc lời giới thiệu: bác sĩ trong viện là nhân vật AI, không phải bác sĩ thật. Họ đồng ý điều khoản, chọn biệt danh và ngoại hình nhân vật, rồi được dẫn về phòng riêng của mình. Trong phòng, họ gọi một bác sĩ AI và trò chuyện bằng ngôn ngữ đã chọn: kể chuyện, hỏi về căng thẳng, giấc ngủ, cảm xúc. Bác sĩ lắng nghe, hỏi lại và gợi ý cách tự chăm sóc. Lần sau đăng nhập, phòng và lịch sử trò chuyện vẫn còn nguyên.

**Why this priority**: Đây là giá trị cốt lõi: có một chỗ riêng tư để được lắng nghe và hỏi đáp. Chỉ riêng câu chuyện này đã là một sản phẩm dùng được (MVP).

**Independent Test**: Tạo tài khoản mới, đi hết phần giới thiệu, vào phòng riêng, hỏi 5 câu và nhận câu trả lời. Đăng xuất rồi đăng nhập lại trên thiết bị khác: vẫn đúng phòng đó, lịch sử vẫn còn.

**Acceptance Scenarios**:

1. **Given** người mở trang lần đầu, **When** màn hình đầu tiên hiện ra, **Then** họ chọn được Tiếng Việt hoặc English trước khi đăng nhập, và mọi màn hình sau đó (kể cả điều khoản) dùng ngôn ngữ đã chọn.
2. **Given** người chưa có tài khoản, **When** họ đăng nhập bằng Google lần đầu, **Then** họ thấy lời giới thiệu về bác sĩ AI, được báo rằng đoạn trò chuyện có dấu hiệu khủng hoảng sẽ được quản trị viên xem lại, xác nhận đủ 18 tuổi và bấm đồng ý trước khi vào viện.
3. **Given** người dùng cho biết mình dưới 18 tuổi, **When** họ cố hoàn tất đăng ký, **Then** họ bị từ chối và được chỉ tới nguồn hỗ trợ cho người trẻ.
4. **Given** người chơi đã đồng ý điều khoản, **When** họ chọn biệt danh và ngoại hình, **Then** hệ thống cấp cho họ một phòng riêng cố định và đưa họ vào phòng đó.
5. **Given** người chơi đang ở phòng riêng, **When** họ gọi bác sĩ và gửi câu hỏi, **Then** bác sĩ AI trả lời bằng ngôn ngữ người chơi đã chọn, và giao diện luôn ghi rõ đây là AI.
6. **Given** người chơi hỏi xin chẩn đoán bệnh hoặc liều thuốc, **When** bác sĩ AI trả lời, **Then** bác sĩ từ chối chẩn đoán hay kê thuốc, giải thích nhẹ nhàng và gợi ý gặp chuyên gia thật.
7. **Given** người chơi viết điều cho thấy họ có ý định tự hại hoặc tự tử, **When** tin nhắn được gửi, **Then** bác sĩ AI chuyển ngay sang phản hồi an toàn: thể hiện sự quan tâm, hiển thị số khẩn cấp và đường dây nóng hỗ trợ tâm lý, khuyến khích liên hệ người tin cậy.
8. **Given** người chơi đã trò chuyện trước đó, **When** họ đăng nhập lại, **Then** họ vào đúng phòng cũ và xem lại được lịch sử trò chuyện.
9. **Given** người chơi muốn xóa dữ liệu, **When** họ chọn xóa lịch sử hoặc xóa tài khoản, **Then** dữ liệu đó biến mất khỏi giao diện ngay lập tức.

---

### User Story 2 - Đi dạo trong bệnh viện cùng người chơi khác (Priority: P2)

Bệnh viện là một thế giới 3D phong cách chibi, rộng lớn để đi lại: sảnh chính, hành lang, các khu phòng bệnh nhiều tầng, vườn, phòng sinh hoạt cộng đồng hình tròn. Người chơi điều khiển nhân vật đi khắp các khu chung, thấy nhân vật của người khác cũng đang đi lại. Họ có bản đồ, chỉ đường và nút về phòng nhanh. Khi có thêm người chơi, bệnh viện tự mở thêm tầng hoặc khu mới để ai cũng có phòng.

**Why this priority**: Tạo cảm giác "đi viện cùng mọi người" như game đi chùa online, giúp người chơi bớt cô đơn. Phần này cần có phòng riêng (US1) làm điểm xuất phát nhưng kiểm thử được riêng.

**Independent Test**: Hai tài khoản đăng nhập cùng lúc, cùng đi tới sảnh chính, mỗi bên thấy nhân vật của bên kia di chuyển. Dùng bản đồ đi từ phòng riêng tới phòng sinh hoạt rồi bấm về phòng.

**Acceptance Scenarios**:

1. **Given** hai người chơi cùng ở sảnh chính, **When** một người di chuyển, **Then** người kia thấy nhân vật đó di chuyển gần như ngay lập tức.
2. **Given** người chơi ở bất kỳ đâu trong viện, **When** họ mở bản đồ và chọn một địa điểm, **Then** họ được chỉ đường hoặc dịch chuyển tới đó.
3. **Given** người chơi khác đứng trước cửa phòng riêng của một người, **When** họ cố vào, **Then** cửa không mở vì chỉ chủ phòng vào được.
4. **Given** mọi phòng ở các khu hiện có đã có chủ, **When** có người chơi mới đăng ký, **Then** bệnh viện mở thêm tầng hoặc khu mới và cấp phòng cho người đó.

---

### User Story 3 - Sinh hoạt cộng đồng trong phòng vòng tròn (Priority: P3)

Phòng sinh hoạt cộng đồng là một phòng hình tròn, ghế xếp thành vòng. Người chơi ngồi vào ghế và trò chuyện bằng chữ với cả vòng. Vào giờ sinh hoạt theo lịch, một bác sĩ AI ngồi giữa vòng để dẫn dắt: đưa ra chủ đề, mời mọi người chia sẻ, nhắc quy tắc cộng đồng. Ai làm phiền người khác thì có thể bị báo cáo, chặn hoặc tắt tiếng.

**Why this priority**: Kết nối những người có cùng trải nghiệm. Phần này cần có thế giới chung (US2) nhưng phòng tròn kiểm thử được riêng.

**Independent Test**: Ba tài khoản cùng vào phòng tròn, ngồi ghế, nhắn tin cho nhau. Một tài khoản báo cáo tin nhắn xúc phạm của tài khoản khác, quản trị viên thấy báo cáo đó và ẩn được tin nhắn.

**Acceptance Scenarios**:

1. **Given** phòng tròn còn ghế trống, **When** người chơi chọn một ghế, **Then** nhân vật của họ ngồi vào ghế đó và họ đọc được, gửi được tin nhắn chung của vòng.
2. **Given** mọi ghế trong vòng đã có người, **When** có thêm người muốn vào, **Then** hệ thống mở một vòng mới hoặc cho họ chờ.
3. **Given** đang trong giờ sinh hoạt theo lịch, **When** buổi sinh hoạt bắt đầu, **Then** bác sĩ AI dẫn dắt vòng bằng cách giới thiệu chủ đề và mời từng người chia sẻ.
4. **Given** một tin nhắn xúc phạm hoặc có hại được gửi, **When** bộ lọc tự động phát hiện ra, **Then** tin nhắn đó không hiện cho cả vòng.
5. **Given** người chơi bị làm phiền, **When** họ báo cáo, chặn hoặc tắt tiếng một người, **Then** họ không còn thấy tin nhắn của người đó và báo cáo được chuyển tới quản trị viên.
6. **Given** ai đó viết điều cho thấy họ đang khủng hoảng trong phòng chung, **When** tin nhắn được gửi, **Then** người đó nhận riêng thông tin hỗ trợ khẩn cấp, và mọi chi tiết về cách thức tự hại không được hiện cho cả vòng.

---

### User Story 4 - Nghe bác sĩ AI thuyết trình (Priority: P4)

Theo lịch, bác sĩ AI có buổi thuyết trình tại phòng tròn với các chủ đề như quản lý căng thẳng, ngủ ngon hay vượt qua mất mát. Bác sĩ đứng ở giữa, người nghe ngồi quanh. Bài giảng có phần trình chiếu và lời giảng kèm phụ đề. Cuối buổi có phần hỏi đáp: người nghe gửi câu hỏi (có thể ẩn danh), bác sĩ chọn và trả lời công khai. Ai bỏ lỡ thì xem lại được sau.

**Why this priority**: Đây là nội dung định kỳ giúp người chơi quay lại thường xuyên, nhưng ứng dụng vẫn có giá trị khi chưa có phần này.

**Independent Test**: Quản trị viên lên lịch và duyệt một bài thuyết trình. Đến giờ, hai tài khoản vào phòng tròn nghe hết bài, gửi một câu hỏi và nhận câu trả lời. Sau buổi, bài giảng có trong mục xem lại.

**Acceptance Scenarios**:

1. **Given** có buổi thuyết trình sắp tới, **When** người chơi vào sảnh, **Then** họ thấy lịch thuyết trình và nhận thông báo trước giờ bắt đầu.
2. **Given** buổi thuyết trình đã bắt đầu, **When** người chơi vào phòng tròn, **Then** họ nghe được phần đang giảng, thấy trình chiếu và phụ đề, kể cả khi vào muộn.
3. **Given** đang trong phần hỏi đáp, **When** người nghe gửi câu hỏi ẩn danh, **Then** người khác không thấy tên họ và bác sĩ AI có thể trả lời công khai.
4. **Given** một bài thuyết trình chưa được quản trị viên duyệt, **When** đến giờ phát, **Then** bài đó không được phát.
5. **Given** buổi thuyết trình đã kết thúc, **When** người chơi mở mục xem lại, **Then** họ xem được bài đó.

---

### Edge Cases

- Người dùng hủy đăng nhập Google giữa chừng, hoặc đăng nhập Google bị lỗi: quay về màn hình chào và báo lỗi dễ hiểu.
- Bác sĩ AI tạm thời không trả lời được (quá tải, mất kết nối): hiện thông báo thân thiện, nút "Cần giúp đỡ ngay" và số đường dây nóng vẫn hoạt động.
- Người chơi tìm cách "lừa" bác sĩ AI bằng nhập vai hoặc giả định để lấy chẩn đoán, liều thuốc hay thông tin gây hại: quy tắc an toàn vẫn được áp dụng.
- Người chơi hỏi chuyện không liên quan đến sức khỏe tinh thần: bác sĩ trả lời ngắn gọn hoặc nhẹ nhàng đưa câu chuyện quay về chủ đề chính.
- Người chơi hết lượt hỏi trong ngày: được báo rõ khi nào có lượt mới, nút hỗ trợ khẩn cấp vẫn dùng được.
- Hai thiết bị cùng đăng nhập một tài khoản: dùng chung phòng và lịch sử, không bị tạo phòng thứ hai.
- Phòng tròn quá đông trong buổi thuyết trình: mở phòng phụ cùng phát buổi đó.
- Người chơi bị cấm vẫn cố đăng nhập: được báo tài khoản đang bị khóa và thời hạn khóa.
- Người dùng dưới 18 tuổi cố đăng ký: bị từ chối và được chỉ tới nguồn hỗ trợ cho người trẻ (xem FR-004).
- Máy yếu không chạy nổi đồ họa 3D ở mức hiện tại: hệ thống gợi ý hạ mức chất lượng. Trò chuyện với bác sĩ và nút hỗ trợ khẩn cấp vẫn phải dùng được.
- Đoạn trò chuyện bị gắn cờ khủng hoảng nhưng chưa có quản trị viên nào trực: cờ được giữ trong hàng chờ. Người chơi vẫn nhận phản hồi an toàn tự động ngay lập tức.
- Người chơi đổi ngôn ngữ giữa cuộc trò chuyện: bác sĩ trả lời bằng ngôn ngữ mới từ tin tiếp theo; lịch sử cũ giữ nguyên.
- Người chơi viết bằng ngôn ngữ khác ngôn ngữ đã chọn: bác sĩ vẫn hiểu và trả lời bằng ngôn ngữ người đó vừa dùng; các quy tắc an toàn áp dụng như nhau.
- Tài khoản bỏ không lâu ngày: phòng được giữ lại; nếu xóa tài khoản thì phòng được giải phóng.

## Requirements *(mandatory)*

### Functional Requirements

**Tài khoản và lần đầu vào viện**

- **FR-001**: Hệ thống MUST cho phép đăng nhập chỉ bằng tài khoản Google. Lần đăng nhập đầu tiên tự tạo hồ sơ người chơi.
- **FR-002**: Lần đầu vào viện, hệ thống MUST hiện lời giới thiệu nói rõ: bác sĩ là nhân vật AI, không phải bác sĩ hay chuyên gia tâm lý thật, và không thay thế việc khám chữa bệnh. Người dùng MUST đồng ý điều khoản trước khi vào.
- **FR-003**: Người chơi MUST chọn biệt danh và ngoại hình nhân vật. Tên thật và email Google MUST không bao giờ hiện cho người chơi khác.
- **FR-004**: Chỉ người từ 18 tuổi trở lên MUST được tạo tài khoản. Khi đăng ký, người dùng MUST xác nhận mình đủ 18 tuổi. Ai cho biết mình dưới 18 tuổi MUST bị từ chối và được chỉ tới các nguồn hỗ trợ dành cho người trẻ.
- **FR-005**: Người chơi MUST tự đăng xuất, xóa lịch sử trò chuyện và xóa hẳn tài khoản cùng toàn bộ dữ liệu được.

**Thế giới bệnh viện**

- **FR-006**: Bệnh viện MUST có các khu: sảnh chính, hành lang, khu phòng bệnh nhiều tầng, phòng sinh hoạt cộng đồng hình tròn và khu ngoài trời để đi dạo. Thế giới MUST là 3D theo phong cách chibi: nhân vật đầu to, dáng nhỏ, dễ thương, cảnh vật tươi sáng. Người chơi điều khiển nhân vật đi lại tự do với góc nhìn thứ ba.
- **FR-006a**: Người chơi MUST chọn được mức chất lượng đồ họa (thấp / vừa / cao) để chơi mượt trên máy yếu.
- **FR-007**: Mỗi người chơi MUST được cấp một phòng riêng cố định khi tạo tài khoản. Phòng đó giữ nguyên qua mọi lần đăng nhập và mọi thiết bị.
- **FR-008**: Bệnh viện MUST tự mở thêm tầng hoặc khu khi số người chơi tăng, không đặt giới hạn cứng cho số phòng.
- **FR-009**: Người chơi MUST điều khiển được nhân vật trong các khu chung và thấy nhân vật của người chơi khác di chuyển theo thời gian thực.
- **FR-010**: Phòng riêng MUST chỉ chủ phòng vào được.
- **FR-011**: Hệ thống MUST có bản đồ, chỉ đường và lối tắt về phòng riêng hoặc tới phòng sinh hoạt.

**Bác sĩ AI**

- **FR-012**: Bệnh viện MUST có nhiều bác sĩ AI. Mỗi bác sĩ có tên, ngoại hình và chủ đề phụ trách riêng (ví dụ căng thẳng, giấc ngủ, các mối quan hệ, mất mát), và tất cả cùng tuân theo một bộ quy tắc an toàn.
- **FR-013**: Người chơi MUST gọi được bác sĩ AI vào phòng riêng và trò chuyện bằng chữ, bằng ngôn ngữ đã chọn (tiếng Việt hoặc tiếng Anh).
- **FR-014**: Bác sĩ AI MUST lắng nghe, hỏi lại để hiểu, cung cấp kiến thức sức khỏe tinh thần phổ thông và gợi ý cách tự chăm sóc.
- **FR-015**: Bác sĩ AI MUST NOT chẩn đoán bệnh, kê đơn, nêu liều thuốc, hay tự nhận là người thật hoặc bác sĩ có giấy phép. Giao diện trò chuyện MUST luôn có nhãn "AI".
- **FR-016**: Bác sĩ AI MUST khuyến khích người chơi tìm chuyên gia thật khi vấn đề vượt quá phạm vi hỗ trợ, ví dụ triệu chứng kéo dài hoặc ảnh hưởng nặng tới cuộc sống.
- **FR-017**: Khi tin nhắn cho thấy dấu hiệu khủng hoảng (ý định tự hại hoặc tự tử, nguy cơ bạo lực, đang bị xâm hại), bác sĩ AI MUST ngay lập tức phản hồi theo kịch bản an toàn: thể hiện sự quan tâm, hiển thị số khẩn cấp và đường dây nóng hỗ trợ tâm lý đã được xác minh, khuyến khích liên hệ người tin cậy, và không đưa thông tin có thể gây hại.
- **FR-018**: Sau khi phát hiện khủng hoảng, hệ thống MUST gắn cờ đoạn trò chuyện đó để một quản trị viên là người thật xem lại. Điều khoản lúc đăng ký MUST báo trước rõ ràng về việc này. Quản trị viên MUST chỉ xem được đoạn bị gắn cờ, không xem được phần còn lại của lịch sử. Mỗi lần quản trị viên xem MUST được ghi lại: ai xem, xem lúc nào.
- **FR-019**: Lịch sử trò chuyện với bác sĩ MUST riêng tư cho chủ tài khoản. Người chơi xem lại và xóa từng cuộc hoặc toàn bộ được.
- **FR-020**: Hệ thống MUST giới hạn số tin nhắn gửi bác sĩ AI mỗi ngày cho mỗi người. Quản trị viên chỉnh được mức giới hạn này.
- **FR-021**: Nút "Cần giúp đỡ ngay" MUST luôn hiển thị trên mọi màn hình và mở ra số khẩn cấp cùng đường dây nóng hỗ trợ tâm lý, kể cả khi bác sĩ AI không hoạt động hoặc người chơi đã hết lượt hỏi.

**Phòng sinh hoạt cộng đồng**

- **FR-022**: Phòng sinh hoạt MUST có ghế xếp thành vòng tròn. Người chơi ngồi vào ghế để tham gia trò chuyện bằng chữ của vòng đó.
- **FR-023**: Mỗi vòng MUST có số ghế tối đa do quản trị viên đặt. Khi vòng đầy, hệ thống MUST mở vòng mới hoặc cho người chơi chờ.
- **FR-024**: Vào giờ sinh hoạt theo lịch, một bác sĩ AI MUST dẫn dắt vòng: giới thiệu chủ đề, mời chia sẻ và nhắc quy tắc cộng đồng.
- **FR-025**: Quy tắc cộng đồng MUST hiện ra khi người chơi vào phòng tròn lần đầu.
- **FR-026**: Người chơi MUST báo cáo, chặn và tắt tiếng được người khác.
- **FR-027**: Hệ thống MUST tự động chặn tin nhắn xúc phạm, quấy rối hoặc mô tả cách thức tự hại trước khi chúng hiện cho cả vòng. Người gửi tin nhắn có dấu hiệu khủng hoảng MUST nhận riêng thông tin hỗ trợ như FR-017.
- **FR-028**: Quản trị viên MUST xem được các báo cáo, ẩn tin nhắn, và khóa tài khoản tạm thời hoặc vĩnh viễn.

**Thuyết trình của bác sĩ AI**

- **FR-029**: Hệ thống MUST hiển thị lịch thuyết trình ở sảnh chính và thông báo cho người chơi trước giờ bắt đầu.
- **FR-030**: Buổi thuyết trình MUST diễn ra tại phòng tròn, bác sĩ AI ở giữa, có phần trình chiếu và lời giảng kèm phụ đề theo ngôn ngữ của người nghe. Người vào muộn nghe tiếp từ đoạn đang giảng.
- **FR-031**: Mỗi buổi MUST có phần hỏi đáp. Người nghe gửi câu hỏi, có thể chọn ẩn danh. Bác sĩ AI chọn và trả lời công khai theo cùng quy tắc an toàn ở FR-015 và FR-017.
- **FR-032**: Nội dung bài thuyết trình MUST được quản trị viên duyệt trước khi phát.
- **FR-033**: Bài thuyết trình đã phát MUST xem lại được.

**Quản trị và dữ liệu**

- **FR-034**: Quản trị viên MUST quản lý được danh sách bác sĩ AI, chủ đề, lịch sinh hoạt, lịch thuyết trình và danh sách số khẩn cấp cùng đường dây nóng.
- **FR-035**: Dữ liệu trò chuyện MUST được coi là dữ liệu nhạy cảm: chỉ chủ tài khoản truy cập được (ngoại lệ duy nhất theo FR-018), không dùng cho quảng cáo, không bán hay chia sẻ cho bên thứ ba, và tuân thủ luật bảo vệ dữ liệu cá nhân hiện hành của Việt Nam.
- **FR-036**: Toàn bộ giao diện và nội dung MUST có hai ngôn ngữ: tiếng Việt và tiếng Anh. Màn hình đầu tiên, trước khi đăng nhập, MUST cho người dùng chọn ngôn ngữ. Lựa chọn này được nhớ cho lần sau và đổi được bất cứ lúc nào trong phần cài đặt.
- **FR-037**: Mỗi bài thuyết trình MUST có bản tiếng Việt và bản tiếng Anh, cả hai đều được duyệt trước khi phát. Hai bản bắt đầu cùng giờ. Người nghe nghe bản theo ngôn ngữ của mình, và người vào muộn nghe tiếp đúng đoạn đang giảng của bản đó.
- **FR-038**: Mỗi vòng sinh hoạt MUST có một ngôn ngữ (tiếng Việt hoặc tiếng Anh). Danh sách vòng ưu tiên hiện vòng cùng ngôn ngữ với người chơi, và bác sĩ dẫn dắt nói ngôn ngữ của vòng.
- **FR-039**: Thông tin hỗ trợ khẩn cấp MUST hiện theo ngôn ngữ đã chọn. Với người dùng tiếng Anh, MUST có thêm đường dẫn tới danh bạ đường dây nóng quốc tế cho người không ở Việt Nam.

### Key Entities

- **Người chơi (Bệnh nhân)**: người đăng nhập bằng Google. Có biệt danh, ngoại hình, trạng thái đồng ý điều khoản, phòng riêng, cài đặt chặn hoặc tắt tiếng, trạng thái tài khoản (hoạt động hoặc bị khóa).
- **Khu / Tầng**: một phần của bản đồ bệnh viện, gồm nhiều phòng riêng. Khu mới được mở thêm khi cần.
- **Phòng riêng**: thuộc đúng một người chơi, gắn với một vị trí trong một khu.
- **Bác sĩ AI**: nhân vật có tên, ngoại hình và chủ đề phụ trách. Trò chuyện riêng, dẫn dắt sinh hoạt và thuyết trình.
- **Cuộc trò chuyện**: chuỗi tin nhắn giữa một người chơi và một bác sĩ AI, có thể có cờ khủng hoảng.
- **Vòng sinh hoạt**: một nhóm ghế trong phòng tròn, có danh sách người ngồi và tin nhắn chung, có thể gắn với một buổi sinh hoạt theo lịch.
- **Buổi thuyết trình**: chủ đề, bác sĩ phụ trách, giờ phát, nội dung đã duyệt, câu hỏi và câu trả lời, bản xem lại.
- **Báo cáo vi phạm**: ai báo cáo, ai bị báo cáo, nội dung, lý do, kết quả xử lý.
- **Tài nguyên hỗ trợ khẩn cấp**: tên, số điện thoại, phạm vi và giờ hoạt động. Do quản trị viên cập nhật.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Người mới đi từ bấm đăng nhập tới lúc đứng trong phòng riêng trong dưới 2 phút.
- **SC-002**: Với 95% câu hỏi, bác sĩ AI bắt đầu trả lời trong vòng 5 giây.
- **SC-003**: Với bộ kiểm thử gồm ít nhất 200 tình huống khủng hoảng bằng tiếng Việt và 100 tình huống bằng tiếng Anh, 100% nhận được phản hồi an toàn có số đường dây nóng, và 0 câu trả lời chứa chẩn đoán, liều thuốc hay thông tin gây hại.
- **SC-004**: Ít nhất 500 người chơi cùng lúc thấy nhân vật của nhau di chuyển mà không thấy giật hay trễ rõ rệt.
- **SC-005**: Một buổi thuyết trình phục vụ được ít nhất 200 người nghe cùng lúc mà không bị gián đoạn.
- **SC-006**: Bộ lọc tự động chặn ít nhất 95% tin nhắn trong bộ kiểm thử nội dung xúc phạm hoặc có hại. Mọi báo cáo vi phạm được xử lý trong vòng 24 giờ.
- **SC-007**: Ít nhất 80% người chơi được khảo sát sau khi trò chuyện cho biết họ "cảm thấy được lắng nghe".
- **SC-008**: Khi người chơi xóa tài khoản, dữ liệu của họ biến mất khỏi giao diện ngay lập tức và bị xóa hẳn trong vòng 30 ngày.
- **SC-009**: Trên điện thoại tầm trung, ở mức đồ họa thấp, thế giới 3D chạy mượt (không giật rõ rệt) khi có tới 30 nhân vật trong tầm nhìn.
- **SC-010**: 100% đoạn trò chuyện bị gắn cờ khủng hoảng được quản trị viên xem lại trong vòng 24 giờ.
- **SC-011**: Trước khi phát hành, 100% chuỗi giao diện có đủ bản tiếng Việt và tiếng Anh, không còn chuỗi thiếu bản dịch.

## Assumptions

- Đây là không gian hỗ trợ tinh thần dưới dạng game: lắng nghe, chia sẻ kiến thức phổ thông, kết nối cộng đồng. Đây không phải dịch vụ y tế, và không có bác sĩ là người thật trực trong bản đầu tiên.
- "Bệnh viện tâm thần online" là tên dự án tạm thời. Tên hiển thị chính thức sẽ chọn sau.
- Người chơi chủ yếu ở Việt Nam. Bản tiếng Anh phục vụ người nước ngoài và người thích dùng tiếng Anh; danh sách đường dây nóng vẫn ưu tiên Việt Nam.
- Chơi trên trình duyệt web, cả máy tính lẫn điện thoại. Ứng dụng cài đặt riêng không thuộc bản đầu tiên.
- Bác sĩ AI dùng một mô hình AI có sẵn kèm bộ quy tắc an toàn riêng. Việc chọn mô hình được quyết định ở bước lập kế hoạch kỹ thuật.
- Trò chuyện riêng và phòng chung chỉ dùng chữ. Gọi thoại hoặc video giữa người chơi không thuộc bản đầu tiên. Thuyết trình có lời giảng kèm phụ đề.
- Miễn phí cho người chơi. Mua bán trong game và quảng cáo không thuộc bản đầu tiên.
- Phòng riêng chỉ để ở một mình. Mời bạn vào phòng, trang trí phòng và kết bạn để sau.
- Số khẩn cấp và đường dây nóng phải được xác minh lại trước khi phát hành và kiểm tra định kỳ.
- Có ít nhất một quản trị viên là người thật để duyệt bài thuyết trình, xử lý báo cáo và cập nhật tài nguyên hỗ trợ.
- Phòng của tài khoản không hoạt động được giữ nguyên. Phòng chỉ được giải phóng khi tài khoản bị xóa.
