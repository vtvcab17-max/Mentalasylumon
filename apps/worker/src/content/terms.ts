/**
 * Điều khoản hiện hành (FR-002, R14, Constitution II–IV). Đổi nội dung → tăng `terms_version` trong settings
 * để mọi người chơi đồng ý lại. Đây là bản cho thử nghiệm kín; cần luật sư duyệt trước khi mở công khai.
 */

export interface Terms {
  sections: { title: string; body: string }[];
  consentItems: { key: "ai_disclosure" | "sensitive_data" | "admin_flag_review" | "overseas_ai_processing"; label: string; required: true }[];
}

export const TERMS: Record<"vi" | "en", Terms> = {
  vi: {
    sections: [
      {
        title: "Bác sĩ ở đây là AI",
        body: "Mọi bác sĩ trong Bệnh viện tâm thần online là nhân vật trí tuệ nhân tạo (AI), không phải bác sĩ hay chuyên gia tâm lý thật. Bác sĩ AI không chẩn đoán bệnh, không kê đơn và không thay thế việc khám chữa bệnh.",
      },
      {
        title: "Chỉ dành cho người từ 18 tuổi",
        body: "Bạn cần từ 18 tuổi trở lên để sử dụng. Đây là bản thử nghiệm kín, chưa phải dịch vụ chính thức.",
      },
      {
        title: "Khi bạn cần giúp đỡ ngay",
        body: "Nếu bạn đang gặp nguy hiểm, hãy gọi 115 hoặc đến phòng cấp cứu gần nhất. Nút \"Cần giúp đỡ ngay\" luôn hiện trên mọi màn hình.",
      },
      {
        title: "Dữ liệu nhạy cảm",
        body: "Những gì bạn kể với bác sĩ AI có thể là thông tin về sức khỏe — đây là dữ liệu cá nhân nhạy cảm. Nội dung được mã hóa, chỉ bạn xem được, không dùng cho quảng cáo và không bán cho ai. Bạn có thể xóa lịch sử hoặc xóa tài khoản bất cứ lúc nào.",
      },
      {
        title: "Khi có dấu hiệu khủng hoảng",
        body: "Nếu tin nhắn của bạn cho thấy dấu hiệu tự hại, tự tử, bạo lực hoặc bị xâm hại, đoạn trò chuyện đó (chỉ đoạn đó) được gắn cờ để một quản trị viên là người thật xem lại. Mỗi lần xem đều được ghi lại.",
      },
      {
        title: "Xử lý bởi nhà cung cấp AI ở nước ngoài",
        body: "Để bác sĩ AI trả lời, tin nhắn của bạn được gửi tới nhà cung cấp mô hình AI (Anthropic, Hoa Kỳ) qua Cloudflare. Biệt danh của bạn không đi kèm.",
      },
    ],
    consentItems: [
      { key: "ai_disclosure", label: "Tôi hiểu bác sĩ ở đây là AI, không phải bác sĩ thật và không thay thế khám chữa bệnh.", required: true },
      { key: "sensitive_data", label: "Tôi đồng ý để hệ thống xử lý dữ liệu nhạy cảm (thông tin về sức khỏe tinh thần) tôi chia sẻ.", required: true },
      { key: "admin_flag_review", label: "Tôi đồng ý để quản trị viên xem lại đoạn trò chuyện bị gắn cờ khủng hoảng.", required: true },
      { key: "overseas_ai_processing", label: "Tôi đồng ý để tin nhắn được gửi tới nhà cung cấp AI ở nước ngoài để tạo câu trả lời.", required: true },
    ],
  },
  en: {
    sections: [
      {
        title: "The doctors here are AI",
        body: "Every doctor in the Online Mental Hospital is an artificial-intelligence (AI) character, not a real doctor or psychologist. AI doctors do not diagnose, do not prescribe and do not replace medical care.",
      },
      { title: "Adults only", body: "You must be 18 or older. This is a closed test, not an official service." },
      {
        title: "If you need help now",
        body: "If you are in danger, call 115 or go to the nearest emergency room. The \"Get help now\" button is on every screen.",
      },
      {
        title: "Sensitive data",
        body: "What you tell the AI doctor may be health information — sensitive personal data. It is encrypted, only you can see it, it is never used for ads or sold. You can delete your history or your account at any time.",
      },
      {
        title: "Signs of crisis",
        body: "If your messages show signs of self-harm, suicide, violence or abuse, that part of the conversation (and only that part) is flagged for review by a human administrator. Every view is logged.",
      },
      {
        title: "Processing by an overseas AI provider",
        body: "To generate replies, your messages are sent to the AI model provider (Anthropic, USA) through Cloudflare. Your nickname is not included.",
      },
    ],
    consentItems: [
      { key: "ai_disclosure", label: "I understand the doctors here are AI, not real doctors, and do not replace medical care.", required: true },
      { key: "sensitive_data", label: "I agree to the processing of sensitive (mental-health) information I share.", required: true },
      { key: "admin_flag_review", label: "I agree that an administrator may review conversation excerpts flagged for crisis.", required: true },
      { key: "overseas_ai_processing", label: "I agree that my messages are sent to an overseas AI provider to generate replies.", required: true },
    ],
  },
};
