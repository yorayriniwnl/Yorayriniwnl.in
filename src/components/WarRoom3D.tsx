import { publicAsset } from "../lib/publicAsset";
import { useEffect, useMemo, useRef, useState } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import {
  CAMERA_PRESETS,
  WAR_ROOM_HOTSPOTS,
  type HotspotConfig,
  type HotspotId,
} from "../data/hubData";

type CameraMode = "third-person" | "orbit";

type WarRoom3DProps = {
  onSelectHotspot: (hotspot: HotspotConfig | null) => void;
  lanternBright: boolean;
  onToggleLantern: () => void;
  activePreset: string;
  onPresetChange: (presetId: string) => void;
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

// Sliding AABB collision boxes in Three.js world space (X, Z) — guarantees zero stuck corners!
const ROOM_BOUNDS = { minX: -4.18, maxX: 4.18, minZ: -3.88, maxZ: 3.70 };
const PLAYER_RADIUS = 0.34;
const OBSTACLES: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> = [
  // Executive War Desk
  { minX: -1.32, maxX: 1.32, minZ: -0.15, maxZ: 0.92 },
  // Crimson Leather Sofa
  { minX: -1.38, maxX: 1.38, minZ: -2.72, maxZ: -1.62 },
  // Left NVG Tactical Crate
  { minX: -2.86, maxX: -1.80, minZ: -2.65, maxZ: -1.65 },
  // Right Lantern & Globe Crate
  { minX: 1.84, maxX: 2.88, minZ: -2.65, maxZ: -1.65 },
  // East Bookshelves & Plinth
  { minX: 3.72, maxX: 4.65, minZ: -2.25, maxZ: 2.25 },
  // West Gothic Console
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
        // Inside AABB fallback: push out along nearest face
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

// Analytical ray-against-interior-room-box spring-arm clamp (stays cleanly inside bookshelves & south doors!)
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

// Custom GPU Animated Rain-on-Glass Shader for floor-to-ceiling North Eclipse Window!
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
        // Strictly monotonic edge0 < edge1 for GLSL ES / ANGLE D3D11 NaN safety!
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
        vec3 baseTint = vec3(0.08, 0.02, 0.03);
        vec3 dropGlow = vec3(0.95, 0.30, 0.26) * rain * 0.85;
        float alpha = clamp(0.045 + rain * 0.38, 0.0, 0.85);
        gl_FragColor = vec4(baseTint + dropGlow, alpha);
      }
    `,
  });
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
      if (mesh.name.includes("HV_Rump") || mesh.name.includes("Husky_SculptedBody")) {
        bodyMesh = mesh;
      }
    }
  });

  if (!bodyMesh) return;
  const targetMesh = bodyMesh as THREE.Mesh;
  if (targetMesh.userData.furAttached) return;
  targetMesh.userData.furAttached = true;

  // 7 GPU-discarded fur shell layers = plush Siberian wolf coat while keeping K9 helmet/mask razor clean & GPU cool!
  const layers = 7;
  const furLength = 0.014;
  for (let i = 1; i <= layers; i++) {
    const h = i / layers;
    const mat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.96,
      metalness: 0.0,
      color: new THREE.Color("#d8d2ce").multiplyScalar(0.56 + 0.46 * h),
    });
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uH = { value: h };
      shader.uniforms.uLen = { value: furLength };
      shader.uniforms.uNoise = { value: furTex };
      shader.uniforms.uDensity = { value: 3.4 };
      shader.vertexShader = shader.vertexShader
        .replace(
          "#include <common>",
          "#include <common>\nuniform float uH; uniform float uLen; varying vec3 vFurP; varying vec3 vFurN;",
        )
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\nvec3 safeN = normalize(objectNormal + vec3(0.0, 1e-5, 0.0));\ntransformed += safeN * (uH * uLen);\ntransformed.y -= uH * uH * uLen * 0.28;\nvFurP = position; vFurN = abs(safeN);",
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
    mat.customProgramCacheKey = () => `huskyFurShell_${i}`;
    const shell = new THREE.Mesh(targetMesh.geometry, mat);
    shell.castShadow = false;
    shell.receiveShadow = true;
    shell.frustumCulled = false;
    shell.userData.hotspotId = "husky";
    targetMesh.add(shell);
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
          m.envMapIntensity = nm.includes("Gold") || nm.includes("AK") || nm.includes("Knight") ? 1.85 : 0.95;
          if (nm.includes("EclipseSkyline")) {
            m.emissiveIntensity = 1.45;
            m.fog = false;
          }
          if (nm.includes("Laptop_ScreenMap")) {
            m.emissiveIntensity = 1.85;
          }
          if (nm.includes("PaintPort_Canvas") || nm.includes("Poster_Artwork") || nm.includes("Ayush_Canvas")) {
            m.emissiveIntensity = 0.25;
          }
        }
      }
    }
  });
}

function CrimsonDustMotes() {
  const count = 110;
  const geomRef = useRef<THREE.BufferGeometry>(null);

  const { positions, phases } = useMemo(() => {
    const pos = new Float32Array(count * 3);
    const ph = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 8.2;
      pos[i * 3 + 1] = 0.35 + Math.random() * 3.1;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 7.6;
      ph[i] = Math.random() * Math.PI * 2;
    }
    return { positions: pos, phases: ph };
  }, []);

  useFrame((state, delta) => {
    const geom = geomRef.current;
    if (!geom) return;
    const attr = geom.getAttribute("position") as THREE.BufferAttribute;
    const arr = attr.array as Float32Array;
    const t = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);
    for (let i = 0; i < count; i++) {
      arr[i * 3] += Math.sin(t * 0.32 + phases[i]) * 0.025 * dt;
      arr[i * 3 + 1] += 0.028 * dt;
      if (arr[i * 3 + 1] > 3.55) arr[i * 3 + 1] = 0.28;
    }
    attr.needsUpdate = true;
  });

  return (
    <points>
      <bufferGeometry ref={geomRef}>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#ff7a70"
        size={0.022}
        transparent
        opacity={0.34}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

function VolumetricEclipseShafts() {
  const shaftMat = useMemo(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 256;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      const grad = ctx.createLinearGradient(0, 0, 0, 256);
      grad.addColorStop(0, "rgba(255, 50, 44, 0.24)");
      grad.addColorStop(0.5, "rgba(180, 18, 22, 0.09)");
      grad.addColorStop(1, "rgba(30, 3, 5, 0.0)");
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 128, 256);
    }
    const tex = new THREE.CanvasTexture(canvas);
    return new THREE.MeshBasicMaterial({
      map: tex,
      transparent: true,
      opacity: 0.42,
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
      <mesh position={[-0.55, 2.05, -2.85]} rotation={[-0.56, 0.08, 0.04]} material={shaftMat}>
        <planeGeometry args={[1.8, 4.8]} />
      </mesh>
      <mesh position={[0.25, 2.05, -2.80]} rotation={[-0.58, -0.08, -0.04]} material={shaftMat}>
        <planeGeometry args={[1.8, 4.8]} />
      </mesh>
    </group>
  );
}

// Selective AAA UnrealBloom Post-Processing Composer (properly synced with DPR!)
function CinematicComposer() {
  const { gl, scene, camera, size } = useThree();
  const composerRef = useRef<EffectComposer | null>(null);

  useEffect(() => {
    const composer = new EffectComposer(gl);
    composer.setPixelRatio(gl.getPixelRatio());
    composer.setSize(size.width, size.height);
    composer.addPass(new RenderPass(scene, camera));
    const bloom = new UnrealBloomPass(
      new THREE.Vector2(size.width, size.height),
      0.34,
      0.48,
      0.90,
    );
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
    composerRef.current = composer;
    return () => {
      composer.dispose();
      composerRef.current = null;
    };
  }, [gl, scene, camera]);

  useEffect(() => {
    composerRef.current?.setPixelRatio(gl.getPixelRatio());
    composerRef.current?.setSize(size.width, size.height);
  }, [gl, size.width, size.height]);

  useFrame(() => {
    composerRef.current?.render();
  }, 1);

  return null;
}

function WarRoomScene({
  assets,
  cameraMode,
  onCameraModeChange,
  hoveredHotspot,
  onHover,
  onSelect,
  lanternBright,
  cameraGoal,
  onPlayerHudUpdate,
  inputSuspended,
}: {
  assets: LoadedAssets;
  cameraMode: CameraMode;
  onCameraModeChange: (m: CameraMode) => void;
  hoveredHotspot: HotspotConfig | null;
  onHover: (h: HotspotConfig | null) => void;
  onSelect: (h: HotspotConfig) => void;
  lanternBright: boolean;
  cameraGoal: { pos: [number, number, number]; target: [number, number, number]; nonce: number } | null;
  onPlayerHudUpdate: (hud: PlayerHudState) => void;
  inputSuspended: boolean;
}) {
  const { camera, gl, scene } = useThree();
  const controlsRef = useRef<OrbitControls | null>(null);
  const lanternLightRef = useRef<THREE.PointLight | null>(null);
  const eclipseLightRef = useRef<THREE.DirectionalLight | null>(null);
  const operatorGroupRef = useRef<THREE.Group | null>(null);
  const mixerRef = useRef<THREE.AnimationMixer | null>(null);
  const actionsRef = useRef<Record<string, THREE.AnimationAction>>({});
  const currentAnimRef = useRef<string>("Idle");
  const huskyHeadRef = useRef<THREE.Bone | null>(null);
  const huskyRestHeadQuatRef = useRef<THREE.Quaternion>(new THREE.Quaternion());
  const rainMat = useMemo(() => createRainGlassMaterial(), []);
  const furTex = useMemo(() => makeFurNoiseTexture(), []);

  // Pre-allocated scratch math objects (ZERO per-frame GC pauses!)
  const scratchTarget = useMemo(() => new THREE.Vector3(), []);
  const scratchCamPos = useMemo(() => new THREE.Vector3(), []);
  const scratchQuat = useMemo(() => new THREE.Quaternion(), []);
  const scratchEuler = useMemo(() => new THREE.Euler(0, 0, 0, "XYZ"), []);

  // 3rd-Person Player & Spring-Arm Camera State (spawns cleanly inside room facing -Z toward War Desk & Eclipse!)
  const playerRef = useRef({
    x: -0.45,
    z: 1.92,
    yaw: -0.14, // 0 = facing -Z (into room, showing slung 24K gold AK on back!)
    velX: 0,
    velZ: 0,
    camYaw: -0.06,
    camPitch: 0.14,
    camDist: 1.85,
    smoothCamPos: new THREE.Vector3(-0.02, 1.72, 3.62),
    smoothLookAt: new THREE.Vector3(0.0, 1.28, -1.65),
    lastHudTime: 0,
    lastNearbyId: null as HotspotId | null,
  });

  const keysRef = useRef<Record<string, boolean>>({});
  const dragRef = useRef({ active: false, dragging: false, lastX: 0, lastY: 0, moved: 0 });
  const hoveredHotspotRef = useRef<HotspotConfig | null>(hoveredHotspot);
  const lerpRef = useRef({
    active: false,
    pos: new THREE.Vector3(0.0, 1.52, 2.75),
    target: new THREE.Vector3(0.0, 1.25, -2.15),
  });

  // Apply real Poly Haven HDRI environment map for AAA PBR reflections!
  useEffect(() => {
    if (assets.envMap) {
      scene.environment = assets.envMap;
      (scene as THREE.Scene & { environmentIntensity?: number }).environmentIntensity = 0.72;
    }
    return () => {
      scene.environment = null;
    };
  }, [assets.envMap, scene]);

  // Prepare room materials, rain shader, GPU husky fur, and Mixamo Operator AnimationMixer
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
            m.envMapIntensity = 1.65;
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

  // Keyboard (WASD / Arrows / Shift / Q / E) + Mouse Drag Spring-Arm Controls for 3rd Person
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (inputSuspended) return;
      const code = e.code;
      if (["KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(code)) {
        if (cameraMode !== "third-person") {
          onCameraModeChange("third-person");
        }
        if (hoveredHotspotRef.current) onHover(null);
        window.dispatchEvent(new Event("yor-cursor-walk"));
      }
      if (code === "KeyE" && cameraMode === "third-person") {
        const nearbyId = playerRef.current.lastNearbyId;
        if (nearbyId) {
          const hit = HOTSPOT_BY_ID.get(nearbyId);
          if (hit) onSelect(hit);
        }
      }
      keysRef.current[code] = true;
    };
    const onKeyUp = (e: KeyboardEvent) => {
      keysRef.current[e.code] = false;
    };
    const onBlur = () => {
      keysRef.current = {};
      if (dragRef.current.dragging) {
        const nextMode = hoveredHotspotRef.current ? "hotspot" : "canvas";
        gl.domElement.dataset.cursor = nextMode;
        window.dispatchEvent(new CustomEvent("yor-cursor-state", { detail: { mode: nextMode } }));
      }
      dragRef.current.active = false;
      dragRef.current.dragging = false;
    };

    const dom = gl.domElement;
    const onPointerDown = (e: PointerEvent) => {
      dragRef.current = { active: true, dragging: false, lastX: e.clientX, lastY: e.clientY, moved: 0 };
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!dragRef.current.active) return;
      const dx = e.clientX - dragRef.current.lastX;
      const dy = e.clientY - dragRef.current.lastY;
      dragRef.current.lastX = e.clientX;
      dragRef.current.lastY = e.clientY;
      dragRef.current.moved += Math.abs(dx) + Math.abs(dy);
      if (cameraMode === "third-person") {
        playerRef.current.camYaw -= dx * 0.0052;
        playerRef.current.camPitch = THREE.MathUtils.clamp(
          playerRef.current.camPitch + dy * 0.0042,
          -0.14,
          0.78,
        );
      }
      if (!dragRef.current.dragging && dragRef.current.moved > 4) {
        dragRef.current.dragging = true;
        if (hoveredHotspotRef.current) onHover(null);
        dom.dataset.cursor = "dragging";
        window.dispatchEvent(new CustomEvent("yor-cursor-state", { detail: { mode: "dragging" } }));
      }
    };
    const onPointerUp = () => {
      const wasDragging = dragRef.current.dragging;
      dragRef.current.active = false;
      dragRef.current.dragging = false;
      if (wasDragging) {
        const nextMode = hoveredHotspotRef.current ? "hotspot" : "canvas";
        dom.dataset.cursor = nextMode;
        window.dispatchEvent(new CustomEvent("yor-cursor-state", { detail: { mode: nextMode } }));
      }
    };
    const onWheel = (e: WheelEvent) => {
      if (cameraMode !== "third-person") return;
      e.preventDefault();
      playerRef.current.camDist = THREE.MathUtils.clamp(
        playerRef.current.camDist + e.deltaY * 0.0014,
        1.35,
        3.35,
      );
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onBlur);
    dom.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    dom.addEventListener("wheel", onWheel, { passive: false });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onBlur);
      dom.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      dom.removeEventListener("wheel", onWheel);
    };
  }, [cameraMode, gl.domElement, inputSuspended, onCameraModeChange, onHover, onSelect]);

  // Free-Orbit OrbitControls (ONLY active in "orbit" mode — NEVER fights 3rd-person camera!)
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
    controls.maxDistance = 3.85;
    controls.minPolarAngle = 0.32;
    controls.maxPolarAngle = Math.PI * 0.54;
    controls.target.copy(lerpRef.current.target);
    controls.update();

    const handleStart = () => {
      lerpRef.current.active = false;
    };
    controls.addEventListener("start", handleStart);
    controlsRef.current = controls;
    return () => {
      controls.removeEventListener("start", handleStart);
      controls.dispose();
      controlsRef.current = null;
    };
  }, [camera, cameraMode, gl.domElement]);

  useEffect(() => {
    if (!cameraGoal) return;
    lerpRef.current.pos.set(...cameraGoal.pos);
    lerpRef.current.target.set(...cameraGoal.target);
    lerpRef.current.active = true;
  }, [cameraGoal]);

  useEffect(() => {
    hoveredHotspotRef.current = hoveredHotspot;
    if (dragRef.current.dragging) return;
    const nextMode = hoveredHotspot ? "hotspot" : "canvas";
    gl.domElement.dataset.cursor = nextMode;
    window.dispatchEvent(new CustomEvent("yor-cursor-state", { detail: { mode: nextMode } }));
  }, [hoveredHotspot, gl.domElement]);

  useEffect(() => {
    return () => {
      delete gl.domElement.dataset.cursor;
    };
  }, [gl.domElement]);

  useFrame((state, delta) => {
    const t = state.clock.elapsedTime;
    const dt = Math.min(delta, 0.05);

    // 1. Update animated rain-on-glass shader & Mixamo animation mixer
    rainMat.uniforms.uTime.value = t;
    mixerRef.current?.update(dt);

    // 2. Subtle practical lantern flicker & eclipse pulse
    if (lanternLightRef.current) {
      const base = lanternBright ? 7.5 : 2.5;
      lanternLightRef.current.intensity = base + Math.sin(t * 7.2) * 0.22 + Math.sin(t * 13.4) * 0.09;
    }
    if (eclipseLightRef.current) {
      eclipseLightRef.current.intensity = 3.1 + Math.sin(t * 0.75) * 0.20;
    }

    // 3. Subtle watchful Husky head turn (zero GC!)
    if (huskyHeadRef.current) {
      scratchEuler.set(0.06, Math.sin(t * 0.68) * 0.14 + 0.18, 0, "XYZ");
      scratchQuat.setFromEuler(scratchEuler);
      huskyHeadRef.current.quaternion.copy(huskyRestHeadQuatRef.current).multiply(scratchQuat);
    }

    // 4. 3RD-PERSON PLAYABLE OPERATOR MOVEMENT + SPRING-ARM CAMERA
    if (cameraMode === "third-person") {
      const p = playerRef.current;
      const keys = keysRef.current;

      // Optional Q/E smooth camera yaw turn
      if (!inputSuspended) {
        if (keys["KeyQ"]) p.camYaw += 1.85 * dt;
        if (keys["KeyC"]) p.camYaw -= 1.85 * dt;
      }

      // Compute camera-relative movement vector on XZ plane
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

      // Camera forward vector on XZ when camYaw = 0 points along (0, -1)
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
        // Resolve sliding AABB collision cleanly so player glides past furniture and never sticks!
        const [nx, nz] = resolveCollision(p.x + p.velX * dt, p.z + p.velZ * dt);
        p.x = nx;
        p.z = nz;

        // Smoothly turn Operator toward movement velocity (Soldier.glb forward is -Z in Three.js -> yaw = atan2(vx, vz) + PI)
        const desiredYaw = Math.atan2(p.velX, p.velZ) + Math.PI;
        let diff = desiredYaw - p.yaw;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        p.yaw += diff * (1 - Math.exp(-10.5 * dt));
      }

      // Cross-fade Mixamo skeletal clips (Idle / Walk / Run) seamlessly!
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

      // Over-the-shoulder AAA spring-arm camera with exact analytical room-wall collision!
      const shoulderOffsetX = camRightX * 0.28;
      const shoulderOffsetZ = camRightZ * 0.28;
      const pivotX = p.x + shoulderOffsetX;
      const pivotY = 1.48;
      const pivotZ = p.z + shoulderOffsetZ;

      const cosP = Math.cos(p.camPitch);
      const dirX = Math.sin(p.camYaw) * cosP;
      const dirY = Math.sin(p.camPitch);
      const dirZ = Math.cos(p.camYaw) * cosP;

      const safeDist = clampCameraBoom(pivotX, pivotY, pivotZ, dirX, dirY, dirZ, p.camDist);
      scratchCamPos.set(pivotX + dirX * safeDist, pivotY + dirY * safeDist, pivotZ + dirZ * safeDist);
      scratchTarget.set(pivotX + camFwdX * 1.35, 1.34 - Math.sin(p.camPitch) * 0.55, pivotZ + camFwdZ * 1.35);

      const camK = 1 - Math.exp(-10.0 * dt);
      p.smoothCamPos.lerp(scratchCamPos, camK);
      p.smoothLookAt.lerp(scratchTarget, camK);
      camera.position.copy(p.smoothCamPos);
      camera.lookAt(p.smoothLookAt);

      // Proximity station detector + throttled mini-radar HUD update (~12 Hz max -> zero React lag!)
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

    // 5. FREE-ORBIT CAMERA MODE (Clean non-fighting OrbitControls)
    const controls = controlsRef.current;
    if (controls) {
      if (lerpRef.current.active) {
        const k = 1 - Math.exp(-4.5 * dt);
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
  });

  const handlePointerOver = (e: ThreeEvent<PointerEvent>) => {
    if (dragRef.current.dragging) return;
    const hit = findHotspotFromObject(e.object);
    if (hit) {
      e.stopPropagation();
      onHover(hit);
    }
  };
  const handlePointerOut = () => onHover(null);
  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6 || dragRef.current.moved > 8) return;
    const hit = findHotspotFromObject(e.object);
    if (hit) {
      e.stopPropagation();
      onSelect(hit);
    }
  };

  return (
    <>
      <color attach="background" args={["#060203"]} />
      <fogExp2 attach="fog" args={["#110305", 0.036]} />

      <hemisphereLight args={["#661c24", "#0e0506", 0.75]} />
      <ambientLight color="#300d12" intensity={0.42} />

      {/* SINGLE Shadow-Casting Directional Light from the Crimson Eclipse Window (Zero PointLight shadow overhead!) */}
      <directionalLight
        ref={eclipseLightRef}
        position={[-0.15, 3.2, -5.6]}
        color="#ff3830"
        intensity={3.1}
        castShadow
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-camera-left={-5.0}
        shadow-camera-right={5.0}
        shadow-camera-top={4.5}
        shadow-camera-bottom={-4.5}
        shadow-camera-near={0.5}
        shadow-camera-far={14.0}
        shadow-bias={-0.0004}
      />

      {/* Non-shadow practical accent fills for AAA warm/crimson key-rim separation */}
      <pointLight position={[-0.95, 2.35, 1.35]} color="#ffdfb8" intensity={5.2} distance={8.5} decay={1.6} />
      <pointLight
        ref={lanternLightRef}
        position={[2.58, 1.22, -2.10]}
        color="#ff3224"
        intensity={7.5}
        distance={7.0}
        decay={1.6}
      />
      <pointLight position={[0.85, 1.25, 0.30]} color="#ff2a26" intensity={2.2} distance={3.8} decay={2} />
      <pointLight position={[-2.95, 2.95, -3.45]} color="#ffd4a8" intensity={3.8} distance={5.5} decay={1.7} />
      <pointLight position={[2.68, 2.85, -3.45]} color="#ff4a40" intensity={3.2} distance={5.5} decay={1.7} />
      <pointLight position={[-3.55, 2.55, -0.15]} color="#ffd4a8" intensity={3.0} distance={5.0} decay={1.7} />
      <pointLight position={[2.95, 2.45, 0.15]} color="#ff423c" intensity={4.0} distance={6.5} decay={1.6} />
      <pointLight position={[0.0, 2.65, 2.95]} color="#c43838" intensity={3.0} distance={6.5} decay={1.6} />

      {/* AAA Blender 5.2 Poly Haven Room + Playable 3rd-Person Mixamo Operator + GPU Fur Husky */}
      <group onPointerOver={handlePointerOver} onPointerOut={handlePointerOut} onClick={handleClick}>
        <primitive object={assets.room} />
        <group ref={operatorGroupRef} position={[-0.45, 0.0, 1.92]} rotation={[0, -0.14, 0]}>
          <primitive object={assets.operator} />
        </group>
        <primitive object={assets.husky} position={[0.58, 0.41, -2.02]} rotation={[0, 0.34, 0]} />
      </group>

      <VolumetricEclipseShafts />
      <CrimsonDustMotes />
      <CinematicComposer />
    </>
  );
}

// Live Tactical Room Minimap Radar (bottom-right HUD for 3rd-person navigation!)
function TacticalMiniRadar({ player }: { player: PlayerHudState }) {
  // Map room X [-4.6..+4.6] -> [8..120], Z [-4.4..+4.2] -> [8..112]
  const mapX = (x: number) => 8 + ((x + 4.6) / 9.2) * 112;
  const mapY = (z: number) => 8 + ((z + 4.4) / 8.6) * 104;
  const px = mapX(player.x);
  const py = mapY(player.z);
  // Operator facing vector in world XZ: yaw=PI faces -Z (up on radar), general dir=(-sin(yaw), -cos(yaw))
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
        <rect x="8" y="8" width="112" height="104" fill="rgba(16,4,6,0.75)" stroke="rgba(232,75,75,0.45)" strokeWidth="1" />
        {/* North Eclipse Window */}
        <line x1="46" y1="8" x2="78" y2="8" stroke="#ff453e" strokeWidth="2.5" />
        {/* Sofa & War Desk */}
        <rect x={mapX(-1.3)} y={mapY(-2.6)} width="32" height="11" fill="rgba(140,22,26,0.55)" stroke="rgba(232,75,75,0.45)" strokeWidth="0.7" />
        <rect x={mapX(-1.25)} y={mapY(-0.1)} width="30" height="11" fill="rgba(65,32,26,0.7)" stroke="rgba(255,190,120,0.4)" strokeWidth="0.7" />
        {/* East Bookshelf */}
        <rect x="112" y="34" width="7" height="50" fill="rgba(232,75,75,0.35)" />
        {/* South Doors */}
        <line x1="52" y1="112" x2="76" y2="112" stroke="#ffd2a8" strokeWidth="2" />
        {/* Interactive Stations */}
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
        {/* Operator Vision Cone + Marker */}
        <polygon points={`${px},${py} ${c1x},${c1y} ${c2x},${c2y}`} fill="rgba(232,75,75,0.28)" />
        <circle cx={px} cy={py} r="3.4" fill="#f5eaea" stroke="#e84b4b" strokeWidth="1.4" />
      </svg>
    </div>
  );
}

export default function WarRoom3D({
  onSelectHotspot,
  lanternBright,
  onToggleLantern,
  activePreset,
  onPresetChange,
  onOpenAssets,
  inputSuspended = false,
}: WarRoom3DProps) {
  const [assets, setAssets] = useState<LoadedAssets | null>(null);
  const [loadProgress, setLoadProgress] = useState(0);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [cameraMode, setCameraMode] = useState<CameraMode>("third-person");
  const [hoveredHotspot, setHoveredHotspot] = useState<HotspotConfig | null>(null);
  const [playerHud, setPlayerHud] = useState<PlayerHudState>({
    x: -0.45,
    z: 1.92,
    yaw: -0.14,
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
          publicAsset("textures/warroom_env.hdr"),
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
      loadGltf(publicAsset("models/playable-war-room/room.glb"), "room"),
      loadGltf(publicAsset("models/playable-war-room/operator.glb"), "operator"),
      loadGltf(publicAsset("models/playable-war-room/husky.glb"), "husky"),
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

  const handleSelectHotspot = (hotspot: HotspotConfig) => {
    onSelectHotspot(hotspot);
  };

  return (
    <section className="warroom-stage" aria-label="Playable 3rd-person 3D War Room">
      {!assets && !loadError && (
        <div className="warroom-loader" role="status" aria-live="polite">
          <div className="warroom-loader__ring" />
          <span>INITIALIZING WAR ROOM // AAA PBR &amp; MIXAMO ENGINE</span>
          <strong>{loadProgress}%</strong>
          <small>Poly Haven CC0 Room · Mixamo YA Operator · Shell-Fur Husky · Studio HDRI</small>
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
          dpr={[1, 1.25]}
          camera={{ fov: 46, near: 0.08, far: 45, position: [-0.02, 1.72, 3.62] }}
          gl={{
            antialias: true,
            powerPreference: "high-performance",
            toneMapping: THREE.ACESFilmicToneMapping,
            toneMappingExposure: 1.12,
          }}
        >
          <WarRoomScene
            assets={assets}
            cameraMode={cameraMode}
            onCameraModeChange={setCameraMode}
            hoveredHotspot={hoveredHotspot}
            onHover={setHoveredHotspot}
            onSelect={handleSelectHotspot}
            lanternBright={lanternBright}
            cameraGoal={cameraGoal}
            onPlayerHudUpdate={setPlayerHud}
            inputSuspended={inputSuspended}
          />
        </Canvas>
      )}

      <div className="warroom-vignette" aria-hidden="true" />

      {hoveredHotspot && (
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
          WASD / Arrows to walk · Shift sprint · Drag mouse to look · E or Click to interact · V switch camera
        </small>
      </div>

      {/* Diegetic AAA Proximity Prompt when walking near any interactive station */}
      {cameraMode === "third-person" && playerHud.nearby && (
        <button
          type="button"
          className="warroom-interact-prompt"
          onClick={() => handleSelectHotspot(playerHud.nearby!)}
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
