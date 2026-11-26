import * as THREE from "three";

/** Canvas helpers for runtime-drawn textures (labels, screens, signs). */
export function canvasTexture(w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true) {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  return { tex, canvas, ctx };
}

/** Tileable value noise as a single-channel DataTexture (for fur, rain, clouds). */
export function noiseTexture(size = 256, seed = 1, cell = 1): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  let s = seed * 9301 + 49297;
  const rand = () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
  for (let i = 0; i < size * size; i++) {
    const v = cell === 1 ? rand() : 0;
    data[i * 4] = v * 255;
    data[i * 4 + 1] = rand() * 255;
    data[i * 4 + 2] = rand() * 255;
    data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  return tex;
}

/** Soft round sprite for particles and light glows. */
export function glowSprite(size = 128): THREE.Texture {
  return canvasTexture(size, size, (ctx, w) => {
    const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(0.25, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, w);
  }).tex;
}

/** Ornamental damask for the rug and wall panels. */
export function damaskTexture(fg: string, bg: string, size = 512): THREE.Texture {
  const { tex } = canvasTexture(size, size, (ctx, w) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, w);
    ctx.strokeStyle = fg;
    ctx.lineWidth = w / 170;
    ctx.globalAlpha = 0.9;
    const motif = (cx: number, cy: number, s: number) => {
      ctx.save();
      ctx.translate(cx, cy);
      for (let k = 0; k < 2; k++) {
        ctx.scale(-1, 1);
        ctx.beginPath();
        ctx.moveTo(0, -s);
        ctx.bezierCurveTo(s * 0.55, -s * 0.8, s * 0.7, -s * 0.2, s * 0.25, 0);
        ctx.bezierCurveTo(s * 0.7, s * 0.2, s * 0.55, s * 0.8, 0, s);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(s * 0.42, -s * 0.42, s * 0.16, 0, Math.PI * 1.6);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(s * 0.42, s * 0.42, s * 0.16, Math.PI * 0.4, Math.PI * 2);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.12, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    };
    const s = w / 4.4;
    for (const [x, y] of [[0.25, 0.25], [0.75, 0.75], [0.75, 0.25], [0.25, 0.75]] as const) {
      motif(x * w, y * w, (x === y ? 1 : 0.6) * s);
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
