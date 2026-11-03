import * as THREE from "three";
import { Engine } from "./engine/renderer";
import { getLocale, onLocaleChange, t } from "./i18n";
import { mountHelpButton } from "./ui/help-button";

// Nút hỗ trợ khẩn cấp gắn trước tiên, độc lập với mọi phần khác (Constitution I).
mountHelpButton();

document.documentElement.lang = getLocale();
const setTitle = () => (document.title = t("app.title"));
setTitle();
onLocaleChange(setTitle);

// Cảnh tạm cho tới khi có thế giới thật (US1/US2).
const engine = new Engine(document.querySelector<HTMLCanvasElement>("#scene")!);
engine.camera.position.set(0, 2, 5);
engine.camera.lookAt(0, 0.8, 0);
engine.scene.add(new THREE.HemisphereLight("#ffffff", "#c9b89a", 1.2));
const sun = new THREE.DirectionalLight("#ffffff", 1);
sun.position.set(3, 6, 4);
engine.scene.add(sun);
const placeholder = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.4, 0.4, 8, 16),
  new THREE.MeshStandardMaterial({ color: "#8fc1b5" }),
);
placeholder.position.y = 0.8;
engine.scene.add(placeholder);
engine.onFrame((dt) => (placeholder.rotation.y += dt * 0.7));
