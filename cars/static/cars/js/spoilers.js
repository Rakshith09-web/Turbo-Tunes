import * as THREE from "three";

// Spoilers that belong to the car instead of sitting on it.
//
// Nothing here is a loose box on legs. A lip or ducktail is a thin "skin" laid over the real
// trunk lid: the lid's surface is found by firing rays at it from above, and the spoiler's
// underside follows it exactly (and sinks a few millimetres into it), so it grows out of the
// lid the way a bonded-on carbon spoiler does. Wings stand on swan-neck pylons whose feet are
// flanges lying flat on the lid, found the same way. The shapes follow real parts: CS-style
// trunk lips, the CSL ducktail, decklid spoilers, duckbills, AMG spoiler caps and so on.

const SINK = 0.0015; // how far the underside tucks into the body, so there is never a visible gap

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smooth = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function isShown(object) {
  for (let o = object; o; o = o.parent) if (!o.visible) return false;
  return true;
}

function isGenerated(object) {
  for (let o = object; o; o = o.parent) if (o.name && o.name.startsWith("Generated")) return true;
  return false;
}

// ---- Surface probing ---------------------------------------------------------------------
// A "probe" answers: how high is the car's surface at this (x, z), seen from above, and which
// way does it face? Casting thousands of real rays at a 100k-triangle body is far too slow, so
// the triangles from the rear part of the car are copied once into a coarse grid and each query
// only tests the few triangles standing over that spot (vertical rays make this a 2D problem).
export function makeProbe(carRoot, only = null) {
  carRoot.updateMatrixWorld(true);
  const wanted = (o) => o.isMesh && isShown(o) && !isGenerated(o) && (!only || only.includes(o));
  const box = new THREE.Box3();
  carRoot.traverse((o) => {
    if (wanted(o)) box.expandByObject(o);
  });
  const size = box.getSize(new THREE.Vector3());
  const zLimit = only ? Infinity : box.min.z + size.z * 0.5; // only the rear half matters for a spoiler
  const yLimit = only ? -Infinity : box.min.y + size.y * 0.3;
  const CELL = 0.04;
  const grid = new Map();
  const tris = []; // x0,z0,y0, x1,z1,y1, x2,z2,y2
  const a = new THREE.Vector3();
  const b = new THREE.Vector3();
  const c = new THREE.Vector3();

  carRoot.traverse((o) => {
    if (!wanted(o)) return;
    if (!only && o.material && o.material.transparent) return; // glass
    const pos = o.geometry.getAttribute("position");
    const index = o.geometry.index;
    const count = index ? index.count : pos.count;
    for (let t = 0; t < count; t += 3) {
      const i0 = index ? index.getX(t) : t;
      const i1 = index ? index.getX(t + 1) : t + 1;
      const i2 = index ? index.getX(t + 2) : t + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(o.matrixWorld);
      b.fromBufferAttribute(pos, i1).applyMatrix4(o.matrixWorld);
      c.fromBufferAttribute(pos, i2).applyMatrix4(o.matrixWorld);
      if (Math.min(a.z, b.z, c.z) > zLimit || Math.max(a.y, b.y, c.y) < yLimit) continue;
      const id = tris.length / 9;
      tris.push(a.x, a.z, a.y, b.x, b.z, b.y, c.x, c.z, c.y);
      const x0 = Math.floor(Math.min(a.x, b.x, c.x) / CELL);
      const x1 = Math.floor(Math.max(a.x, b.x, c.x) / CELL);
      const z0 = Math.floor(Math.min(a.z, b.z, c.z) / CELL);
      const z1 = Math.floor(Math.max(a.z, b.z, c.z) / CELL);
      for (let ix = x0; ix <= x1; ix++) {
        for (let iz = z0; iz <= z1; iz++) {
          const key = ix * 100003 + iz;
          let list = grid.get(key);
          if (!list) grid.set(key, (list = []));
          list.push(id);
        }
      }
    }
  });

  const probe = (x, z) => {
    const list = grid.get(Math.floor(x / CELL) * 100003 + Math.floor(z / CELL));
    if (!list) return null;
    let bestY = -Infinity;
    let best = -1;
    for (const id of list) {
      const k = id * 9;
      const x0 = tris[k], z0 = tris[k + 1], y0 = tris[k + 2];
      const x1 = tris[k + 3], z1 = tris[k + 4], y1 = tris[k + 5];
      const x2 = tris[k + 6], z2 = tris[k + 7], y2 = tris[k + 8];
      const det = (z1 - z2) * (x0 - x2) + (x2 - x1) * (z0 - z2);
      if (Math.abs(det) < 1e-12) continue;
      const l0 = ((z1 - z2) * (x - x2) + (x2 - x1) * (z - z2)) / det;
      const l1 = ((z2 - z0) * (x - x2) + (x0 - x2) * (z - z2)) / det;
      const l2 = 1 - l0 - l1;
      if (l0 < -1e-6 || l1 < -1e-6 || l2 < -1e-6) continue;
      const y = l0 * y0 + l1 * y1 + l2 * y2;
      if (y > bestY) {
        bestY = y;
        best = k;
      }
    }
    if (best < 0) return null;
    // face normal of the winning triangle (x, y, z order restored), pointing up
    const k = best;
    const e1 = new THREE.Vector3(tris[k + 3] - tris[k], tris[k + 5] - tris[k + 2], tris[k + 4] - tris[k + 1]);
    const e2 = new THREE.Vector3(tris[k + 6] - tris[k], tris[k + 8] - tris[k + 2], tris[k + 7] - tris[k + 1]);
    const normal = e1.cross(e2).normalize();
    if (normal.y < 0) normal.negate();
    return { y: bestY, normal };
  };
  probe.box = box;
  return probe;
}

// March from the front toward the rear along a line and stop where the lid drops away.
export function findRearEdge(probe, x, zFront, zBack) {
  const step = 0.01;
  let prev = probe(x, zFront);
  if (!prev) return null;
  let lastGood = zFront;
  for (let z = zFront - step; z >= zBack; z -= step) {
    const hit = probe(x, z);
    if (!hit || hit.y < prev.y - 0.025) return lastGood;
    prev = hit;
    lastGood = z;
  }
  return lastGood;
}

// The lid's trailing edge is not a straight line (it tucks forward toward the tail lights), so
// every column across the car gets its own edge. Walk outward from the centre line until the
// edge pulls too far forward or changes height, i.e. until we've left the lid.
function scanLid(probe, zFront, zBack, xc = 0) {
  const centreEdge = findRearEdge(probe, xc, zFront, zBack);
  if (centreEdge == null) return null;
  const centreHit = probe(xc, centreEdge);
  const centreY = centreHit ? centreHit.y : probe.box.max.y * 0.8;
  const cache = new Map();
  const edgeAt = (x) => {
    const key = Math.round(x * 1000);
    if (!cache.has(key)) cache.set(key, findRearEdge(probe, xc + x, zFront, zBack));
    return cache.get(key);
  };
  let hw = 0;
  for (let x = 0.02; x < 1.2; x += 0.02) {
    const edge = edgeAt(x);
    const hit = edge == null ? null : probe(xc + x, edge);
    if (edge == null || edge > centreEdge + 0.16 || !hit || Math.abs(hit.y - centreY) > 0.05) break;
    hw = x;
  }
  return { centreEdge, centreY, hw, edgeAt };
}

// ---- Materials ---------------------------------------------------------------------------
let carbonTexture = null;
function getCarbonTexture() {
  if (carbonTexture) return carbonTexture;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const g = canvas.getContext("2d");
  const cell = size / 8;
  for (let i = 0; i < 8; i++) {
    for (let j = 0; j < 8; j++) {
      // 2x2 twill: bundles of fibre alternate direction in a diagonal pattern
      const horizontal = (i + j) % 4 < 2;
      const grad = horizontal ? g.createLinearGradient(0, j * cell, 0, (j + 1) * cell) : g.createLinearGradient(i * cell, 0, (i + 1) * cell, 0);
      grad.addColorStop(0, horizontal ? "#2a2d33" : "#17191d");
      grad.addColorStop(0.5, horizontal ? "#4a4f58" : "#2f3238");
      grad.addColorStop(1, horizontal ? "#1b1d22" : "#14161a");
      g.fillStyle = grad;
      g.fillRect(i * cell, j * cell, cell, cell);
    }
  }
  carbonTexture = new THREE.CanvasTexture(canvas);
  carbonTexture.wrapS = carbonTexture.wrapT = THREE.RepeatWrapping;
  carbonTexture.colorSpace = THREE.SRGBColorSpace;
  carbonTexture.anisotropy = 8;
  return carbonTexture;
}

export function makeSpoilerMaterial(finish, bodyHex, envMap) {
  const common = { side: THREE.DoubleSide };
  if (finish === "carbon") {
    return new THREE.MeshPhysicalMaterial({ ...common, map: getCarbonTexture(), metalness: 0.35, roughness: 0.38, clearcoat: 0.9, clearcoatRoughness: 0.12, envMap, envMapIntensity: 0.5 });
  }
  if (finish === "gloss") {
    return new THREE.MeshPhysicalMaterial({ ...common, color: 0x15161a, metalness: 0.5, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.08, envMap, envMapIntensity: 0.6 });
  }
  // Body match: the same gloss-paint response the paint tint gives the body (see tintMesh in
  // viewer.js), so a spoiler painted "to match" is the same colour as the car next to it.
  return new THREE.MeshStandardMaterial({ ...common, color: bodyHex, metalness: 0.55, roughness: 0.35 });
}

// ---- Geometry helpers --------------------------------------------------------------------
function gridGeometry(positions, nu, nv, plane = "xz", uvScale = 8) {
  // positions: array [i][j] of Vector3, i across (0..nu), j along (0..nv)
  const verts = [];
  const uvs = [];
  const index = [];
  for (let i = 0; i <= nu; i++) {
    for (let j = 0; j <= nv; j++) {
      const p = positions[i][j];
      verts.push(p.x, p.y, p.z);
      // texture coordinates follow the plane the face lies in, so carbon doesn't smear on walls
      if (plane === "xy") uvs.push(p.x * uvScale, p.y * uvScale);
      else if (plane === "zy") uvs.push(p.z * uvScale, p.y * uvScale);
      else uvs.push(p.x * uvScale, p.z * uvScale);
    }
  }
  const at = (i, j) => i * (nv + 1) + j;
  for (let i = 0; i < nu; i++) {
    for (let j = 0; j < nv; j++) {
      index.push(at(i, j), at(i, j + 1), at(i + 1, j));
      index.push(at(i + 1, j), at(i, j + 1), at(i + 1, j + 1));
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return geometry;
}

// A spoiler skin laid over the deck. profile: [[v, h], ...] gives the thickness h (metres) from
// the front edge (v = 0, flush with the lid) to the trailing edge (v = 1). endRise lifts the
// tips, sideDrop lets them follow the lid down at the sides (a ducktail's curled-down ends).
function buildSkin(probe, material, opt) {
  const { xc = 0, hw, zRear, edgeAt = null, len, profile, endRise = 0, sideDrop = 0, nx = 80, nz = 26 } = opt;
  const hAt = (u, v) => {
    let h = 0;
    for (let k = 0; k < profile.length - 1; k++) {
      const [v0, h0] = profile[k];
      const [v1, h1] = profile[k + 1];
      if (v >= v0 && v <= v1) h = h0 + (h1 - h0) * smooth(0, 1, (v - v0) / (v1 - v0 || 1));
    }
    const edge = Math.abs(2 * u - 1);
    h *= 1 - sideDrop * smooth(0.7, 1, edge);
    h += endRise * smooth(0.82, 1, edge) * smooth(0.35, 1, v);
    return h;
  };

  // 1. the lid's height at every grid point. Where the scan has fine ribs or louvres, take the
  //    highest point within a couple of centimetres, so the spoiler bridges them instead of
  //    pleating over them.
  const columns = [];
  const deck = [];
  let lastY = null;
  for (let i = 0; i <= nx; i++) {
    const u = i / nx;
    const x = xc - hw + 2 * hw * u;
    let zEnd = zRear;
    if (edgeAt) {
      const around = [-0.06, -0.03, 0, 0.03, 0.06].map((d) => edgeAt(x - xc + d)).filter((e) => e != null).sort((a, b) => a - b);
      if (around.length) zEnd = around[Math.floor(around.length / 2)]; // median: ignores one-off bumps
    }
    columns.push({ x, zEnd });
    deck.push([]);
    for (let j = 0; j <= nz; j++) {
      const z = zEnd + len * (1 - j / nz);
      let y = -Infinity;
      for (let dx = -0.02; dx <= 0.0201; dx += 0.01) {
        for (let dz = -0.02; dz <= 0.0201; dz += 0.01) {
          const hit = probe(x + dx, z + dz);
          if (hit && hit.y > y) y = hit.y;
        }
      }
      if (y === -Infinity) y = lastY ?? probe.box.max.y;
      lastY = y;
      deck[i].push(y);
    }
  }
  // 2. smooth that envelope (a few light blurs), never dropping more than 3 mm below it
  let smoothed = deck;
  for (let pass = 0; pass < 3; pass++) {
    smoothed = smoothed.map((col, i) =>
      col.map((y, j) => {
        let sum = 0;
        let n = 0;
        for (let di = -1; di <= 1; di++) for (let dj = -1; dj <= 1; dj++) {
          const v = smoothed[i + di]?.[j + dj];
          if (v !== undefined) { sum += v; n++; }
        }
        return sum / n;
      })
    );
  }

  const top = [];
  const bottom = [];
  for (let i = 0; i <= nx; i++) {
    const u = i / nx;
    top.push([]);
    bottom.push([]);
    for (let j = 0; j <= nz; j++) {
      const v = j / nz;
      const deckY = Math.max(smoothed[i][j], deck[i][j] - 0.003);
      const h = hAt(u, v);
      const y = deckY + h - SINK;
      top[i].push(new THREE.Vector3(columns[i].x, y, columns[i].zEnd + len * (1 - v)));
      bottom[i].push(new THREE.Vector3(columns[i].x, deckY - 0.012, columns[i].zEnd + len * (1 - v)));
    }
  }

  const group = new THREE.Group();
  group.add(new THREE.Mesh(gridGeometry(top, nx, nz), material));

  // trailing-edge wall (rear face) and front edge: a bonded-on spoiler has a crisp front edge,
  // a few millimetres proud of the lid, rather than a feathered one that wobbles with the lid
  [nz, 0].forEach((j) => {
    const wall = [];
    for (let i = 0; i <= nx; i++) wall.push([top[i][j], bottom[i][j]]);
    group.add(new THREE.Mesh(gridGeometry(wall, nx, 1, "xy"), material));
  });

  // end caps
  [0, nx].forEach((i) => {
    const cap = [];
    for (let j = 0; j <= nz; j++) cap.push([top[i][j], bottom[i][j]]);
    // reuse the grid builder with a 1 x nz strip
    const strip = [
      cap.map((pair) => pair[0]),
      cap.map((pair) => pair[1]),
    ];
    group.add(new THREE.Mesh(gridGeometry(strip, 1, nz, "zy"), material));
  });
  return group;
}

// Cross-section of a wing blade: s runs from the leading edge (0) to the trailing edge (1).
function bladeSection(chord, thickness, camber, gurney) {
  const n = 22;
  const upper = [];
  const lower = [];
  for (let k = 0; k <= n; k++) {
    const s = k / n;
    const body = Math.pow(Math.sin(Math.PI * Math.min(0.999, s * 0.96 + 0.02)), 0.55);
    const mid = camber * Math.sin(Math.PI * s);
    const lift = gurney * smooth(0.88, 1, s);
    upper.push([s * chord, mid + thickness * body + lift]);
    lower.push([s * chord, mid - thickness * 0.35 * body]);
  }
  return [...upper, ...lower.reverse()];
}

// Sweep a (rear-distance, height) cross-section along x between x0 and x1.
function sweepSection(section, x0, x1, z0, y0, material, nx = 14) {
  const ring = section.length;
  const verts = [];
  const index = [];
  for (let i = 0; i <= nx; i++) {
    const x = x0 + ((x1 - x0) * i) / nx;
    for (let r = 0; r < ring; r++) verts.push(x, y0 + section[r][1], z0 - section[r][0]);
  }
  for (let i = 0; i < nx; i++) {
    for (let r = 0; r < ring; r++) {
      const a = i * ring + r;
      const b = i * ring + ((r + 1) % ring);
      index.push(a, b, a + ring, b, b + ring, a + ring);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
  geometry.setIndex(index);
  geometry.computeVertexNormals();
  return new THREE.Mesh(geometry, material);
}

// A thin vertical end plate, standing from `bottomAt(z)` up to the blade's height, at x.
function buildEndPlate(x, zLead, chord, yBlade, probe, material, { top = 0.055, thick = 0.007, bottomFromDeck = true, bottomY = null } = {}) {
  const n = 14;
  const upper = [];
  const lower = [];
  for (let k = 0; k <= n; k++) {
    const s = k / n;
    const z = zLead - s * chord;
    const hit = bottomFromDeck ? probe(x, z) : null;
    const yb = hit ? hit.y - 0.01 : bottomY ?? yBlade - 0.1;
    const yt = yBlade + top * (1 - 0.35 * s) * smooth(0, 0.12, s + 0.1);
    lower.push(new THREE.Vector3(x, yb, z));
    upper.push(new THREE.Vector3(x, yt, z));
  }
  const grids = [];
  [-thick / 2, thick / 2].forEach((dx) => {
    grids.push([upper.map((p) => new THREE.Vector3(p.x + dx, p.y, p.z)), lower.map((p) => new THREE.Vector3(p.x + dx, p.y, p.z))]);
  });
  const group = new THREE.Group();
  grids.forEach((g) => group.add(new THREE.Mesh(gridGeometry(g, 1, n, "zy"), material)));
  return group;
}

// A swan-neck pylon rising from a flange lying on the lid to the top of the blade.
function buildPylon(x, zBase, probe, yBladeTop, zBlade, material) {
  const hit = probe(x, zBase);
  const baseY = hit ? hit.y : yBladeTop - 0.2;
  const normal = hit ? hit.normal : new THREE.Vector3(0, 1, 0);
  const rise = yBladeTop - baseY;
  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, -0.01, 0),
    new THREE.Vector3(0, rise * 0.45, -0.004),
    new THREE.Vector3(0, rise * 0.85, -(zBase - zBlade) * 0.35),
    new THREE.Vector3(0, rise, -(zBase - zBlade)),
  ]);
  const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.017, 10, false), material);
  tube.scale.x = 0.38; // flatten the round tube into a blade-shaped strut
  const group = new THREE.Group();
  group.add(tube);

  // the foot: a low oval flange lying on the lid, tilted to the lid's own slope
  const flange = new THREE.Mesh(new THREE.CylinderGeometry(0.052, 0.062, 0.016, 28), material);
  flange.scale.x = 0.65;
  flange.scale.z = 1.25;
  flange.position.y = 0.002;
  group.add(flange);

  group.position.set(x, baseY, zBase);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
  return group;
}

function buildWing(probe, material, opt) {
  const { xc = 0, hw, zLead, chord, clearance, thickness = 0.014, camber = 0.012, gurney = 0.018, pylonX, plates = true, endPlateTop = 0.06, pylons = true } = opt;
  const group = new THREE.Group();
  const centre = probe(xc, zLead - chord * 0.5);
  const deckY = centre ? centre.y : probe.box.max.y * 0.8;
  const yBlade = deckY + clearance;
  group.add(sweepSection(bladeSection(chord, thickness, camber, gurney), xc - hw, xc + hw, zLead, yBlade, material));
  if (plates) [-hw, hw].forEach((dx) => group.add(buildEndPlate(xc + dx, zLead, chord, yBlade, probe, material, { top: endPlateTop, bottomFromDeck: false, bottomY: yBlade - 0.045 })));
  if (pylons) {
    pylonX.forEach((dx) => group.add(buildPylon(xc + dx, zLead + chord * 0.1, probe, yBlade + thickness * 0.6, zLead - chord * 0.42, material)));
  }
  return group;
}

// Plate-mounted wing: blade held between two end plates that stand on the surface below.
function buildPlateWing(probe, material, opt) {
  const { xc = 0, hw, zLead, chord, clearance, thickness = 0.012, camber = 0.01, gurney = 0.014, plateTop = 0.05 } = opt;
  const group = new THREE.Group();
  const centre = probe(xc, zLead - chord * 0.5);
  const baseY = centre ? centre.y : probe.box.max.y * 0.9;
  const yBlade = baseY + clearance;
  group.add(sweepSection(bladeSection(chord, thickness, camber, gurney), xc - hw, xc + hw, zLead, yBlade, material));
  [-hw, hw].forEach((dx) => group.add(buildEndPlate(xc + dx, zLead, chord, yBlade, probe, material, { top: plateTop, thick: 0.009 })));
  return group;
}

// ---- Recipes -----------------------------------------------------------------------------
// Each style is a plain description of the part; the numbers are in metres and were tuned
// against these particular bodies. scanFront is where to start looking for the lid, as a
// fraction of the car's length measured forward from its rear. A car's own spoiler is hidden
// when a style is chosen, unless the style says keepStock.
export const SPOILER_RECIPES = {
  Sedan: {
    scanFront: 0.095,
    styles: {
      cs_lip: { kind: "skin", span: 0.9, len: 0.09, profile: [[0, 0.007], [0.55, 0.011], [0.85, 0.026], [1, 0.036]] },
      m_perf: { kind: "skin", span: 0.96, len: 0.13, profile: [[0, 0.007], [0.4, 0.016], [0.75, 0.04], [1, 0.054]], endRise: 0.014 },
      csl_ducktail: { kind: "skin", span: 0.92, len: 0.22, profile: [[0, 0.007], [0.5, 0.024], [0.85, 0.052], [0.95, 0.074], [1, 0.086]], sideDrop: 0.7 },
      gt_wing: { kind: "wing", span: 0.86, inset: 0.05, chord: 0.27, clearance: 0.2, pylonX: 0.55 },
    },
  },
  "Sports Sedan": {
    scanFront: 0.095,
    styles: {
      decklid: { kind: "skin", span: 0.72, sideDrop: 0.5, len: 0.12, profile: [[0, 0.007], [0.5, 0.016], [0.85, 0.04], [1, 0.058]], endRise: 0.012 },
      duckbill: { kind: "skin", span: 0.8, len: 0.17, profile: [[0, 0.007], [0.5, 0.02], [0.8, 0.036], [0.94, 0.058], [1, 0.08]], sideDrop: 0.7 },
      ducktail: { kind: "skin", span: 0.86, len: 0.26, profile: [[0, 0.007], [0.45, 0.022], [0.8, 0.057], [0.95, 0.09], [1, 0.102]], sideDrop: 0.75 },
    },
  },
  "Sports Hatchback": {
    styles: {
      // cap and double deck build on the car's own roof spoiler, so it stays; the lip replaces it
      aero_cap: { kind: "cap", keepStock: true },
      double_deck: { kind: "double", keepStock: true },
      roof_lip: { kind: "roof" },
    },
  },
};

// ---- Building a style --------------------------------------------------------------------
// `stockMeshes` are the car's own spoiler parts (hatchback) when they're showing.
export function buildSpoilerStyle(carRoot, carName, styleKey, material, stockMeshes) {
  const recipe = SPOILER_RECIPES[carName];
  const style = recipe && recipe.styles[styleKey];
  if (!style) return null;

  const probe = makeProbe(carRoot);
  const box = probe.box;
  const size = box.getSize(new THREE.Vector3());
  const centre = box.getCenter(new THREE.Vector3());
  const group = new THREE.Group();
  group.name = "GeneratedSpoiler";

  if (style.kind === "skin" || style.kind === "wing") {
    const zFront = box.min.z + size.z * (recipe.scanFront ?? 0.1);
    const lid = scanLid(probe, zFront, box.min.z, centre.x);
    if (!lid) return null;
    const hw = Math.max(0.2, lid.hw * (style.span ?? 0.9) - 0.01);
    if (style.kind === "skin") {
      group.add(buildSkin(probe, material, { xc: centre.x, hw, zRear: lid.centreEdge, edgeAt: (dx) => lid.edgeAt(Math.sign(dx) * Math.min(Math.abs(dx), lid.hw)), len: style.len, profile: style.profile, endRise: style.endRise, sideDrop: style.sideDrop }));
    } else {
      group.add(buildWing(probe, material, { xc: centre.x, hw, zLead: lid.centreEdge + (style.inset ?? 0.05) + style.chord, chord: style.chord, clearance: style.clearance, pylonX: [-hw * style.pylonX, hw * style.pylonX] }));
    }
    group.userData.edge = { zEdge: lid.centreEdge, hw, lidHalf: lid.hw };
    return group;
  }

  if ((style.kind === "cap" || style.kind === "double") && stockMeshes && stockMeshes.length) {
    // These build on the car's own roof spoiler, so they probe that part alone: the skin follows
    // the spoiler's top surface, not whatever (glass, roof) lies behind its gaps.
    const stockProbe = makeProbe(carRoot, stockMeshes);
    const stock = stockProbe.box;
    const xc = (stock.max.x + stock.min.x) / 2;
    if (style.kind === "cap") {
      // a cap lifting the trailing edge of the roof spoiler (the AMG aero-pack piece)
      const hw = ((stock.max.x - stock.min.x) / 2) * 0.97;
      group.add(buildSkin(stockProbe, material, { xc, hw, zRear: stock.min.z + 0.02, len: 0.1, profile: [[0, 0.006], [0.35, 0.01], [0.75, 0.024], [0.94, 0.038], [1, 0.046]], endRise: 0.008 }));
    } else {
      // a second blade held above the roof spoiler between two end plates standing on it
      const hw = ((stock.max.x - stock.min.x) / 2) * 0.94;
      const chord = Math.min(0.22, (stock.max.z - stock.min.z) * 0.55);
      group.add(buildPlateWing(stockProbe, material, { xc, hw, zLead: stock.min.z + chord + 0.05, chord, clearance: 0.085 }));
    }
    return group;
  }

  if (style.kind === "roof") {
    // small lip on the hatch's own trailing edge (the stock spoiler is hidden for this one)
    const lid = scanLid(probe, box.min.z + size.z * 0.12, box.min.z, centre.x);
    if (!lid) return null;
    group.add(buildSkin(probe, material, { xc: centre.x, hw: Math.max(0.25, lid.hw * 0.92), zRear: lid.centreEdge, edgeAt: (dx) => lid.edgeAt(Math.sign(dx) * Math.min(Math.abs(dx), lid.hw)), len: 0.15, profile: [[0, 0.007], [0.5, 0.014], [0.85, 0.032], [1, 0.044]], endRise: 0.01 }));
    return group;
  }
  return null;
}
