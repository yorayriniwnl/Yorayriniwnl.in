import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import {
  CAMERA_PRESETS,
  WAR_ROOM_HOTSPOTS,
  type HotspotConfig,
  type HotspotId,
} from "../data/hubData";
import {
  AdaptiveRenderScaler,
  ExternalDepthBokehPass,
  computeResponsiveLetterbox,
  createFinalGradeShader,
  selectPlateQuality,
} from "../lib/cinematicPost";
import { createDustAndEmberSystem } from "../lib/cinematicParticles";

type CameraMode = "third-person" | "orbit";
type FreeRoamTelemetry = { fps: number; scale: number };

type WarRoom3DProps = {
  selectedHotspot: HotspotId | null;
  onSelectHotspot: (hotspot: HotspotConfig | null) => void;
  lanternBright: boolean;
  onToggleLantern: () => void;
  activePreset: string;
  onPresetChange: (presetId: string) => void;
  autoOrbit: boolean;
  onToggleAutoOrbit: () => void;
  onOpenAssets: () => void;
  inputSuspended?: boolean;
};

type LoadedAssets = {
  room: THREE.Group;
  operator: THREE.Group;
  operatorClips: THREE.AnimationClip[];
  husky: THREE.Group;
  envMap: THREE.Texture | null;
};

type PlayerHudState = {
  x: number;
  z: number;
  yaw: number;
  moving: boolean;
  sprinting: boolean;
  nearby: HotspotConfig | null;
};

// Tunable visual look parameters calibrated against the War Room reference painting
const FREE_ROAM_LOOK = {
  fov: 36,
  exposure: 1.02,
  envIntensity: 0.34,
  gtaoRadius: 0.50,
  gtaoScale: 1.28,
  gtaoBlendIntensity: 0.88,
  bloomStrength: 0.16,
  bloomRadius: 0.34,
  bloomThreshold: 1.42,
  gradeExposure: 1.06,
  gradeContrast: 1.12,
  gradeBlackPoint: 0.018,
  gradeSaturation: 1.04,
  gradeRedRichness: 0.06,
  gradeVignette: 0.30,
  gradeGrain: 0.014,
  gradeChroma: 0.0018,
};

// Sliding AABB collision boxes in Three.js world space (X, Z)
const ROOM_BOUNDS = { minX: -4.18, maxX: 4.18, minZ: -3.88, maxZ: 3.70 };
const PLAYER_RADIUS = 0.34;
const OBSTACLES: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> = [
  { minX: -1.32, maxX: 1.32, minZ: -0.15, maxZ: 0.92 },
  { minX: -1.38, maxX: 1.38, minZ: -2.72, maxZ: -1.62 },
  { minX: -2.86, maxX: -1.80, minZ: -2.65, maxZ: -1.65 },
  { minX: 1.84, maxX: 2.88, minZ: -2.65, maxZ: -1.65 },
  { minX: 3.72, maxX: 4.65, minZ: -2.25, maxZ: 2.25 },
  { minX: -4.55, maxX: -3.32, minZ: -0.92, maxZ: 0.62 },
];

const HOTSPOT_BY_NODE = new Map<string, HotspotConfig>(
  WAR_ROOM_HOTSPOTS.map((h) => [h.nodeName, h]),
);
const HOTSPOT_BY_ID = new Map<HotspotId, HotspotConfig>(
  WAR_ROOM_HOTSPOTS.map((h) => [h.id, h]),
);

function findHotspotFromObject(obj: THREE.Object3D | null): HotspotConfig | null {
  let cur: THREE.Object3D | null = obj;
  while (cur) {
    if (cur.userData?.hotspotId) {
      const hit = HOTSPOT_BY_ID.get(cur.userData.hotspotId as HotspotId);
      if (hit) return hit;
    }
    const byName = HOTSPOT_BY_NODE.get(cur.name);
    if (byName) return byName;
    cur = cur.parent;
  }
  return null;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = THREE.MathUtils.clamp((x - edge0) / Math.max(edge1 - edge0, 1e-5), 0, 1);
  return t * t * (3 - 2 * t);
}

function resolveCollision(x: number, z: number): [number, number] {
  let nx = THREE.MathUtils.clamp(x, ROOM_BOUNDS.minX, ROOM_BOUNDS.maxX);
  let nz = THREE.MathUtils.clamp(z, ROOM_BOUNDS.minZ, ROOM_BOUNDS.maxZ);
  for (const box of OBSTACLES) {
    const cx = THREE.MathUtils.clamp(nx, box.minX, box.maxX);
    const cz = THREE.MathUtils.clamp(nz, box.minZ, box.maxZ);
    const dx = nx - cx;
    const dz = nz - cz;
    const distSq = dx * dx + dz * dz;
    if (distSq < PLAYER_RADIUS * PLAYER_RADIUS) {
      const dist = Math.sqrt(distSq);
      if (dist > 1e-4) {
        const push = PLAYER_RADIUS - dist;
        nx += (dx / dist) * push;
        nz += (dz / dist) * push;
      } else {
        const dL = Math.abs(nx - box.minX);
        const dR = Math.abs(box.maxX - nx);
        const dT = Math.abs(nz - box.minZ);
        const dB = Math.abs(box.maxZ - nz);
        const m = Math.min(dL, dR, dT, dB);
        if (m === dL) nx = box.minX - PLAYER_RADIUS;
        else if (m === dR) nx = box.maxX + PLAYER_RADIUS;
        else if (m === dT) nz = box.minZ - PLAYER_RADIUS;
        else nz = box.maxZ + PLAYER_RADIUS;
      }
    }
  }
  nx = THREE.MathUtils.clamp(nx, ROOM_BOUNDS.minX, ROOM_BOUNDS.maxX);
  nz = THREE.MathUtils.clamp(nz, ROOM_BOUNDS.minZ, ROOM_BOUNDS.maxZ);
  return [nx, nz];
}

function clampCameraBoom(
  originX: number,
  originY: number,
  originZ: number,
  dirX: number,
  dirY: number,
  dirZ: number,
  desiredDist: number,
): number {
  const minX = -3.62;
  const maxX = 3.62;
  const minY = 0.45;
  const maxY = 3.48;
  const minZ = -3.85;
  const maxZ = 3.74;
  let tMax = desiredDist;

  if (dirX < -1e-4) tMax = Math.min(tMax, (minX - originX) / dirX);
  else if (dirX > 1e-4) tMax = Math.min(tMax, (maxX - originX) / dirX);

  if (dirY < -1e-4) tMax = Math.min(tMax, (minY - originY) / dirY);
  else if (dirY > 1e-4) tMax = Math.min(tMax, (maxY - originY) / dirY);

  if (dirZ < -1e-4) tMax = Math.min(tMax, (minZ - originZ) / dirZ);
  else if (dirZ > 1e-4) tMax = Math.min(tMax, (maxZ - originZ) / dirZ);

  return THREE.MathUtils.clamp(tMax - 0.06, 0.55, desiredDist);
}

// Procedural tileable fur noise texture for GPU multi-shell Siberian Husky fur
function makeFurNoiseTexture(): THREE.DataTexture {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  let seed = 1337;
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const clumpGrid = new Float32Array(32 * 32);
  for (let i = 0; i < clumpGrid.length; i++) clumpGrid[i] = rand();

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;
      const gx = Math.floor((x / size) * 32) % 32;
      const gy = Math.floor((y / size) * 32) % 32;
      const strand = rand();
      const clump = clumpGrid[gy * 32 + gx];
      data[idx] = Math.floor(strand * 255);
      data[idx + 1] = Math.floor(clump * 255);
      data[idx + 2] = 128;
      data[idx + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// Custom GPU Animated Rain-on-Glass Shader for floor-to-ceiling North Eclipse Window
function createRainGlassMaterial(): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    uniforms: {
      uTime: { value: 0 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;

      float hash21(vec2 p) {
        p = fract(p * vec2(123.34, 456.21));
        p += dot(p, p + 45.32);
        return fract(p.x * p.y);
      }

      float rainLayer(vec2 uv, float t, float cols) {
        vec2 aspect = vec2(cols, cols * 0.28);
        vec2 st = uv * aspect;
        st.y += t * 0.55;
        vec2 id = floor(st);
        float n = hash21(id);
        vec2 gv = fract(st) - 0.5;
        float yOff = sin(t * 1.4 + n * 6.2831) * 0.28;
        float xOff = (n - 0.5) * 0.52;
        vec2 dropPos = vec2(xOff, yOff);
        float d = length((gv - dropPos) * vec2(1.0, 2.6));
        float drop = 1.0 - smoothstep(0.03, 0.16, d);
        float trailX = 1.0 - smoothstep(0.01, 0.06, abs(gv.x - xOff));
        float trailY = smoothstep(-0.45, yOff, gv.y) * (1.0 - smoothstep(yOff - 0.02, yOff + 0.04, gv.y));
        float mask = smoothstep(0.25, 0.85, n);
        return clamp(max(drop, trailX * trailY * 0.45) * mask, 0.0, 1.0);
      }

      void main() {
        float r1 = rainLayer(vUv, uTime * 0.85, 22.0);
        float r2 = rainLayer(vUv + vec2(0.37, 0.19), uTime * 1.25, 34.0) * 0.7;
        float rain = clamp(r1 + r2, 0.0, 1.0);
        vec3 baseTint = vec3(0.02, 0.01, 0.015);
        vec3 dropGlow = vec3(0.92, 0.22, 0.20) * rain * 0.78;
        float alpha = clamp(0.03 + rain * 0.34, 0.0, 0.78);
        gl_FragColor = vec4(baseTint + dropGlow, alpha);
      }
    `,
  });
}

// Paint authentic high-contrast Siberian Husky coat markings onto HV_Rump linear vertex colors:
// jet-black dorsal mantle & shoulder wrap, skull cap, ear backs/rims, widow's peak & eye spectacles,
// paired with crisp snow-white inner ears, brow blaze, cheeks, muzzle, chest ruff, forelegs & tail underside.
function paintProperHuskyMarkings(targetMesh: THREE.Mesh) {
  const geom = targetMesh.geometry;
  const posAttr = geom.getAttribute("position") as THREE.BufferAttribute | undefined;
  const normAttr = geom.getAttribute("normal") as THREE.BufferAttribute | undefined;
  if (!posAttr || !normAttr) return;

  const count = posAttr.count;
  const colors = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    const x = posAttr.getX(i);
    const y = posAttr.getY(i);
    const z = posAttr.getZ(i);
    const ny = normAttr.getY(i);
    const nz = normAttr.getZ(i);
    const ax = Math.abs(x);

    // Organic guard-hair boundary feathering
    const feather =
      0.017 * Math.sin(x * 46.0 + y * 30.0) * Math.cos(z * 38.0) +
      0.008 * Math.sin(x * 94.0 + z * 78.0 - y * 64.0);

    // 1. Dorsal saddle / mantle wrapping over back, shoulders, flanks, and haunches
    const saddleFloor = THREE.MathUtils.clamp(0.28 + 0.85 * z, 0.08, 0.50);
    const aboveBelly = smoothstep(saddleFloor - 0.16 + feather, saddleFloor - 0.03 + feather, y);
    const shoulderForward = 0.055 + smoothstep(0.055, 0.125, ax) * 0.135;
    const behindChest = 1.0 - smoothstep(shoulderForward - 0.045 + feather, shoulderForward + 0.04 + feather, z);
    const dorsalFacing = THREE.MathUtils.clamp(0.86 + ny * 0.40 - nz * 0.40, 0.0, 1.0);
    let mantle = THREE.MathUtils.clamp(aboveBelly * behindChest * dorsalFacing * 1.5, 0.0, 1.0);

    // Outer thigh / haunch wrap
    if (y < 0.46) {
      const haunch =
        (1.0 - smoothstep(-0.055 + feather, 0.045 + feather, z)) *
        smoothstep(0.075 + feather, 0.165 + feather, y);
      mantle = Math.max(mantle, THREE.MathUtils.clamp(haunch * 1.25, 0.0, 1.0));
    }

    // 2. Siberian Husky head markings (y > 0.54)
    let isInnerEar = false;
    if (y > 0.46) {
      const backNeck =
        (1.0 - smoothstep(0.11 + feather, 0.195 + feather, z)) * smoothstep(0.45, 0.54, y);
      mantle = Math.max(mantle, backNeck);
    }

    if (y > 0.55) {
      // Jet-black skull cap / crown
      const crownLine = 0.694 + Math.max(0.0, z - 0.205) * 0.22 + feather * 0.55;
      const crown = smoothstep(crownLine, crownLine + 0.024, y);

      // Sharp black widow's peak coming down the center forehead between the eyes
      const widowPeak =
        Math.exp(-((ax / 0.025) ** 2)) *
        smoothstep(0.674, 0.704, y) *
        (z > 0.215 && z < 0.365 ? 1.0 : 0.0);

      // Dark eye spectacles/mask framing each crimson eye and sweeping back toward temples
      const eyeMask =
        Math.exp(-(((ax - 0.050) / 0.027) ** 2)) *
        Math.exp(-(((y - 0.708) / 0.021) ** 2)) *
        smoothstep(0.215, 0.275, z);

      // Dark cheek sideburn border framing the plush white cheek ruff
      const sideburn =
        smoothstep(0.074, 0.102, ax) *
        smoothstep(0.625, 0.675, y) *
        (1.0 - smoothstep(0.185, 0.255, z));

      let headDark = Math.max(crown, widowPeak, eyeMask * 0.96, sideburn * 0.92);

      // Crisp white forehead brow pips flanking the widow's peak
      const browPip =
        Math.exp(-(((ax - 0.036) / 0.016) ** 2)) *
        Math.exp(-(((y - 0.722) / 0.015) ** 2)) *
        smoothstep(0.240, 0.285, z);
      headDark *= 1.0 - browPip * 0.92;

      // Tall pointed ears: jet-black backs, outer edges & tips; bright snow-white inner ear triangles
      if (y > 0.725 && ax > 0.022) {
        const innerFace = smoothstep(0.24, 0.52, nz);
        const withinEarCore =
          smoothstep(0.034, 0.050, ax) *
          (1.0 - smoothstep(0.074, 0.094, ax)) *
          smoothstep(0.732, 0.760, y) *
          (1.0 - smoothstep(0.842, 0.876, y));
        const innerMask = innerFace * withinEarCore;
        if (innerMask > 0.32) isInnerEar = true;
        headDark = THREE.MathUtils.lerp(1.0, 0.02, innerMask);
      }

      // Protect crisp snow-white muzzle and plush lower cheek ruffs
      if (z > 0.290 && y < 0.695) {
        headDark *= 0.03;
      } else if (y > 0.555 && y < 0.694 && z > 0.18 && ax < 0.104) {
        headDark *= 0.04;
      }

      mantle = Math.max(mantle, headDark);
    }

    // 3. Curled wolf tail brush: dark charcoal-black upper, snow-white underside & tip
    if (z < -0.205 || (z < -0.155 && y > 0.28)) {
      const tailDark = THREE.MathUtils.clamp(ny * 0.62 - nz * 0.72 + 0.44 + feather * 2.2, 0.06, 1.0);
      const tailTip = smoothstep(0.41, 0.46, y) * smoothstep(-0.30, -0.21, z);
      mantle = THREE.MathUtils.lerp(tailDark, 0.06, tailTip);
    }

    // 4. Protect snow-white chest ruff, forelegs, and paws
    if (z > 0.13 && y > 0.22 && y < 0.60 && ax < 0.096) {
      mantle *= 0.05;
    }
    if ((y < 0.265 && z > 0.035) || y < 0.072) {
      mantle *= 0.03;
    }

    const m = THREE.MathUtils.clamp(mantle, 0.0, 1.0);

    // Linear RGB coat ramp: plush snow white -> silver agouti edge -> jet black
    const cheekLift = y > 0.58 && y < 0.72 && z > 0.20 ? 1.06 : 1.0;
    const whiteR = (isInnerEar ? 0.82 : 0.79) * cheekLift;
    const whiteG = (isInnerEar ? 0.75 : 0.79) * cheekLift;
    const whiteB = (isInnerEar ? 0.75 : 0.78) * cheekLift;
    const silverR = 0.14;
    const silverG = 0.145;
    const silverB = 0.165;
    const blackR = 0.010;
    const blackG = 0.011;
    const blackB = 0.014;

    const lowT = THREE.MathUtils.clamp(m * 2.35, 0.0, 1.0);
    const highT = THREE.MathUtils.clamp((m - 0.34) / 0.56, 0.0, 1.0);

    let r = THREE.MathUtils.lerp(whiteR, silverR, lowT);
    let g = THREE.MathUtils.lerp(whiteG, silverG, lowT);
    let b = THREE.MathUtils.lerp(whiteB, silverB, lowT);

    r = THREE.MathUtils.lerp(r, blackR, highT);
    g = THREE.MathUtils.lerp(g, blackG, highT);
    b = THREE.MathUtils.lerp(b, blackB, highT);

    const micro = 0.93 + 0.12 * Math.sin(x * 190.0 + z * 165.0 + y * 210.0);
    colors[i * 3] = THREE.MathUtils.clamp(r * micro, 0.008, 0.94);
    colors[i * 3 + 1] = THREE.MathUtils.clamp(g * micro, 0.008, 0.94);
    colors[i * 3 + 2] = THREE.MathUtils.clamp(b * micro, 0.010, 0.94);
  }

  geom.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geom.attributes.color.needsUpdate = true;

  const mats = Array.isArray(targetMesh.material) ? targetMesh.material : [targetMesh.material];
  for (const mat of mats) {
    if (mat instanceof THREE.MeshStandardMaterial) {
      mat.vertexColors = true;
      mat.color.set("#ffffff");
      mat.roughness = 0.90;
      mat.metalness = 0.0;
      mat.envMapIntensity = 0.36;
      mat.needsUpdate = true;
    }
  }
}

function attachHuskyFurShells(husky: THREE.Group, furTex: THREE.DataTexture) {
  let bodyMesh: THREE.Mesh | null = null;
  husky.traverse((child) => {
    child.userData.hotspotId = "husky";
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.frustumCulled = false;

      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m instanceof THREE.MeshStandardMaterial) {
          if (m.name.includes("K9Helmet") || m.name.includes("K9GasMask") || m.name.includes("K9Harness")) {
            m.color.set("#151619");
            m.roughness = 0.52;
            m.envMapIntensity = 0.48;
          } else if (m.name.includes("CrimsonEye")) {
            m.color.set("#5c0408");
            m.emissive.set("#d80812");
            m.emissiveIntensity = 1.05;
          } else if (m.name.includes("CrimsonAccent")) {
            // Sleek matte dark crimson tactical respirator trim matching the reference
            m.color.set("#6c0a10");
            m.emissive.set("#280306");
            m.emissiveIntensity = 0.04;
            m.roughness = 0.58;
            m.metalness = 0.15;
          } else if (m.name.includes("BuckleGold")) {
            m.envMapIntensity = 1.25;
          }
        }
      }

      if (mesh.name.includes("HV_Rump") || mesh.name.includes("Husky_SculptedBody")) {
        bodyMesh = mesh;
      }
    }
  });

  if (!bodyMesh) return;
  const targetMesh = bodyMesh as THREE.Mesh;
  paintProperHuskyMarkings(targetMesh);

  if (targetMesh.userData.furAttached) return;
  targetMesh.userData.furAttached = true;

  const isSkinned = (targetMesh as THREE.SkinnedMesh).isSkinnedMesh;
  const skinnedTarget = targetMesh as THREE.SkinnedMesh;
  const shellParent = targetMesh.parent ?? targetMesh;

  // 7 GPU-discarded fur shell layers properly skinned to the Husky armature
  // Fur length tapers cleanly to zero under the harness collar/chest strap & respirator mask so gear never clips!
  const layers = 7;
  const furLength = 0.0095;
  for (let i = 1; i <= layers; i++) {
    const h = i / layers;
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.94,
      metalness: 0.0,
      envMapIntensity: 0.30,
      color: new THREE.Color("#ffffff").multiplyScalar(0.56 + 0.48 * h),
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uH = { value: h };
      shader.uniforms.uLen = { value: furLength };
      shader.uniforms.uNoise = { value: furTex };
      shader.uniforms.uDensity = { value: 3.6 };
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform float uH; uniform float uLen; varying vec3 vFurP; varying vec3 vFurN;",
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvec3 safeN = normalize(objectNormal + vec3(0.0, 1e-5, 0.0));\nfloat collarZone = smoothstep(0.515, 0.545, position.y) * (1.0 - smoothstep(0.585, 0.615, position.y));\nfloat strapZone = smoothstep(0.395, 0.425, position.y) * (1.0 - smoothstep(0.495, 0.530, position.y)) * smoothstep(0.04, 0.14, position.z);\nfloat maskZone = smoothstep(0.285, 0.330, position.z) * (1.0 - smoothstep(0.680, 0.715, position.y));\nfloat furMask = clamp(1.0 - max(max(collarZone, strapZone), maskZone), 0.0, 1.0);\nfloat effLen = uLen * furMask;\ntransformed += safeN * (uH * effLen);\ntransformed.y -= uH * uH * effLen * 0.24;\nvFurP = position; vFurN = abs(safeN);",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform float uH; uniform sampler2D uNoise; uniform float uDensity; varying vec3 vFurP; varying vec3 vFurN;\nvec2 furTri(float d){ vec3 w = vFurN / (vFurN.x + vFurN.y + vFurN.z + 1e-4); vec3 p = vFurP * d; return texture2D(uNoise, p.yz).rg * w.x + texture2D(uNoise, p.xz).rg * w.y + texture2D(uNoise, p.xy).rg * w.z; }",
        )
        .replace(
          "#include <clipping_planes_fragment>",
          "#include <clipping_planes_fragment>\nfloat strand = furTri(uDensity).r;\nfloat clump = furTri(uDensity * 0.16).g;\nif (strand * (0.76 + 0.48 * clump) < uH * 0.92 + 0.05) discard;",
        );
    };
    mat.customProgramCacheKey = () => `huskyFurShellV2_${i}`;

    let shell: THREE.Mesh;
    if (isSkinned && skinnedTarget.skeleton) {
      const skinnedShell = new THREE.SkinnedMesh(targetMesh.geometry, mat);
      skinnedShell.bind(skinnedTarget.skeleton, skinnedTarget.bindMatrix);
      skinnedShell.position.copy(targetMesh.position);
      skinnedShell.quaternion.copy(targetMesh.quaternion);
      skinnedShell.scale.copy(targetMesh.scale);
      shell = skinnedShell;
      shellParent.add(shell);
    } else {
      shell = new THREE.Mesh(targetMesh.geometry, mat);
      targetMesh.add(shell);
    }
    shell.castShadow = false;
    shell.receiveShadow = true;
    shell.frustumCulled = false;
    shell.userData.hotspotId = "husky";
    shell.userData.excludeFromGtao = true;
  }
}

function prepareRoomScene(room: THREE.Group, rainMat: THREE.ShaderMaterial) {
  room.traverse((child) => {
    const hotspot = HOTSPOT_BY_NODE.get(child.name);
    if (hotspot) {
      child.traverse((sub) => {
        sub.userData.hotspotId = hotspot.id;
      });
    }
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const nm = mesh.name;

      if (nm.includes("Window_RainGlass")) {
        mesh.material = rainMat;
        mesh.castShadow = false;
        mesh.receiveShadow = false;
        mesh.userData.excludeFromGtao = true;
        return;
      }

      const isBgOrGlow =
        nm.includes("EclipseSkyline") ||
        nm.includes("Neon") ||
        nm.includes("Glow") ||
        nm.includes("ScreenMap") ||
        nm.includes("Room_Architecture");
      mesh.castShadow = !isBgOrGlow;
      mesh.receiveShadow = !nm.includes("EclipseSkyline");

      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m instanceof THREE.MeshStandardMaterial) {
          const matName = m.name || "";

          // True obsidian blacks & neutral architectural calibration
          if (matName.includes("PolyWallPlaster")) {
            m.color.setRGB(0.08, 0.078, 0.082);
            m.roughness = 0.92;
            m.envMapIntensity = 0.22;
          } else if (matName.includes("PolyWainscot")) {
            m.color.setRGB(0.088, 0.076, 0.072);
            m.roughness = 0.74;
            m.envMapIntensity = 0.30;
          } else if (matName.includes("PolyParquet")) {
            m.color.setRGB(0.10, 0.08, 0.07);
            m.roughness = 0.62;
            m.envMapIntensity = 0.36;
            if (m instanceof THREE.MeshPhysicalMaterial) m.clearcoat = 0.12;
          } else if (matName.includes("PolyWalnutDesk")) {
            m.color.setRGB(0.065, 0.054, 0.052);
            m.roughness = 0.40;
            m.envMapIntensity = 0.46;
            if (m instanceof THREE.MeshPhysicalMaterial) {
              m.clearcoat = 0.10;
              m.clearcoatRoughness = 0.36;
            }
          } else if (matName.includes("Obsidian") || matName.includes("ClassicLaptop_Mat_0")) {
            m.color.setRGB(0.012, 0.012, 0.015);
            m.envMapIntensity = 0.48;
          } else if (matName.includes("CrimsonRug")) {
            m.color.setRGB(0.022, 0.007, 0.009);
            m.envMapIntensity = 0.12;
          } else if (matName.includes("PolyCrimsonLeather")) {
            // Deep tufted oxblood velvet-leather: soft rim sheen without glossy specular pools
            m.color.setRGB(0.11, 0.014, 0.018);
            m.roughness = 0.80;
            m.envMapIntensity = 0.24;
            if (m instanceof THREE.MeshPhysicalMaterial) {
              m.clearcoat = 0.0;
              m.clearcoatRoughness = 0.72;
            }
          } else if (matName.includes("QuadNVG_TacticalHelmet")) {
            m.color.setRGB(0.095, 0.095, 0.105);
            m.emissiveIntensity = 0.16;
            m.envMapIntensity = 0.76;
          } else if (
            matName.includes("Gold") ||
            matName.includes("Brass") ||
            nm.includes("Gold") ||
            nm.includes("AK") ||
            nm.includes("Knight")
          ) {
            m.roughness = Math.max(m.roughness, 0.28);
            m.envMapIntensity = 1.05;
            if (m instanceof THREE.MeshPhysicalMaterial) {
              m.clearcoat = 0.08;
              m.clearcoatRoughness = 0.30;
            }
          } else if (matName.includes("LanternCrimsonCore")) {
            m.emissiveIntensity = 1.55;
          } else if (matName.includes("NeonCrimson")) {
            m.emissiveIntensity = 1.25;
          } else if (matName.includes("NeonSoft")) {
            m.emissiveIntensity = 0.78;
          } else {
            m.envMapIntensity = 0.42;
          }

          if (nm.includes("NVGCase") || nm.includes("Pelican") || nm.includes("TacticalCase")) {
            if (m.color.r < 0.035 && m.color.g < 0.035) {
              m.color.setRGB(0.038, 0.038, 0.044);
              m.roughness = 0.62;
            }
          }
          if (nm.includes("Notebook") || matName.includes("Paper") || matName.includes("Page")) {
            m.color.multiplyScalar(0.74);
            m.roughness = Math.max(m.roughness, 0.90);
          }
          if (nm.includes("EclipseSkyline")) {
            m.emissiveIntensity = 1.05;
            m.fog = false;
          }
          if (nm.includes("Laptop_ScreenMap")) {
            m.emissiveIntensity = 1.25;
          }
          if (nm.includes("PaintPort_Canvas") || nm.includes("Ayush_Canvas")) {
            m.emissiveIntensity = 0.20;
          }
          if (nm.includes("Poster_Artwork")) {
            m.emissiveIntensity = 0.28;
          }
        }
      }

      // Window mullions are solid obsidian iron silhouettes against the blood-moon skyline (matching reference)
      if (nm.includes("Window_Mullions") && Array.isArray(mesh.material)) {
        mesh.material = mesh.material.map((mat) => {
          if (mat instanceof THREE.MeshStandardMaterial && mat.name.includes("NeonCrimson")) {
            const darkIron = mat.clone();
            darkIron.color.set("#09090b");
            darkIron.emissive.set("#1a0406");
            darkIron.emissiveIntensity = 0.06;
            darkIron.roughness = 0.55;
            return darkIron;
          }
          return mat;
        });
      }
    }
  });
}

function WarRoomDustAndEmbers({ lanternBright }: { lanternBright: boolean }) {
  const { gl, size } = useThree();
  const isMobile = useMemo(() => selectPlateQuality().isMobile, []);

  const system = useMemo(
    () =>
      createDustAndEmberSystem({
        mode: "scene-depth",
        dustCount: isMobile ? 140 : 230,
        emberCount: isMobile ? 85 : 145,
        bounds: [-4.05, 4.05, 0.22, 3.42, -3.75, 3.55],
        emberSources: [
          [2.58, 1.12, -2.10, 1.1],
          [-0.15, 1.65, -3.45, 1.45],
          [3.62, 1.55, 0.15, 1.15],
          [0.0, 1.05, 0.35, 1.3],
        ],
      }),
    [isMobile],
  );

  useEffect(() => {
    return () => {
      system.dispose();
    };
  }, [system]);

  useFrame((state) => {
    system.update(
      state.clock.elapsedTime,
      gl.getPixelRatio(),
      size.height,
      lanternBright ? 1.0 : 0.45,
    );
  });

  return <primitive object={system.group} />;
}

function VolumetricEclipseShafts() {
  const shaftMat = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, "rgba(255, 36, 36, 0.16)");
      grad.addColorStop(0.5, "rgba(150, 12, 18, 0.05)");
      grad.addColorStop(1, "rgba(10, 2, 3, 0.0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 256);
    }
    const tex = new THREE.CanvasTexture(canvas);
    return new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
  }, []);

  useEffect(() => {
    return () => {
      shaftMat.map?.dispose();
      shaftMat.dispose();
    };
  }, [shaftMat]);

  return (
    <group>
      <mesh
        position={[-0.55, 2.08, -3.45]}
        rotation={[-0.48, 0.08, 0.04]}
        material={shaftMat}
        userData={{ excludeFromGtao: true }}
      >
        <planeGeometry args={[1.6, 4.2]} />
      </mesh>
      <mesh
        position={[0.25, 2.08, -3.40]}
        rotation={[-0.50, -0.08, -0.04]}
        material={shaftMat}
        userData={{ excludeFromGtao: true }}
      >
        <planeGeometry args={[1.6, 4.2]} />
      </mesh>
    </group>
  );
}

// Post-Processing Chain:
//   RenderPass (Linear HDR) -> GTAO Ambient Occlusion -> Golden-Angle Bokeh DoF (hovered object / Operator)
//   -> Emissive UnrealBloom -> Final Grade (ACES + Horizontal Lens Streaks + Edge CA + Grain + Vignette + Letterbox)
//   Paired with AdaptiveRenderScaler targeting 60 fps.
function CinematicComposer({
  cameraMode,
  focusTargetRef,
  letterboxEnabled,
  onTelemetry,
}: {
  cameraMode: CameraMode;
  focusTargetRef: MutableRefObject<THREE.Vector3>;
  letterboxEnabled: boolean;
  onTelemetry: (t: FreeRoamTelemetry) => void;
}) {
  const { gl, scene, camera, size } = useThree();
  const composerRef = useRef<EffectComposer | null>(null);
  const bokehRef = useRef<ExternalDepthBokehPass | null>(null);
  const gradeRef = useRef<ShaderPass | null>(null);
  const scalerRef = useRef<AdaptiveRenderScaler | null>(null);
  const focusDistRef = useRef(2.1);
  const letterboxValRef = useRef(0.052);
  const lastTelemetryRef = useRef(0);
  const onTelemetryRef = useRef(onTelemetry);
  onTelemetryRef.current = onTelemetry;

  useEffect(() => {
    const quality = selectPlateQuality(gl.capabilities.maxTextureSize);
    const scaler = new AdaptiveRenderScaler(
      quality.initialScale,
      quality.minScale,
      quality.maxScale,
    );
    scalerRef.current = scaler;

    gl.toneMapping = THREE.NoToneMapping;
    gl.setPixelRatio(scaler.getScale());

    const effW = Math.max(1, Math.round(size.width * scaler.getScale()));
    const effH = Math.max(1, Math.round(size.height * scaler.getScale()));

    const rt = new THREE.WebGLRenderTarget(effW, effH, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
    });
    rt.texture.generateMipmaps = false;

    const composer = new EffectComposer(gl, rt);
    composer.setPixelRatio(scaler.getScale());
    composer.setSize(size.width, size.height);

    composer.addPass(new RenderPass(scene, camera));

    // Ground-Truth Ambient Occlusion grounding desk props, sofa cushions, husky paws & room corners
    const gtaoPass = new GTAOPass(scene, camera, effW, effH);
    gtaoPass.output = GTAOPass.OUTPUT.Default;
    gtaoPass.blendIntensity = FREE_ROAM_LOOK.gtaoBlendIntensity;
    gtaoPass.updateGtaoMaterial({
      radius: FREE_ROAM_LOOK.gtaoRadius,
      distanceExponent: 1.6,
      thickness: 1.2,
      distanceFallOff: 0.9,
      scale: FREE_ROAM_LOOK.gtaoScale,
      samples: 16,
      screenSpaceRadius: false,
    });
    gtaoPass.updatePdMaterial({
      lumaPhi: 8,
      depthPhi: 2,
      normalPhi: 3,
      radius: 6,
      radiusExponent: 2,
      rings: 2,
      samples: 12,
    });
    gtaoPass.setSceneClipBox(
      new THREE.Box3(new THREE.Vector3(-4.8, -0.2, -5.0), new THREE.Vector3(4.8, 4.2, 4.5)),
    );

    // Exclude transparent volumetric/rain planes, dust/embers, and GPU-discarded fur shells from GTAO G-buffer
    const origGtaoRender = gtaoPass.render.bind(gtaoPass);
    gtaoPass.render = (renderer, writeBuffer, readBuffer, deltaTime, maskActive) => {
      const hidden: THREE.Object3D[] = [];
      scene.traverse((obj) => {
        if (obj.userData?.excludeFromGtao && obj.visible) {
          obj.visible = false;
          hidden.push(obj);
        }
      });
      try {
        origGtaoRender(renderer, writeBuffer, readBuffer, deltaTime, maskActive);
      } finally {
        for (const obj of hidden) obj.visible = true;
      }
    };
    composer.addPass(gtaoPass);

    // Golden-Angle Spiral Bokeh DoF reusing GTAOPass hardware depthTexture (zero extra scene render!)
    const gtaoWithDepth = gtaoPass as GTAOPass & {
      normalRenderTarget?: THREE.WebGLRenderTarget;
    };
    const bokeh = new ExternalDepthBokehPass(
      camera as THREE.PerspectiveCamera,
      () => gtaoWithDepth.normalRenderTarget?.depthTexture ?? null,
      effW,
      effH,
      {
        focusDistance: 2.1,
        focusRange: 2.6,
        focusDeadzone: 0.65,
        maxBlur: 0.0115,
        highlightGain: 0.55,
        anamorphicRatio: 0.86,
        strength: 1.0,
      },
    );
    composer.addPass(bokeh);

    // Selective emissive UnrealBloomPass in linear HDR (high threshold keeps leather & gold crisp!)
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(effW, effH),
      FREE_ROAM_LOOK.bloomStrength,
      FREE_ROAM_LOOK.bloomRadius,
      FREE_ROAM_LOOK.bloomThreshold,
    );
    composer.addPass(bloom);

    // Final Grade Pass: Edge CA + Horizontal Lens Streaks + ACES Filmic + Obsidian Grade + Vignette + Grain + Letterbox
    const initLb = computeResponsiveLetterbox(size.width, size.height, letterboxEnabled);
    letterboxValRef.current = initLb;
    const grade = new ShaderPass(
      createFinalGradeShader({
        exposure: FREE_ROAM_LOOK.exposure * FREE_ROAM_LOOK.gradeExposure,
        streakThreshold: 1.72,
        streakStrength: 0.10,
        streakSpread: 0.011,
        chromaticAberration: FREE_ROAM_LOOK.gradeChroma,
        grainStrength: FREE_ROAM_LOOK.gradeGrain,
        vignetteStrength: FREE_ROAM_LOOK.gradeVignette,
        letterbox: initLb,
        saturation: FREE_ROAM_LOOK.gradeSaturation,
        contrast: FREE_ROAM_LOOK.gradeContrast,
        blackPoint: FREE_ROAM_LOOK.gradeBlackPoint,
        redRichness: FREE_ROAM_LOOK.gradeRedRichness,
      }),
    );
    grade.uniforms.uResolution.value.set(effW, effH);
    composer.addPass(grade);

    composerRef.current = composer;
    bokehRef.current = bokeh;
    gradeRef.current = grade;

    return () => {
      bokeh.dispose();
      bloom.dispose();
      grade.dispose();
      gtaoPass.dispose();
      composer.dispose();
      composerRef.current = null;
      bokehRef.current = null;
      gradeRef.current = null;
      scalerRef.current = null;
    };
  }, [gl, scene, camera]);

  useEffect(() => {
    const scaler = scalerRef.current;
    const scale = scaler ? scaler.getScale() : gl.getPixelRatio();
    gl.setPixelRatio(scale);
    composerRef.current?.setPixelRatio(scale);
    composerRef.current?.setSize(size.width, size.height);
    if (gradeRef.current) {
      gradeRef.current.uniforms.uResolution.value.set(
        Math.max(1, Math.round(size.width * scale)),
        Math.max(1, Math.round(size.height * scale)),
      );
    }
  }, [gl, size.width, size.height]);

  useFrame((state, delta) => {
    const composer = composerRef.current;
    const bokeh = bokehRef.current;
    const grade = gradeRef.current;
    const scaler = scalerRef.current;
    if (!composer || !bokeh || !grade || !scaler) return;

    const dt = Math.min(Math.max(delta, 0.001), 0.05);

    // Adapt render scale dynamically to keep 60 fps
    const perf = scaler.sample(delta);
    if (perf.changed) {
      gl.setPixelRatio(perf.scale);
      composer.setPixelRatio(perf.scale);
      composer.setSize(size.width, size.height);
      grade.uniforms.uResolution.value.set(
        Math.max(1, Math.round(size.width * perf.scale)),
        Math.max(1, Math.round(size.height * perf.scale)),
      );
    }

    // Rack Golden-Angle Bokeh focus smoothly toward hovered hotspot or Operator
    const desiredDist = camera.position.distanceTo(focusTargetRef.current);
    const focusK = 1 - Math.exp(-6.2 * dt);
    focusDistRef.current += (desiredDist - focusDistRef.current) * focusK;
    bokeh.uniforms.uFocusDistance.value = focusDistRef.current;

    const targetRange = cameraMode === "orbit" ? 4.4 : 3.6;
    const targetDead = cameraMode === "orbit" ? 1.55 : 1.15;
    const targetMaxBlur = cameraMode === "orbit" ? 0.0036 : 0.0046;
    const modeK = 1 - Math.exp(-5.0 * dt);
    bokeh.uniforms.uFocusRange.value += (targetRange - bokeh.uniforms.uFocusRange.value) * modeK;
    bokeh.uniforms.uFocusDeadzone.value += (targetDead - bokeh.uniforms.uFocusDeadzone.value) * modeK;
    bokeh.uniforms.uMaxBlur.value += (targetMaxBlur - bokeh.uniforms.uMaxBlur.value) * modeK;

    const targetLb = computeResponsiveLetterbox(size.width, size.height, letterboxEnabled);
    letterboxValRef.current += (targetLb - letterboxValRef.current) * (1 - Math.exp(-8.0 * dt));
    grade.uniforms.uLetterbox.value = letterboxValRef.current;
    grade.uniforms.uTime.value = state.clock.elapsedTime;

    composer.render(dt);

    if (state.clock.elapsedTime - lastTelemetryRef.current > 0.25) {
      lastTelemetryRef.current = state.clock.elapsedTime;
      onTelemetryRef.current({ fps: perf.fps, scale: perf.scale });
    }
  }, 1);

  return null;
}

function WarRoomScene({
  assets,
  cameraMode,
  onCameraModeChange,
  selectedHotspot,
  hoveredHotspot,
  onHover,
  onSelect,
  onPointerLockChange,
  lanternBright,
  letterboxEnabled,
  cameraGoal,
  autoOrbit,
  onUserDragStart,
  onPlayerHudUpdate,
  onTelemetry,
  inputSuspended,
}: {
  assets: LoadedAssets;
  cameraMode: CameraMode;
  onCameraModeChange: (m: CameraMode) => void;
  selectedHotspot: HotspotId | null;
  hoveredHotspot: HotspotConfig | null;
  onHover: (h: HotspotConfig | null) => void;
  onSelect: (h: HotspotConfig | null) => void;
  onPointerLockChange: (locked: boolean) => void;
  lanternBright: boolean;
  letterboxEnabled: boolean;
  cameraGoal: { pos: [number, number, number]; target: [number, number, number]; nonce: number } | null;
  autoOrbit: boolean;
  onUserDragStart: () => void;
  onPlayerHudUpdate: (hud: PlayerHudState) => void;
  onTelemetry: (t: FreeRoamTelemetry) => void;
  inputSuspended: boolean;
}) {
  const { camera, gl, scene } = useThree();
  const focusTargetRef = useRef(new THREE.Vector3(-0.58, 1.36, 1.66));
  const controlsRef = useRef<OrbitControls | null>(null);
  const lanternLightRef = useRef<THREE.PointLight | null>(null);
  const eclipseRimLightRef = useRef<THREE.DirectionalLight | null>(null);
  const operatorGroupRef = useRef<THREE.Group | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Record<string, THREE.AnimationAction>>({});
  const currentAnimRef = useRef<string>("Idle");
  const huskyHeadRef = useRef<THREE.Bone | null>(null);
  const huskyRestHeadQuatRef = useRef<THREE.Quaternion>(new THREE.Quaternion());
  const rainMat = useMemo(() => createRainGlassMaterial(), []);
  const furTex = useMemo(() => makeFurNoiseTexture(), []);

  // Pre-allocated scratch math objects
  const scratchTarget = useMemo(() => new THREE.Vector3(), []);
  const scratchCamPos = useMemo(() => new THREE.Vector3(), []);
  const scratchQuat = useMemo(() => new THREE.Quaternion(), []);
  const scratchEuler = useMemo(() => new THREE.Euler(0, 0, 0, "XYZ"), []);

  // Tightened 3rd-Person Player & Spring-Arm Camera State
  const playerRef = useRef({
    x: -0.52,
    z: 1.54,
    yaw: -0.20,
    velX: 0,
    velZ: 0,
    camYaw: -0.06,
    camPitch: 0.09,
    camDist: 1.58,
    smoothCamPos: new THREE.Vector3(-0.24, 1.56, 3.10),
    smoothLookAt: new THREE.Vector3(-0.04, 1.22, -1.65),
    lastHudTime: 0,
    lastNearbyId: null as HotspotId | null,
  });

  const keysRef = useRef<Record<string, boolean>>({});
  const dragRef = useRef({ active: false, lastX: 0, lastY: 0, moved: 0 });
  const lockTimestampRef = useRef(0);
  const lerpRef = useRef({
    active: false,
    pos: new THREE.Vector3(0.06, 1.38, 2.38),
    target: new THREE.Vector3(-0.04, 1.24, -1.85),
  });

  // Apply restrained studio HDRI so metallic gold & leather shine while blacks stay obsidian black
  useEffect(() => {
    if (assets.envMap) {
      scene.environment = assets.envMap;
      (scene as THREE.Scene & { environmentIntensity?: number }).environmentIntensity =
        FREE_ROAM_LOOK.envIntensity;
    }
    return () => {
      scene.environment = null;
    };
  }, [assets.envMap, scene]);

  // Prepare room materials, rain shader, Siberian husky markings + skinned fur shells, and Operator
  useEffect(() => {
    prepareRoomScene(assets.room, rainMat);
    attachHuskyFurShells(assets.husky, furTex);

    assets.husky.traverse((ch) => {
      if ((ch as THREE.Bone).isBone && ch.name === "Head") {
        huskyHeadRef.current = ch as THREE.Bone;
        huskyRestHeadQuatRef.current.copy(ch.quaternion);
      }
    });

    assets.operator.traverse((ch) => {
      ch.userData.hotspotId = "operator";
      if ((ch as THREE.Mesh).isMesh) {
        const mesh = ch as THREE.Mesh;
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        mesh.frustumCulled = false;
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        for (const m of mats) {
          if (m instanceof THREE.MeshStandardMaterial) {
            if (m.name.includes("VanguardBodyMat")) {
              m.color.set("#151417");
              m.roughness = 0.44;
              m.metalness = 0.36;
              m.envMapIntensity = 0.72;
            } else if (m.name.includes("OpObsidian") || m.name.includes("OpLeather")) {
              m.color.set("#0e0e11");
              m.envMapIntensity = 0.55;
            } else if (m.name.includes("AK24K")) {
              m.envMapIntensity = 1.95;
            } else if (m.name.includes("CrimsonYA")) {
              m.emissive.set("#f01820");
              m.emissiveIntensity = 2.2;
            } else {
              m.envMapIntensity = 0.85;
            }
          }
        }
      }
    });

    const mixer = new THREE.AnimationMixer(assets.operator);
    const acts: Record<string, THREE.AnimationAction> = {};
    for (const clip of assets.operatorClips) {
      const action = mixer.clipAction(clip);
      acts[clip.name] = action;
    }
    const idle = acts["Idle"] ?? Object.values(acts)[0];
    if (idle) {
      idle.reset().play();
      currentAnimRef.current = idle.getClip().name;
    }
    mixerRef.current = mixer;
    actionsRef.current = acts;

    return () => {
      mixer.stopAllAction();
      mixerRef.current = null;
      rainMat.dispose();
      furTex.dispose();
    };
  }, [assets, rainMat, furTex]);

  // Keyboard (WASD / Arrows / Shift / Q / C / E) + Pointer-Lock Mouse Look (with drag fallback)
  useEffect(() => {
    const dom = gl.domElement;

    const releasePointerLock = () => {
      if (document.pointerLockElement === dom) {
        document.exitPointerLock();
      }
    };

    const requestLock = () => {
      if (
        cameraMode !== "third-person" ||
        inputSuspended ||
        document.pointerLockElement === dom ||
        typeof dom.requestPointerLock !== "function"
      ) {
        return;
      }
      try {
        const result = dom.requestPointerLock() as unknown as Promise<void> | undefined;
        if (result && typeof result.catch === "function") {
          result.catch(() => {});
        }
      } catch {
        // Ignore rapid re-lock rejections
      }
    };

    const onPointerLockChangeEvent = () => {
      const locked = document.pointerLockElement === dom;
      if (locked) {
        lockTimestampRef.current = performance.now();
        onHover(null);
      }
      onPointerLockChange(locked);
    };

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement !== dom || cameraMode !== "third-person" || inputSuspended) return;
      const dx = THREE.MathUtils.clamp(e.movementX, -140, 140);
      const dy = THREE.MathUtils.clamp(e.movementY, -140, 140);
      playerRef.current.camYaw -= dx * 0.0026;
      playerRef.current.camPitch = THREE.MathUtils.clamp(
        playerRef.current.camPitch + dy * 0.0022,
        -0.14,
        0.74,
      );
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (inputSuspended) return;
      const code = e.code;
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(code)) {
        if (cameraMode !== "third-person") {
          onCameraModeChange("third-person");
        }
      }
      if (code === "KeyE" && cameraMode === "third-person") {
        const nearbyId = playerRef.current.lastNearbyId;
        if (nearbyId) {
          const hit = HOTSPOT_BY_ID.get(nearbyId);
          if (hit) {
            releasePointerLock();
            onSelect(hit);
          }
        }
      }
      keysRef.current[code] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };
    const onBlur = () => {
      keysRef.current = {};
      dragRef.current.active = false;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (cameraMode !== "third-person" || inputSuspended) return;
      if (document.pointerLockElement === dom) {
        if (e.button === 0 && performance.now() - lockTimestampRef.current > 220) {
          const nearbyId = playerRef.current.lastNearbyId;
          if (nearbyId) {
            const hit = HOTSPOT_BY_ID.get(nearbyId);
            if (hit) {
              releasePointerLock();
              onSelect(hit);
            }
          }
        }
        return;
      }
      dragRef.current = { active: true, lastX: e.clientX, lastY: e.clientY, moved: 0 };
    };
    const onPointerMove = (e: PointerEvent) => {
      if (cameraMode !== "third-person" || document.pointerLockElement === dom || !dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.lastX;
      const dy = e.clientY - dragRef.current.lastY;
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
      dragRef.current.moved += Math.abs(dx) + Math.abs(dy);
      playerRef.current.camYaw -= dx * 0.0046;
      playerRef.current.camPitch = THREE.MathUtils.clamp(
        playerRef.current.camPitch + dy * 0.0038,
        -0.14,
        0.74,
      );
    };
    const onPointerUp = () => {
      dragRef.current.active = false;
    };
    const onCanvasClick = () => {
      if (cameraMode !== "third-person" || inputSuspended) return;
      if (document.pointerLockElement === dom) return;
      if (dragRef.current.moved > 6) return;
      if (selectedHotspot) onSelect(null);
      requestLock();
    };
    const onWheel = (e: WheelEvent) => {
      if (cameraMode !== "third-person") return;
      e.preventDefault();
      playerRef.current.camDist = THREE.MathUtils.clamp(
        playerRef.current.camDist + e.deltaY * 0.0012,
        1.15,
        2.65,
      );
    };

    document.addEventListener("pointerlockchange", onPointerLockChangeEvent);
    document.addEventListener("mousemove", onMouseMove);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    dom.addEventListener("pointerdown", onPointerDown);
    dom.addEventListener("click", onCanvasClick);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    dom.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      document.removeEventListener("pointerlockchange", onPointerLockChangeEvent);
      document.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      dom.removeEventListener("pointerdown", onPointerDown);
      dom.removeEventListener("click", onCanvasClick);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      dom.removeEventListener("wheel", onWheel);
    };
  }, [cameraMode, gl.domElement, inputSuspended, onCameraModeChange, onHover, onPointerLockChange, onSelect, selectedHotspot]);

  useEffect(() => {
    const dom = gl.domElement;
    if ((cameraMode !== "third-person" || inputSuspended || Boolean(selectedHotspot)) && document.pointerLockElement === dom) {
      document.exitPointerLock();
    }
    if (cameraMode === "third-person") {
      onHover(null);
    }
  }, [cameraMode, gl.domElement, inputSuspended, onHover, selectedHotspot]);

  useEffect(() => {
    const dom = gl.domElement;
    return () => {
      if (document.pointerLockElement === dom) {
        document.exitPointerLock();
      }
      onPointerLockChange(false);
    };
  }, [gl.domElement, onPointerLockChange]);

  // Free-Orbit OrbitControls
  useEffect(() => {
    if (cameraMode !== "orbit") {
      if (controlsRef.current) {
        controlsRef.current.dispose();
        controlsRef.current = null;
      }
      return;
    }
    const controls = new OrbitControls(camera, gl.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.enablePan = true;
    controls.panSpeed = 0.55;
    controls.rotateSpeed = 0.65;
    controls.zoomSpeed = 0.85;
    controls.minDistance = 0.65;
    controls.maxDistance = 3.65;
    controls.minPolarAngle = 0.34;
    controls.maxPolarAngle = Math.PI * 0.54;
    controls.target.copy(lerpRef.current.target);
    controls.update();

    const handleStart = () => {
      lerpRef.current.active = false;
      onUserDragStart();
    };
    controls.addEventListener("start", handleStart);
    controlsRef.current = controls;
    return () => {
      controls.removeEventListener("start", handleStart);
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, cameraMode, gl.domElement, onUserDragStart]);

  useEffect(() => {
    if (!cameraGoal) return;
    lerpRef.current.pos.set(...cameraGoal.pos);
    lerpRef.current.target.set(...cameraGoal.target);
    lerpRef.current.active = true;
  }, [cameraGoal]);

  useEffect(() => {
    gl.domElement.style.cursor = cameraMode === "orbit" && hoveredHotspot ? "pointer" : "default";
    return () => {
      gl.domElement.style.cursor = "auto";
    };
  }, [cameraMode, hoveredHotspot, gl.domElement]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);

    rainMat.uniforms.uTime.value = t;
    mixerRef.current?.update(dt);

    // Subtle practical lantern flicker & crimson eclipse rim pulse
    if (lanternLightRef.current) {
      const base = lanternBright ? 2.55 : 0.85;
      lanternLightRef.current.intensity = base + Math.sin(t * 7.2) * 0.12 + Math.sin(t * 13.4) * 0.05;
    }
    if (eclipseRimLightRef.current) {
      eclipseRimLightRef.current.intensity = 1.15 + Math.sin(t * 0.75) * 0.10;
    }

    // Subtle watchful Husky head turn
    if (huskyHeadRef.current) {
      scratchEuler.set(0.05, Math.sin(t * 0.68) * 0.13 + 0.14, 0, "XYZ");
      scratchQuat.setFromEuler(scratchEuler);
      huskyHeadRef.current.quaternion.copy(huskyRestHeadQuatRef.current).multiply(scratchQuat);
    }

    // 3rd-Person Playable Operator Movement + Tightened Spring-Arm Camera
    if (cameraMode === "third-person") {
      const p = playerRef.current;
      const keys = keysRef.current;

      if (!inputSuspended) {
        if (keys["KeyQ"]) p.camYaw += 1.85 * dt;
        if (keys["KeyC"]) p.camYaw -= 1.85 * dt;
      }

      let fwd = 0;
      let right = 0;
      if (!inputSuspended) {
        if (keys["KeyW"] || keys["ArrowUp"]) fwd += 1;
        if (keys["KeyS"] || keys["ArrowDown"]) fwd -= 1;
        if (keys["KeyD"] || keys["ArrowRight"]) right += 1;
        if (keys["KeyA"] || keys["ArrowLeft"]) right -= 1;
      }

      const moving = fwd !== 0 || right !== 0;
      const sprinting = moving && Boolean(keys["ShiftLeft"] || keys["ShiftRight"]);
      const maxSpeed = sprinting ? 3.95 : 2.15;

      const camFwdX = -Math.sin(p.camYaw);
      const camFwdZ = -Math.cos(p.camYaw);
      const camRightX = Math.cos(p.camYaw);
      const camRightZ = -Math.sin(p.camYaw);

      let targetVx = 0;
      let targetVz = 0;
      if (moving) {
        const mx = camFwdX * fwd + camRightX * right;
        const mz = camFwdZ * fwd + camRightZ * right;
        const len = Math.hypot(mx, mz) || 1;
        targetVx = (mx / len) * maxSpeed;
        targetVz = (mz / len) * maxSpeed;
      }

      const accel = 1 - Math.exp(-11.0 * dt);
      p.velX += (targetVx - p.velX) * accel;
      p.velZ += (targetVz - p.velZ) * accel;

      const speed = Math.hypot(p.velX, p.velZ);
      if (speed > 0.02) {
        const [nx, nz] = resolveCollision(p.x + p.velX * dt, p.z + p.velZ * dt);
        p.x = nx;
        p.z = nz;

        const desiredYaw = Math.atan2(p.velX, p.velZ) + Math.PI;
        let diff = desiredYaw - p.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        p.yaw += diff * (1 - Math.exp(-10.5 * dt));
      }

      const nextClip = speed > 2.85 ? "Run" : speed > 0.22 ? "Walk" : "Idle";
      if (nextClip !== currentAnimRef.current && actionsRef.current[nextClip]) {
        const prev = actionsRef.current[currentAnimRef.current];
        const next = actionsRef.current[nextClip];
        next.reset().setEffectiveTimeScale(1).setEffectiveWeight(1).play();
        if (prev) prev.crossFadeTo(next, 0.22, false);
        currentAnimRef.current = nextClip;
      }

      if (operatorGroupRef.current) {
        operatorGroupRef.current.position.set(p.x, 0, p.z);
        operatorGroupRef.current.rotation.set(0, p.yaw, 0);
      }

      // Tighter over-the-shoulder cinematic spring-arm camera
      const shoulderOffsetX = camRightX * 0.34;
      const shoulderOffsetZ = camRightZ * 0.34;
      const pivotX = p.x + shoulderOffsetX;
      const pivotY = 1.42;
      const pivotZ = p.z + shoulderOffsetZ;

      const cosP = Math.cos(p.camPitch);
      const dirX = Math.sin(p.camYaw) * cosP;
      const dirY = Math.sin(p.camPitch);
      const dirZ = Math.cos(p.camYaw) * cosP;

      const safeDist = clampCameraBoom(pivotX, pivotY, pivotZ, dirX, dirY, dirZ, p.camDist);
      scratchCamPos.set(pivotX + dirX * safeDist, pivotY + dirY * safeDist, pivotZ + dirZ * safeDist);
      scratchTarget.set(pivotX + camFwdX * 1.55, 1.28 - Math.sin(p.camPitch) * 0.50, pivotZ + camFwdZ * 1.55);

      const camK = 1 - Math.exp(-10.0 * dt);
      p.smoothCamPos.lerp(scratchCamPos, camK);
      p.smoothLookAt.lerp(scratchTarget, camK);
      camera.position.copy(p.smoothCamPos);
      camera.lookAt(p.smoothLookAt);
      camera.updateMatrixWorld();
      focusTargetRef.current.set(p.x, 1.36, p.z);

      if (t - p.lastHudTime > 0.08) {
        p.lastHudTime = t;
        let nearest: HotspotConfig | null = null;
        let bestDist = 2.25;
        for (const h of WAR_ROOM_HOTSPOTS) {
          if (h.id === "operator") continue;
          const d = Math.hypot(h.markerPos[0] - p.x, h.markerPos[2] - p.z);
          if (d < bestDist) {
            bestDist = d;
            nearest = h;
          }
        }
        p.lastNearbyId = nearest?.id ?? null;
        onPlayerHudUpdate({
          x: p.x,
          z: p.z,
          yaw: p.yaw,
          moving: speed > 0.22,
          sprinting,
          nearby: nearest,
        });
      }
      return;
    }

    // Free-Orbit Camera Mode
    const controls = controlsRef.current;
    if (controls) {
      controls.autoRotate = autoOrbit && !lerpRef.current.active;
      controls.autoRotateSpeed = 0.55;
      if (lerpRef.current.active) {
        const k = 1 - Math.exp(-4.8 * dt);
        camera.position.lerp(lerpRef.current.pos, k);
        controls.target.lerp(lerpRef.current.target, k);
        if (
          camera.position.distanceTo(lerpRef.current.pos) < 0.025 &&
          controls.target.distanceTo(lerpRef.current.target) < 0.025
        ) {
          lerpRef.current.active = false;
        }
      }
      controls.update();
    }

    // In Orbit mode: focus follows hovered object, otherwise tracks OrbitControls target cleanly
    if (hoveredHotspot) {
      focusTargetRef.current.set(...hoveredHotspot.markerPos);
    } else if (controlsRef.current) {
      focusTargetRef.current.copy(controlsRef.current.target);
    } else {
      focusTargetRef.current.set(-0.04, 1.14, -1.75);
    }
  });

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    if (cameraMode !== "orbit") return;
    const hit = findHotspotFromObject(e.object);
    if (hit) {
      e.stopPropagation();
      onHover(hit);
    }
  };
  const handlePointerOut = () => {
    if (cameraMode === "orbit") onHover(null);
  };
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (cameraMode !== "orbit" || e.delta > 6) return;
    const hit = findHotspotFromObject(e.object);
    if (hit) {
      e.stopPropagation();
      onSelect(hit);
    }
  };

  return (
    <>
      {/* True obsidian blacks and clean neutral shadow floor (zero red fog soup) */}
      <color attach="background" args={["#020203"]} />
      <fogExp2 attach="fog" args={["#030305", 0.017]} />

      <hemisphereLight args={["#2d313c", "#050507", 0.22]} />
      <ambientLight color="#0a0b0e" intensity={0.05} />

      {/* NEUTRAL SHADOW-CASTING KEY LIGHT: crisp white husky fur, 24K gold & obsidian armor */}
      <directionalLight
        position={[-1.55, 3.35, 2.65]}
        color="#f6f2eb"
        intensity={2.35}
        castShadow
        shadow-mapSize-width={2048}
        shadow-mapSize-height={2048}
        shadow-camera-left={-4.6}
        shadow-camera-right={4.6}
        shadow-camera-top={4.2}
        shadow-camera-bottom={-4.2}
        shadow-camera-near={0.5}
        shadow-camera-far={12.0}
        shadow-bias={-0.0003}
        shadow-normalBias={0.026}
      />

      {/* Focused neutral front-desk key bounce for husky face, notebook, gold AK & chess knight */}
      <pointLight position={[-0.45, 2.38, 1.45]} color="#f2ede6" intensity={1.55} distance={6.0} decay={2} />

      {/* CRIMSON RED RIM LIGHTS: edge separation from eclipse window, right LEDs, lantern & laptop */}
      <directionalLight
        ref={eclipseRimLightRef}
        position={[0.35, 3.15, -5.4]}
        color="#e8141c"
        intensity={1.15}
      />
      <pointLight
        ref={lanternLightRef}
        position={[2.58, 1.16, -2.10]}
        color="#ff2014"
        intensity={2.55}
        distance={4.0}
        decay={2}
      />
      <pointLight position={[3.08, 2.18, -0.35]} color="#ff141c" intensity={2.45} distance={4.5} decay={2} />
      <pointLight position={[2.55, 2.75, -3.45]} color="#ff1a20" intensity={1.45} distance={3.8} decay={2} />
      <pointLight position={[0.82, 1.14, 0.34]} color="#ff1c20" intensity={0.28} distance={1.4} decay={2} />

      {/* Warm tungsten gallery accent for the left framed portrait */}
      <pointLight position={[-2.90, 2.95, -3.48]} color="#ffe2b8" intensity={3.4} distance={3.9} decay={2} />
      <pointLight position={[-3.45, 2.45, -0.15]} color="#f5e6d2" intensity={2.0} distance={3.8} decay={2} />

      {/* AAA Blender 5.2 Room + Playable 3rd-Person Operator + Siberian Husky */}
      <group onPointerOver={handlePointerOver} onPointerOut={handlePointerOut} onClick={handleClick}>
        <primitive object={assets.room} />
        <group ref={operatorGroupRef} position={[-0.52, 0.0, 1.54]} rotation={[0, -0.20, 0]}>
          <primitive object={assets.operator} />
        </group>
        <primitive object={assets.husky} position={[0.58, 0.41, -2.02]} rotation={[0, 0.28, 0]} />
      </group>

      <VolumetricEclipseShafts />
      <WarRoomDustAndEmbers lanternBright={lanternBright} />
      <CinematicComposer
        cameraMode={cameraMode}
        focusTargetRef={focusTargetRef}
        letterboxEnabled={letterboxEnabled}
        onTelemetry={onTelemetry}
      />
    </>
  );
}

// Live Tactical Room Minimap Radar
function TacticalMiniRadar({ player }: { player: PlayerHudState }) {
  const mapX = (x: number) => 8 + ((x + 4.6) / 9.2) * 112;
  const mapY = (z: number) => 8 + ((z + 4.4) / 8.6) * 104;
  const px = mapX(player.x);
  const py = mapY(player.z);
  const fx = -Math.sin(player.yaw);
  const fz = -Math.cos(player.yaw);
  const coneA = Math.atan2(fz, fx);
  const c1x = px + Math.cos(coneA - 0.45) * 18;
  const c1y = py + Math.sin(coneA - 0.45) * 18;
  const c2x = px + Math.cos(coneA + 0.45) * 18;
  const c2y = py + Math.sin(coneA + 0.45) * 18;

  return (
    <div className="warroom-radar" aria-label="War Room tactical radar">
      <div className="warroom-radar__head">
        <span>RADAR // SEC-02</span>
        <small>{player.sprinting ? "SPRINT" : player.moving ? "MOVE" : "IDLE"}</small>
      </div>
      <svg viewBox="0 0 128 120" width="128" height="120" aria-hidden="true">
        <rect x="8" y="8" width="112" height="104" fill="rgba(8,8,10,0.82)" stroke="rgba(232,75,75,0.45)" strokeWidth="1" />
        <line x1="46" y1="8" x2="78" y2="8" stroke="#ff453e" strokeWidth="2.5" />
        <rect x={mapX(-1.3)} y={mapY(-2.6)} width="32" height="11" fill="rgba(140,22,26,0.55)" stroke="rgba(232,75,75,0.45)" strokeWidth="0.7" />
        <rect x={mapX(-1.25)} y={mapY(-0.1)} width="30" height="11" fill="rgba(65,32,26,0.7)" stroke="rgba(255,190,120,0.4)" strokeWidth="0.7" />
        <rect x="112" y="34" width="7" height="50" fill="rgba(232,75,75,0.35)" />
        <line x1="52" y1="112" x2="76" y2="112" stroke="#ffd2a8" strokeWidth="2" />
        {WAR_ROOM_HOTSPOTS.filter((h) => h.id !== "operator").map((h) => (
          <circle
            key={h.id}
            cx={mapX(h.markerPos[0])}
            cy={mapY(h.markerPos[2])}
            r={player.nearby?.id === h.id ? 3.2 : 1.7}
            fill={player.nearby?.id === h.id ? "#ffd27d" : "#e84b4b"}
            opacity={player.nearby?.id === h.id ? 1 : 0.65}
          />
        ))}
        <polygon points={`${px},${py} ${c1x},${c1y} ${c2x},${c2y}`} fill="rgba(232,75,75,0.28)" />
        <circle cx={px} cy={py} r="3.4" fill="#f5eaea" stroke="#e84b4b" strokeWidth="1.4" />
      </svg>
    </div>
  );
}

export default function WarRoom3D({
  selectedHotspot,
  onSelectHotspot,
  lanternBright,
  onToggleLantern,
  activePreset,
  onPresetChange,
  autoOrbit,
  onToggleAutoOrbit,
  onOpenAssets,
  inputSuspended = false,
}: WarRoom3DProps) {
  const [assets, setAssets] = useState<LoadedAssets | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>("third-person");
  const [pointerLocked, setPointerLocked] = useState(false);
  const [hoveredHotspot, setHoveredHotspot] = useState<HotspotConfig | null>(null);
  const [letterboxEnabled, setLetterboxEnabled] = useState(false);
  const [telemetry, setTelemetry] = useState<FreeRoamTelemetry | null>(null);
  const initialScale = useMemo(() => selectPlateQuality().initialScale, []);
  const [playerHud, setPlayerHud] = useState<PlayerHudState>({
    x: -0.52,
    z: 1.54,
    yaw: -0.20,
    moving: false,
    sprinting: false,
    nearby: null,
  });
  const [cameraGoal, setCameraGoal] = useState<{
    pos: [number, number, number];
    target: [number, number, number];
    nonce: number;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const gltfLoader = new GLTFLoader();
    const hdrLoader = new HDRLoader();
    const progress = { room: 0, operator: 0, husky: 0, hdri: 0 };

    const updateTotal = () => {
      if (cancelled) return;
      const pct = Math.round(
        (progress.room * 0.54 + progress.operator * 0.24 + progress.husky * 0.12 + progress.hdri * 0.10) * 100,
      );
      setLoadProgress(Math.min(100, pct));
    };

    const loadGltf = (url: string, key: "room" | "operator" | "husky") =>
      new Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }>((resolve, reject) => {
        gltfLoader.load(
          url,
          (gltf) => {
            progress[key] = 1;
            updateTotal();
            resolve({ scene: gltf.scene, animations: gltf.animations });
          },
          (evt) => {
            if (evt.total > 0) {
              progress[key] = Math.min(0.99, evt.loaded / evt.total);
              updateTotal();
            }
          },
          reject,
        );
      });

    const loadHdri = () =>
      new Promise<THREE.Texture | null>((resolve) => {
        hdrLoader.load(
          "/textures/warroom_env.hdr",
          (tex) => {
            tex.mapping = THREE.EquirectangularReflectionMapping;
            progress.hdri = 1;
            updateTotal();
            resolve(tex);
          },
          undefined,
          () => {
            progress.hdri = 1;
            updateTotal();
            resolve(null);
          },
        );
      });

    Promise.all([
      loadGltf("/models/room.glb", "room"),
      loadGltf("/models/operator.glb", "operator"),
      loadGltf("/models/husky.glb", "husky"),
      loadHdri(),
    ])
      .then(([roomRes, opRes, hkRes, envMap]) => {
        if (cancelled) return;
        setAssets({
          room: roomRes.scene,
          operator: opRes.scene,
          operatorClips: opRes.animations,
          husky: hkRes.scene,
          envMap,
        });
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Failed loading AAA War Room assets:", err);
        setLoadError("Could not load 3D War Room GLB assets. Check WebGL or network status.");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const flyTo = (pos: [number, number, number], target: [number, number, number]) => {
    setCameraMode("orbit");
    setCameraGoal({ pos, target, nonce: Date.now() + Math.random() });
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (inputSuspended) return;
      if (e.code === "KeyV") {
        setCameraMode((prev) => (prev === "third-person" ? "orbit" : "third-person"));
      }
      if (e.code === "KeyR") {
        onPresetChange("overview");
        setCameraMode("third-person");
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [inputSuspended, onPresetChange]);

  const handleUserDragStart = () => {
    if (autoOrbit) onToggleAutoOrbit();
  };

  return (
    <section className="warroom-stage" aria-label="Playable 3rd-person 3D War Room">
      {!assets && !loadError && (
        <div className="warroom-loader" role="status" aria-live="polite">
          <div className="warroom-loader__ring" />
          <span>INITIALIZING WAR ROOM // AAA PBR &amp; GTAO ENGINE</span>
          <strong>{loadProgress}%</strong>
          <small>Neutral Key + Crimson Rims · GTAO · Mixamo Operator · Siberian Husky</small>
        </div>
      )}

      {loadError && (
        <div className="warroom-loader" role="alert">
          <span>RENDERER FAULT</span>
          <strong>{loadError}</strong>
        </div>
      )}

      {assets && (
        <Canvas
          shadows="percentage"
          dpr={initialScale}
          camera={{ fov: FREE_ROAM_LOOK.fov, near: 0.08, far: 45, position: [-0.24, 1.56, 3.10] }}
          gl={{
            antialias: false,
            powerPreference: "high-performance",
            toneMapping: THREE.NoToneMapping,
            outputColorSpace: THREE.SRGBColorSpace,
          }}
        >
          <WarRoomScene
            assets={assets}
            cameraMode={cameraMode}
            onCameraModeChange={setCameraMode}
            selectedHotspot={selectedHotspot}
            hoveredHotspot={hoveredHotspot}
            onHover={setHoveredHotspot}
            onSelect={onSelectHotspot}
            onPointerLockChange={setPointerLocked}
            lanternBright={lanternBright}
            letterboxEnabled={letterboxEnabled}
            cameraGoal={cameraGoal}
            autoOrbit={autoOrbit}
            onUserDragStart={handleUserDragStart}
            onPlayerHudUpdate={setPlayerHud}
            onTelemetry={setTelemetry}
            inputSuspended={inputSuspended}
          />
        </Canvas>
      )}

      {cameraMode === "orbit" && hoveredHotspot && (
        <div className="warroom-reticle" role="status">
          <span>{hoveredHotspot.code}</span>
          <strong>{hoveredHotspot.label}</strong>
          <small>{hoveredHotspot.subtitle} · Click to inspect</small>
        </div>
      )}

      <div className="warroom-badge">
        <span>
          SECTOR 02 // {cameraMode === "third-person" ? "3RD-PERSON FREE ROAM" : "CINEMATIC ORBIT"}
        </span>
        <small>
          {cameraMode === "third-person"
            ? pointerLocked
              ? "Mouse look active · WASD walk · Shift sprint · E interact · Esc unlock"
              : "Click scene to lock mouse look · WASD walk · Shift sprint · E interact · V orbit"
            : "Drag to orbit · Scroll zoom · Click objects to inspect · V 3rd-person"}
        </small>
      </div>

      {cameraMode === "third-person" && playerHud.nearby && (
        <button
          type="button"
          className="warroom-interact-prompt"
          onClick={() => onSelectHotspot(playerHud.nearby!)}
        >
          <kbd>E</kbd>
          <div>
            <span>{playerHud.nearby.code}</span>
            <strong>{playerHud.nearby.label}</strong>
          </div>
        </button>
      )}

      {assets && <TacticalMiniRadar player={playerHud} />}

      <div className="warroom-dock" role="toolbar" aria-label="War Room camera viewpoints">
        <div className="warroom-dock__presets">
          <button
            type="button"
            className={cameraMode === "third-person" ? "is-active" : ""}
            onClick={() => setCameraMode("third-person")}
          >
            3rd Person Walk
          </button>
          {CAMERA_PRESETS.map((preset) => (
            <button
              key={preset.id}
              type="button"
              className={cameraMode === "orbit" && activePreset === preset.id ? "is-active" : ""}
              onClick={() => {
                onPresetChange(preset.id);
                flyTo(preset.pos, preset.target);
              }}
            >
              {preset.label}
            </button>
          ))}
        </div>
        <div className="warroom-dock__controls">
          {telemetry && (
            <span className="warroom-telemetry" aria-label="Render performance">
              <b>3D</b>
              <i>{telemetry.fps} FPS</i>
              <small>{telemetry.scale.toFixed(2)}×</small>
            </span>
          )}
          <button
            type="button"
            className={letterboxEnabled ? "is-active" : ""}
            aria-pressed={letterboxEnabled}
            onClick={() => setLetterboxEnabled((v) => !v)}
            title="Toggle cinematic letterbox bars"
          >
            Bars {letterboxEnabled ? "On" : "Off"}
          </button>
          <button
            type="button"
            className={lanternBright ? "is-active" : ""}
            onClick={onToggleLantern}
            title="Toggle red cage lantern intensity"
          >
            Lantern {lanternBright ? "High" : "Dim"}
          </button>
          <button type="button" onClick={onOpenAssets} title="Download Blender GLB files and 4K render">
            GLBs &amp; 4K
          </button>
        </div>
      </div>
    </section>
  );
}
