import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createPalettePainter } from "./palette.js";

// A turntable showing one car. `style` is { modelUrl, paintMode, paintRegion }.
// Used by the booking form (which swaps styles and colours as the customer chooses), by the
// request page (one car in the colour that was booked) and by the All Cars showroom.
// `distance` is how far the camera sits, as a multiple of the car's largest dimension.
export function createCarStage(container, { distance: distanceFactor = 1.8, interactive = true, autoRotateSpeed = 1.6, lightBoost = 1 } = {}) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 4 / 3, 0.1, 100);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.appendChild(renderer.domElement);

  scene.add(new THREE.AmbientLight(0xffffff, 0.55 * lightBoost));
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d2c0, 0.75 * lightBoost));
  const keyLight = new THREE.DirectionalLight(0xffffff, 1.2 * lightBoost);
  keyLight.position.set(5, 10, 7);
  scene.add(keyLight);
  if (lightBoost > 1) {
    const fillLight = new THREE.DirectionalLight(0xa9e8f2, 1.1 * (lightBoost - 1));
    fillLight.position.set(-6, 4, -5);
    scene.add(fillLight);
  }

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.enableDamping = true;
  controls.autoRotate = true;
  controls.autoRotateSpeed = autoRotateSpeed;
  controls.minPolarAngle = Math.PI * 0.22;
  controls.maxPolarAngle = Math.PI * 0.52;
  // A purely ambient/background stage (e.g. the homepage hero) spins on its own and never
  // takes pointer input, so clicks and drags pass straight through to whatever sits on top.
  controls.enabled = interactive;
  // OrbitControls blocks all touch gestures; let vertical swipes keep scrolling the page.
  renderer.domElement.style.touchAction = "pan-y";

  let resumeSpin = null;
  controls.addEventListener("start", () => {
    controls.autoRotate = false;
    clearTimeout(resumeSpin);
  });
  controls.addEventListener("end", () => {
    resumeSpin = setTimeout(() => (controls.autoRotate = true), 3500);
  });

  function resize() {
    const { clientWidth: width, clientHeight: height } = container;
    if (!width || !height) return;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(container);
  resize();

  const loader = new GLTFLoader();
  const loaded = new Map();
  let current = null;
  let painter = null;
  let latest = null;

  function loadModel(url) {
    if (!loaded.has(url)) {
      loaded.set(
        url,
        new Promise((resolve, reject) => loader.load(url, (gltf) => resolve(gltf.scene), undefined, reject))
      );
    }
    return loaded.get(url);
  }

  function frame(model) {
    const box = new THREE.Box3().setFromObject(model);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const distance = Math.max(size.x, size.y, size.z) * distanceFactor;
    controls.target.copy(center);
    camera.position.set(center.x + distance * 0.72, center.y + distance * 0.34, center.z + distance * 0.78);
    camera.lookAt(center);
    controls.update();
  }

  async function showStyle(style) {
    latest = style;
    let template;
    try {
      template = await loadModel(style.modelUrl);
    } catch (error) {
      console.error("Couldn't load the car model:", error);
      return false;
    }
    if (latest !== style) return false;

    if (current) scene.remove(current);
    current = template.clone(true);
    // Each car gets its own materials so recoloring one never leaks into the next.
    current.traverse((child) => {
      if (child.isMesh) child.material = child.material.clone();
    });
    scene.add(current);
    painter = style.paintMode === "palette" ? createPalettePainter(current, style.paintRegion) : null;
    frame(current);
    container.classList.add("is-live");
    return true;
  }

  function setColor(hex) {
    if (painter && hex) painter.paint(hex);
  }

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  return { showStyle, setColor };
}
