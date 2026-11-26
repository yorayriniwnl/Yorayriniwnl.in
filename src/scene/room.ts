import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { canvasTexture, damaskTexture } from "./textures";

export const WINDOW = { x0: -1.25, x1: 1.25, y0: 0.85, y1: 3.05, z: -2.05 };
export const ROOM = { w: 7.6, h: 3.6, back: -2.05, front: 4.5 };

export type Room = {
  group: THREE.Group;
  neon: THREE.Mesh[];
  /** positions of things the camera visits */
  anchors: Record<string, THREE.Vector3>;
};

function frame(w: number, h: number, depth: number, thick: number, mat: THREE.Material) {
  const g = new THREE.Group();
  const bars: [number, number, number, number][] = [
    [0, h / 2 - thick / 2, w, thick],
    [0, -h / 2 + thick / 2, w, thick],
    [-w / 2 + thick / 2, 0, thick, h],
    [w / 2 - thick / 2, 0, thick, h],
  ];
  for (const [x, y, bw, bh] of bars) {
    const m = new THREE.Mesh(new RoundedBoxGeometry(bw, bh, depth, 3, Math.min(thick, depth) * 0.3), mat);
    m.position.set(x, y, 0);
    m.castShadow = true;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

export async function buildRoom(opts: { creed: readonly string[]; skills: readonly string[]; lowPower: boolean }): Promise<Room> {
  const group = new THREE.Group();
  const neon: THREE.Mesh[] = [];
  const loader = new THREE.TextureLoader();
  const tex = (url: string) =>
    new Promise<THREE.Texture>((res) =>
      loader.load(url, (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        res(t);
      }, undefined, () => res(new THREE.Texture())),
    );

  // --------------------------------------------------------- materials ----
  const wallTex = damaskTexture("#3a080b", "#160304", 512);
  wallTex.repeat.set(5, 2);
  const wall = new THREE.MeshStandardMaterial({ color: "#ffffff", map: wallTex, roughness: 0.75 });
  const lacquer = new THREE.MeshPhysicalMaterial({ color: "#1a0204", roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.2 });
  const walnut = new THREE.MeshPhysicalMaterial({ color: "#1c0d07", roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  const gold = new THREE.MeshPhysicalMaterial({ color: "#c8913f", metalness: 1, roughness: 0.28, envMapIntensity: 1.6 });
  const ebony = new THREE.MeshStandardMaterial({ color: "#050404", metalness: 0.6, roughness: 0.35 });
  const neonMat = new THREE.MeshStandardMaterial({ color: "#200000", emissive: "#ff1e14", emissiveIntensity: 2.2 });

  // ------------------------------------------------------------- floor ----
  const floorTex = canvasTexture(1024, 1024, (ctx, w) => {
    for (let i = 0; i < 16; i++) {
      for (let j = 0; j < 4; j++) {
        const l = 8 + Math.random() * 10;
        ctx.fillStyle = `rgb(${l + 6},${l * 0.45},${l * 0.3})`;
        const off = (i % 2) * 128;
        ctx.fillRect(j * 256 + off - 128, i * 64, 254, 62);
        ctx.fillRect(j * 256 + off + 128, i * 64, 254, 62);
      }
    }
    ctx.globalAlpha = 0.08;
    for (let k = 0; k < 4000; k++) {
      ctx.fillStyle = Math.random() > 0.5 ? "#000" : "#3a1a10";
      ctx.fillRect(Math.random() * w, Math.random() * w, Math.random() * 60, 1);
    }
  }).tex;
  floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping;
  floorTex.repeat.set(3, 3);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.front - ROOM.back), new THREE.MeshPhysicalMaterial({ map: floorTex, roughness: 0.45, clearcoat: 0.5, clearcoatRoughness: 0.25 }));
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = (ROOM.front + ROOM.back) / 2;
  floor.receiveShadow = true;
  group.add(floor);

  // rug under the table
  const rugTex = damaskTexture("#6a0d12", "#1f0305", 512);
  rugTex.repeat.set(3, 2);
  const rug = new THREE.Mesh(new THREE.PlaneGeometry(3.4, 2.4), new THREE.MeshPhysicalMaterial({ map: rugTex, roughness: 0.95, sheen: 1, sheenColor: new THREE.Color("#5a1010") }));
  rug.rotation.x = -Math.PI / 2;
  rug.position.set(0, 0.004, -0.2);
  rug.receiveShadow = true;
  group.add(rug);

  // ------------------------------------------------------- back wall ----
  const W = ROOM.w;
  const H = ROOM.h;
  const z = ROOM.back;
  const addWall = (x: number, y: number, w: number, h: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), wall);
    m.position.set(x, y, z - 0.1);
    m.receiveShadow = true;
    group.add(m);
  };
  const { x0, x1, y0, y1 } = WINDOW;
  addWall((-W / 2 + x0) / 2, H / 2, x0 + W / 2, H);
  addWall((W / 2 + x1) / 2, H / 2, W / 2 - x1, H);
  addWall(0, y0 / 2, x1 - x0, y0);
  addWall(0, (H + y1) / 2, x1 - x0, H - y1);
  // side walls
  for (const sx of [-1, 1]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.2, H, ROOM.front - ROOM.back), wall);
    m.position.set(sx * (W / 2 + 0.1), H / 2, (ROOM.front + ROOM.back) / 2);
    m.receiveShadow = true;
    group.add(m);
  }
  // ceiling
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, ROOM.front - ROOM.back), new THREE.MeshStandardMaterial({ color: "#070203", roughness: 0.9 }));
  ceil.rotation.x = Math.PI / 2;
  ceil.position.set(0, H, (ROOM.front + ROOM.back) / 2);
  group.add(ceil);

  // wainscot: lacquered panels with gold beading
  const wains = new THREE.Group();
  const panelW = 0.62;
  for (let x = -W / 2 + panelW / 2 + 0.05; x < W / 2; x += panelW + 0.05) {
    if (x > x0 - 0.2 && x < x1 + 0.2) continue;
    const p = new THREE.Mesh(new RoundedBoxGeometry(panelW, 0.78, 0.05, 2, 0.015), lacquer);
    p.position.set(x, 0.5, z + 0.03);
    p.receiveShadow = true;
    wains.add(p);
    const bead = frame(panelW - 0.08, 0.66, 0.012, 0.012, gold);
    bead.position.set(x, 0.5, z + 0.06);
    wains.add(bead);
  }
  group.add(wains);
  for (const yy of [0.92, 0.06]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(W, yy > 0.5 ? 0.04 : 0.12, 0.06), yy > 0.5 ? gold : walnut);
    rail.position.set(0, yy, z + 0.03);
    group.add(rail);
  }
  const crown = new THREE.Mesh(new THREE.BoxGeometry(W, 0.14, 0.1), walnut);
  crown.position.set(0, H - 0.07, z + 0.05);
  group.add(crown);
  const crownGold = new THREE.Mesh(new THREE.BoxGeometry(W, 0.02, 0.11), gold);
  crownGold.position.set(0, H - 0.15, z + 0.05);
  group.add(crownGold);

  // ------------------------------------------------------------ window ----
  const win = frame(x1 - x0 + 0.16, y1 - y0 + 0.16, 0.22, 0.1, ebony);
  win.position.set(0, (y0 + y1) / 2, z);
  group.add(win);
  for (const fx of [-1 / 3, 1 / 3]) {
    const mull = new THREE.Mesh(new THREE.BoxGeometry(0.06, y1 - y0, 0.12), ebony);
    mull.position.set(fx * (x1 - x0) / 2 * 1.0, (y0 + y1) / 2, z);
    group.add(mull);
  }
  const transom = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.05, 0.12), ebony);
  transom.position.set(0, y1 - 0.55, z);
  group.add(transom);
  const sill = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0 + 0.4, 0.06, 0.32), walnut);
  sill.position.set(0, y0 - 0.03, z + 0.1);
  group.add(sill);
  // neon strips framing the window, like the art
  for (const sx of [-1, 1]) {
    const strip = new THREE.Mesh(new THREE.BoxGeometry(0.035, y1 - y0 + 0.3, 0.035), neonMat);
    strip.position.set(sx * ((x1 - x0) / 2 + 0.2), (y0 + y1) / 2, z + 0.08);
    group.add(strip);
    neon.push(strip);
  }

  // ------------------------------------------------- painting + poster ----
  const [paintTex, posterTex] = await Promise.all([tex("/media/warroom/painting-operator.jpg"), tex("/media/warroom/poster-eclipse.jpg")]);
  const painting = new THREE.Group();
  const pw = 1.5;
  const ph = pw * (658 / 1024);
  const canvas = new THREE.Mesh(new THREE.PlaneGeometry(pw, ph), new THREE.MeshStandardMaterial({ map: paintTex, roughness: 0.7, emissive: "#ffffff", emissiveMap: paintTex, emissiveIntensity: 0.05 }));
  painting.add(canvas);
  const pf = frame(pw + 0.16, ph + 0.16, 0.07, 0.09, gold);
  pf.position.z = 0.01;
  painting.add(pf);
  painting.position.set(-2.45, 1.95, z + 0.06);
  group.add(painting);
  // picture light
  const plight = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 16), gold);
  plight.rotation.z = Math.PI / 2;
  plight.position.set(-2.45, 1.95 + ph / 2 + 0.16, z + 0.16);
  group.add(plight);

  // "Keep Grinding, Keep Losing." red neon script under the painting
  await document.fonts?.load?.("64px 'Permanent Marker'").catch(() => undefined);
  const sign = canvasTexture(1024, 160, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const text = "Keep Grinding, Keep Losing.";
    let size = 84;
    ctx.font = size + "px 'Permanent Marker', 'Brush Script MT', cursive";
    const wide = ctx.measureText(text).width;
    if (wide > w * 0.9) size = Math.floor((size * w * 0.9) / wide);
    ctx.font = size + "px 'Permanent Marker', 'Brush Script MT', cursive";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.shadowColor = "#ff2a1a";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#ff4a3a";
    ctx.fillText(text, w / 2, h / 2);
  }).tex;
  const signMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(1.4, 0.22),
    new THREE.MeshBasicMaterial({ map: sign, transparent: true, color: new THREE.Color(2.2, 1.6, 1.6), depthWrite: false, toneMapped: false }),
  );
  signMesh.position.set(-2.45, 1.95 - ph / 2 - 0.22, z + 0.07);
  group.add(signMesh);
  neon.push(signMesh);

  const poster = new THREE.Group();
  const qw = 1.25;
  const qh = qw * (815 / 800);
  poster.add(new THREE.Mesh(new THREE.PlaneGeometry(qw, qh), new THREE.MeshStandardMaterial({ map: posterTex, roughness: 0.6, emissive: "#ffffff", emissiveMap: posterTex, emissiveIntensity: 0.1 })));
  const qf = frame(qw + 0.1, qh + 0.1, 0.05, 0.05, ebony);
  qf.position.z = 0.01;
  poster.add(qf);
  poster.position.set(2.15, 2.0, z + 0.06);
  group.add(poster);

  // --------------------------------------------------------- bookshelf ----
  const shelf = new THREE.Group();
  const sw = 1.1;
  const sh = 2.9;
  const carcass = [
    [0, sh / 2, sw, 0.04, 0.36, -sw / 2],
  ];
  void carcass;
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(new THREE.BoxGeometry(0.05, sh, 0.36), walnut);
    side.position.set(sx * sw / 2, sh / 2, 0);
    shelf.add(side);
  }
  const back = new THREE.Mesh(new THREE.BoxGeometry(sw, sh, 0.02), lacquer);
  back.position.set(0, sh / 2, -0.17);
  shelf.add(back);
  const rows = [0.08, 0.66, 1.24, 1.82, 2.4, 2.88];
  for (const y of rows) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(sw, 0.04, 0.36), walnut);
    b.position.set(0, y, 0);
    b.receiveShadow = true;
    shelf.add(b);
    if (y < 2.8) {
      const strip = new THREE.Mesh(new THREE.BoxGeometry(sw - 0.08, 0.012, 0.012), neonMat);
      strip.position.set(0, y + 0.53, 0.15);
      shelf.add(strip);
      neon.push(strip);
    }
  }
  // books: one atlas, one material, per-book UVs on the spine face
  const labels: { text: string; accent: boolean }[] = [
    ...opts.creed.map((t) => ({ text: t.toUpperCase(), accent: true })),
    ...opts.skills.map((t) => ({ text: t.toUpperCase(), accent: false })),
  ];
  const AT_W = 2048;
  const AT_H = 1024;
  const cols = 16;
  const cellW = AT_W / cols;
  const atlasRows = Math.ceil(labels.length / cols) + 1;
  const cellH = AT_H / Math.max(2, atlasRows);
  const palette = ["#1a0507", "#0a0a0a", "#0d1410", "#2a0608", "#120d0b"];
  const atlas = canvasTexture(AT_W, AT_H, (ctx) => {
    ctx.fillStyle = "#0a0505";
    ctx.fillRect(0, 0, AT_W, AT_H);
    labels.forEach((l, i) => {
      const cx = (i % cols) * cellW;
      const cy = Math.floor(i / cols) * cellH;
      ctx.fillStyle = l.accent ? "#2a0507" : palette[i % palette.length];
      ctx.fillRect(cx, cy, cellW, cellH);
      ctx.strokeStyle = "#b8873a";
      ctx.lineWidth = 3;
      ctx.strokeRect(cx + 10, cy + 14, cellW - 20, 4);
      ctx.strokeRect(cx + 10, cy + cellH - 18, cellW - 20, 4);
      ctx.save();
      ctx.translate(cx + cellW / 2, cy + cellH / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillStyle = l.accent ? "#e8c27a" : "#c9a15e";
      ctx.font = `700 ${Math.min(44, (cellH * 0.8) / Math.max(6, l.text.length) * 1.7)}px Oxanium, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(l.text, 0, 0);
      ctx.restore();
    });
  }).tex;
  const bookMat = new THREE.MeshPhysicalMaterial({ map: atlas, roughness: 0.6, clearcoat: 0.2 });
  let li = 0;
  const shelfRows = [2.42, 1.84, 1.26, 0.68];
  for (const y of shelfRows) {
    let x = -sw / 2 + 0.05;
    while (x < sw / 2 - 0.12) {
      const thick = 0.035 + Math.random() * 0.03;
      const tall = 0.32 + Math.random() * 0.14;
      const g = new THREE.BoxGeometry(thick, tall, 0.24);
      const i = li % labels.length;
      li++;
      // remap the +Z face (spine) UVs to atlas cell i
      const uv = g.attributes.uv as THREE.BufferAttribute;
      const u0 = ((i % cols) * cellW) / AT_W;
      const v0 = 1 - (Math.floor(i / cols) * cellH + cellH) / AT_H;
      for (let k = 0; k < uv.count; k++) {
        const face = Math.floor(k / 4);
        const fu = uv.getX(k);
        const fv = uv.getY(k);
        if (face === 4) uv.setXY(k, u0 + fu * (cellW / AT_W), v0 + fv * (cellH / AT_H));
        else uv.setXY(k, u0 + 0.01, v0 + 0.5 * (cellH / AT_H));
      }
      const b = new THREE.Mesh(g, bookMat);
      const lean = Math.random() < 0.08 ? 0.18 : 0;
      b.position.set(x + thick / 2, y + 0.02 + tall / 2, 0.02);
      b.rotation.z = lean;
      b.castShadow = true;
      shelf.add(b);
      x += thick + 0.004 + (lean ? 0.06 : 0);
      if (Math.random() < 0.06) x += 0.12; // gap for a trophy
    }
  }
  shelf.position.set(3.2, 0, z + 0.2);
  group.add(shelf);

  // left-side shelf silhouette with brass lamp
  const lshelf = shelf.clone();
  lshelf.position.set(-3.25, 0, z + 0.2);
  group.add(lshelf);

  const anchors = {
    painting: painting.position.clone(),
    poster: poster.position.clone(),
    shelf: shelf.position.clone().add(new THREE.Vector3(0, 1.5, 0)),
  };
  return { group, neon, anchors };
}

/** Laptop screen: an operations radar that names the selected project. */
export function makeLaptopScreen() {
  const W = 1024;
  const H = 652;
  const { tex, ctx } = canvasTexture(W, H, () => undefined);
  let title = "";
  let index = "";
  let ping: readonly [number, number] = [0.7, 0.42];
  const draw = (t: number) => {
    ctx.fillStyle = "#160204";
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = "rgba(255,50,40,0.32)";
    ctx.lineWidth = 1;
    for (let x = 0; x < W; x += 32) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y < H; y += 32) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    const cx = ping[0] * W;
    const cy = ping[1] * H;
    for (let r = 1; r <= 4; r++) {
      ctx.strokeStyle = `rgba(255,70,55,${0.85 - r * 0.15})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(cx, cy, r * 70, 0, Math.PI * 2);
      ctx.stroke();
    }
    const a = t * 1.4;
    const grad = ctx.createConicGradient ? ctx.createConicGradient(a, cx, cy) : null;
    if (grad) {
      grad.addColorStop(0, "rgba(255,60,40,0.75)");
      grad.addColorStop(0.12, "rgba(255,40,30,0)");
      grad.addColorStop(1, "rgba(255,40,30,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(cx, cy, 280, 0, Math.PI * 2);
      ctx.fill();
    }
    const pulse = 8 + 6 * Math.abs(Math.sin(t * 3));
    ctx.fillStyle = "#ff3a2a";
    ctx.beginPath();
    ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#ff5a48";
    ctx.font = "600 30px Oxanium, monospace";
    ctx.fillText("YOR // OPERATIONS", 36, 56);
    ctx.font = "700 72px Oxanium, monospace";
    ctx.fillStyle = "#ffd9d2";
    ctx.fillText(title.toUpperCase(), 36, H - 70);
    ctx.font = "500 26px Oxanium, monospace";
    ctx.fillStyle = "#ff5a48";
    ctx.fillText(`OP-${index}  ·  20.30N 85.82E  ·  ${new Date().toISOString().slice(0, 10)}`, 36, H - 28);
    tex.needsUpdate = true;
  };
  return {
    tex,
    set(next: { title: string; index: string; ping: readonly [number, number] }) {
      title = next.title;
      index = next.index;
      ping = next.ping;
    },
    draw,
  };
}

export function makeNotebookCover() {
  return canvasTexture(512, 688, (ctx, w, h) => {
    ctx.fillStyle = "#0b0909";
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "#b8873a";
    ctx.lineWidth = 4;
    ctx.strokeRect(24, 24, w - 48, h - 48);
    ctx.fillStyle = "#d9b26a";
    ctx.font = "700 64px Oxanium, sans-serif";
    ctx.textAlign = "center";
    ["IDEAS", "BUILD", "GRIND", "REPEAT"].forEach((word, i) => ctx.fillText(word, w / 2, 230 + i * 86));
    ctx.font = "600 28px Oxanium, sans-serif";
    ctx.fillStyle = "#b8873a";
    ctx.fillText("Y O R", w / 2, h - 70);
  }).tex;
}
