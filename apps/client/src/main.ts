import { startApp } from "./app";
import { Engine } from "./engine/renderer";
import { getLocale, onLocaleChange, t } from "./i18n";
import { injectStyles } from "./ui/styles";
import { mountHelpButton } from "./ui/help-button";

// Nút hỗ trợ khẩn cấp gắn trước tiên, độc lập với mọi phần khác (Constitution I).
mountHelpButton();
injectStyles();

document.documentElement.lang = getLocale();
const setTitle = () => (document.title = t("app.title"));
setTitle();
onLocaleChange(setTitle);

const engine = new Engine(document.querySelector<HTMLCanvasElement>("#scene")!);
void startApp(document.querySelector<HTMLElement>("#ui")!, engine);
