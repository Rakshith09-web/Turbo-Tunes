import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import { createPalettePainter } from "./palette.js";
import { TurboAudioEngine } from "./turbo_audio.js";
import { buildGarage } from "./garage.js";
import { buildSpoilerStyle, makeSpoilerMaterial, SPOILER_RECIPES } from "./spoilers.js";
import { buildRimSet, makeRimMaterial } from "./rims.js";

const carData = JSON.parse(document.getElementById("car-data").textContent);
const viewerEl = document.getElementById("viewer");

const optionsByType = {};
carData.options.forEach((option) => {
  if (!optionsByType[option.option_type]) optionsByType[option.option_type] = [];
  optionsByType[option.option_type].push(option);
});

const selectedOptionIds = new Set();

const savedSelectionEl = document.getElementById("selected-options");
const preselectedOptionIds = savedSelectionEl ? JSON.parse(savedSelectionEl.textContent) : [];

const scene = new THREE.Scene();
scene.background = null;

const camera = new THREE.PerspectiveCamera(
  45,
  viewerEl.clientWidth / viewerEl.clientHeight,
  0.05,
  1000
);

// preserveDrawingBuffer enables clean snapshot downloads and thumbnail captures
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: true,
  alpha: true,
});
renderer.setSize(viewerEl.clientWidth, viewerEl.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
viewerEl.appendChild(renderer.domElement);

// Lift the car slightly in the frame so bottom toolbar doesn't cover wheels.
const VIEW_LIFT = 0.03;
function applyViewOffset() {
  const width = viewerEl.clientWidth;
  const height = viewerEl.clientHeight;
  camera.setViewOffset(width, height, 0, height * VIEW_LIFT, width, height);
}
applyViewOffset();

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.06;
controls.enableZoom = true;
controls.zoomSpeed = 0.85;
controls.screenSpacePanning = true;
// Safe zoom boundaries to prevent disappearing geometry or inversion
controls.minDistance = 1.2;
controls.maxDistance = 18.0;
// The garage has a floor, so don't let the camera orbit down underneath it.
controls.maxPolarAngle = Math.PI / 2 + 0.12;

// Idle cursor drift: when the user isn't actively dragging, the camera gently
// leans toward the cursor around a "rest" angle.
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
  if (radius < 0.5) return;
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
controls.addEventListener("change", () => {
  if (!isDragging) captureRestAngles();
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

const ambientLight = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambientLight);
const hemiLight = new THREE.HemisphereLight(0xffffff, 0xd9d2c0, 0.75);
scene.add(hemiLight);
const keyLight = new THREE.DirectionalLight(0xffffff, 1.2);
keyLight.position.set(5, 10, 7);
scene.add(keyLight);

let carRoot = null;
let carBounds = null;
// The 3D garage the car sits in; built once the car's size is known (see onModelReady).
let garage = null;

// How far the camera may zoom out: far enough to see the whole car, but never through a garage wall.
function maxZoomDistance(maxDim) {
  const wanted = maxDim * 3.5;
  return garage ? Math.min(wanted, garage.maxCameraDistance) : wanted;
}

function getCarBounds() {
  if (!carRoot) return null;
  const box = new THREE.Box3().setFromObject(carRoot);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const maxDim = Math.max(size.x, size.y, size.z);
  carBounds = { box, size, center, maxDim };
  return carBounds;
}


let isInteriorMode = false;
let cabinLight = null;
let cabinFill = null;

function ensureCabinLights() {
  if (!cabinLight) {
    cabinLight = new THREE.PointLight(0xfff7ed, 3.2, 3.5);
    cabinLight.decay = 1.2;
    cabinLight.position.set(0, 0.95, 0.15);
    scene.add(cabinLight);
  }
  if (!cabinFill) {
    cabinFill = new THREE.HemisphereLight(0xfffaed, 0x444444, 0.9);
    cabinFill.position.set(0, 1.2, 0.1);
    scene.add(cabinFill);
  }
}

function enterInteriorView() {
  if (!carRoot) return;
  const bounds = getCarBounds();
  if (!bounds) return;
  const { center, size } = bounds;

  isInteriorMode = true;
  ensureCabinLights();
  cabinLight.visible = true;
  cabinFill.visible = true;
  cabinLight.intensity = 3.6;

  // Driver cockpit perspective looking directly at steering wheel and curved digital display
  const driverPos = new THREE.Vector3(
    center.x - 0.28,
    center.y + 0.18,
    center.z - 0.04
  );
  const cockpitTarget = new THREE.Vector3(
    center.x - 0.24,
    center.y + 0.10,
    center.z + 0.52
  );

  focusTween.startPos.copy(camera.position);
  focusTween.startTarget.copy(controls.target);
  focusTween.targetPos.copy(driverPos);
  focusTween.targetTarget.copy(cockpitTarget);
  focusTween.startTime = performance.now();
  focusTween.duration = 650;
  focusTween.active = true;

  controls.minDistance = 0.10;
  controls.maxDistance = 1.6;

  document.querySelectorAll(".view-presets button").forEach((b) => {
    b.classList.toggle("active", b.dataset.view === "interior");
  });

  showToast("Inside cabin • Inspecting interior & dashboard");
}

function exitInteriorView(direction = VIEW_DIRECTIONS.front) {
  isInteriorMode = false;
  if (cabinLight) cabinLight.intensity = 2.4;
  document.querySelectorAll(".view-presets button").forEach((b) => {
    b.classList.remove("active");
  });
  frameCameraFromDirection(direction);
  showToast("Full showroom view restored");
}

function updateSafeZoomLimits() {
  if (!carBounds && !getCarBounds()) return;

  if (isInteriorMode) {
    controls.minDistance = 0.10;
    controls.maxDistance = 1.6;
    return;
  }

  // Smooth zoom all the way close to inspect interior, wheels, and details
  // 0.35m safe minimum stops OrbitControls from collapsing through target (0 distance)
  controls.minDistance = 0.35;
  controls.maxDistance = maxZoomDistance(carBounds.maxDim);

  const offset = camera.position.clone().sub(controls.target);
  const currentDist = offset.length();
  if (currentDist < 0.001) return;

  if (currentDist < controls.minDistance) {
    offset.normalize().multiplyScalar(controls.minDistance);
    camera.position.copy(controls.target.clone().add(offset));
  }
}

function frameCameraFromDirection(direction) {
  if (!carRoot) return;
  const bounds = getCarBounds();
  if (!bounds) return;
  const { center, maxDim } = bounds;
  const overhead = Math.abs(direction.y) > 0.9;
  const distance = maxDim * (overhead ? 1.95 : 1.65);

  controls.minDistance = 0.35;
  controls.maxDistance = maxZoomDistance(maxDim);

  camera.position.copy(center.clone().add(direction.clone().normalize().multiplyScalar(distance)));
  camera.lookAt(center);
  controls.target.copy(center);
  controls.update();
  captureRestAngles();
}

function zoomCamera(dir) {
  if (!carBounds && !getCarBounds()) return;

  if (isInteriorMode) {
    const target = controls.target;
    const offset = camera.position.clone().sub(target);
    const currentDist = offset.length();
    const factor = dir > 0 ? 1.25 : 0.8;
    const newDist = currentDist * factor;

    if (dir > 0 && newDist > 1.55) {
      exitInteriorView();
      return;
    }

    const clampedDist = THREE.MathUtils.clamp(newDist, 0.10, 1.6);
    offset.normalize().multiplyScalar(clampedDist);
    camera.position.copy(target.clone().add(offset));
    controls.update();
    return;
  }

  // Exterior mode:
  const target = controls.target;
  const offset = camera.position.clone().sub(target);
  const currentDist = offset.length();
  const safeMin = 0.35;
  const safeMax = maxZoomDistance(carBounds.maxDim);

  const factor = dir > 0 ? 1.22 : 0.80;
  const newDist = THREE.MathUtils.clamp(currentDist * factor, safeMin, safeMax);

  offset.normalize().multiplyScalar(newDist);
  camera.position.copy(target.clone().add(offset));
  controls.update();
  captureRestAngles();
}

const focusRaycaster = new THREE.Raycaster();
const focusMouse = new THREE.Vector2();

let focusTween = {
  active: false,
  startPos: new THREE.Vector3(),
  targetPos: new THREE.Vector3(),
  startTarget: new THREE.Vector3(),
  targetTarget: new THREE.Vector3(),
  startTime: 0,
  duration: 600,
};

function focusCameraOn(targetPoint, distance = 1.45) {
  if (!carBounds && !getCarBounds()) return;
  const dir = camera.position.clone().sub(controls.target).normalize();

  focusTween.startPos.copy(camera.position);
  focusTween.startTarget.copy(controls.target);
  focusTween.targetTarget.copy(targetPoint);
  focusTween.targetPos.copy(targetPoint.clone().add(dir.multiplyScalar(distance)));
  focusTween.startTime = performance.now();
  focusTween.duration = 600;
  focusTween.active = true;
}

// ---- Showing off a change ------------------------------------------------------------------
// When someone changes something, the camera glides to where that change can be seen: the side
// of the car for wheels and decals, the back for exhaust and spoilers, a three-quarter view for
// paint. Each is a pose (where to look, from which direction, how far), worked out from the
// parts themselves so it suits every car.
function boxOf(objects) {
  const box = new THREE.Box3();
  objects.forEach((o) => box.expandByObject(o));
  return box.isEmpty() ? null : box;
}

// How far back the camera must be for `width` x `height` metres to fill the view.
function fitDistance(width, height, margin = 1.15) {
  const halfV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  const byHeight = (height * margin) / (2 * halfV);
  const byWidth = (width * margin) / (2 * halfV * camera.aspect);
  return Math.max(byHeight, byWidth);
}

function focusPoseFor(type, side) {
  const bounds = getCarBounds();
  if (!bounds) return null;
  const { box, size, center } = bounds;
  const at = (x, y, z) => new THREE.Vector3(x, y, z);
  const dir = (x, y, z) => new THREE.Vector3(x, y, z).normalize();

  if (type === "paint") {
    // three-quarter front, close enough that the colour fills the screen
    return { target: at(center.x, box.min.y + size.y * 0.42, center.z + size.z * 0.04), direction: dir(side * 0.78, 0.2, 0.62), distance: fitDistance(size.z * 0.8, size.y * 1.4) };
  }

  if (type === "wheels") {
    // side profile, close in on the front wheel
    const option = (optionsByType.wheels || [])[0];
    const meshes = option ? meshesMatchingNames(option.mesh_name) : [];
    const wheels = boxOf(meshes);
    let target = at(side > 0 ? box.max.x : box.min.x, box.min.y + size.y * 0.22, center.z + size.z * 0.3);
    let rim = size.y * 0.4;
    if (wheels) {
      const diameter = wheels.max.y - wheels.min.y;
      const several = wheels.max.z - wheels.min.z > diameter * 1.6; // all four wheels in one mesh
      target = at(side > 0 ? wheels.max.x : wheels.min.x, (wheels.min.y + wheels.max.y) / 2, several ? wheels.max.z - diameter / 2 : (wheels.min.z + wheels.max.z) / 2);
      rim = diameter;
    }
    return { target, direction: dir(side, 0.06, 0), distance: THREE.MathUtils.clamp(rim * 3.2, 1.7, 2.8) };
  }

  if (type === "exhaust") {
    // straight behind and low, wide enough to take in the whole bumper
    return { target: at(center.x, box.min.y + size.y * 0.27, box.min.z + size.z * 0.02), direction: dir(0, 0.16, -1), distance: fitDistance(size.x, size.y * 0.55, 1.2) };
  }

  if (type === "decal") {
    // the whole side of the car, filling the view (the near flank is half a car-width closer
    // to the camera than the car's centre, hence the extra distance)
    return { target: at(center.x, box.min.y + size.y * 0.45, center.z), direction: dir(side, 0.05, 0), distance: fitDistance(size.z, size.y, 1.1) + size.x * 0.5 };
  }

  if (type === "spoiler") {
    // behind and a little above, centred on the spoiler itself
    const parts = [];
    const generated = carRoot.getObjectByName("GeneratedSpoiler");
    if (generated) parts.push(generated);
    stockSpoilerMeshes().filter((m) => m.visible).forEach((m) => parts.push(m));
    const spoiler = boxOf(parts);
    const targetY = spoiler ? (spoiler.min.y + spoiler.max.y) / 2 : box.min.y + size.y * 0.72;
    const width = spoiler ? Math.max(spoiler.max.x - spoiler.min.x, 0.9) : size.x * 0.6;
    return { target: at(center.x, targetY, spoiler ? (spoiler.min.z + spoiler.max.z) / 2 : box.min.z + size.z * 0.1), direction: dir(0, 0.3, -1), distance: fitDistance(width * 1.5, width * 0.9, 1.25) };
  }
  return null;
}

function focusOnChange(type) {
  if (!carRoot) return;
  if (type === "spoiler_finish") type = "spoiler";
  if (type === "rims") type = "wheels";
  // stay on whichever side of the car the viewer is already on
  const centre = carBounds ? carBounds.center : new THREE.Vector3();
  const side = camera.position.x >= centre.x ? 1 : -1;
  const pose = focusPoseFor(type, side);
  if (!pose) return;

  if (isInteriorMode) {
    isInteriorMode = false;
    if (cabinLight) cabinLight.visible = false;
    if (cabinFill) cabinFill.visible = false;
  }
  document.querySelectorAll(".view-presets button").forEach((b) => b.classList.remove("active"));

  const targetPos = pose.target.clone().add(pose.direction.clone().multiplyScalar(pose.distance));
  // Already looking at it from about the right place (say, while flicking through colours)?
  // Then leave the camera alone instead of snapping the viewer back.
  const here = camera.position.clone().sub(controls.target);
  const wanted = targetPos.clone().sub(pose.target);
  const angle = here.angleTo(wanted);
  if (angle < 0.4 && Math.abs(here.length() / wanted.length() - 1) < 0.3 && controls.target.distanceTo(pose.target) < wanted.length() * 0.3) return;

  focusTween.startPos.copy(camera.position);
  focusTween.startTarget.copy(controls.target);
  focusTween.targetPos.copy(targetPos);
  focusTween.targetTarget.copy(pose.target);
  focusTween.startTime = performance.now();
  focusTween.duration = 850;
  focusTween.active = true;
}

function updateFocusTween() {
  if (!focusTween.active) return;
  const elapsed = performance.now() - focusTween.startTime;
  const t = Math.min(1.0, elapsed / focusTween.duration);
  const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  camera.position.lerpVectors(focusTween.startPos, focusTween.targetPos, ease);
  controls.target.lerpVectors(focusTween.startTarget, focusTween.targetTarget, ease);
  camera.lookAt(controls.target);

  if (t >= 1.0) {
    focusTween.active = false;
    controls.update();
    captureRestAngles();
  }
}

viewerEl.addEventListener("dblclick", (e) => {
  if (!carRoot || (!carBounds && !getCarBounds())) return;
  const rect = viewerEl.getBoundingClientRect();
  focusMouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  focusMouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

  focusRaycaster.setFromCamera(focusMouse, camera);
  const hits = focusRaycaster.intersectObjects(carRoot.children, true);

  if (hits.length > 0) {
    const hitMesh = hits[0].object;
    if (/window|interior|seat|wheel/i.test(hitMesh.name) || isInteriorMode) {
      if (!isInteriorMode) {
        enterInteriorView();
      } else {
        focusCameraOn(hits[0].point, 0.45);
      }
    } else {
      focusCameraOn(hits[0].point, 1.45);
    }
  } else {
    if (isInteriorMode) {
      exitInteriorView();
    } else {
      frameCameraFromDirection(VIEW_DIRECTIONS.front);
    }
  }
});

const VIEW_DIRECTIONS = {
  front: new THREE.Vector3(0, 0.12, 1),
  rear: new THREE.Vector3(0, 0.12, -1),
  left: new THREE.Vector3(-1, 0.12, 0),
  right: new THREE.Vector3(1, 0.12, 0),
  top: new THREE.Vector3(0, 1, 0.01),
  bottom: new THREE.Vector3(0, -1, 0.01),
};

function takeSnapshot() {
  renderer.render(scene, camera);
  const canvas = renderer.domElement;

  const exportCanvas = document.createElement("canvas");
  exportCanvas.width = canvas.width;
  exportCanvas.height = canvas.height;
  const ctx = exportCanvas.getContext("2d");

  // Draw background matching active mode
  if (isMidnightMode) {
    const bgGrad = ctx.createRadialGradient(
      exportCanvas.width * 0.5,
      exportCanvas.height * 0.75,
      exportCanvas.width * 0.05,
      exportCanvas.width * 0.5,
      exportCanvas.height * 0.75,
      exportCanvas.width * 0.75
    );
    bgGrad.addColorStop(0, "#455268");
    bgGrad.addColorStop(0.5, "#2c3545");
    bgGrad.addColorStop(1, "#181f2a");
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  } else {
    ctx.fillStyle = "#f5f0e6";
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
  }

  // Draw 3D canvas
  ctx.drawImage(canvas, 0, 0);

  // Add sleek branding watermark
  const padding = 24;
  ctx.save();
  ctx.font = "600 15px 'Space Grotesk', sans-serif";
  ctx.fillStyle = isMidnightMode ? "rgba(255, 255, 255, 0.75)" : "rgba(32, 31, 28, 0.75)";
  ctx.textAlign = "right";
  ctx.textBaseline = "bottom";
  const brandText = "TURBO TUNES  |  " + (carData.brand || "") + " " + (carData.name || "");
  ctx.fillText(brandText, exportCanvas.width - padding, exportCanvas.height - padding);
  ctx.restore();

  // Trigger download
  const link = document.createElement("a");
  const fileName = `TurboTunes-${(carData.name || "car").replace(/\s+/g, "_")}.png`;
  link.download = fileName;
  link.href = exportCanvas.toDataURL("image/png");
  link.click();

  showToast("Saved snapshot to downloads");
}

function addViewPresetButtons() {
  const bar = document.createElement("div");
  bar.className = "view-presets";

  const presetList = [
    { name: "front", label: "Front" },
    { name: "rear", label: "Rear" },
    { name: "left", label: "Left" },
    { name: "right", label: "Right" },
    { name: "top", label: "Top" },
    { name: "interior", label: "Interior" },
  ];

  presetList.forEach((item) => {
    const btn = document.createElement("button");
    btn.textContent = item.label;
    btn.dataset.view = item.name;
    btn.addEventListener("click", () => {
      if (item.name === "interior") {
        if (isInteriorMode) {
          exitInteriorView();
        } else {
          enterInteriorView();
        }
      } else {
        if (isInteriorMode) {
          isInteriorMode = false;
          if (cabinLight) cabinLight.visible = false;
        }
        document.querySelectorAll(".view-presets button").forEach((b) => b.classList.remove("active"));
        frameCameraFromDirection(VIEW_DIRECTIONS[item.name]);
      }
    });
    bar.appendChild(btn);
  });

  const zoomInBtn = document.createElement("button");
  zoomInBtn.className = "btn-zoom";
  zoomInBtn.textContent = "+";
  zoomInBtn.title = "Zoom In";
  zoomInBtn.addEventListener("click", () => zoomCamera(-1));
  bar.appendChild(zoomInBtn);

  const zoomOutBtn = document.createElement("button");
  zoomOutBtn.className = "btn-zoom";
  zoomOutBtn.textContent = "−";
  zoomOutBtn.title = "Zoom Out";
  zoomOutBtn.addEventListener("click", () => zoomCamera(1));
  bar.appendChild(zoomOutBtn);

  const resetZoomBtn = document.createElement("button");
  resetZoomBtn.className = "btn-zoom-reset";
  resetZoomBtn.textContent = "⟲ Fit";
  resetZoomBtn.title = "Reset View / Fit Car";
  resetZoomBtn.addEventListener("click", () => {
    if (isInteriorMode) exitInteriorView();
    else frameCameraFromDirection(VIEW_DIRECTIONS.front);
  });
  bar.appendChild(resetZoomBtn);

  const snapBtn = document.createElement("button");
  snapBtn.className = "btn-snapshot";
  snapBtn.innerHTML = `<span>📸 Snapshot</span>`;
  snapBtn.title = "Download high-resolution image";
  snapBtn.addEventListener("click", takeSnapshot);
  bar.appendChild(snapBtn);

  viewerEl.appendChild(bar);
}

// Used until a car has a real .glb file uploaded (see Car.model_file in cars/models.py).
// Named parts mirror the mesh_name values used by CustomizationOption rows, so live
// customization (Task 8) works identically against this or a real sourced model.
function createPlaceholderCar() {
  const car = new THREE.Group();

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(2, 0.8, 4.2),
    new THREE.MeshStandardMaterial({ color: 0xb9b4a8 })
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

function nameMatches(object, prefix) {
  return object.name.toLowerCase().startsWith(prefix.toLowerCase());
}

function meshesMatchingPrefix(prefix) {
  const matches = [];
  carRoot.traverse((child) => {
    if (child.isMesh && nameMatches(child, prefix)) matches.push(child);
  });
  return matches;
}

function findMeshByName(name) {
  let found = null;
  carRoot.traverse((child) => {
    if (!found && child.isMesh && child.name.toLowerCase() === name.toLowerCase()) found = child;
  });
  return found;
}

// mesh_name may be a comma-separated list — some cars have their body paint split across
// several meshes (doors, hood, fenders...) that share one material but never got joined into one.
function meshesMatchingNames(commaSeparatedNames) {
  const names = commaSeparatedNames.split(",").map((n) => n.trim().toLowerCase());
  const matches = [];
  carRoot.traverse((child) => {
    if (child.isMesh && names.includes(child.name.toLowerCase())) matches.push(child);
  });
  return matches;
}

// ---- Paint -------------------------------------------------------------------------------
// "palette" models colour themselves from one shared palette image; see palette.js.
let palettePainter = null;

function setupPalette() {
  palettePainter = createPalettePainter(carRoot, carData.paintRegion);
}

function paintPalette(hex) {
  if (!palettePainter) return false;
  palettePainter.paint(hex);
  return true;
}

// material.color multiplies the existing colour texture, so on a baked, unevenly-lit photo
// the result stays muddy and doesn't match the swatch. Dropping the colour map and painting
// the bare material gives an exact, even colour — normal maps are left alone, so panel lines
// and reflections still read through the lighting, just not the baked paint photo.
//
// Some of these scanned models have no real metallic/roughness texture, so metalness defaults
// to glTF's spec default of 1 (fully metallic) with roughness 1 (fully matte) — with no
// environment map in this scene to reflect, that combination renders almost black no matter
// the colour. A clean gloss-paint response (some metalness, moderate roughness) reads clearly
// under the scene's own lights instead.
function tintMesh(target, hex) {
  target.material = target.material.clone();
  target.material.map = null;
  target.material.metalnessMap = null;
  target.material.roughnessMap = null;
  target.material.metalness = 0.55;
  target.material.roughness = 0.35;
  target.material.color.set(hex);
  target.material.needsUpdate = true;
}

function applyPaint(option) {
  if (carData.paintMode === "palette") {
    if (paintPalette(option.color_hex)) return true;
    console.warn("This car is set to palette paint but its palette couldn't be found.");
    return false;
  }
  const targets = meshesMatchingNames(option.mesh_name);
  if (!targets.length) {
    console.warn(`Mesh "${option.mesh_name}" not found in this car's model.`);
    return false;
  }
  targets.forEach((target) => tintMesh(target, option.color_hex));
  lastPaintHex = option.color_hex;
  if (carRoot) followPaintWithSpoiler();
  return true;
}

function applyInterior(option) {
  const target = findMeshByName(option.mesh_name);
  if (!target) {
    console.warn(`Mesh "${option.mesh_name}" not found in this car's model.`);
    return false;
  }
  tintMesh(target, option.color_hex);
  return true;
}

// ---- Wheels ------------------------------------------------------------------------------
// Two ways a wheel "style" can work:
//  - swap: the car has left/right wheel meshes (name ends in -left / -right). A style with a
//    part file replaces their shape with that file's wheel; one without restores the stock shape.
//  - show/hide: the car carries every style as separate meshes (name prefix per style).
const partGeometryCache = new Map();

function loadPartGeometry(url) {
  if (!partGeometryCache.has(url)) {
    partGeometryCache.set(
      url,
      new Promise((resolve, reject) => {
        new GLTFLoader().load(
          url,
          (gltf) => {
            let geometry = null;
            gltf.scene.traverse((child) => {
              if (!geometry && child.isMesh) geometry = child.geometry;
            });
            geometry ? resolve(geometry) : reject(new Error("No mesh in " + url));
          },
          undefined,
          reject
        );
      })
    );
  }
  return partGeometryCache.get(url);
}

function sideWheels(prefix) {
  return meshesMatchingPrefix(prefix).filter((mesh) => /-(left|right)$/i.test(mesh.name));
}

// The car's own wheel meshes sit off-centre (outer half only), so the part is nudged outward
// to line up, and mirrored for the right-hand side.
const WHEEL_OUTWARD_SHIFT = 0.1;

async function swapWheels(option, wheels) {
  const partGeometry = option.part_url ? await loadPartGeometry(option.part_url) : null;
  wheels.forEach((mesh) => {
    if (!mesh.userData.originalGeometry) mesh.userData.originalGeometry = mesh.geometry;
    if (mesh.geometry !== mesh.userData.originalGeometry) mesh.geometry.dispose();

    if (!partGeometry) {
      mesh.geometry = mesh.userData.originalGeometry;
      return;
    }
    const isLeft = /-left$/i.test(mesh.name);
    const geometry = partGeometry.clone();
    if (!isLeft) geometry.rotateY(Math.PI);
    geometry.translate(isLeft ? WHEEL_OUTWARD_SHIFT : -WHEEL_OUTWARD_SHIFT, 0, 0);
    mesh.geometry = geometry;
  });
}

function showOnly(option) {
  let matchedSelected = false;
  optionsByType[option.option_type].forEach((sibling) => {
    const isSelected = sibling.id === option.id;
    const meshes = meshesMatchingPrefix(sibling.mesh_name);
    if (isSelected && meshes.length > 0) matchedSelected = true;
    meshes.forEach((mesh) => {
      mesh.visible = isSelected;
    });
  });
  if (!matchedSelected) console.warn(`No meshes matching "${option.mesh_name}" found in this car's model.`);
  return matchedSelected;
}

async function applyWheels(option) {
  // A colour option (these realistic cars: one rim finish tinted directly, same as paint) —
  // checked first since it's the cheap, common case.
  if (option.color_hex) {
    const targets = meshesMatchingNames(option.mesh_name);
    if (!targets.length) {
      console.warn(`Mesh "${option.mesh_name}" not found in this car's model.`);
      return false;
    }
    targets.forEach((target) => tintMesh(target, option.color_hex));
    // The colour belongs to the rims only (never the tyres): the stock rim mesh above, and the rim
    // design built in code if one is fitted.
    wheelColorHex = option.color_hex;
    if (activeRimMaterial) activeRimMaterial.color.set(option.color_hex);
    return true;
  }
  // Older Kenney-style cars: swap in a whole alternate wheel shape, or show/hide a stock set.
  const wheels = sideWheels(option.mesh_name);
  if (wheels.length > 0) {
    await swapWheels(option, wheels);
    return true;
  }
  return showOnly(option);
}

// ---- Rim designs -------------------------------------------------------------------------
// "Stock" keeps the model's own rims. Any other style hides them and fits a design built in code
// (rims.js) in the same place on each wheel; the Wheels colour then paints that rim, not the tyre.
let rimStyle = null;
let wheelColorHex = null;
let activeRimMaterial = null;

function stockRimMeshes() {
  const wheel = (optionsByType.wheels || [])[0];
  return wheel ? meshesMatchingNames(wheel.mesh_name) : [];
}

function removeGeneratedRims() {
  const old = carRoot.getObjectByName("GeneratedRims");
  if (!old) return;
  old.traverse((o) => o.geometry && o.geometry.dispose());
  if (activeRimMaterial) activeRimMaterial.dispose();
  activeRimMaterial = null;
  carRoot.remove(old);
}

function refreshRims() {
  removeGeneratedRims();
  const stock = stockRimMeshes();
  const key = rimStyle ? rimStyle.mesh_name.split(":")[1] : "stock";
  if (key === "stock") {
    stock.forEach((mesh) => (mesh.visible = true));
    return;
  }
  activeRimMaterial = makeRimMaterial(wheelColorHex || "#B8BCC0", getExhaustEnvMap());
  const set = buildRimSet(carRoot, stock, key, activeRimMaterial, carData.name);
  if (set) {
    carRoot.add(set);
    stock.forEach((mesh) => (mesh.visible = false));
  } else {
    console.warn(`Couldn't build the "${key}" rim design for ${carData.name}.`);
    stock.forEach((mesh) => (mesh.visible = true));
  }
}

function applyRims(option) {
  rimStyle = option;
  refreshRims();
  return true;
}

// ---- Exhaust -----------------------------------------------------------------------------
// Tip finishes ("generated:chrome", "generated:black", "generated:titanium") are built in code,
// but not as loose tubes bolted onto the bumper: each tip is placed where this car's own tips
// are (or would be) and its lip is found by firing rays at the real bumper, so it sits in the
// body instead of hanging off it. "generated:none" is the stock look.
//   tips:   [x, y, radius] as fractions of the car's width (x from the centre line) and height
//           (y up from the ground); radius is a fraction of the width.
//   cutout: draw a black bumper opening behind each tip, for cars whose body has no hole there.
//   inset:  how far (in tip radii) to sink the lip back from the body's rearmost point.
const EXHAUST_LAYOUTS = {
  // Both of these models already have real tip cut-outs; the new tips replace what's in them.
  Sedan: { tips: [[-0.291, 0.2535, 0.026], [-0.231, 0.2535, 0.026], [0.231, 0.2535, 0.026], [0.291, 0.2535, 0.026]] },
  "Sports Hatchback": {
    tips: [[-0.304, 0.2, 0.0214], [-0.258, 0.2, 0.0214], [0.258, 0.2, 0.0214], [0.304, 0.2, 0.0214]],
  },
  // The Taycan is electric, so its diffuser has no holes: add tips with their own openings.
  "Sports Sedan": { tips: [[-0.205, 0.226, 0.027], [0.205, 0.226, 0.027]], cutout: true, inset: 0.3 },
  "Future Racer": { tips: [[0, 0.4, 0.032]] },
};

const EXHAUST_FINISHES = {
  chrome: { color: 0xeef0f4, metalness: 1, roughness: 0.12 },
  black: { color: 0x15161a, metalness: 0.85, roughness: 0.32 },
  titanium: { color: 0x7b7fa6, metalness: 1, roughness: 0.22 },
};

// No environment map in this scene, so metals would render black. These tips get a small
// studio-ish one of their own (light panels over a dark floor) so chrome actually looks like chrome.
let exhaustEnvMap = null;
function getExhaustEnvMap() {
  if (exhaustEnvMap) return exhaustEnvMap;
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 256;
  const g = canvas.getContext("2d");
  const sky = g.createLinearGradient(0, 0, 0, 256);
  sky.addColorStop(0, "#dfe6f2");
  sky.addColorStop(0.46, "#8d96a6");
  sky.addColorStop(0.5, "#1b1d22");
  sky.addColorStop(1, "#4a4d55");
  g.fillStyle = sky;
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = "#ffffff";
  for (let i = 0; i < 8; i++) g.fillRect(i * 64 + 14, 24, 22, 70); // overhead light panels
  const texture = new THREE.CanvasTexture(canvas);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  exhaustEnvMap = pmrem.fromEquirectangular(texture).texture;
  pmrem.dispose();
  texture.dispose();
  return exhaustEnvMap;
}

function buildExhaustTip(radius, finish, cutout) {
  const length = radius * 2.4; // mostly hidden inside the body
  const wall = radius * 0.1;
  const depth = radius * 0.9; // how far inside the dark end cap sits
  const material = new THREE.MeshStandardMaterial({
    ...finish,
    envMap: getExhaustEnvMap(),
    envMapIntensity: 1.1,
    side: THREE.DoubleSide,
  });

  // Lip at y = 0, running back (-y) into the body: outer wall, rolled lip, inner wall.
  const profile = [new THREE.Vector2(radius, -length), new THREE.Vector2(radius, -wall * 0.5)];
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * Math.PI;
    profile.push(new THREE.Vector2(radius - wall / 2 + (wall / 2) * Math.cos(a), -wall * 0.5 + (wall / 2) * Math.sin(a)));
  }
  profile.push(new THREE.Vector2(radius - wall, -depth * 1.4));
  const tube = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), material);
  tube.geometry.rotateX(-Math.PI / 2); // axis now points out of the rear of the car (-z)

  const parts = [tube];
  const cap = new THREE.Mesh(
    new THREE.CircleGeometry(radius - wall, 40),
    new THREE.MeshStandardMaterial({ color: 0x050506, roughness: 0.9, side: THREE.DoubleSide })
  );
  cap.position.z = depth;
  parts.push(cap);

  if (cutout) {
    const opening = new THREE.Mesh(
      new THREE.CircleGeometry(radius * 1.45, 48),
      new THREE.MeshStandardMaterial({ color: 0x08080a, roughness: 0.85, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 })
    );
    opening.position.z = radius * 0.16;
    parts.push(opening);
  }
  const tip = new THREE.Group();
  tip.add(...parts);
  return tip;
}

function buildExhaust(style) {
  const layout = EXHAUST_LAYOUTS[carData.name];
  const finish = EXHAUST_FINISHES[style];
  if (!layout || !finish) return null;

  const group = new THREE.Group();
  group.name = "GeneratedExhaust";
  carRoot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(carRoot);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const raycaster = new THREE.Raycaster();
  const down = new THREE.Vector3(0, 0, 1); // rays travel from behind the car toward the nose

  layout.tips.forEach(([xFrac, yFrac, rFrac]) => {
    const x = center.x + xFrac * size.x;
    const y = box.min.y + yFrac * size.y;
    const radius = rFrac * size.x;

    // The rearmost point of the body around this spot is where the tip's lip belongs.
    let lipZ = Infinity;
    for (let k = 0; k < 8; k++) {
      const angle = (k / 8) * Math.PI * 2;
      raycaster.set(new THREE.Vector3(x + Math.cos(angle) * radius * 0.9, y + Math.sin(angle) * radius * 0.9, box.min.z - 1), down);
      const hit = raycaster.intersectObject(carRoot, true).find((h) => h.object.visible);
      if (hit) lipZ = Math.min(lipZ, hit.point.z);
    }
    if (!isFinite(lipZ)) lipZ = box.min.z + size.z * 0.02;

    const tip = buildExhaustTip(radius * 1.03, finish, !!layout.cutout);
    tip.position.set(x, y, lipZ + radius * (layout.inset ?? -0.12));
    group.add(tip);
  });
  return group;
}

function applyExhaust(option) {
  if (!option.mesh_name.startsWith("generated:")) return showOnly(option);

  const existing = carRoot.getObjectByName("GeneratedExhaust");
  if (existing) carRoot.remove(existing);
  const style = option.mesh_name.split(":")[1];
  if (style !== "none") {
    const exhaust = buildExhaust(style);
    if (exhaust) carRoot.add(exhaust);
  }
  return true;
}

// ---- Spoiler -----------------------------------------------------------------------------
// Two independent choices: the style ("spoiler" options) and its finish ("spoiler_finish"
// options). A style is either the car's own spoiler part, "None", or a "generated:<style>" one
// that spoilers.js builds as a skin on the car's real lid (see there). Until the person picks
// something, the model is left exactly as it came.
let spoilerStyle = null;
let spoilerFinish = null;
let lastPaintHex = null;
let sampledBodyHex = null;
let activeSpoilerMaterial = null;

const SPOILER_FINISH_TINTS = { gloss: "#17181A", carbon: "#2B2E33" };

function stockSpoilerMeshes() {
  const stock = (optionsByType.spoiler || []).find((o) => !o.mesh_name.startsWith("generated:"));
  return stock ? meshesMatchingNames(stock.mesh_name) : [];
}

// The colour the body currently is: the last paint picked, else the colour the paint mesh's own
// texture gives it. These palette-style textures are tiny and hold many colours, so the body
// colour is whatever the mesh's vertices actually point at, averaged — not the whole image.
function bodyColorHex() {
  if (lastPaintHex) return lastPaintHex;
  if (sampledBodyHex) return sampledBodyHex;
  const paint = (optionsByType.paint || [])[0];
  const target = paint && findMeshByName(paint.mesh_name);
  const material = target && target.material;
  if (!material) return "#888888";
  const colour = material.color ? material.color.clone() : new THREE.Color(1, 1, 1);
  const image = material.map && material.map.image;
  const uv = target.geometry.getAttribute("uv");
  if (image && image.width && uv) {
    try {
      const w = Math.min(image.width, 256);
      const h = Math.min(image.height, 256);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const g = canvas.getContext("2d");
      g.drawImage(image, 0, 0, w, h);
      const data = g.getImageData(0, 0, w, h).data;
      let r = 0, gr = 0, b = 0, n = 0;
      const step = Math.max(1, Math.floor(uv.count / 4000));
      for (let i = 0; i < uv.count; i += step) {
        const u = uv.getX(i) - Math.floor(uv.getX(i));
        let v = uv.getY(i) - Math.floor(uv.getY(i));
        if (material.map.flipY) v = 1 - v;
        const k = (Math.min(h - 1, Math.floor(v * h)) * w + Math.min(w - 1, Math.floor(u * w))) * 4;
        r += data[k]; gr += data[k + 1]; b += data[k + 2]; n++;
      }
      if (n) colour.multiply(new THREE.Color().setRGB(r / n / 255, gr / n / 255, b / n / 255, THREE.SRGBColorSpace));
    } catch (error) {
      /* a tainted canvas just means we fall back to the material colour */
    }
  }
  sampledBodyHex = "#" + colour.getHexString();
  return sampledBodyHex;
}

function spoilerFinishKey() {
  return spoilerFinish ? spoilerFinish.mesh_name.split(":")[1] : "body";
}

function tintStockSpoiler(meshes) {
  const key = spoilerFinishKey();
  meshes.forEach((mesh) => tintMesh(mesh, key === "body" ? bodyColorHex() : SPOILER_FINISH_TINTS[key]));
}

function removeGeneratedSpoiler() {
  const old = carRoot.getObjectByName("GeneratedSpoiler");
  if (!old) return;
  old.traverse((o) => o.geometry && o.geometry.dispose());
  if (activeSpoilerMaterial) activeSpoilerMaterial.dispose();
  activeSpoilerMaterial = null;
  carRoot.remove(old);
}

function refreshSpoiler() {
  removeGeneratedSpoiler();
  const stockMeshes = stockSpoilerMeshes();
  if (!spoilerStyle) {
    if (spoilerFinish) tintStockSpoiler(stockMeshes);
    return;
  }

  const key = spoilerStyle.mesh_name;
  if (key === "generated:none") {
    stockMeshes.forEach((mesh) => (mesh.visible = false));
    return;
  }
  const isStock = !key.startsWith("generated:");
  const styleKey = key.split(":")[1];
  const definition = SPOILER_RECIPES[carData.name]?.styles[styleKey];
  const showStock = isStock || !!definition?.keepStock;
  stockMeshes.forEach((mesh) => (mesh.visible = showStock));
  if (showStock && spoilerFinish) tintStockSpoiler(stockMeshes);
  if (isStock) return;

  activeSpoilerMaterial = makeSpoilerMaterial(spoilerFinishKey(), bodyColorHex(), getExhaustEnvMap());
  const group = buildSpoilerStyle(carRoot, carData.name, styleKey, activeSpoilerMaterial, showStock ? stockMeshes : null);
  if (group) carRoot.add(group);
  else console.warn(`Couldn't build spoiler style "${styleKey}" for ${carData.name}.`);
}

function applySpoiler(option) {
  spoilerStyle = option;
  refreshSpoiler();
  return true;
}

function applySpoilerFinish(option) {
  spoilerFinish = option;
  refreshSpoiler();
  return true;
}

// Painting the body re-colours a body-match spoiler without rebuilding it.
function followPaintWithSpoiler() {
  if (spoilerFinishKey() !== "body") return;
  if (activeSpoilerMaterial) activeSpoilerMaterial.color.set(bodyColorHex());
  if (spoilerStyle || spoilerFinish) tintStockSpoiler(stockSpoilerMeshes().filter((mesh) => mesh.visible));
}

// ---- Decals ------------------------------------------------------------------------------
// Decals are projected onto the body with DecalGeometry, so they follow its shape whatever its
// UVs: once from above (hood, roof, boot) and, when the design has flank artwork, once sideways
// onto each flank (doors, fenders). The cars face +z.
let decalMeshes = [];

function clearDecal() {
  decalMeshes.forEach((mesh) => {
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.map?.dispose();
    mesh.material.dispose();
  });
  decalMeshes = [];
}

function loadDecalTexture(url) {
  return new Promise((resolve) => {
    new THREE.TextureLoader().load(
      url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.anisotropy = 8;
        resolve(texture);
      },
      undefined,
      () => resolve(null)
    );
  });
}

function makeDecalMesh(target, texture, position, euler, dimensions) {
  const geometry = new DecalGeometry(target, position, euler, dimensions);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -4,
    roughness: 0.55,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.renderOrder = 2;
  return mesh;
}

async function applyDecal(option) {
  clearDecal();
  if (!option.texture_url) return true;

  const target = findMeshByName(option.mesh_name);
  if (!target) {
    console.warn(`Mesh "${option.mesh_name}" not found in this car's model.`);
    return false;
  }

  const [top, side, sideFlipped] = await Promise.all([
    loadDecalTexture(option.texture_url),
    option.side_texture_url ? loadDecalTexture(option.side_texture_url) : null,
    option.side_texture_flipped_url ? loadDecalTexture(option.side_texture_flipped_url) : null,
  ]);
  if (!top) return false;

  carRoot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(target);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const meshes = [];

  // From above. The projector's local y points toward the nose (+z) and local x toward -x, so
  // the top artwork reads nose-up when seen from above.
  const depth = size.y * 1.2;
  meshes.push(
    makeDecalMesh(
      target,
      top,
      new THREE.Vector3(center.x, box.max.y - depth / 2 + size.y * 0.02, center.z),
      new THREE.Euler(-Math.PI / 2, 0, Math.PI),
      new THREE.Vector3(size.x * 0.9, size.z * 1.02, depth)
    )
  );

  // Sideways. The box reaches only a short way in from each outer edge, so it paints that flank
  // and never the far one. Seen from outside, the nose is on the right of the viewer for the -x
  // flank and on the left for the +x flank, which is why the second flank has mirrored artwork.
  const flankLength = size.z * 0.92;
  const flankHeight = Math.min(flankLength / 5, size.y * 0.8);
  const flankDepth = size.x * 0.42;
  const flankY = box.min.y + size.y * 0.42;
  if (side) {
    meshes.push(
      makeDecalMesh(
        target,
        side,
        new THREE.Vector3(box.min.x + flankDepth / 2 - size.x * 0.03, flankY, center.z),
        new THREE.Euler(0, -Math.PI / 2, 0),
        new THREE.Vector3(flankLength, flankHeight, flankDepth)
      )
    );
  }
  if (sideFlipped) {
    meshes.push(
      makeDecalMesh(
        target,
        sideFlipped,
        new THREE.Vector3(box.max.x - flankDepth / 2 + size.x * 0.03, flankY, center.z),
        new THREE.Euler(0, Math.PI / 2, 0),
        new THREE.Vector3(flankLength, flankHeight, flankDepth)
      )
    );
  }

  clearDecal();
  meshes.forEach((mesh) => scene.add(mesh));
  decalMeshes = meshes;
  return true;
}

// ---- Applying an option ------------------------------------------------------------------
async function applyOption(option, { focus = false } = {}) {
  if (!carRoot) return;

  let applied = false;
  if (option.option_type === "paint") applied = applyPaint(option);
  else if (option.option_type === "interior") applied = applyInterior(option);
  else if (option.option_type === "decal") applied = await applyDecal(option);
  else if (option.option_type === "wheels") applied = await applyWheels(option);
  else if (option.option_type === "rims") applied = applyRims(option);
  else if (option.option_type === "exhaust") applied = applyExhaust(option);
  else if (option.option_type === "spoiler") applied = applySpoiler(option);
  else if (option.option_type === "spoiler_finish") applied = applySpoilerFinish(option);
  if (!applied) return;

  selectedOptionIds.add(option.id);
  optionsByType[option.option_type]
    .filter((sibling) => sibling.id !== option.id)
    .forEach((sibling) => selectedOptionIds.delete(sibling.id));

  refreshPanelSelection();
  if (focus) focusOnChange(option.option_type);
}

function refreshPanelSelection() {
  document.querySelectorAll("[data-option-id]").forEach((el) => {
    const id = Number(el.dataset.optionId);
    el.classList.toggle("selected", selectedOptionIds.has(id));
  });
}

const CATEGORY_LABELS = {
  paint: "Paint",
  wheels: "Wheels",
  rims: "Rims",
  interior: "Interior",
  exhaust: "Exhaust",
  decal: "Decals",
  spoiler: "Spoiler",
  sound: "Sound",
  ambience: "Ambience",
};

// Stroke-based, 17px, one consistent style — matches the icon set used in the draft mockup.
const CATEGORY_ICONS = {
  paint:
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg>',
  wheels:
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5 L12 8.5 M12 15.5 L12 20.5 M3.5 12 L8.5 12 M15.5 12 L20.5 12 M6 6 L9.5 9.5 M14.5 14.5 L18 18 M18 6 L14.5 9.5 M9.5 14.5 L6 18"/></svg>',
  rims:
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.2"/><path d="M12 9.8 L9.2 4.2 M13.9 11 L19.8 9.4 M13.2 13.6 L16.8 18.7 M10.8 13.6 L7.2 18.7 M10.1 11 L4.2 9.4"/></svg>',
  interior:
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 L5 12 C5 8 8 5.5 12 5.5 C16 5.5 19 8 19 12 L19 19"/><path d="M5 19 L19 19"/><path d="M7 19 L7 15.5 C7 13.8 8.5 12.5 10 12.5 L14 12.5 C15.5 12.5 17 13.8 17 15.5 L17 19"/></svg>',
  exhaust:
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10 L14 10 C16.5 10 18 12 18 14 L18 15"/><circle cx="19.5" cy="15" r="2.3"/></svg>',
  decal:
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 4 L9 20 M13 4 L13 20"/></svg>',
  spoiler:
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8 L20 8 M7 8 L7 13 M17 8 L17 13 M7 13 L17 13"/></svg>',
  sound:
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 A9 9 0 0 0 3 12 A9 9 0 0 0 6 18.5"/><path d="M18 18.5 A9 9 0 0 0 21 12 A9 9 0 0 0 12 3"/><path d="M12 12 L16 8"/><circle cx="12" cy="12" r="2"/></svg>',
  ambience:
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/><path d="M19 5v4m2-2h-4"/></svg>',
};

let activeCategory = null;

function buildOptionsPanel() {
  const panel = document.getElementById("options-panel");
  panel.innerHTML = "";

  // spoiler_finish isn't a tab of its own: its swatches sit in the Spoiler tab after the styles
  const TAB_ORDER = ["paint", "wheels", "rims", "interior", "exhaust", "decal", "spoiler", "sound", "ambience"];
  const rank = (t) => (TAB_ORDER.includes(t) ? TAB_ORDER.indexOf(t) : TAB_ORDER.length);
  const types = Object.keys(optionsByType)
    .filter((type) => type !== "spoiler_finish");
  if (!types.includes("sound")) types.push("sound");
  if (!types.includes("ambience")) types.push("ambience");
  types.sort((a, b) => rank(a) - rank(b));
  if (types.length === 0) return;
  activeCategory = types.includes(activeCategory) ? activeCategory : types[0];

  const swatchRow = document.createElement("div");
  swatchRow.className = "toolbar-swatches";
  panel.appendChild(swatchRow);

  const iconBar = document.createElement("div");
  iconBar.className = "toolbar-icons";
  types.forEach((type) => {
    const tab = document.createElement("button");
    tab.className = "toolbtn";
    tab.dataset.category = type;
    tab.innerHTML = `${CATEGORY_ICONS[type] || ""}<span>${CATEGORY_LABELS[type] || type}</span>`;
    tab.addEventListener("click", () => {
      activeCategory = type;
      renderSwatchRow();
      refreshTabSelection();
    });
    iconBar.appendChild(tab);
  });
  panel.appendChild(iconBar);

  renderSwatchRow();
  refreshTabSelection();
}

function refreshTabSelection() {
  document.querySelectorAll(".toolbtn").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.category === activeCategory);
  });
}

function renderSwatchRow() {
  const swatchRow = document.querySelector(".toolbar-swatches");
  if (!swatchRow) return;
  swatchRow.innerHTML = "";

  const type = activeCategory;
  if (type === "sound") {
    renderSoundRow(swatchRow);
    refreshPanelSelection();
    return;
  }
  if (type === "ambience") {
    renderAmbienceRow(swatchRow);
    refreshPanelSelection();
    return;
  }

  const options = optionsByType[type] || [];
  // Wheels/spoiler are swatches when they're colour options (these cars) and pills when
  // they're named styles/shapes (older Kenney-style cars with a part_file swap) — decided by
  // what's seeded. A spoiler's "None" choice has no colour (it removes the part), so at least
  // one colour among the options is enough to treat the whole row as swatches.
  const isColorType =
    type === "paint" || type === "interior" || (options.length > 0 && options.some((o) => o.color_hex));

  const label = document.createElement("span");
  label.className = "swatch-row-label";
  label.textContent = CATEGORY_LABELS[type] || type;
  swatchRow.appendChild(label);

  options.forEach((option) => {
    const el = document.createElement(isColorType ? "div" : "button");
    el.dataset.optionId = option.id;
    el.title = option.label;
    if (isColorType) {
      el.className = "swatch";
      if (option.color_hex) {
        el.style.backgroundColor = option.color_hex;
      } else {
        el.classList.add("swatch-none"); // e.g. spoiler "None" — an empty ring, not a fill
      }
    } else {
      el.className = "option-pill";
      el.textContent = option.label;
    }
    el.addEventListener("click", () => applyOption(option, { focus: true }));
    swatchRow.appendChild(el);
  });

  // The Spoiler tab shows the styles as pills, then a "Finish" group of colour swatches.
  const finishes = type === "spoiler" ? optionsByType.spoiler_finish || [] : [];
  if (finishes.length) {
    const finishLabel = document.createElement("span");
    finishLabel.className = "swatch-row-label swatch-row-label-sub";
    finishLabel.textContent = "Finish";
    swatchRow.appendChild(finishLabel);
    finishes.forEach((option) => {
      const el = document.createElement("div");
      el.dataset.optionId = option.id;
      el.title = option.label;
      el.className = "swatch";
      el.style.backgroundColor = option.color_hex;
      if (option.mesh_name === "finish:carbon") el.classList.add("swatch-carbon");
      el.addEventListener("click", () => applyOption(option, { focus: true }));
      swatchRow.appendChild(el);
    });
  }
  refreshPanelSelection();
}

function getSelectedOptionIds() {
  return Array.from(selectedOptionIds);
}

function getCookie(name) {
  const match = document.cookie.match(new RegExp("(?:^| )" + name + "=([^;]+)"));
  return match ? decodeURIComponent(match[1]) : null;
}

let toastEl = null;
let toastTimeout = null;

function showToast(message) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add("visible");
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toastEl.classList.remove("visible"), 3200);
}

async function handleSaveClick() {
  if (!carData.isAuthenticated) {
    showToast("Login to save and access your work");
    return;
  }

  showToast("Saving…");
  try {
    const response = await fetch("/garage/save/", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-CSRFToken": getCookie("csrftoken"),
      },
      body: JSON.stringify({ car_id: carData.carId, option_ids: getSelectedOptionIds() }),
    });
    showToast(response.ok ? "Saved to My Garage" : "Couldn't save — please try again.");
  } catch (error) {
    showToast("Couldn't save — please try again.");
    console.error("Save build failed:", error);
  }
}

function addSaveControls() {
  const bar = document.createElement("div");
  bar.className = "save-build-bar";

  const button = document.createElement("button");
  button.className = "save-build-btn";
  button.textContent = "Save my build";
  button.addEventListener("click", handleSaveClick);
  bar.appendChild(button);

  const toast = document.createElement("div");
  toast.className = "toast-message";
  bar.appendChild(toast);
  toastEl = toast;

  viewerEl.appendChild(bar);
}

// ---- Neon Underglow & Midnight Mode ---------------------------------------
let underglowGroup = null;
let activeUnderglowColor = "none";

function createUnderglowTexture(hexColor) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext("2d");

  const gradient = ctx.createRadialGradient(256, 256, 30, 256, 256, 250);
  gradient.addColorStop(0, hexColor);
  gradient.addColorStop(0.3, hexColor);
  gradient.addColorStop(0.65, hexColor + "99");
  gradient.addColorStop(1, "rgba(0,0,0,0)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 512, 512);

  return new THREE.CanvasTexture(canvas);
}

function setUnderglow(colorHex) {
  activeUnderglowColor = colorHex;
  const existing = scene.getObjectByName("UnderglowGroup");
  if (existing) scene.remove(existing);

  if (!colorHex || colorHex === "none" || !carRoot) return;

  const box = new THREE.Box3().setFromObject(carRoot);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const group = new THREE.Group();
  group.name = "UnderglowGroup";

  const planeGeo = new THREE.PlaneGeometry(size.x * 1.5, size.z * 1.35);
  const texture = createUnderglowTexture(colorHex);
  const planeMat = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 0.9,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const plane = new THREE.Mesh(planeGeo, planeMat);
  plane.rotation.x = -Math.PI / 2;
  plane.position.set(center.x, box.min.y + 0.015, center.z);
  group.add(plane);

  const lightColor = new THREE.Color(colorHex);
  const p1 = new THREE.PointLight(lightColor, 2.5, size.x * 2.5);
  p1.position.set(center.x - size.x * 0.3, box.min.y + 0.12, center.z);
  group.add(p1);

  const p2 = new THREE.PointLight(lightColor, 2.5, size.x * 2.5);
  p2.position.set(center.x + size.x * 0.3, box.min.y + 0.12, center.z);
  group.add(p2);

  scene.add(group);
}

let isMidnightMode = false;

function setMidnightMode(enabled) {
  isMidnightMode = enabled;
  const stage = document.querySelector(".viewer-stage");
  if (stage) stage.classList.toggle("midnight-mode", enabled);
  if (garage) garage.setMode(enabled ? "midnight" : "day");
  if (enabled) {
    ambientLight.intensity = 0.65;
    hemiLight.intensity = 0.72;
    keyLight.intensity = 1.35;
    keyLight.color.setHex(0xe2eeff);
  } else {
    ambientLight.intensity = 0.55;
    hemiLight.intensity = 0.75;
    keyLight.intensity = 1.2;
    keyLight.color.setHex(0xffffff);
  }
}

const UNDERGLOW_COLORS = [
  { name: "Off", hex: "none" },
  { name: "Cyan", hex: "#00f0ff" },
  { name: "Mint", hex: "#10b981" },
  { name: "Lime", hex: "#22c55e" },
  { name: "Electric Gold", hex: "#facc15" },
  { name: "Amber", hex: "#f97316" },
  { name: "Red", hex: "#ef4444" },
  { name: "Hot Pink", hex: "#ec4899" },
  { name: "Purple", hex: "#d946ef" },
  { name: "Ultraviolet", hex: "#7c3aed" },
  { name: "Blue", hex: "#3b82f6" },
  { name: "Ice White", hex: "#f8fafc" },
];

let audioEngine = null;

function initTurboAudio() {
  if (audioEngine) return;
  const carName = carData.name || (document.querySelector(".car-title") ? document.querySelector(".car-title").textContent : "");
  audioEngine = new TurboAudioEngine(carName);
  const profile = audioEngine.profile;

  audioEngine.onRpmChange = (rpm) => {
    const rpmNum = document.getElementById("turbo-rpm-num");
    const rpmFill = document.getElementById("turbo-rpm-fill");
    if (rpmNum) rpmNum.textContent = rpm;
    if (rpmFill) {
      const pct = Math.min(100, Math.max(0, (rpm / profile.maxRpm) * 100));
      rpmFill.style.width = pct + "%";
    }
  };

  // Spacebar revving support globally
  window.addEventListener("keydown", (e) => {
    if (e.code === "Space" && (e.target === document.body || e.target === viewerEl || (e.target.classList && e.target.classList.contains("toolbtn"))) && audioEngine.isRunning && !audioEngine.isRevving) {
      e.preventDefault();
      const revBtn = document.querySelector(".btn-rev");
      if (revBtn) revBtn.classList.add("revving");
      const badge = document.getElementById("turbo-badge");
      if (badge) badge.textContent = "REV";
      audioEngine.startRev();
    }
  });

  window.addEventListener("keyup", (e) => {
    if (e.code === "Space" && audioEngine.isRunning && audioEngine.isRevving) {
      e.preventDefault();
      const revBtn = document.querySelector(".btn-rev");
      if (revBtn) revBtn.classList.remove("revving");
      const badge = document.getElementById("turbo-badge");
      if (badge) badge.textContent = "IDLE";
      audioEngine.releaseRev();
    }
  });
}

function updateSoundToolbtnBadge() {
  const soundBtn = document.querySelector('.toolbtn[data-category="sound"]');
  if (!soundBtn) return;
  soundBtn.classList.toggle("engine-on", Boolean(audioEngine && audioEngine.isRunning));
}

function renderSoundRow(container) {
  if (!audioEngine) initTurboAudio();
  const profile = audioEngine.profile;

  const row = document.createElement("div");
  row.className = "sound-toolbar-row";

  const label = document.createElement("span");
  label.className = "swatch-row-label";
  label.textContent = "Turbo Sound";
  row.appendChild(label);

  const title = document.createElement("span");
  title.className = "sound-engine-title";
  title.textContent = profile.engineTitle;
  row.appendChild(title);

  const badge = document.createElement("span");
  badge.className = "turbo-audio-badge" + (audioEngine.isRunning ? " active" : "");
  badge.id = "turbo-badge";
  badge.textContent = audioEngine.isRunning ? (audioEngine.isRevving ? "REV" : "IDLE") : "OFF";
  row.appendChild(badge);

  const igniteBtn = document.createElement("button");
  igniteBtn.className = "turbo-btn btn-ignite" + (audioEngine.isRunning ? " running" : "");
  igniteBtn.textContent = audioEngine.isRunning ? "Stop Engine" : "Start Engine";
  row.appendChild(igniteBtn);

  const revBtn = document.createElement("button");
  revBtn.className = "turbo-btn btn-rev";
  revBtn.textContent = "Rev (Hold)";
  revBtn.disabled = !audioEngine.isRunning;
  revBtn.title = "Click & hold or press Spacebar to rev";
  row.appendChild(revBtn);

  const meter = document.createElement("div");
  meter.className = "turbo-rpm-meter-dock";
  const curRpm = audioEngine.currentRpm || 0;
  const pct = Math.min(100, Math.max(0, (curRpm / profile.maxRpm) * 100));
  meter.innerHTML = `
    <div class="turbo-rpm-text-dock">
      <span>RPM</span>
      <span id="turbo-rpm-num">${curRpm}</span>
    </div>
    <div class="turbo-rpm-bar-track-dock">
      <div class="turbo-rpm-bar-fill-dock" id="turbo-rpm-fill" style="width: ${pct}%"></div>
    </div>
  `;
  row.appendChild(meter);

  container.appendChild(row);

  igniteBtn.addEventListener("click", () => {
    const running = audioEngine.toggleEngine();
    if (running) {
      igniteBtn.textContent = "Stop Engine";
      igniteBtn.classList.add("running");
      badge.textContent = "IDLE";
      badge.classList.add("active");
      revBtn.disabled = false;
      showToast("Engine started! Hold Rev or press Spacebar");
    } else {
      igniteBtn.textContent = "Start Engine";
      igniteBtn.classList.remove("running");
      badge.textContent = "OFF";
      badge.classList.remove("active");
      revBtn.disabled = true;
      const rpmNum = document.getElementById("turbo-rpm-num");
      const rpmFill = document.getElementById("turbo-rpm-fill");
      if (rpmNum) rpmNum.textContent = "0";
      if (rpmFill) rpmFill.style.width = "0%";
    }
    updateSoundToolbtnBadge();
  });

  const startRev = (e) => {
    if (e && e.type !== "keydown") e.preventDefault();
    if (!audioEngine.isRunning) return;
    revBtn.classList.add("revving");
    badge.textContent = "REV";
    audioEngine.startRev();
  };

  const endRev = (e) => {
    if (e && e.type !== "keyup") e.preventDefault();
    if (!audioEngine.isRunning) return;
    revBtn.classList.remove("revving");
    badge.textContent = "IDLE";
    audioEngine.releaseRev();
  };

  revBtn.addEventListener("mousedown", startRev);
  window.addEventListener("mouseup", endRev);
  revBtn.addEventListener("touchstart", startRev, { passive: false });
  window.addEventListener("touchend", endRev);
}

function renderAmbienceRow(container) {
  const row = document.createElement("div");
  row.className = "ambience-toolbar-row";

  const label = document.createElement("span");
  label.className = "swatch-row-label";
  label.textContent = "Ambience";
  row.appendChild(label);

  const nightBtn = document.createElement("button");
  nightBtn.className = "atmo-btn btn-night" + (isMidnightMode ? " active" : "");
  nightBtn.textContent = isMidnightMode ? "☀️ Daylight" : "🌙 Midnight";
  nightBtn.title = "Switch between Day and Midnight Garage mode";
  row.appendChild(nightBtn);

  const divider = document.createElement("span");
  divider.className = "swatch-row-label swatch-row-label-sub";
  divider.textContent = "Underglow";
  row.appendChild(divider);

  const labelText = document.createElement("span");
  labelText.className = "underglow-label-status";
  const activeObj = UNDERGLOW_COLORS.find((c) => c.hex === activeUnderglowColor);
  labelText.textContent = activeObj ? activeObj.name : "Off";
  row.appendChild(labelText);

  const swatchesEl = document.createElement("div");
  swatchesEl.className = "underglow-swatches-dock";

  UNDERGLOW_COLORS.forEach((item) => {
    const swatch = document.createElement("button");
    swatch.dataset.color = item.hex;
    swatch.title = `Underglow: ${item.name}`;
    const isActive = (item.hex === "none" && (!activeUnderglowColor || activeUnderglowColor === "none")) || (activeUnderglowColor === item.hex);
    if (item.hex === "none") {
      swatch.className = "underglow-swatch underglow-swatch-none" + (isActive ? " active" : "");
    } else {
      swatch.className = "underglow-swatch" + (isActive ? " active" : "");
      swatch.style.backgroundColor = item.hex;
    }
    swatch.addEventListener("click", () => {
      setUnderglow(item.hex);
      swatchesEl.querySelectorAll(".underglow-swatch").forEach((el) => {
        el.classList.toggle("active", el.dataset.color === item.hex);
      });
      labelText.textContent = item.name;
    });
    swatchesEl.appendChild(swatch);
  });
  row.appendChild(swatchesEl);

  nightBtn.addEventListener("click", () => {
    const nextState = !isMidnightMode;
    setMidnightMode(nextState);
    nightBtn.classList.toggle("active", nextState);
    nightBtn.textContent = nextState ? "☀️ Daylight" : "🌙 Midnight";
    if (nextState && (!activeUnderglowColor || activeUnderglowColor === "none")) {
      setUnderglow("#00f0ff");
      swatchesEl.querySelectorAll(".underglow-swatch").forEach((el) => {
        el.classList.toggle("active", el.dataset.color === "#00f0ff");
      });
      labelText.textContent = "Cyan";
    }
  });

  container.appendChild(row);
}

function applyPreselectedOptions() {
  preselectedOptionIds.forEach((id) => {
    const option = carData.options.find((o) => o.id === id);
    if (option) applyOption(option);
  });
}

function setupWindowGlassMaterial() {
  if (!carRoot) return;
  carRoot.traverse((child) => {
    if (child.isMesh && /window|glass/i.test(child.name)) {
      child.material = child.material.clone();
      child.material.transparent = true;
      child.material.opacity = 0.22;
      child.material.roughness = 0.06;
      child.material.metalness = 0.85;
      child.material.depthWrite = false;
      child.material.side = THREE.DoubleSide;
      child.material.needsUpdate = true;
    }
  });
}

function buildGarageAroundCar() {
  const bounds = getCarBounds();
  if (!bounds) return;
  garage = buildGarage({ center: bounds.center, floorY: bounds.box.min.y, carSize: bounds.size });
  scene.add(garage.group);
  scene.background = garage.backdrop;
  garage.setMode(isMidnightMode ? "midnight" : "day");
}

function onModelReady() {
  scene.add(carRoot);
  buildGarageAroundCar();
  ensureCabinLights();
  setupWindowGlassMaterial();
  if (carData.paintMode === "palette") setupPalette();
  frameCameraFromDirection(VIEW_DIRECTIONS.front);
  addViewPresetButtons();
  addSaveControls();
  initTurboAudio();
  buildOptionsPanel();
  applyPreselectedOptions();
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
  applyViewOffset();
  camera.updateProjectionMatrix();
  renderer.setSize(viewerEl.clientWidth, viewerEl.clientHeight);
}
window.addEventListener("resize", onResize);

function animate() {
  requestAnimationFrame(animate);
  if (!focusTween.active) {
    updateSafeZoomLimits();
    controls.update();
    if (!isDragging && !isInteriorMode) applyIdleDrift();
  } else {
    updateFocusTween();
  }
  // Panning or the idle drift must never carry the camera out through a garage wall or the floor.
  if (garage) {
    garage.clampInside(controls.target, 1.5, 0.05);
    garage.clampInside(camera.position, 0.6, 0.12);
  }
  renderer.render(scene, camera);
}
animate();

window.controls = controls;
window.camera = camera;
window.scene = scene;
window.getCarRoot = () => carRoot; // debugging aid, like the three above

export { scene, carData, getSelectedOptionIds };
