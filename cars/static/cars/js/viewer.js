import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

const carData = JSON.parse(document.getElementById("car-data").textContent);
const viewerEl = document.getElementById("viewer");

const optionsByType = {};
carData.options.forEach((option) => {
  if (!optionsByType[option.option_type]) optionsByType[option.option_type] = [];
  optionsByType[option.option_type].push(option);
});

const selectedOptionIds = new Set();

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x050506);

const camera = new THREE.PerspectiveCamera(
  45,
  viewerEl.clientWidth / viewerEl.clientHeight,
  0.1,
  1000
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(viewerEl.clientWidth, viewerEl.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
viewerEl.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Idle cursor drift: when the user isn't actively dragging, the camera gently
// leans toward the cursor around a "rest" angle. OrbitControls re-derives its
// own spherical state from camera.position on every update(), so nudging the
// camera directly here (while controls.enabled stays true) is picked up
// automatically the next time the user starts a drag — no state to reconcile.
const IDLE_MAX_AZIMUTH = THREE.MathUtils.degToRad(10);
const IDLE_MAX_POLAR = THREE.MathUtils.degToRad(6);
let isDragging = false;
let restAzimuth = 0;
let restPolar = Math.PI / 2;
const pointerNDC = { x: 0, y: 0 };

function captureRestAngles() {
  restAzimuth = controls.getAzimuthalAngle();
  restPolar = controls.getPolarAngle();
}

function applyIdleDrift() {
  if (!carRoot) return;
  const radius = camera.position.distanceTo(controls.target);
  const azimuth = restAzimuth - pointerNDC.x * IDLE_MAX_AZIMUTH;
  const polar = THREE.MathUtils.clamp(
    restPolar - pointerNDC.y * IDLE_MAX_POLAR,
    0.15,
    Math.PI - 0.15
  );
  const offset = new THREE.Vector3().setFromSpherical(
    new THREE.Spherical(radius, polar, azimuth)
  );
  const desired = controls.target.clone().add(offset);
  camera.position.lerp(desired, 0.06);
  camera.lookAt(controls.target);
}

controls.addEventListener("start", () => {
  isDragging = true;
});
controls.addEventListener("end", () => {
  isDragging = false;
  captureRestAngles();
});
viewerEl.addEventListener("pointermove", (event) => {
  const rect = viewerEl.getBoundingClientRect();
  pointerNDC.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointerNDC.y = ((event.clientY - rect.top) / rect.height) * 2 - 1;
});
viewerEl.addEventListener("pointerleave", () => {
  pointerNDC.x = 0;
  pointerNDC.y = 0;
});

scene.add(new THREE.AmbientLight(0xffffff, 0.6));
const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
keyLight.position.set(5, 10, 7);
scene.add(keyLight);

let carRoot = null;

function frameCameraFromDirection(direction) {
  if (!carRoot) return;
  const box = new THREE.Box3().setFromObject(carRoot);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  const distance = maxDim * 1.8;

  camera.position.copy(center.clone().add(direction.clone().normalize().multiplyScalar(distance)));
  camera.lookAt(center);
  controls.target.copy(center);
  controls.update();
  captureRestAngles();
}

const VIEW_DIRECTIONS = {
  front: new THREE.Vector3(0, 0.2, 1),
  rear: new THREE.Vector3(0, 0.2, -1),
  left: new THREE.Vector3(-1, 0.2, 0),
  right: new THREE.Vector3(1, 0.2, 0),
  top: new THREE.Vector3(0, 1, 0.01),
  bottom: new THREE.Vector3(0, -1, 0.01),
};

function addViewPresetButtons() {
  const bar = document.createElement("div");
  bar.className = "view-presets";
  Object.keys(VIEW_DIRECTIONS).forEach((name) => {
    const btn = document.createElement("button");
    btn.textContent = name[0].toUpperCase() + name.slice(1);
    btn.addEventListener("click", () => frameCameraFromDirection(VIEW_DIRECTIONS[name]));
    bar.appendChild(btn);
  });
  viewerEl.appendChild(bar);
}

// Used until a car has a real .glb file uploaded (see Car.model_file in cars/models.py).
// Named parts mirror the mesh_name values used by CustomizationOption rows, so live
// customization (Task 8) works identically against this or a real sourced model.
function createPlaceholderCar() {
  const car = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.8, 4.2),
    new THREE.MeshStandardMaterial({ color: 0xdddddd })
  );
  body.name = "Body";
  body.position.set(0, 0.8, 0);
  car.add(body);

  const interior = new THREE.Mesh(
    new THREE.BoxGeometry(1.6, 0.3, 2.2),
    new THREE.MeshStandardMaterial({ color: 0x333333 })
  );
  interior.name = "Interior";
  interior.position.set(0, 1.35, -0.2);
  car.add(interior);

  const wheelPositions = {
    FL: [-1.05, 0.4, 1.4],
    FR: [1.05, 0.4, 1.4],
    RL: [-1.05, 0.4, -1.4],
    RR: [1.05, 0.4, -1.4],
  };

  function addWheelSet(prefix, radius, width, color, visible) {
    Object.entries(wheelPositions).forEach(([corner, pos]) => {
      const wheel = new THREE.Mesh(
        new THREE.CylinderGeometry(radius, radius, width, 20),
        new THREE.MeshStandardMaterial({ color })
      );
      wheel.name = `${prefix}_${corner}`;
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(...pos);
      wheel.visible = visible;
      car.add(wheel);
    });
  }

  addWheelSet("Wheel_Sport", 0.42, 0.32, 0x222222, true);
  addWheelSet("Wheel_Offroad", 0.5, 0.4, 0x111111, false);

  function addExhaust(name, radius, length, position, visible) {
    const pipe = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius, length, 12),
      new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.6, roughness: 0.4 })
    );
    pipe.name = name;
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(...position);
    pipe.visible = visible;
    car.add(pipe);
  }

  addExhaust("Exhaust_Standard", 0.08, 0.4, [0.4, 0.35, -2.15], true);
  addExhaust("Exhaust_Sport", 0.12, 0.5, [0.4, 0.35, -2.2], false);

  return car;
}

function applyOption(option) {
  if (!carRoot) return;
  const target = carRoot.getObjectByName(option.mesh_name);
  if (!target) {
    console.warn(`Mesh "${option.mesh_name}" not found in this car's model.`);
    return;
  }

  if (option.option_type === "paint" || option.option_type === "interior") {
    target.material = target.material.clone();
    target.material.color.set(option.color_hex);
  } else if (option.option_type === "decal") {
    new THREE.TextureLoader().load(option.texture_url, (texture) => {
      texture.colorSpace = THREE.SRGBColorSpace;
      target.material = target.material.clone();
      target.material.map = texture;
      target.material.needsUpdate = true;
    });
  } else if (option.option_type === "wheels" || option.option_type === "exhaust") {
    optionsByType[option.option_type].forEach((sibling) => {
      const siblingMesh = carRoot.getObjectByName(sibling.mesh_name);
      if (siblingMesh) siblingMesh.visible = sibling.id === option.id;
    });
  }

  selectedOptionIds.add(option.id);
  optionsByType[option.option_type]
    .filter((sibling) => sibling.id !== option.id)
    .forEach((sibling) => selectedOptionIds.delete(sibling.id));

  refreshPanelSelection();
}

function refreshPanelSelection() {
  document.querySelectorAll("[data-option-id]").forEach((el) => {
    const id = Number(el.dataset.optionId);
    el.classList.toggle("selected", selectedOptionIds.has(id));
  });
}

function buildOptionsPanel() {
  const panel = document.getElementById("options-panel");
  panel.innerHTML = "";

  Object.entries(optionsByType).forEach(([type, options]) => {
    const group = document.createElement("div");
    group.className = "option-group";

    const heading = document.createElement("h3");
    heading.textContent = type;
    group.appendChild(heading);

    const isColorType = type === "paint" || type === "interior";
    const row = document.createElement("div");
    row.className = isColorType ? "swatch-row" : "";

    options.forEach((option) => {
      const el = document.createElement(isColorType ? "div" : "button");
      el.dataset.optionId = option.id;
      el.title = option.label;
      if (isColorType) {
        el.className = "swatch";
        el.style.backgroundColor = option.color_hex;
      } else {
        el.className = "option-button";
        el.textContent = option.label;
      }
      el.addEventListener("click", () => applyOption(option));
      row.appendChild(el);
    });

    group.appendChild(row);
    panel.appendChild(group);
  });
}

function getSelectedOptionIds() {
  return Array.from(selectedOptionIds);
}

function onModelReady() {
  scene.add(carRoot);
  frameCameraFromDirection(VIEW_DIRECTIONS.front);
  addViewPresetButtons();
  buildOptionsPanel();
}

if (carData.modelUrl) {
  new GLTFLoader().load(
    carData.modelUrl,
    (gltf) => {
      carRoot = gltf.scene;
      onModelReady();
    },
    undefined,
    (error) => {
      viewerEl.innerHTML = "<p style='color:#f88;padding:1rem;'>Couldn't load this car's 3D model.</p>";
      console.error("GLTF load failed:", error);
    }
  );
} else {
  carRoot = createPlaceholderCar();
  onModelReady();
}

function onResize() {
  camera.aspect = viewerEl.clientWidth / viewerEl.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(viewerEl.clientWidth, viewerEl.clientHeight);
}
window.addEventListener("resize", onResize);

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  if (!isDragging) applyIdleDrift();
  renderer.render(scene, camera);
}
animate();

export { scene, carData, getSelectedOptionIds };
