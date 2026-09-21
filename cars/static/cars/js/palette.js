import * as THREE from "three";

// "Palette" models take every colour from one shared palette image. Painting the car means
// recoloring just the body's swatch in a private copy of that image, so windows, lights and
// trim keep their own colours.

function shadeHex(hex, factor) {
  const value = parseInt(hex.replace("#", ""), 16);
  const channel = (shift) => Math.max(0, Math.min(255, Math.round(((value >> shift) & 255) * factor)));
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`;
}

// region is "x,y,width,height" in texture pixels. Returns { paint(hex) }, or null when the
// model has no texture or the region is unusable.
export function createPalettePainter(root, region) {
  const [x, y, w, h] = (region || "").split(",").map(Number);
  if ([x, y, w, h].some((n) => Number.isNaN(n) || n === undefined)) return null;

  let sourceMap = null;
  root.traverse((child) => {
    if (!sourceMap && child.isMesh && child.material && child.material.map) {
      sourceMap = child.material.map;
    }
  });
  if (!sourceMap) return null;

  const image = sourceMap.image;
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.flipY = sourceMap.flipY;
  texture.colorSpace = sourceMap.colorSpace;
  texture.magFilter = sourceMap.magFilter;
  texture.minFilter = sourceMap.minFilter;

  const swapped = new Set();
  root.traverse((child) => {
    if (child.isMesh && child.material && child.material.map === sourceMap && !swapped.has(child.material)) {
      swapped.add(child.material);
      child.material.map = texture;
      child.material.needsUpdate = true;
    }
  });

  return {
    paint(hex) {
      ctx.fillStyle = hex;
      ctx.fillRect(x, y, w / 2, h);
      ctx.fillStyle = shadeHex(hex, 0.86);
      ctx.fillRect(x + w / 2, y, w / 2, h);
      texture.needsUpdate = true;
    },
  };
}
