import * as THREE from "three";

// Setup (T003): cảnh 3D tối thiểu để kiểm tra build. Renderer thật ở T038.
const canvas = document.querySelector<HTMLCanvasElement>("#scene")!;
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.background = new THREE.Color("#f4efe6");
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 100);
camera.position.set(0, 2, 5);

scene.add(new THREE.HemisphereLight("#ffffff", "#c9b89a", 1.2));
const placeholder = new THREE.Mesh(
  new THREE.CapsuleGeometry(0.4, 0.4, 8, 16),
  new THREE.MeshStandardMaterial({ color: "#8fc1b5" }),
);
placeholder.position.y = 0.8;
scene.add(placeholder);

function resize() {
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
}
window.addEventListener("resize", resize);
resize();

renderer.setAnimationLoop((t) => {
  placeholder.rotation.y = t / 1500;
  renderer.render(scene, camera);
});
