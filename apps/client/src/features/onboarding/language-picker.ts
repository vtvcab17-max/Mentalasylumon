import { getLocale, setLocale, t, type Locale } from "../../i18n";
import { h, screen } from "../../ui/dom";

/** Màn đầu tiên, trước đăng nhập: chọn Tiếng Việt / English (T054, FR-036). */
export function showLanguagePicker(root: HTMLElement): Promise<Locale> {
  return new Promise((resolve) => {
    const choose = (l: Locale) => {
      setLocale(l);
      close();
      resolve(l);
    };
    // Tiêu đề hiện cả hai thứ tiếng, vì người dùng chưa chọn.
    const close = screen(
      root,
      h(
        "div",
        {},
        h("h1", {}, "Chọn ngôn ngữ · Choose your language"),
        h("p", { class: "bvo-muted" }, "Bạn có thể đổi lại trong cài đặt · You can change this in settings."),
        ...(["vi", "en"] as const).map((l) =>
          h(
            "button",
            { class: `bvo-btn ${l === getLocale() ? "" : "secondary"}`, type: "button", lang: l, on: { click: () => choose(l) } },
            t(`lang.${l}`),
          ),
        ),
      ),
    );
  });
}
