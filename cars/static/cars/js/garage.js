import * as THREE from "three";

// A procedural 3D garage that surrounds the car in the customizer. Because it's real geometry
// (floor, four walls, ceiling, props) rather than a flat backdrop, orbiting the camera around
// the car shows a different part of the garage from every angle, like a game's garage screen.
//
// Everything is drawn in code (canvas textures + simple meshes), so there are no extra downloads.
// Dimensions below are metres for a ~4.8 m car; buildGarage() scales the whole room to the car.

const ROOM_HALF = 13; // room spans x,z in [-13, 13]
const ROOM_H = 5.6;
const WALL_SPLIT = 2.4; // lower (block/brick) wall below this height, corrugated metal above

function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvasTex(w, h, draw, repeat = [1, 1]) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  draw(canvas.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat[0], repeat[1]);
  tex.anisotropy = 8;
  return tex;
}

// ---- Textures -------------------------------------------------------------------------------

// World (x, z) maps to canvas ((x+13)*ppm, (z+13)*ppm): canvas top is world -Z.
function drawFloor(ctx, w, h) {
  const R = rng(7);
  const ppm = w / (ROOM_HALF * 2);
  ctx.fillStyle = "#1d2029";
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < 70; i++) {
    const x = R() * w, y = R() * h, r = 80 + R() * 260;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const light = R() > 0.5;
    g.addColorStop(0, light ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.10)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 30000; i++) {
    ctx.fillStyle = R() < 0.5 ? "rgba(255,255,255,0.035)" : "rgba(0,0,0,0.13)";
    ctx.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2);
  }

  // saw-cut expansion joints every 4 m
  ctx.strokeStyle = "rgba(4,5,8,0.9)";
  ctx.lineWidth = 3;
  for (let m = -12; m <= 12; m += 4) {
    const p = (m + ROOM_HALF) * ppm;
    ctx.beginPath(); ctx.moveTo(p, 0); ctx.lineTo(p, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0, p); ctx.lineTo(w, p); ctx.stroke();
  }

  // oil stains
  for (let i = 0; i < 7; i++) {
    const x = (ROOM_HALF + (R() - 0.5) * 18) * ppm, y = (ROOM_HALF + (R() - 0.5) * 18) * ppm, r = (0.3 + R() * 0.5) * ppm;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, "rgba(0,0,0,0.5)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // the painted bay the car sits in: white outline with diagonal hatching at both ends
  const bx = 3.3, bz = 5.9, lw = 0.13 * ppm;
  const X0 = (-bx + ROOM_HALF) * ppm, X1 = (bx + ROOM_HALF) * ppm;
  const Z0 = (-bz + ROOM_HALF) * ppm, Z1 = (bz + ROOM_HALF) * ppm;
  ctx.save();
  ctx.fillStyle = "rgba(236,238,244,0.93)";
  ctx.fillRect(X0, Z0, X1 - X0, lw);
  ctx.fillRect(X0, Z1 - lw, X1 - X0, lw);
  ctx.fillRect(X0, Z0, lw, Z1 - Z0);
  ctx.fillRect(X1 - lw, Z0, lw, Z1 - Z0);
  for (const [za, zb] of [[Z0, Z0 + 1.1 * ppm], [Z1 - 1.1 * ppm, Z1]]) {
    ctx.save();
    ctx.beginPath(); ctx.rect(X0, za, X1 - X0, zb - za); ctx.clip();
    ctx.strokeStyle = "rgba(236,238,244,0.85)";
    ctx.lineWidth = 0.1 * ppm;
    for (let x = X0 - (zb - za); x < X1 + (zb - za); x += 0.42 * ppm) {
      ctx.beginPath(); ctx.moveTo(x, zb); ctx.lineTo(x + (zb - za), za); ctx.stroke();
    }
    ctx.restore();
  }
  ctx.restore();
  // wear: speckle the paint with floor colour so the lines look scuffed
  for (let i = 0; i < 2600; i++) {
    ctx.fillStyle = "rgba(29,32,41,0.8)";
    const x = X0 + R() * (X1 - X0), y = Z0 + R() * (Z1 - Z0);
    ctx.fillRect(x, y, 1 + R() * 3, 1 + R() * 3);
  }

  // soft pool of light under the ceiling strips
  const pool = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, 8 * ppm);
  pool.addColorStop(0, "rgba(255,255,255,0.13)");
  pool.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = pool;
  ctx.fillRect(0, 0, w, h);
}

function drawBlocks(ctx, w, h, base, seam, seed) {
  const R = rng(seed);
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);
  const bw = w / 4, bh = h / 8; // 4 x 8 blocks per tile
  for (let row = 0; row < 8; row++) {
    for (let col = -1; col < 4; col++) {
      const x = col * bw + (row % 2 ? bw / 2 : 0);
      const shade = (R() - 0.5) * 22;
      ctx.fillStyle = `rgba(${shade > 0 ? 255 : 0},${shade > 0 ? 255 : 0},${shade > 0 ? 255 : 0},${Math.abs(shade) / 255})`;
      ctx.fillRect(x, row * bh, bw, bh);
    }
  }
  ctx.strokeStyle = seam;
  ctx.lineWidth = 3;
  for (let row = 0; row <= 8; row++) {
    ctx.beginPath(); ctx.moveTo(0, row * bh); ctx.lineTo(w, row * bh); ctx.stroke();
    for (let col = -1; col <= 4; col++) {
      const x = col * bw + (row % 2 ? bw / 2 : 0);
      if (row < 8) { ctx.beginPath(); ctx.moveTo(x, row * bh); ctx.lineTo(x, (row + 1) * bh); ctx.stroke(); }
    }
  }
  for (let i = 0; i < 5000; i++) {
    ctx.fillStyle = R() < 0.5 ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.12)";
    ctx.fillRect(R() * w, R() * h, 1 + R() * 2, 1 + R() * 2);
  }
}

function drawCorrugated(ctx, w, h) {
  const stripe = w / 8;
  for (let i = 0; i < 8; i++) {
    const g = ctx.createLinearGradient(i * stripe, 0, (i + 1) * stripe, 0);
    g.addColorStop(0, "#2a2f3c");
    g.addColorStop(0.5, "#454c5e");
    g.addColorStop(1, "#262b37");
    ctx.fillStyle = g;
    ctx.fillRect(i * stripe, 0, stripe, h);
  }
  const R = rng(3);
  for (let i = 0; i < 1500; i++) {
    ctx.fillStyle = "rgba(0,0,0,0.10)";
    ctx.fillRect(R() * w, R() * h, 1, 2 + R() * 10);
  }
}

const POSTER_STYLES = [
  { a: "#ff2d95", b: "#3b0764", t: "TURBO\nTUNES", s: "NIGHT RUN" },
  { a: "#22d3ee", b: "#0c1a4a", t: "TUNE\nUP", s: "BOOST  •  GRIP  •  GLORY" },
  { a: "#facc15", b: "#7c2d12", t: "1996", s: "LEGENDS NEVER DIE" },
  { a: "#a78bfa", b: "#111827", t: "DRIFT\nKING", s: "TOUGE  •  MIDNIGHT" },
  { a: "#34d399", b: "#052e2b", t: "WIDE\nBODY", s: "FORM  FOLLOWS  SPEED" },
  { a: "#f87171", b: "#1f1020", t: "STREET\nCLUB", s: "EST. 2026" },
];

function posterTex(i) {
  const st = POSTER_STYLES[i % POSTER_STYLES.length];
  return canvasTex(256, 384, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, st.b);
    g.addColorStop(1, st.a);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = "#ffffff";
    for (let k = 0; k < 7; k++) {
      ctx.beginPath();
      ctx.moveTo(-20 + k * 46, h);
      ctx.lineTo(60 + k * 46, 0);
      ctx.lineTo(90 + k * 46, 0);
      ctx.lineTo(10 + k * 46, h);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    // stylised car silhouette
    ctx.fillStyle = "rgba(8,8,14,0.85)";
    ctx.beginPath();
    ctx.moveTo(26, 258); ctx.lineTo(60, 232); ctx.lineTo(104, 214); ctx.lineTo(152, 214);
    ctx.lineTo(196, 236); ctx.lineTo(232, 244); ctx.lineTo(232, 266); ctx.lineTo(26, 266); ctx.closePath();
    ctx.fill();
    ctx.beginPath(); ctx.arc(72, 268, 17, 0, 7); ctx.arc(190, 268, 17, 0, 7); ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.textAlign = "center";
    ctx.font = "800 54px 'Space Grotesk', Arial Black, sans-serif";
    ctx.shadowColor = "rgba(0,0,0,0.55)";
    ctx.shadowBlur = 8;
    st.t.split("\n").forEach((line, n) => ctx.fillText(line, w / 2, 70 + n * 56));
    ctx.shadowBlur = 0;
    ctx.font = "600 15px 'Space Grotesk', Arial, sans-serif";
    ctx.fillText(st.s, w / 2, h - 28);
  });
}

function neonSignTex() {
  return canvasTex(1024, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "800 150px 'Space Grotesk', Arial Black, sans-serif";
    for (const [blur, color] of [[55, "#ff2d95"], [28, "#ff2d95"], [10, "#ff9ad1"]]) {
      ctx.shadowColor = color;
      ctx.shadowBlur = blur;
      ctx.fillStyle = "#ffe0f1";
      ctx.fillText("TURBO TUNES", w / 2, h / 2 - 6);
    }
    ctx.shadowBlur = 20;
    ctx.shadowColor = "#22d3ee";
    ctx.strokeStyle = "#a5f3fc";
    ctx.lineWidth = 6;
    ctx.beginPath(); ctx.moveTo(150, h - 28); ctx.lineTo(w - 150, h - 28); ctx.stroke();
  });
}

function doorTex() {
  return canvasTex(512, 1024, (ctx, w, h) => {
    const slat = h / 16;
    for (let i = 0; i < 16; i++) {
      const g = ctx.createLinearGradient(0, i * slat, 0, (i + 1) * slat);
      g.addColorStop(0, "#7a8294");
      g.addColorStop(0.55, "#5a6172");
      g.addColorStop(1, "#3a4050");
      ctx.fillStyle = g;
      ctx.fillRect(0, i * slat, w, slat);
      ctx.fillStyle = "rgba(0,0,0,0.5)";
      ctx.fillRect(0, (i + 1) * slat - 3, w, 3);
    }
    ctx.fillStyle = "rgba(190,225,255,0.55)"; // row of small panes near the top
    for (let k = 0; k < 6; k++) ctx.fillRect(40 + k * 74, 2 * slat + 8, 56, slat - 18);
  });
}

function windowTex() {
  return canvasTex(512, 384, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#0a1233");
    g.addColorStop(0.65, "#2b2a6b");
    g.addColorStop(1, "#7a3b8f");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    const R = rng(11);
    for (let i = 0; i < 90; i++) {
      const x = R() * w, y = h * 0.55 + R() * h * 0.45, r = 2 + R() * 7;
      const c = ["255,214,120", "255,255,255", "255,120,120", "120,200,255"][Math.floor(R() * 4)];
      const rg = ctx.createRadialGradient(x, y, 0, x, y, r * 2);
      rg.addColorStop(0, `rgba(${c},0.95)`);
      rg.addColorStop(1, `rgba(${c},0)`);
      ctx.fillStyle = rg;
      ctx.fillRect(x - r * 2, y - r * 2, r * 4, r * 4);
    }
  });
}

function toolChestTex() {
  return canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#b3202a";
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 5; i++) {
      const y = 18 + i * 44;
      ctx.fillStyle = "#8f1820";
      ctx.fillRect(10, y, w - 20, 38);
      ctx.fillStyle = "#c8353f";
      ctx.fillRect(10, y, w - 20, 4);
      ctx.fillStyle = "#d4d7de";
      ctx.fillRect(w / 2 - 50, y + 14, 100, 8);
    }
  });
}

function contactShadowTex() {
  return canvasTex(256, 256, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, "rgba(0,0,0,0.85)");
    g.addColorStop(0.55, "rgba(0,0,0,0.45)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

// ---- Garage ---------------------------------------------------------------------------------

export function buildGarage({ center, floorY, carSize }) {
  const carLength = Math.max(carSize.x, carSize.y, carSize.z);
  const u = Math.max(carLength, 3.6) / 4.8; // scale the room to the car

  const root = new THREE.Group();
  root.name = "Garage";
  root.position.set(center.x, floorY, center.z);

  const group = new THREE.Group(); // modelled in metres, scaled by u
  group.scale.setScalar(u);
  root.add(group);

  const lights = []; // { light, day, night }
  const neons = []; // { mat, base }
  const glassMats = [];
  const wallMats = []; // { mat, base } so Midnight scales the original colour instead of replacing it
  const trackWall = (mat) => wallMats.push({ mat, base: mat.color.clone() });

  const std = (opts) => new THREE.MeshStandardMaterial(opts);
  const steel = std({ color: 0x7b8394, metalness: 0.75, roughness: 0.42 });
  const darkSteel = std({ color: 0x2a2e38, metalness: 0.7, roughness: 0.5 });
  const rubber = std({ color: 0x0f1014, metalness: 0.0, roughness: 0.95 });
  const yellowSteel = std({ color: 0xd9a21b, metalness: 0.4, roughness: 0.55 });
  const redMetal = std({ color: 0xb3202a, metalness: 0.4, roughness: 0.5 });

  const add = (mesh, x = 0, y = 0, z = 0, ry = 0) => {
    mesh.position.set(x, y, z);
    mesh.rotation.y = ry;
    group.add(mesh);
    return mesh;
  };
  const box = (w, h, d, mat, x, y, z, ry = 0) => add(new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat), x, y, z, ry);
  const neon = (w, h, d, hex, x, y, z) => {
    const mat = new THREE.MeshBasicMaterial({ color: hex });
    neons.push({ mat, base: new THREE.Color(hex) });
    return box(w, h, d, mat, x, y, z);
  };

  // --- floor, ceiling ---
  const floorMat = std({ map: canvasTex(2048, 2048, drawFloor), roughness: 0.62, metalness: 0.1 });
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_HALF * 2, ROOM_HALF * 2), floorMat);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.003;
  group.add(floor);

  const ceilMat = std({ color: 0x14161d, roughness: 0.9, metalness: 0.2 });
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_HALF * 2, ROOM_HALF * 2), ceilMat);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = ROOM_H;
  group.add(ceiling);
  trackWall(ceilMat);

  // --- walls: [name, position, rotY, brick?] ---
  const concrete = canvasTex(512, 512, (c, w, h) => drawBlocks(c, w, h, "#2c303b", "rgba(8,9,13,0.75)", 21), [1, 1]);
  const brick = canvasTex(512, 512, (c, w, h) => drawBlocks(c, w, h, "#4a3030", "rgba(18,10,10,0.8)", 5), [1, 1]);
  const corrugated = canvasTex(256, 256, drawCorrugated, [1, 1]);
  const WALLS = [
    { pos: [0, -ROOM_HALF], ry: 0, tex: concrete },
    { pos: [0, ROOM_HALF], ry: Math.PI, tex: concrete },
    { pos: [ROOM_HALF, 0], ry: -Math.PI / 2, tex: concrete },
    { pos: [-ROOM_HALF, 0], ry: Math.PI / 2, tex: brick },
  ];
  for (const w of WALLS) {
    const lowTex = w.tex.clone();
    lowTex.needsUpdate = true;
    lowTex.repeat.set((ROOM_HALF * 2) / 2, WALL_SPLIT / 2);
    const low = std({ map: lowTex, roughness: 0.85, metalness: 0.05 });
    const upTex = corrugated.clone();
    upTex.needsUpdate = true;
    upTex.repeat.set((ROOM_HALF * 2) / 1, 1);
    const up = std({ map: upTex, roughness: 0.55, metalness: 0.5 });
    trackWall(low);
    trackWall(up);
    const lo = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_HALF * 2, WALL_SPLIT), low);
    lo.position.set(w.pos[0], WALL_SPLIT / 2, w.pos[1]);
    lo.rotation.y = w.ry;
    group.add(lo);
    const hi = new THREE.Mesh(new THREE.PlaneGeometry(ROOM_HALF * 2, ROOM_H - WALL_SPLIT), up);
    hi.position.set(w.pos[0], WALL_SPLIT + (ROOM_H - WALL_SPLIT) / 2, w.pos[1]);
    hi.rotation.y = w.ry;
    group.add(hi);
  }
  // steel trim where the block wall meets the metal, plus perimeter neon under the ceiling
  const R_ = ROOM_HALF - 0.04;
  box(ROOM_HALF * 2, 0.1, 0.08, darkSteel, 0, WALL_SPLIT, -R_);
  box(ROOM_HALF * 2, 0.1, 0.08, darkSteel, 0, WALL_SPLIT, R_);
  box(0.08, 0.1, ROOM_HALF * 2, darkSteel, R_, WALL_SPLIT, 0);
  box(0.08, 0.1, ROOM_HALF * 2, darkSteel, -R_, WALL_SPLIT, 0);
  neon(ROOM_HALF * 2 - 1, 0.07, 0.07, 0xec4899, 0, ROOM_H - 0.4, -R_ + 0.05);
  neon(ROOM_HALF * 2 - 1, 0.07, 0.07, 0x3b82f6, 0, ROOM_H - 0.4, R_ - 0.05);
  neon(0.07, 0.07, ROOM_HALF * 2 - 1, 0x22d3ee, R_ - 0.05, ROOM_H - 0.4, 0);
  neon(0.07, 0.07, ROOM_HALF * 2 - 1, 0x8b5cf6, -R_ + 0.05, ROOM_H - 0.4, 0);
  neon(0.07, 0.07, ROOM_HALF * 2 - 1, 0x8b5cf6, -R_ + 0.05, WALL_SPLIT + 0.12, 0);
  neon(ROOM_HALF * 2 - 1, 0.07, 0.07, 0xec4899, 0, WALL_SPLIT + 0.12, -R_ + 0.05);

  // --- ceiling trusses and hanging LED strips ---
  for (const z of [-10, -5, 0, 5, 10]) box(ROOM_HALF * 2, 0.34, 0.26, darkSteel, 0, ROOM_H - 0.2, z);
  for (const x of [-9, 9]) box(0.26, 0.34, ROOM_HALF * 2, darkSteel, x, ROOM_H - 0.2, 0);
  const ledMat = new THREE.MeshBasicMaterial({ color: 0xf4f8ff });
  neons.push({ mat: ledMat, base: new THREE.Color(0xf4f8ff) });
  for (const x of [-4.2, -1.4, 1.4, 4.2]) {
    for (const z of [-4.4, 4.4]) {
      add(new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.07, 3.8), ledMat), x, ROOM_H - 0.55, z);
      box(0.26, 0.05, 3.9, darkSteel, x, ROOM_H - 0.49, z);
    }
  }

  // --- tires (instanced) ---
  const tireGeo = new THREE.TorusGeometry(0.27, 0.115, 14, 30);
  const tireMats = [];
  const tireAt = (parentMatrix, x, y, z, rx, ry) => {
    const o = new THREE.Object3D();
    o.position.set(x, y, z);
    o.rotation.set(rx, ry, 0);
    o.updateMatrix();
    tireMats.push(parentMatrix.clone().multiply(o.matrix));
  };
  const shelfFrame = (x, z, ry, width, levels = [0.28, 1.08, 1.88]) => {
    const g = new THREE.Group();
    g.position.set(x, 0, z);
    g.rotation.y = ry;
    group.add(g);
    const post = (px) => {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.07, 2.5, 0.07), darkSteel);
      p.position.set(px, 1.25, -0.28); g.add(p);
      const q = p.clone(); q.position.z = 0.28; g.add(q);
    };
    const n = Math.max(2, Math.round(width / 1.6) + 1);
    for (let i = 0; i < n; i++) post(-width / 2 + (i * width) / (n - 1));
    for (const ly of levels) {
      const plank = new THREE.Mesh(new THREE.BoxGeometry(width, 0.05, 0.66), steel);
      plank.position.set(0, ly, 0); g.add(plank);
    }
    g.updateMatrixWorld(true);
    return g;
  };
  const tireRack = (x, z, ry, width) => {
    const g = shelfFrame(x, z, ry, width);
    const per = Math.floor(width / 0.28);
    [0.28, 1.08, 1.88].forEach((ly, row) => {
      for (let i = 0; i < per; i++) {
        if ((i * 7 + row * 3) % 11 === 0) continue; // gaps so it doesn't look stamped
        tireAt(g.matrix, -width / 2 + 0.2 + i * 0.28, ly + 0.025 + 0.385, 0, 0, 0);
      }
    });
  };
  const tireStack = (x, z, n) => {
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) tireAt(m, x, 0.115 + i * 0.23, z, Math.PI / 2, 0);
  };

  // --- back wall (-Z): the one you see behind the car from the default front view ---
  tireRack(-8.2, -12.55, 0, 6.4);
  tireRack(8.6, -12.55, 0, 3.2);
  const poster = (i, x, y, z, ry, w = 1.5, h = 2.25) => {
    const frame = box(w + 0.12, h + 0.12, 0.05, darkSteel, 0, 0, 0);
    frame.position.set(x, y, z); frame.rotation.y = ry;
    const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: posterTex(i) }));
    p.position.set(0, 0, 0.03); frame.add(p);
    neons.push({ mat: p.material, base: new THREE.Color(0xffffff), glass: true });
  };
  poster(0, -2.6, 2.1, -12.9, 0);
  poster(1, 2.6, 2.1, -12.9, 0);
  poster(3, 5.4, 2.1, -12.9, 0, 1.2, 1.8);
  // neon sign
  const signMat = new THREE.MeshBasicMaterial({ map: neonSignTex(), transparent: true, depthWrite: false });
  const sign = add(new THREE.Mesh(new THREE.PlaneGeometry(5.6, 1.4), signMat), 0, 4.15, -12.92);
  sign.renderOrder = 2;
  neons.push({ mat: signMat, base: new THREE.Color(0xffffff), glass: true });
  for (const x of [-4.4, 4.4]) neon(0.07, 3.2, 0.07, 0x8b5cf6, x, 3.6, -12.9);
  // workbench + red tool chest in the back-right corner
  box(3.4, 0.07, 0.8, std({ color: 0x4a3b2c, roughness: 0.8 }), 11.0, 0.96, -12.2);
  for (const x of [9.5, 12.5]) box(0.07, 0.93, 0.7, darkSteel, x, 0.47, -12.2);
  box(3.4, 1.2, 0.05, darkSteel, 11.0, 1.9, -12.9); // pegboard
  for (let i = 0; i < 9; i++) box(0.05, 0.5 + (i % 3) * 0.12, 0.04, steel, 9.6 + i * 0.35, 1.9, -12.85);
  const chestFace = std({ map: toolChestTex(), roughness: 0.45, metalness: 0.4 });
  const chest = new THREE.Mesh(new THREE.BoxGeometry(1.0, 1.2, 0.7), [redMetal, redMetal, redMetal, redMetal, chestFace, redMetal]);
  add(chest, 7.6, 0.6, -12.3);
  // oil drums
  const drumGeo = new THREE.CylinderGeometry(0.29, 0.29, 0.88, 22);
  [[11.8, -9.9, 0x1d4ed8], [12.45, -9.2, 0xb91c1c], [11.7, -9.0, 0x1d4ed8]].forEach(([x, z, c]) =>
    add(new THREE.Mesh(drumGeo, std({ color: c, metalness: 0.5, roughness: 0.45 })), x, 0.44, z));

  // --- front wall (+Z): roll-up door with a bright gap under it ---
  add(new THREE.Mesh(new THREE.PlaneGeometry(6.2, 0.55), new THREE.MeshBasicMaterial({ color: 0xcfe6ff })), 0, 0.28, 12.9, Math.PI);
  add(new THREE.Mesh(new THREE.PlaneGeometry(6.2, 3.5), std({ map: doorTex(), roughness: 0.5, metalness: 0.55 })), 0, 0.55 + 1.75, 12.92, Math.PI);
  box(6.5, 0.18, 0.2, darkSteel, 0, 4.15, 12.85);
  for (const x of [-3.25, 3.25]) box(0.18, 4.1, 0.2, darkSteel, x, 2.05, 12.85);
  poster(2, -7.6, 2.1, 12.9, Math.PI);
  poster(4, -5.4, 2.1, 12.9, Math.PI, 1.2, 1.8);
  poster(5, 7.4, 2.1, 12.9, Math.PI);
  tireRack(-10.6, 12.55, Math.PI, 3.2);
  tireStack(9.4, 11.9, 5);
  tireStack(10.2, 11.9, 4);
  tireStack(9.8, 11.2, 3);

  // --- right wall (+X): big night windows, a two-post lift ---
  for (const z of [-7, 0, 7]) {
    const glassMat = new THREE.MeshBasicMaterial({ map: windowTex() });
    glassMats.push(glassMat);
    const gl = add(new THREE.Mesh(new THREE.PlaneGeometry(3.4, 1.9), glassMat), 12.94, 3.45, z, -Math.PI / 2);
    gl.renderOrder = 1;
    box(0.12, 0.12, 3.6, darkSteel, 12.9, 4.43, z);
    box(0.12, 0.12, 3.6, darkSteel, 12.9, 2.47, z);
    for (const dz of [-1.75, 0, 1.75]) box(0.12, 2.0, 0.1, darkSteel, 12.9, 3.45, z + dz);
  }
  // lift: two posts, overhead beam, carriage arms
  for (const z of [3.2, 6.6]) {
    box(0.4, 3.4, 0.4, yellowSteel, 10.4, 1.7, z);
    box(1.0, 0.1, 0.9, darkSteel, 10.4, 0.05, z);
    box(2.4, 0.18, 0.14, yellowSteel, 9.2, 0.45, z);
  }
  box(0.4, 0.3, 3.8, yellowSteel, 10.4, 3.5, 4.9);
  // wall of shelves with oil cans on the +X wall near the front
  const shelf = shelfFrame(12.55, -3.4, -Math.PI / 2, 3.4, [0.5, 1.2, 1.9]);
  const canGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.22, 14);
  const canMats = [0xef4444, 0xfacc15, 0x38bdf8, 0x22c55e].map((c) => std({ color: c, metalness: 0.5, roughness: 0.4 }));
  [0.5, 1.2, 1.9].forEach((ly, r) => {
    for (let i = 0; i < 9; i++) {
      const can = new THREE.Mesh(canGeo, canMats[(i + r) % 4]);
      can.position.set(-1.5 + i * 0.37, ly + 0.14, ((i + r) % 3) * 0.12 - 0.12);
      shelf.add(can);
    }
  });

  // --- left wall (-X): brick, with a mezzanine and the stairs up to it ---
  poster(0, -12.9, 2.1, -3.0, Math.PI / 2, 1.3, 1.95);
  poster(2, -12.9, 2.1, 0.2, Math.PI / 2, 1.3, 1.95);
  poster(4, -12.9, 2.1, 3.4, Math.PI / 2, 1.3, 1.95);
  tireRack(-12.55, 8.4, Math.PI / 2, 5.0);
  tireStack(-11.6, 3.2 + 4.2, 4);
  // mezzanine platform with railing, in the back-left corner
  const mx = -10.4, mz = -10.7, mw = 5.2, md = 4.6, my = 2.9;
  box(mw, 0.16, md, darkSteel, mx, my, mz);
  for (const [px, pz] of [[mx + mw / 2 - 0.1, mz + md / 2 - 0.1], [mx + mw / 2 - 0.1, mz - md / 2 + 0.1], [mx - mw / 2 + 0.1, mz + md / 2 - 0.1]])
    box(0.2, my, 0.2, steel, px, my / 2, pz);
  for (let i = 0; i <= 5; i++) box(0.05, 1.0, 0.05, steel, mx + mw / 2 - 0.04, my + 0.58, mz - md / 2 + (i * md) / 5);
  box(0.06, 0.06, md, steel, mx + mw / 2 - 0.04, my + 1.1, mz);
  box(0.06, 0.06, md, steel, mx + mw / 2 - 0.04, my + 0.6, mz);
  for (let i = 0; i <= 5; i++) box(0.05, 1.0, 0.05, steel, mx - mw / 2 + (i * mw) / 5, my + 0.58, mz + md / 2 - 0.04);
  box(mw, 0.06, 0.06, steel, mx, my + 1.1, mz + md / 2 - 0.04);
  box(mw, 0.06, 0.06, steel, mx, my + 0.6, mz + md / 2 - 0.04);
  neon(mw, 0.05, 0.05, 0x8b5cf6, mx, my - 0.12, mz + md / 2 - 0.02);
  // stairs: 13 steps rising toward the platform, along the left wall
  const steps = 13, rise = my / steps, run = 0.27;
  for (let i = 0; i < steps; i++) {
    box(1.1, 0.05, run + 0.02, steel, -12.3, rise * (i + 1), mz + md / 2 + run * (steps - i - 0.5));
    box(1.1, rise, 0.03, darkSteel, -12.3, rise * (i + 0.5), mz + md / 2 + run * (steps - i - 0.05));
  }
  const stairLen = Math.hypot(run * steps, my);
  const ang = Math.atan2(my, run * steps);
  const stringer = box(0.06, 0.3, stairLen, darkSteel, -11.75, my / 2 - 0.08, mz + md / 2 + (run * steps) / 2);
  stringer.rotation.x = ang;
  const rail = box(0.05, 0.05, stairLen, steel, -11.75, my / 2 + 0.95, mz + md / 2 + (run * steps) / 2);
  rail.rotation.x = ang;
  // boxes and crates under the mezzanine
  box(1.2, 0.9, 1.0, std({ color: 0x3a4a3b, roughness: 0.8 }), mx + 1.4, 0.45, mz + 0.6);
  box(0.9, 0.6, 0.9, std({ color: 0x6b4f2a, roughness: 0.8 }), mx - 0.6, 0.3, mz + 0.8);

  // --- instanced tires, built once all racks and stacks are placed ---
  const tires = new THREE.InstancedMesh(tireGeo, rubber, tireMats.length);
  tireMats.forEach((m, i) => tires.setMatrixAt(i, m));
  tires.instanceMatrix.needsUpdate = true;
  group.add(tires);

  // --- soft contact shadow under the car ---
  const shadow = new THREE.Mesh(
    new THREE.PlaneGeometry(carSize.x * 1.55, carSize.z * 1.25),
    new THREE.MeshBasicMaterial({ map: contactShadowTex(), transparent: true, depthWrite: false, opacity: 0.9 })
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = 0.004;
  root.add(shadow); // in the unscaled root: it's sized from the car's real dimensions

  // --- lights (intensities scale with u^2 so a bigger room keeps the same brightness) ---
  const U2 = u * u;
  const addSpot = (x, y, z, hex, day, night, angle = 0.8) => {
    const s = new THREE.SpotLight(hex, day * U2, 24 * u, angle, 0.7, 2);
    s.position.set(x * u, y * u, z * u);
    s.target.position.set(0, 0.6 * u, 0);
    root.add(s, s.target);
    lights.push({ light: s, day: day * U2, night: night * U2 });
  };
  const addPoint = (x, y, z, hex, day, night, dist = 16) => {
    const p = new THREE.PointLight(hex, day * U2, dist * u, 2);
    p.position.set(x * u, y * u, z * u);
    root.add(p);
    lights.push({ light: p, day: day * U2, night: night * U2 });
  };
  addSpot(0, ROOM_H - 0.7, 3.5, 0xffffff, 70, 30);
  addSpot(0, ROOM_H - 0.7, -3.5, 0xffffff, 70, 30);
  addSpot(-3, ROOM_H - 0.7, 0, 0xcdd9ff, 45, 22, 0.9);
  addSpot(3, ROOM_H - 0.7, 0, 0xffe2f0, 45, 22, 0.9);
  addPoint(-11, 2.2, 0, 0x8b5cf6, 26, 70);
  addPoint(11, 2.2, 0, 0x22d3ee, 22, 62);
  addPoint(0, 3.6, -11.5, 0xff2d95, 22, 60);
  addPoint(0, 2.0, 11.5, 0x3b82f6, 16, 42);

  const MODES = {
    day: { led: 1, neon: 0.85, glass: 1, wall: 1, poster: 1 },
    midnight: { led: 0.55, neon: 1, glass: 0.55, wall: 0.55, poster: 0.7 },
  };
  function setMode(name) {
    const m = MODES[name] || MODES.day;
    const night = name === "midnight";
    lights.forEach((l) => { l.light.intensity = night ? l.night : l.day; });
    neons.forEach(({ mat, base, glass }) => {
      const k = glass ? m.poster : mat === ledMat ? m.led : m.neon;
      mat.color.copy(base).multiplyScalar(k);
    });
    glassMats.forEach((g) => g.color.setScalar(m.glass));
    wallMats.forEach(({ mat, base }) => mat.color.copy(base).multiplyScalar(m.wall));
  }
  setMode("day");

  const half = ROOM_HALF * u;
  return {
    group: root,
    setMode,
    backdrop: new THREE.Color(0x0b0d12),
    // how far the camera may sit from the car's centre and still be inside the room
    maxCameraDistance: half * 0.82,
    // keep a point inside the room (used for the camera and the orbit target)
    clampInside(point, margin, minY = 0.05) {
      const lx = THREE.MathUtils.clamp(point.x - center.x, -half + margin, half - margin);
      const lz = THREE.MathUtils.clamp(point.z - center.z, -half + margin, half - margin);
      const ly = THREE.MathUtils.clamp(point.y - floorY, minY, ROOM_H * u - 0.4);
      point.set(center.x + lx, floorY + ly, center.z + lz);
      return point;
    },
  };
}
