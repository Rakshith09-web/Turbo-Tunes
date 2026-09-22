import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DecalGeometry } from "three/addons/geometries/DecalGeometry.js";
import { createPalettePainter } from "./palette.js";

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
scene.background = new THREE.Color(0xf5f0e6);

const camera = new THREE.PerspectiveCamera(
  45,
  viewerEl.clientWidth / viewerEl.clientHeight,
  0.1,
  1000
);

// ?capture keeps the last rendered frame readable, for saving car thumbnails.
const renderer = new THREE.WebGLRenderer({
  antialias: true,
  preserveDrawingBuffer: new URLSearchParams(location.search).has("capture"),
});
renderer.setSize(viewerEl.clientWidth, viewerEl.clientHeight);
renderer.setPixelRatio(window.devicePixelRatio);
viewerEl.appendChild(renderer.domElement);

// Lift the car in the frame so the floating toolbar at the bottom doesn't cover it.
const VIEW_LIFT = 0.1;
function applyViewOffset() {
  const width = viewerEl.clientWidth;
  const height = viewerEl.clientHeight;
  camera.setViewOffset(width, height, 0, height * VIEW_LIFT, width, height);
}
applyViewOffset();

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

scene.add(new THREE.AmbientLight(0xffffff, 0.55));
scene.add(new THREE.HemisphereLight(0xffffff, 0xd9d2c0, 0.75));
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
  const overhead = Math.abs(direction.y) > 0.9; // top/bottom need more room than side views
  const distance = maxDim * (overhead ? 1.95 : 1.65);

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

// ---- Exhaust -----------------------------------------------------------------------------
// Options named "generated:<style>" are built in code (the free models have no exhaust parts).
function buildExhaust(style) {
  const box = new THREE.Box3().setFromObject(carRoot);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const tipRadius = style === "dual" ? size.x * 0.05 : size.x * 0.06;
  const xOffsets = style === "dual" ? [-size.x * 0.24, size.x * 0.24] : [size.x * 0.24];

  const group = new THREE.Group();
  group.name = "GeneratedExhaust";
  const metal = new THREE.MeshStandardMaterial({ color: 0xdfe2e8, metalness: 0.7, roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x0c0c0e });

  xOffsets.forEach((dx) => {
    const tube = new THREE.Mesh(
      new THREE.CylinderGeometry(tipRadius, tipRadius, size.z * 0.05, 20, 1, true),
      metal
    );
    tube.material.side = THREE.DoubleSide;
    const hole = new THREE.Mesh(new THREE.CircleGeometry(tipRadius * 0.85, 20), dark);
    hole.rotation.y = Math.PI;
    hole.position.z = size.z * 0.02;
    const tip = new THREE.Group();
    tip.add(tube, hole);
    tube.rotation.x = Math.PI / 2;
    tip.position.set(center.x + dx, box.min.y + size.y * 0.26, box.min.z + size.z * 0.005);
    group.add(tip);
  });
  return group;
}

function applyExhaust(option) {
  if (!option.mesh_name.startsWith("generated:")) return showOnly(option);

  const existing = carRoot.getObjectByName("GeneratedExhaust");
  if (existing) carRoot.remove(existing);
  const style = option.mesh_name.split(":")[1];
  if (style !== "none") carRoot.add(buildExhaust(style));
  return true;
}

// ---- Spoiler -----------------------------------------------------------------------------
// Built in code from the car's own bounding box, same idea as the exhaust generator — this
// works on every car regardless of whether its model has a spoiler of its own (most don't:
// on these scanned cars, a real spoiler is either fused into the body as one continuous
// surface with no separate part to target, or, like the sedan, isn't modelled at all).
function buildSpoiler(hex) {
  const box = new THREE.Box3().setFromObject(carRoot);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  const group = new THREE.Group();
  group.name = "GeneratedSpoiler";
  const material = new THREE.MeshStandardMaterial({ color: hex, metalness: 0.5, roughness: 0.3 });

  const wingWidth = size.x * 0.76;
  const wingDepth = size.z * 0.09;
  const wingThickness = size.y * 0.03;
  const strutHeight = size.y * 0.15;
  const strutWidth = size.x * 0.025;

  const wingZ = box.min.z + size.z * 0.05; // near the rear
  const wingY = box.max.y + strutHeight;

  const wing = new THREE.Mesh(new THREE.BoxGeometry(wingWidth, wingThickness, wingDepth), material);
  wing.position.set(center.x, wingY, wingZ);
  group.add(wing);

  const strutGeometry = new THREE.BoxGeometry(strutWidth, strutHeight, wingDepth * 0.55);
  [-1, 1].forEach((side) => {
    const strut = new THREE.Mesh(strutGeometry, material);
    strut.position.set(center.x + side * wingWidth * 0.36, box.max.y + strutHeight / 2, wingZ);
    group.add(strut);
  });

  return group;
}

function applySpoiler(option) {
  const existing = carRoot.getObjectByName("GeneratedSpoiler");
  if (existing) carRoot.remove(existing);
  if (option.color_hex) carRoot.add(buildSpoiler(option.color_hex));
  return true;
}

// ---- Decals ------------------------------------------------------------------------------
// Decals are projected onto the body from above, so they follow its shape whatever its UVs.
let decalMesh = null;

function clearDecal() {
  if (decalMesh) {
    scene.remove(decalMesh);
    decalMesh.geometry.dispose();
    decalMesh.material.dispose();
    decalMesh = null;
  }
}

function applyDecal(option) {
  clearDecal();
  if (!option.texture_url) return Promise.resolve(true);

  const target = findMeshByName(option.mesh_name);
  if (!target) {
    console.warn(`Mesh "${option.mesh_name}" not found in this car's model.`);
    return Promise.resolve(false);
  }

  return new Promise((resolve) => {
    new THREE.TextureLoader().load(
      option.texture_url,
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        carRoot.updateMatrixWorld(true);
        const box = new THREE.Box3().setFromObject(target);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());

        // Projector looks straight down: local x = across the car, local y = along it.
        const depth = size.y * 1.2;
        const geometry = new DecalGeometry(
          target,
          new THREE.Vector3(center.x, box.max.y - depth / 2 + size.y * 0.02, center.z),
          new THREE.Euler(-Math.PI / 2, 0, 0),
          new THREE.Vector3(size.x * 0.9, size.z * 1.02, depth)
        );
        const material = new THREE.MeshStandardMaterial({
          map: texture,
          transparent: true,
          depthWrite: false,
          polygonOffset: true,
          polygonOffsetFactor: -4,
          roughness: 0.55,
        });
        clearDecal();
        decalMesh = new THREE.Mesh(geometry, material);
        scene.add(decalMesh);
        resolve(true);
      },
      undefined,
      () => resolve(false)
    );
  });
}

// ---- Applying an option ------------------------------------------------------------------
async function applyOption(option) {
  if (!carRoot) return;

  let applied = false;
  if (option.option_type === "paint") applied = applyPaint(option);
  else if (option.option_type === "interior") applied = applyInterior(option);
  else if (option.option_type === "decal") applied = await applyDecal(option);
  else if (option.option_type === "wheels") applied = await applyWheels(option);
  else if (option.option_type === "exhaust") applied = applyExhaust(option);
  else if (option.option_type === "spoiler") applied = applySpoiler(option);
  if (!applied) return;

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

const CATEGORY_LABELS = {
  paint: "Paint",
  wheels: "Wheels",
  interior: "Interior",
  exhaust: "Exhaust",
  decal: "Decals",
  spoiler: "Spoiler",
};

// Stroke-based, 17px, one consistent style — matches the icon set used in the draft mockup.
const CATEGORY_ICONS = {
  paint:
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/></svg>',
  wheels:
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.5"/><path d="M12 3.5 L12 8.5 M12 15.5 L12 20.5 M3.5 12 L8.5 12 M15.5 12 L20.5 12 M6 6 L9.5 9.5 M14.5 14.5 L18 18 M18 6 L14.5 9.5 M9.5 14.5 L6 18"/></svg>',
  interior:
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 L5 12 C5 8 8 5.5 12 5.5 C16 5.5 19 8 19 12 L19 19"/><path d="M5 19 L19 19"/><path d="M7 19 L7 15.5 C7 13.8 8.5 12.5 10 12.5 L14 12.5 C15.5 12.5 17 13.8 17 15.5 L17 19"/></svg>',
  exhaust:
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10 L14 10 C16.5 10 18 12 18 14 L18 15"/><circle cx="19.5" cy="15" r="2.3"/></svg>',
  decal:
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M9 4 L9 20 M13 4 L13 20"/></svg>',
  spoiler:
    '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 8 L20 8 M7 8 L7 13 M17 8 L17 13 M7 13 L17 13"/></svg>',
};

let activeCategory = null;

function buildOptionsPanel() {
  const panel = document.getElementById("options-panel");
  panel.innerHTML = "";

  const types = Object.keys(optionsByType);
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
    el.addEventListener("click", () => applyOption(option));
    swatchRow.appendChild(el);
  });
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

function applyPreselectedOptions() {
  preselectedOptionIds.forEach((id) => {
    const option = carData.options.find((o) => o.id === id);
    if (option) applyOption(option);
  });
}

function onModelReady() {
  scene.add(carRoot);
  if (carData.paintMode === "palette") setupPalette();
  frameCameraFromDirection(VIEW_DIRECTIONS.front);
  addViewPresetButtons();
  addSaveControls();
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
  controls.update();
  if (!isDragging) applyIdleDrift();
  renderer.render(scene, camera);
}
animate();

export { scene, carData, getSelectedOptionIds };
