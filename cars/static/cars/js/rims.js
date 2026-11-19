import * as THREE from "three";

// Alternative rim designs, built in code and fitted to each car's own wheels.
//
// The car's real rims (already split out of the tyres, see cars/seed_assets/README.md) are hidden
// when a design is picked and a new rim is built in the same place: same axle, same outer radius,
// same width, so the tyre still meets it exactly and the brake discs and calipers show through
// the spokes just as they do on the stock rims. Designs are drawn from the four classics in the
// reference sheet: a Y-spoke multi-spoke, a swept turbine, a lattice mesh and a hex-pocket disc.

// ---- Finding the wheels -----------------------------------------------------------------------
// The stock rim meshes hold all of a car's wheels (some in one mesh, some in several), so the
// wheels are told apart by which quarter of the car they sit in.
export function findWheels(carRoot, rimMeshes) {
  carRoot.updateMatrixWorld(true);
  const carBox = new THREE.Box3().setFromObject(carRoot);
  const cx = (carBox.min.x + carBox.max.x) / 2;
  const cz = (carBox.min.z + carBox.max.z) / 2;
  const quarters = new Map();
  const v = new THREE.Vector3();
  rimMeshes.forEach((mesh) => {
    const pos = mesh.geometry.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      const key = `${v.x >= cx ? 1 : -1},${v.z >= cz ? 1 : -1}`;
      let q = quarters.get(key);
      if (!q) quarters.set(key, (q = { box: new THREE.Box3(), pts: [] }));
      q.box.expandByPoint(v);
      if (i % 3 === 0) q.pts.push(v.x, v.y, v.z); // a third of the points is plenty for the radius
    }
  });

  const wheels = [];
  quarters.forEach((q) => {
    const centre = q.box.getCenter(new THREE.Vector3());
    // The axle runs along x, through the middle of the wheel in y and z.
    let radius = 0;
    for (let i = 0; i < q.pts.length; i += 3) {
      radius = Math.max(radius, Math.hypot(q.pts[i + 1] - centre.y, q.pts[i + 2] - centre.z));
    }
    const side = centre.x >= cx ? 1 : -1; // which way is "out" for this wheel
    wheels.push({ centre, radius, width: q.box.max.x - q.box.min.x, outboard: side === 1 ? q.box.max.x : q.box.min.x, side });
  });
  return wheels;
}

// The stock rim meshes of the sedan and sports sedan also carry a thin ring of tyre rubber, so their
// farthest vertex is the tyre's edge, not the rim's. Measured by looking for the gap in the vertices'
// distance from the axle; the other two cars' rim meshes are rim only, so their own extent is right.
const RIM_RADIUS = { Sedan: 0.288, "Sports Sedan": 0.305 };

// ---- Materials --------------------------------------------------------------------------------
export function makeRimMaterial(hex, envMap) {
  return new THREE.MeshStandardMaterial({ color: hex, metalness: 0.88, roughness: 0.26, envMap, envMapIntensity: 1.1, side: THREE.DoubleSide });
}

// ---- Parts ------------------------------------------------------------------------------------
// Everything is built with the axle along +z and "outboard" (the face you see) at z = 0 looking
// toward +z; the barrel runs back to z = -depth. The wheel is rotated into place afterwards.

function barrel(R, depth) {
  const t = Math.max(0.008, R * 0.04);
  const profile = [
    new THREE.Vector2(R * 0.84, -t),
    new THREE.Vector2(R * 0.9, 0),
    new THREE.Vector2(R * 0.985, 0),
    new THREE.Vector2(R, -t * 0.6),
    new THREE.Vector2(R, -depth),
    new THREE.Vector2(R - t, -depth),
    new THREE.Vector2(R - t, -t * 2),
  ];
  const geometry = new THREE.LatheGeometry(profile, 72);
  geometry.rotateX(Math.PI / 2); // lathe axis y -> z
  return geometry;
}

// A spoke that sweeps as it goes: half-width w0 at the hub end, w1 at the rim end, turning through
// `sweep` radians on the way. Returned as a flat shape in the wheel's plane (angle 0 points up the y axis).
function spokeShape(rIn, rOut, w0, w1, sweep, rot = 0, steps = 14) {
  const left = [];
  const right = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const r = rIn + (rOut - rIn) * t;
    const a = rot + sweep * t;
    const c = Math.cos(a), s = Math.sin(a);
    // radial direction (−s, c) is "up the spoke"; the normal is (c, s)
    const px = -s * r, py = c * r;
    const w = w0 + (w1 - w0) * t;
    left.push([px + c * w, py + s * w]);
    right.push([px - c * w, py - s * w]);
  }
  const pts = [...left, ...right.reverse()];
  const shape = new THREE.Shape();
  shape.moveTo(pts[0][0], pts[0][1]);
  for (let i = 1; i < pts.length; i++) shape.lineTo(pts[i][0], pts[i][1]);
  shape.closePath();
  return shape;
}

function extrude(shapes, z0, thickness, bevel = 0.0025) {
  const geometry = new THREE.ExtrudeGeometry(shapes, { depth: thickness, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 1, curveSegments: 10 });
  geometry.translate(0, 0, z0);
  return geometry;
}

function hub(R, depth, faceZ) {
  const parts = [];
  const hubR = R * 0.2;
  const cap = new THREE.CylinderGeometry(hubR, hubR * 1.05, depth * 0.22, 40);
  cap.rotateX(Math.PI / 2);
  cap.translate(0, 0, faceZ + depth * 0.02);
  parts.push(cap);
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    const bolt = new THREE.CylinderGeometry(R * 0.022, R * 0.022, depth * 0.14, 12);
    bolt.rotateX(Math.PI / 2);
    bolt.translate(Math.sin(a) * hubR * 0.62, Math.cos(a) * hubR * 0.62, faceZ + depth * 0.14);
    parts.push(bolt);
  }
  return parts;
}

// Each design returns the list of geometries (in the wheel's local space) that make up the face.
const DESIGNS = {
  // Y-spoke: ten slim stems, each forking into two fine spokes near the rim.
  multispoke(R, depth) {
    const faceZ = -depth * 0.2;
    const th = depth * 0.1;
    const n = 10;
    const geoms = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      const shapes = [
        spokeShape(R * 0.2, R * 0.62, R * 0.05, R * 0.04, 0, a),
        spokeShape(R * 0.6, R * 0.97, R * 0.028, R * 0.022, 0.2, a),
        spokeShape(R * 0.6, R * 0.97, R * 0.028, R * 0.022, -0.2, a),
      ];
      geoms.push(extrude(shapes, faceZ, th));
    }
    geoms.push(...hub(R, depth, faceZ));
    return geoms;
  },

  // Turbine: twelve broad blades that sweep round like a fan.
  turbine(R, depth) {
    const faceZ = -depth * 0.18;
    const th = depth * 0.11;
    const n = 12;
    const geoms = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      geoms.push(extrude(spokeShape(R * 0.2, R * 0.97, R * 0.075, R * 0.04, 0.72, a), faceZ, th));
    }
    geoms.push(...hub(R, depth, faceZ));
    return geoms;
  },

  // Mesh: two sets of fine curved spokes crossing each other, with a deeper lip.
  mesh(R, depth) {
    const faceZ = -depth * 0.22;
    const th = depth * 0.07;
    const n = 20;
    const geoms = [];
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2;
      geoms.push(extrude(spokeShape(R * 0.2, R * 0.96, R * 0.022, R * 0.022, 0.62, a), faceZ, th, 0.0015));
      geoms.push(extrude(spokeShape(R * 0.2, R * 0.96, R * 0.022, R * 0.022, -0.62, a), faceZ - th * 0.9, th, 0.0015));
    }
    // a stepped inner ring where the mesh meets the barrel
    const ring = new THREE.RingGeometry(R * 0.84, R * 0.97, 72);
    ring.translate(0, 0, faceZ + th * 0.5);
    geoms.push(ring);
    geoms.push(...hub(R, depth, faceZ - th * 0.9));
    return geoms;
  },

  // Hex-pocket: a solid disc face with six hexagonal windows cut through it.
  hex(R, depth) {
    const faceZ = -depth * 0.16;
    const th = depth * 0.12;
    const shape = new THREE.Shape();
    shape.absarc(0, 0, R * 0.97, 0, Math.PI * 2, false);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      const cx = Math.sin(a) * R * 0.56;
      const cy = Math.cos(a) * R * 0.56;
      const hole = new THREE.Path();
      const hr = R * 0.255;
      for (let j = 0; j < 6; j++) {
        const b = -a + (j / 6) * Math.PI * 2 + Math.PI / 6;
        const x = cx + Math.cos(b) * hr;
        const y = cy + Math.sin(b) * hr;
        if (j === 0) hole.moveTo(x, y);
        else hole.lineTo(x, y);
      }
      hole.closePath();
      shape.holes.push(hole);
    }
    const centreHole = new THREE.Path();
    centreHole.absarc(0, 0, R * 0.15, 0, Math.PI * 2, true);
    shape.holes.push(centreHole);
    const geoms = [extrude([shape], faceZ, th)];
    geoms.push(...hub(R, depth, faceZ));
    return geoms;
  },
};

export const RIM_DESIGNS = Object.keys(DESIGNS);

function buildOne(R, depth, designKey, material) {
  const group = new THREE.Group();
  const parts = [barrel(R, depth), ...DESIGNS[designKey](R, depth)];
  parts.forEach((geometry) => group.add(new THREE.Mesh(geometry, material)));
  return group;
}

// A full set: one rim per wheel found on the car, each turned so its face points outboard.
export function buildRimSet(carRoot, rimMeshes, designKey, material, carName) {
  if (!DESIGNS[designKey]) return null;
  const wheels = findWheels(carRoot, rimMeshes);
  if (!wheels.length) return null;
  const set = new THREE.Group();
  set.name = "GeneratedRims";
  wheels.forEach((wheel) => {
    // the stock rim's own depth is a decent guess at how deep the barrel should run
    const radius = RIM_RADIUS[carName] ?? wheel.radius;
    const depth = Math.min(Math.max(wheel.width * 0.9, 0.12), radius * 0.85);
    const rim = buildOne(radius * 0.985, depth, designKey, material);
    // local +z (the face) must point outboard along x; local y stays up
    rim.rotation.y = wheel.side === 1 ? Math.PI / 2 : -Math.PI / 2;
    rim.position.set(wheel.outboard - wheel.side * 0.004, wheel.centre.y, wheel.centre.z);
    set.add(rim);
  });
  return set;
}
