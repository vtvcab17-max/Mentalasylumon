# Feature Specification: Cấp bậc, nhiệm vụ và bầu Viện trưởng

**Feature Branch**: `002-ranks-quests`

**Created**: 2026-11-09

**Status**: Draft

**Input**: User description: "có thêm nhiệm vụ cho nhân vật, các cấp và từ bệnh nhân có thể lên nhân viên lau dọn lên dần dần đến thực tập sinh và viện trưởng, có hội đồng để bầu cử viện trưởng, và viện trưởng có mọi quyền hành trong 1 tuần rồi được bầu cử lại. làm game play thú vị, các hành trình thăng cấp và nhiệm vụ cần rõ ràng"

**Đã chốt với người dùng (2026-11-09)**:

- Viện trưởng chỉ có **quyền trong game**: chọn chủ đề tuần, đặt nhiệm vụ tuần, trang trí, ra thông báo (vẫn qua kiểm duyệt), bổ nhiệm danh dự. Viện trưởng KHÔNG xem dữ liệu riêng hay cờ khủng hoảng, KHÔNG khóa người chơi và KHÔNG đổi quy tắc an toàn. Lý do: "mọi quyền hành" theo nghĩa đen trái với Nguyên tắc I và III của hiến pháp dự án.
- Nhiệm vụ kiểu **hỗn hợp**: tự chăm sóc hằng ngày, mini-game công việc theo cấp, nhiệm vụ cộng đồng và khám phá. Điểm mỗi ngày có giới hạn, và không thưởng cho việc online lâu.
- **Hội đồng bầu**: Thực tập sinh và Trưởng khoa lập thành Hội đồng. Ứng viên là Trưởng khoa. Không ai làm Viện trưởng hai tuần liền.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Nhiệm vụ hằng ngày và sổ nhiệm vụ (Priority: P1)

Mỗi ngày, người chơi mở **Sổ nhiệm vụ** và thấy 3 nhiệm vụ hằng ngày, mỗi nhiệm vụ thuộc một nhóm khác nhau:

- **Tự chăm sóc**: ghi cảm xúc hôm nay bằng một biểu tượng, làm bài thở 3 phút có hướng dẫn, hoặc viết một dòng biết ơn riêng tư.
- **Cộng đồng**: chào một người ở sảnh, ngồi đủ 10 phút trong vòng sinh hoạt, hoặc gửi lời cảm ơn cho một tin chia sẻ.
- **Khám phá**: đi tới một góc của viện, ví dụ ao ở vườn sau hay bậc portico ở sân trước.

Mỗi nhiệm vụ ghi rõ ba điều: làm gì, ở đâu và được bao nhiêu điểm. Nhiệm vụ cũng có nút **Dẫn đường** chỉ hướng tới nơi cần đến. Làm xong thì người chơi được **điểm cống hiến** ngay, kèm một hiệu ứng nhỏ. Nhiệm vụ mới có lúc 0 giờ (giờ Việt Nam).

**Why this priority**: Đây là vòng chơi cơ bản, cho người chơi lý do quay lại mỗi ngày và hướng họ tới thói quen lành mạnh. Mọi phần sau (thăng cấp, bầu cử) đều dựa trên điểm này.

**Independent Test**: Một tài khoản mới mở Sổ nhiệm vụ, làm đủ 3 nhiệm vụ trong ngày và thấy điểm tăng đúng. Hôm sau có 3 nhiệm vụ mới. Chưa cần có cấp bậc vẫn đã có giá trị: thói quen tự chăm sóc nhỏ mỗi ngày.

**Acceptance Scenarios**:

1. **Given** người chơi mở Sổ nhiệm vụ lần đầu trong ngày, **When** sổ hiện ra, **Then** có đúng 3 nhiệm vụ thuộc 3 nhóm khác nhau, mỗi nhiệm vụ có mô tả việc cần làm, nơi làm, số điểm và trạng thái (chưa làm / đang làm x/y / xong).
2. **Given** nhiệm vụ "đi tới ao ở vườn sau", **When** người chơi bấm Dẫn đường, **Then** viện hiện chỉ dẫn tới đúng khu và đúng chỗ. Tới nơi thì nhiệm vụ tự hoàn thành.
3. **Given** người chơi đã đạt giới hạn điểm của ngày, **When** họ làm thêm việc khác, **Then** họ vẫn làm được nhưng thấy thông báo nhẹ nhàng: "Hôm nay bạn đã đủ điểm. Nghỉ ngơi cũng là một nhiệm vụ."
4. **Given** nhiệm vụ "ghi cảm xúc hôm nay", **When** người chơi chọn một biểu tượng, **Then** chỉ việc hoàn thành được ghi nhận để tính điểm. Cảm xúc đã chọn không hiện cho ai khác và không dùng để xếp hạng.
5. **Given** người chơi bỏ lỡ vài ngày, **When** họ quay lại, **Then** họ không bị trừ điểm, không mất cấp, và không thấy lời trách móc kiểu "mất chuỗi".

---

### User Story 2 - Thăng cấp theo lộ trình rõ ràng (Priority: P1)

Mọi người chơi bắt đầu là **Bệnh nhân**. Lộ trình gồm 7 bậc:

| Bậc | Chức danh trong game | Điều kiện (mặc định, admin chỉnh được) | Mở khóa |
|---|---|---|---|
| 1 | Bệnh nhân | — | Phòng riêng, nhiệm vụ hằng ngày |
| 2 | Nhân viên lau dọn | 100 điểm + chuỗi "Ngày đầu ở viện" (đi hết sân trước, sảnh, vườn sau, phòng sinh hoạt) | Mini-game Lau dọn, đồng phục xanh |
| 3 | Hộ lý | 400 điểm, 3 ngày có hoạt động + chuỗi "Bàn tay giúp đỡ" | Mini-game Sắp ghế & rót trà ở vòng sinh hoạt, huy hiệu |
| 4 | Điều dưỡng | 1.000 điểm, 7 ngày + chuỗi "Người chăm vườn" | Mini-game Chăm vườn, áo blouse ngắn |
| 5 | Thực tập sinh | 2.000 điểm, 14 ngày + chuỗi "Người dẫn đường" (đón 1 người mới) | Vào Hội đồng, được bỏ phiếu |
| 6 | Trưởng khoa | 3.500 điểm, 28 ngày + chuỗi "Người giữ lửa" (đón thêm 3 người mới, tham gia 3 buổi sinh hoạt) | Được ứng cử Viện trưởng, ghế Hội đồng |
| 7 | Viện trưởng | Do Hội đồng bầu, nhiệm kỳ 1 tuần | Quyền trong game (US5), áo choàng, tên vàng |

Sổ nhiệm vụ luôn có thẻ **"Bước tiếp theo"**. Thẻ hiện cấp kế tiếp, từng điều kiện kèm thanh tiến độ (ví dụ 640/1.000 điểm, 5/7 ngày, chuỗi nhiệm vụ 2/4 bước) và việc nên làm ngay. Khi đủ điều kiện, người chơi được mời tới sảnh chính nhận **lễ thăng cấp**: bác sĩ AI trao huy hiệu, người đang ở gần thấy pháo giấy. Chức danh hiện dưới biệt danh trong mọi khu.

**Why this priority**: Đây là "hành trình rõ ràng" mà người dùng yêu cầu. Thiếu nó thì điểm không có ý nghĩa.

**Independent Test**: Cấp sẵn đủ điểm và số ngày cho một tài khoản thử, làm chuỗi nhiệm vụ của bậc, nhận lễ thăng cấp, rồi kiểm tra chức danh mới hiện cho người chơi khác và đồ mở khóa dùng được.

**Acceptance Scenarios**:

1. **Given** Bệnh nhân mới, **When** mở thẻ Bước tiếp theo, **Then** thấy cấp "Nhân viên lau dọn" kèm 2 điều kiện, tiến độ từng điều kiện và nút tới bước đầu của chuỗi "Ngày đầu ở viện".
2. **Given** người chơi đủ điều kiện, **When** họ tới sảnh nhận lễ, **Then** chức danh đổi ngay. Người chơi khác cùng khu thấy chức danh mới và một hiệu ứng chúc mừng.
3. **Given** người chơi chưa đủ điều kiện, **When** họ xem cấp kế tiếp, **Then** biết chính xác còn thiếu gì. Không có điều kiện nào bị ẩn.
4. **Given** bất kỳ người chơi nào mang chức danh Điều dưỡng, Thực tập sinh hay Trưởng khoa, **When** người khác xem hồ sơ của họ, **Then** có dòng ghi rõ đây là chức danh trong game, không phải nhân viên y tế thật.

---

### User Story 3 - Mini-game công việc theo cấp (Priority: P2)

Mỗi bậc mở ra một công việc nhỏ, chơi được trong 1–3 phút:

- **Lau dọn** (từ bậc 2): lá rụng và giấy vụn xuất hiện ở sân trước, sảnh và vườn sau; đi tới để nhặt. Nhiều người cùng dọn một khu thì cả khu sạch nhanh hơn, và ai cũng được điểm.
- **Sắp ghế & rót trà** (từ bậc 3): trước buổi sinh hoạt theo lịch, xếp ghế ngay ngắn và đặt tách trà lên bàn giữa.
- **Chăm vườn** (từ bậc 4): tưới các bồn hoa trong vườn sau. Hoa lớn dần theo số lần cả viện tưới trong tuần.
- **Đón người mới** (từ bậc 5): khi có người vào viện lần đầu, Thực tập sinh và Trưởng khoa nhận lời mời "dẫn tham quan". Họ dẫn người mới đi qua các khu bằng đường đi có sẵn và có thể dùng câu chào mẫu. Người mới có quyền từ chối.

**Why this priority**: Làm cho mỗi cấp có cảm giác khác nhau và mỗi lần lên cấp đều đáng mong chờ. Tuy vậy, chỉ US1 và US2 thôi đã là một vòng chơi trọn vẹn.

**Independent Test**: Tài khoản bậc 2 chơi xong một lượt Lau dọn ở sảnh và nhận điểm. Một người chơi khác cùng sảnh thấy rác biến mất.

**Acceptance Scenarios**:

1. **Given** Nhân viên lau dọn ở sảnh có rác, **When** họ nhặt hết số rác của lượt, **Then** họ nhận điểm (tính vào giới hạn ngày) và rác biến mất với mọi người trong khu.
2. **Given** Bệnh nhân (bậc 1), **When** họ tới gần rác, **Then** thấy dòng gợi ý "Lên Nhân viên lau dọn để nhận việc này" kèm đường tới thẻ Bước tiếp theo.
3. **Given** người mới vào viện, **When** một Thực tập sinh gửi lời mời dẫn tham quan, **Then** người mới chấp nhận hoặc từ chối được bằng một nút. Từ chối không ảnh hưởng gì tới ai.

---

### User Story 4 - Hội đồng bầu Viện trưởng mỗi tuần (Priority: P2)

Mỗi tuần (giờ Việt Nam) có một vòng bầu cử:

| Thời gian | Bước |
|---|---|
| Thứ Năm 00:00 – Thứ Sáu 23:59 | **Ứng cử**: Trưởng khoa tự ứng cử, kèm lời hứa ngắn (tối đa 200 ký tự, qua kiểm duyệt như tin nhắn công khai) và tối đa 3 việc định làm, chọn từ danh sách quyền ở US5. |
| Thứ Bảy 00:00 – Chủ Nhật 20:00 | **Bỏ phiếu**: mỗi thành viên Hội đồng (Thực tập sinh và Trưởng khoa) bỏ 1 phiếu kín. Được đổi phiếu tới khi đóng. |
| Chủ Nhật 20:00 | **Công bố** kết quả trên bảng tin ở sảnh chính. |
| Thứ Hai 00:00 | Nhiệm kỳ mới bắt đầu. |

Phòng Hội đồng là một căn phòng trong viện, có bảng ứng viên và hòm phiếu, mở cho mọi người xem. Chỉ thành viên Hội đồng được bỏ phiếu.

**Why this priority**: Tạo mục tiêu dài hạn và nội dung xã hội cho người chơi lâu năm. Cần có US2 (cấp bậc) trước.

**Independent Test**: Tạo 1 Trưởng khoa ứng cử và 3 thành viên Hội đồng bỏ phiếu, rồi tua tới giờ đóng. Kết quả được công bố, người thắng thành Viện trưởng từ thứ Hai, tên hiện trên bảng ở sảnh.

**Acceptance Scenarios**:

1. **Given** đang trong thời gian ứng cử, **When** Trưởng khoa gửi lời hứa có lời xúc phạm, **Then** lời hứa bị từ chối kèm lý do, giống tin nhắn ở vòng sinh hoạt.
2. **Given** đang trong thời gian bỏ phiếu, **When** một Thực tập sinh bỏ phiếu, **Then** phiếu được ghi kín. Không ai, kể cả Viện trưởng đương nhiệm, xem được ai bầu cho ai; chỉ thấy tổng số phiếu sau khi công bố.
3. **Given** Viện trưởng tuần này, **When** tuần sau mở ứng cử, **Then** người này không ứng cử được và thấy lý do "nghỉ một nhiệm kỳ".
4. **Given** hai ứng viên bằng phiếu, **When** công bố, **Then** người thắng là người tích lũy nhiều điểm cống hiến hơn trong 4 tuần gần nhất. Nếu vẫn bằng thì bốc thăm, và cách phân định được ghi rõ trên bảng.
5. **Given** không có ứng viên hoặc có ít hơn 3 phiếu hợp lệ, **When** công bố, **Then** tuần đó "ghế Viện trưởng để trống", chủ đề tuần do quản trị viên chọn, và bảng tin ghi rõ như vậy.
6. **Given** một tài khoản tạo chưa đủ 14 ngày hoặc đang bị khóa, **When** tài khoản đó cố bỏ phiếu, **Then** không bỏ được.

---

### User Story 5 - Một tuần làm Viện trưởng (Priority: P3)

Viện trưởng có **bàn làm việc** trong phòng Viện trưởng ở khối giữa, ngay dưới mái vòm. Trong nhiệm kỳ, Viện trưởng có các quyền sau:

- **Chủ đề tuần**: chọn 1 trong danh sách chủ đề đã duyệt sẵn, ví dụ "Giấc ngủ", "Biết ơn", "Kết nối". Chủ đề gợi ý cho các buổi sinh hoạt và hiện ở sảnh.
- **3 nhiệm vụ tuần cho cả viện**: chọn từ danh sách mẫu, ví dụ "Cả viện tưới 500 lượt hoa" hay "300 người làm bài thở". Hoàn thành thì mọi người góp sức đều được thưởng.
- **Trang trí**: chọn bảng màu, đèn lồng, cờ và hoa cho sảnh, sân trước và vườn sau từ các bộ có sẵn.
- **Thông báo toàn viện**: tối đa 1 thông báo mỗi ngày, mỗi thông báo tối đa 200 ký tự, qua kiểm duyệt.
- **Bổ nhiệm 2 Trưởng khoa danh dự** cho tuần đó: một danh hiệu hiển thị, không có quyền bầu.
- **Biểu tượng**: áo choàng, tên màu vàng, ghế riêng ở sảnh. Hết nhiệm kỳ, người đó vào "Bảng vàng Viện trưởng" vĩnh viễn.

Viện trưởng **không** có các quyền sau:

- xem trò chuyện riêng, cờ khủng hoảng, báo cáo hay email của bất kỳ ai;
- khóa, cấm, tắt tiếng hay đổi cấp người khác;
- đổi quy tắc an toàn, model AI, đường dây nóng hay điều khoản.

**Why this priority**: Là phần thưởng đỉnh cao, nhưng chỉ có ý nghĩa khi đã có người chơi lâu năm.

**Independent Test**: Đặt một tài khoản làm Viện trưởng, chọn chủ đề, nhiệm vụ tuần và bộ trang trí. Người chơi khác thấy sảnh đổi trang trí và nhiệm vụ tuần mới trong Sổ nhiệm vụ.

**Acceptance Scenarios**:

1. **Given** Viện trưởng chọn bộ trang trí "Đèn lồng Trung thu", **When** người khác vào sảnh, **Then** thấy trang trí mới.
2. **Given** Viện trưởng gửi thông báo thứ hai trong ngày, **When** bấm gửi, **Then** bị từ chối kèm giờ được gửi lần tới.
3. **Given** Viện trưởng tìm cách mở xem dữ liệu hay khóa người khác, **When** họ thao tác, **Then** không có chức năng nào như vậy trong giao diện, và máy chủ cũng từ chối.
4. **Given** Viện trưởng vi phạm quy tắc cộng đồng và bị quản trị viên khóa, **When** việc khóa có hiệu lực, **Then** họ mất chức ngay, ghế để trống tới hết tuần, và các trang trí họ đã chọn được giữ nguyên.

### Edge Cases

- Người chơi xóa tài khoản giữa nhiệm kỳ Viện trưởng hoặc khi đang là ứng viên: ghế hoặc tư cách ứng viên bị hủy, các phiếu đã bỏ cho họ bị bỏ qua, bảng vàng không ghi tên.
- Hai thiết bị cùng hoàn thành một nhiệm vụ: chỉ tính điểm một lần.
- Đồng hồ máy người chơi sai giờ: ngày mới và thời gian bầu cử luôn tính theo giờ máy chủ (giờ Việt Nam).
- Quản trị viên đổi ngưỡng điểm của một bậc: người đã ở bậc đó không bị hạ cấp; người chưa lên thì áp ngưỡng mới.
- Nhiều tài khoản phụ nhặt lời cảm ơn hoặc phiếu cho nhau: mỗi cặp người chỉ tính lời cảm ơn 1 lần mỗi ngày; muốn bỏ phiếu phải có tài khoản từ 14 ngày tuổi và đang ở bậc 5 trở lên. Điều này cũng ngăn tạo tài khoản ồ ạt để thắng cử.
- Người chơi đang bị khóa tạm thời: không nhận điểm, không bỏ phiếu, không ứng cử được trong thời gian bị khóa. Cấp bậc vẫn giữ.
- Người chơi đang khủng hoảng (vừa nhận thông tin hỗ trợ): không bị nhắc nhiệm vụ trong phần còn lại của phiên chơi đó; Sổ nhiệm vụ ưu tiên gợi ý "Cần giúp đỡ ngay" và bài thở.
- Vòng tiếng Anh và tiếng Việt: mọi chức danh, nhiệm vụ, lời hứa mẫu và thông báo hệ thống đều có cả hai ngôn ngữ. Lời hứa và thông báo do người chơi viết giữ nguyên ngôn ngữ gốc.

## Requirements *(mandatory)*

### Functional Requirements

**Điểm và nhiệm vụ**

- **FR-001**: Hệ thống MUST giao cho mỗi người chơi 3 nhiệm vụ hằng ngày thuộc 3 nhóm khác nhau (tự chăm sóc, cộng đồng, khám phá). Nhiệm vụ đổi mới lúc 00:00 giờ Việt Nam.
- **FR-002**: Mỗi nhiệm vụ MUST ghi rõ việc cần làm, nơi làm, số điểm thưởng và tiến độ. Nhiệm vụ có địa điểm MUST có nút Dẫn đường.
- **FR-003**: Hệ thống MUST tự xác nhận hoàn thành nhiệm vụ dựa trên hành động thật trong game (đến nơi, ngồi đủ thời gian, làm xong bài thở…), không dựa trên việc người chơi tự khai.
- **FR-004**: Điểm cống hiến nhận được mỗi ngày MUST có giới hạn (mặc định 100). Vượt giới hạn thì vẫn chơi tiếp được nhưng không cộng điểm.
- **FR-005**: Hệ thống MUST NOT trừ điểm, hạ cấp hay phạt vì không đăng nhập. Hệ thống MUST NOT thưởng điểm theo thời gian online đơn thuần.
- **FR-006**: Nội dung người chơi nhập trong nhiệm vụ tự chăm sóc (cảm xúc, dòng biết ơn) MUST là riêng tư như dữ liệu trò chuyện: chỉ chủ tài khoản xem được, tự xóa được, không dùng để xếp hạng hay hiện cho ai.
- **FR-007**: Hệ thống MUST NOT có bảng xếp hạng điểm công khai. Người khác chỉ thấy chức danh và huy hiệu.
- **FR-008**: Lời cảm ơn giữa hai người chơi MUST chỉ được tính điểm 1 lần mỗi ngày cho mỗi cặp người, và MUST NOT tính khi một bên đã chặn bên kia.

**Cấp bậc**

- **FR-009**: Hệ thống MUST có 7 bậc theo thứ tự ở US2. Điều kiện của bậc 2–6 gồm ngưỡng điểm, số ngày có hoạt động và một chuỗi nhiệm vụ thăng cấp. Quản trị viên chỉnh được các ngưỡng này.
- **FR-010**: Thẻ "Bước tiếp theo" MUST hiện mọi điều kiện của bậc kế tiếp, mỗi điều kiện kèm tiến độ.
- **FR-011**: Thăng cấp MUST diễn ra qua lễ thăng cấp ở sảnh chính. Chức danh mới MUST hiện ngay cho người chơi khác.
- **FR-012**: Chức danh có tên nghề y tế MUST đi kèm ghi chú "chức danh trong game, không phải nhân viên y tế thật" trên hồ sơ. Người chơi MUST NOT được hệ thống gọi hay trình bày như người có chuyên môn.
- **FR-013**: Quản trị viên MUST hạ cấp hoặc tước tư cách Hội đồng được khi có vi phạm, kèm lý do ghi lại.

**Mini-game**

- **FR-014**: Mỗi bậc từ 2 tới 5 MUST mở một mini-game công việc chơi trong 1–3 phút (Lau dọn, Sắp ghế & rót trà, Chăm vườn, Đón người mới). Kết quả mini-game nhiều người MUST đồng bộ cho mọi người trong khu.
- **FR-015**: Lời mời "dẫn tham quan" MUST để người mới chấp nhận hoặc từ chối được. Lời chào mặc định MUST là câu mẫu; tin tự viết MUST qua kiểm duyệt như vòng sinh hoạt.

**Hội đồng và bầu cử**

- **FR-016**: Hội đồng MUST gồm người chơi bậc 5–6 có tài khoản từ 14 ngày tuổi trở lên và không bị khóa.
- **FR-017**: Bầu cử MUST diễn ra mỗi tuần theo lịch ở US4, tính theo giờ Việt Nam.
- **FR-018**: Chỉ Trưởng khoa (bậc 6) MUST được ứng cử. Lời hứa ứng cử MUST qua kiểm duyệt nội dung công khai. Viện trưởng tuần trước MUST NOT được ứng cử tuần kế tiếp.
- **FR-019**: Phiếu bầu MUST là phiếu kín. Chỉ tổng số phiếu được công bố sau khi đóng. Quản trị viên chỉ xem được danh sách người đã bỏ phiếu để điều tra gian lận, không xem được họ bầu cho ai.
- **FR-020**: Cách phân định khi hòa phiếu và quy tắc "ghế để trống" (không có ứng viên hoặc ít hơn 3 phiếu hợp lệ) MUST áp dụng như ở US4 và MUST được ghi trên bảng kết quả.
- **FR-021**: Kết quả và danh sách Viện trưởng các tuần ("Bảng vàng") MUST hiện ở sảnh chính cho mọi người. Bảng vàng chỉ ghi biệt danh.

**Viện trưởng**

- **FR-022**: Viện trưởng MUST có đúng các quyền trong game liệt kê ở US5 và MUST NOT có bất kỳ quyền nào ngoài danh sách đó. Mọi quyền MUST được máy chủ kiểm tra, không chỉ ẩn trong giao diện.
- **FR-023**: Thông báo toàn viện MUST qua kiểm duyệt nội dung công khai, tối đa 1 lần mỗi ngày, mỗi lần tối đa 200 ký tự.
- **FR-024**: Chủ đề tuần, nhiệm vụ tuần và bộ trang trí MUST chọn từ danh sách quản trị viên đã duyệt sẵn, có đủ bản tiếng Việt và tiếng Anh.
- **FR-025**: Khi Viện trưởng bị khóa, xóa tài khoản hoặc bị quản trị viên phế truất, ghế MUST để trống tới hết tuần và bảng tin MUST ghi "ghế để trống".
- **FR-026**: Mọi hành động của Viện trưởng (đổi chủ đề, trang trí, thông báo, bổ nhiệm) MUST được ghi nhật ký để quản trị viên xem lại.

**Chung**

- **FR-027**: Mọi chữ hiển thị của tính năng này MUST có cả tiếng Việt và tiếng Anh.
- **FR-028**: Nút "Cần giúp đỡ ngay" MUST luôn hiện trên Sổ nhiệm vụ, phòng Hội đồng và phòng Viện trưởng. Ngay sau khi người chơi nhận thông tin hỗ trợ khủng hoảng, hệ thống MUST NOT gửi lời nhắc nhiệm vụ cho họ trong phần còn lại của phiên chơi.
- **FR-029**: Viện trưởng có nhiệm kỳ đúng 1 tuần (thứ Hai 00:00 – Chủ Nhật 23:59 giờ Việt Nam) và dùng chung cho cả cộng đồng tiếng Việt lẫn tiếng Anh. Người chơi nói tiếng Anh vẫn ứng cử và bỏ phiếu bình thường; chủ đề, nhiệm vụ và trang trí là các mục chọn sẵn đã có đủ hai ngôn ngữ.

### Key Entities

- **Điểm cống hiến (Contribution ledger)**: từng khoản điểm của người chơi (nguồn, nhiệm vụ, ngày, số điểm). Cho biết tổng điểm, điểm trong ngày và điểm 4 tuần gần nhất (dùng phân định hòa phiếu).
- **Nhiệm vụ (Quest)**: mẫu nhiệm vụ (nhóm, điều kiện hoàn thành, nơi chốn, điểm, chuỗi nhiệm vụ nếu có, nội dung 2 ngôn ngữ). Giao cho người chơi thành **Nhiệm vụ của tôi**: trạng thái, tiến độ, ngày giao.
- **Cấp bậc (Rank)**: bậc 1–7, điều kiện, đồ mở khóa. Người chơi có bậc hiện tại, lịch sử thăng/hạ cấp kèm lý do, số ngày có hoạt động.
- **Nhật ký tự chăm sóc (Self-care entry)**: cảm xúc hoặc dòng biết ơn của riêng người chơi, là dữ liệu nhạy cảm.
- **Kỳ bầu cử (Election)**: tuần, mốc thời gian, trạng thái (ứng cử / bỏ phiếu / đã công bố / ghế trống), danh sách **ứng viên** (lời hứa, 3 việc định làm), **phiếu** (kín), kết quả và cách phân định.
- **Nhiệm kỳ Viện trưởng (Term)**: người giữ, tuần, chủ đề, nhiệm vụ tuần, bộ trang trí, thông báo, Trưởng khoa danh dự, nhật ký hành động, lý do kết thúc sớm (nếu có).
- **Danh mục chọn sẵn (Catalog)**: chủ đề, mẫu nhiệm vụ tuần, bộ trang trí do quản trị viên duyệt, mỗi mục có 2 ngôn ngữ.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Trong thử nghiệm với người chơi mới, ít nhất 90% nói đúng "mình cần làm gì để lên cấp tiếp theo" trong vòng 1 phút sau khi mở Sổ nhiệm vụ.
- **SC-002**: Người chơi mới lên được Nhân viên lau dọn ngay trong ngày đầu nếu chơi khoảng 20 phút.
- **SC-003**: Người chơi đều đặn (khoảng 20–30 phút mỗi ngày, 5 ngày mỗi tuần) lên tới Trưởng khoa trong khoảng 6–8 tuần. Không ai lên Trưởng khoa trong dưới 28 ngày.
- **SC-004**: Tỉ lệ người chơi quay lại vào ngày thứ 7 tăng ít nhất 20% so với trước khi có tính năng, trong khi thời gian chơi trung bình mỗi ngày không vượt 45 phút.
- **SC-005**: 100% số tuần có bầu cử ra được kết quả hoặc "ghế để trống" đúng giờ công bố, không cần quản trị viên can thiệp bằng tay.
- **SC-006**: Không có quyền nào của Viện trưởng cho phép xem dữ liệu riêng của người khác hay khóa người khác. Kiểm thử bảo mật thử mọi thao tác ngoài danh sách đều bị máy chủ từ chối.
- **SC-007**: 0 trường hợp lời hứa ứng cử hoặc thông báo của Viện trưởng có nội dung xúc phạm hay có hại lọt ra công khai, dùng cùng ngưỡng kiểm duyệt với vòng sinh hoạt (≥ 95% tin xấu bị chặn trên bộ mẫu).
- **SC-008**: Trong khảo sát, ít nhất 70% người chơi đánh giá nhiệm vụ hằng ngày là "dễ chịu" hoặc "có ích", và dưới 10% thấy "áp lực".

## Assumptions

- Ngưỡng điểm, số ngày và giới hạn 100 điểm/ngày ở US2 là mặc định để có lộ trình khoảng 6–8 tuần tới Trưởng khoa; quản trị viên chỉnh được sau khi xem số liệu thử nghiệm.
- "Ngày có hoạt động" là ngày người chơi hoàn thành ít nhất 1 nhiệm vụ, không phải ngày chỉ đăng nhập.
- Điểm, cấp bậc và bầu cử không có giá trị tiền tệ, không mua được bằng tiền và không đổi ra tiền.
- Ở giai đoạn thử nghiệm kín ít người, ghế Viện trưởng có thể để trống nhiều tuần. Đây là hành vi đúng, không phải lỗi.
- Phòng Hội đồng và phòng Viện trưởng là phòng mới trong khối giữa (dưới mái vòm) theo bố cục 1815 (research.md §R18 của 001). Tạm dựng bằng khối hình như các khu hiện có.
- Mini-game Lau dọn và Chăm vườn dùng các khu sẵn có (sân trước, sảnh, vườn sau) và không cần khu mới.
- Bài thở 3 phút là hoạt động hướng dẫn có sẵn trong game (đếm nhịp, có hình), không phải bài trị liệu.
- Tính năng này dựa trên 001: đăng nhập, khu chung realtime, vòng sinh hoạt, pipeline kiểm duyệt và trang admin.
