import * as THREE from "three";

export type ParticleDepthMode = "scene-depth";

export type DustEmberOptions = {
  mode: ParticleDepthMode;
  dustCount?: number;
  emberCount?: number;
  /** Bounds [minX, maxX, minY, maxY, minZ, maxZ] in world space */
  bounds: [number, number, number, number, number, number];
  /** Optional ember emitter hotspots [x, y, z, radius] */
  emberSources?: Array<[number, number, number, number]>;
};

export type DustEmberSystem = {
  group: THREE.Group;
  dustMaterial: THREE.ShaderMaterial;
  emberMaterial: THREE.ShaderMaterial;
  update: (elapsedTime: number, pixelRatio: number, viewportHeight: number, lanternBoost?: number) => void;
  dispose: () => void;
};

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * GPU-driven 3D Dust & Glowing Ember particle system for real 3D WebGL scenes (WarRoom3D).
 * Uses hardware depth testing so every particle is cleanly hidden behind nearer 3D meshes,
 * and marks all points with excludeFromGtao so ambient occlusion never darkens embers/dust.
 */
export function createDustAndEmberSystem(options: DustEmberOptions): DustEmberSystem {
  const {
    dustCount = 240,
    emberCount = 150,
    bounds,
    emberSources = [],
  } = options;

  const [minX, maxX, minY, maxY, minZ, maxZ] = bounds;
  const spanX = maxX - minX;
  const spanY = maxY - minY;
  const spanZ = maxZ - minZ;

  const rand = mulberry32(47129);
  const group = new THREE.Group();
  group.name = "CinematicDustAndEmbers3D";
  group.userData.excludeFromGtao = true;

  const dustGeom = new THREE.BufferGeometry();
  const dustPos = new Float32Array(dustCount * 3);
  const dustSeed = new Float32Array(dustCount * 4);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = minX + rand() * spanX;
    dustPos[i * 3 + 1] = minY + rand() * spanY;
    dustPos[i * 3 + 2] = minZ + rand() * spanZ;
    dustSeed[i * 4] = rand() * Math.PI * 2;
    dustSeed[i * 4 + 1] = 0.55 + rand() * 0.95;
    dustSeed[i * 4 + 2] = 0.65 + rand() * 1.35;
    dustSeed[i * 4 + 3] = rand();
  }
  dustGeom.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  dustGeom.setAttribute("aSeed", new THREE.BufferAttribute(dustSeed, 4));

  const emberGeom = new THREE.BufferGeometry();
  const emberPos = new Float32Array(emberCount * 3);
  const emberSeed = new Float32Array(emberCount * 4);
  for (let i = 0; i < emberCount; i++) {
    if (emberSources.length > 0 && rand() < 0.62) {
      const src = emberSources[Math.floor(rand() * emberSources.length)];
      const angle = rand() * Math.PI * 2;
      const rad = Math.sqrt(rand()) * src[3];
      emberPos[i * 3] = THREE.MathUtils.clamp(src[0] + Math.cos(angle) * rad, minX, maxX);
      emberPos[i * 3 + 1] = THREE.MathUtils.clamp(src[1] + (rand() - 0.5) * src[3] * 1.3, minY, maxY);
      emberPos[i * 3 + 2] = THREE.MathUtils.clamp(src[2] + Math.sin(angle) * rad * 0.65, minZ, maxZ);
    } else {
      emberPos[i * 3] = minX + rand() * spanX;
      emberPos[i * 3 + 1] = minY + rand() * spanY;
      emberPos[i * 3 + 2] = minZ + rand() * spanZ;
    }
    emberSeed[i * 4] = rand() * Math.PI * 2;
    emberSeed[i * 4 + 1] = 0.45 + rand() * 1.15;
    emberSeed[i * 4 + 2] = 0.7 + rand() * 1.5;
    emberSeed[i * 4 + 3] = rand();
  }
  emberGeom.setAttribute("position", new THREE.BufferAttribute(emberPos, 3));
  emberGeom.setAttribute("aSeed", new THREE.BufferAttribute(emberSeed, 4));

  const commonUniforms = () => ({
    uTime: { value: 0 },
    uPointScale: { value: 300 },
    uMinBounds: { value: new THREE.Vector3(minX, minY, minZ) },
    uSpanBounds: { value: new THREE.Vector3(spanX, spanY, spanZ) },
    uLanternBoost: { value: 1.0 },
  });

  const dustMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    uniforms: commonUniforms(),
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime;
      uniform float uPointScale;
      uniform vec3 uMinBounds;
      uniform vec3 uSpanBounds;

      varying float vAlpha;
      varying float vTint;

      void main() {
        float ph = aSeed.x;
        float spd = aSeed.y;
        float sz = aSeed.z;
        vTint = aSeed.w;

        vec3 p = position;
        float t = uTime * spd;

        p.x += sin(t * 0.28 + ph) * 0.14 + cos(t * 0.13 + ph * 1.7) * 0.06;
        p.z += cos(t * 0.22 + ph * 1.3) * 0.08;
        float yOffset = fract((p.y - uMinBounds.y + uTime * 0.022 * spd) / max(uSpanBounds.y, 0.01));
        p.y = uMinBounds.y + yOffset * uSpanBounds.y;

        vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
        float dist = max(-mvPos.z, 0.18);

        float loopFade = smoothstep(0.0, 0.12, yOffset) * (1.0 - smoothstep(0.88, 1.0, yOffset));
        float shimmer = 0.55 + 0.45 * sin(uTime * (0.9 + spd * 0.6) + ph * 3.1);
        float nearFade = smoothstep(0.22, 0.65, dist);
        vAlpha = loopFade * shimmer * nearFade * 0.36;

        gl_PointSize = clamp((sz * 0.022 * uPointScale) / dist, 1.5, 20.0);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      varying float vTint;

      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r = length(c);
        if (r > 0.5) discard;

        float disc = 1.0 - smoothstep(0.04, 0.5, r);
        float core = 1.0 - smoothstep(0.0, 0.24, r);
        float alpha = (disc * 0.65 + core * 0.35) * vAlpha;

        vec3 warmDust = vec3(0.95, 0.80, 0.68);
        vec3 crimsonDust = vec3(0.98, 0.32, 0.26);
        vec3 col = mix(warmDust, crimsonDust, vTint * 0.55) * 0.8;
        gl_FragColor = vec4(col * alpha, alpha);
      }
    `,
  });

  const emberMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    uniforms: commonUniforms(),
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime;
      uniform float uPointScale;
      uniform vec3 uMinBounds;
      uniform vec3 uSpanBounds;
      uniform float uLanternBoost;

      varying float vAlpha;
      varying float vHeat;
      varying float vAngle;

      void main() {
        float ph = aSeed.x;
        float spd = aSeed.y;
        float sz = aSeed.z;
        vHeat = aSeed.w;

        vec3 p = position;
        float t = uTime * spd;

        float riseRate = (0.06 + spd * 0.055) * (0.85 + 0.15 * uLanternBoost);
        float yNorm = fract((p.y - uMinBounds.y + uTime * riseRate) / max(uSpanBounds.y, 0.01));
        p.y = uMinBounds.y + yNorm * uSpanBounds.y;

        float swirl = sin(t * 1.15 + ph + yNorm * 5.2);
        float swirl2 = cos(t * 0.85 + ph * 1.9 + yNorm * 3.8);
        p.x += swirl * 0.14 + swirl2 * 0.04;
        p.z += swirl2 * 0.10;

        vec4 mvPos = modelViewMatrix * vec4(p, 1.0);
        float dist = max(-mvPos.z, 0.22);

        float life = smoothstep(0.0, 0.14, yNorm) * (1.0 - smoothstep(0.76, 1.0, yNorm));
        float flicker = 0.62 + 0.38 * sin(uTime * (5.2 + spd * 3.5) + ph * 7.3);
        float nearFade = smoothstep(0.24, 0.68, dist);

        vAlpha = life * flicker * nearFade * (0.78 + 0.22 * uLanternBoost);
        vAngle = swirl * 0.55;

        gl_PointSize = clamp((sz * 0.026 * uPointScale) / dist, 2.0, 24.0);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: /* glsl */ `
      varying float vAlpha;
      varying float vHeat;
      varying float vAngle;

      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float ca = cos(vAngle);
        float sa = sin(vAngle);
        vec2 rotC = vec2(c.x * ca - c.y * sa, c.x * sa + c.y * ca);
        vec2 sparkC = vec2(rotC.x * 1.45, rotC.y * 0.92);
        float r = length(sparkC);
        if (r > 0.5) discard;

        float core = 1.0 - smoothstep(0.02, 0.18, r);
        float halo = 1.0 - smoothstep(0.05, 0.5, r);
        float intensity = (core * 1.35 + halo * halo * 0.52) * vAlpha;

        // HDR linear radiance (> 1.2) so embers bloom & streak organically
        vec3 deepCrimson = vec3(2.4, 0.22, 0.12);
        vec3 moltenAmber = vec3(3.2, 0.95, 0.26);
        vec3 whiteHot = vec3(3.8, 2.2, 1.15);
        vec3 col = mix(deepCrimson, moltenAmber, vHeat);
        col = mix(col, whiteHot, core * 0.62);

        gl_FragColor = vec4(col * intensity, clamp(intensity, 0.0, 1.0));
      }
    `,
  });

  const dustPoints = new THREE.Points(dustGeom, dustMaterial);
  dustPoints.frustumCulled = false;
  dustPoints.renderOrder = 10;
  dustPoints.userData.excludeFromGtao = true;

  const emberPoints = new THREE.Points(emberGeom, emberMaterial);
  emberPoints.frustumCulled = false;
  emberPoints.renderOrder = 11;
  emberPoints.userData.excludeFromGtao = true;

  group.add(dustPoints, emberPoints);

  return {
    group,
    dustMaterial,
    emberMaterial,
    update(elapsedTime: number, pixelRatio: number, viewportHeight: number, lanternBoost = 1.0) {
      const ptScale = Math.max(200, viewportHeight * pixelRatio * 0.42);
      dustMaterial.uniforms.uTime.value = elapsedTime;
      dustMaterial.uniforms.uPointScale.value = ptScale;
      dustMaterial.uniforms.uLanternBoost.value = lanternBoost;

      emberMaterial.uniforms.uTime.value = elapsedTime;
      emberMaterial.uniforms.uPointScale.value = ptScale;
      emberMaterial.uniforms.uLanternBoost.value = lanternBoost;
    },
    dispose() {
      dustGeom.dispose();
      emberGeom.dispose();
      dustMaterial.dispose();
      emberMaterial.dispose();
    },
  };
}

export type PomParticleFrame = {
  elapsedTime: number;
  introFade: number;
  reducedMotion: number;
  lanternBright: number;
  zoom: number;
  dollyShiftY: number;
  roll: number;
  rayDeltaX: number;
  rayDeltaY: number;
  viewportAspect: number;
  plateAspect: number;
  pixelWidth: number;
  pixelHeight: number;
  pixelRatio: number;
  sceneDepthTex: THREE.Texture;
};

export type PomDustEmberSystem = {
  scene: THREE.Scene;
  camera: THREE.OrthographicCamera;
  update: (frame: PomParticleFrame) => void;
  dispose: () => void;
};

/**
 * 3D Dust & Glowing Ember particle system projected in exact lockstep with CinematicWarRoom's
 * POM camera (aspect cover-fit, dolly zoom, vertical crane shift, gimbal roll, and depth-plane
 * parallax), occluded pixel-accurately behind nearer objects using the POM-warped depth map
 * stored in sceneTarget.a (derived directly from public/cinematic/depth.png).
 */
export function createPomDepthDustAndEmberSystem(isMobile: boolean): PomDustEmberSystem {
  const dustCount = isMobile ? 80 : 135;
  const emberCount = isMobile ? 38 : 66;
  const rand = mulberry32(90421);

  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

  // Normalized 3D plate coordinates: (u in [0..1], v in [0..1], depth in [0..1] where 1 = nearest foreground, 0 = far window)
  const dustGeom = new THREE.BufferGeometry();
  const dustPos = new Float32Array(dustCount * 3);
  const dustSeed = new Float32Array(dustCount * 4); // phase, speed, size, tint
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = 0.02 + rand() * 0.96;
    dustPos[i * 3 + 1] = 0.04 + rand() * 0.92;
    // Stratified 3D depth across window air (0.04..0.18), operator/husky mid-air (0.20..0.52), and foreground desk air (0.55..0.92)
    const band = rand();
    dustPos[i * 3 + 2] =
      band < 0.36
        ? 0.04 + rand() * 0.16
        : band < 0.78
          ? 0.21 + rand() * 0.36
          : 0.58 + rand() * 0.34;
    dustSeed[i * 4] = rand() * Math.PI * 2;
    dustSeed[i * 4 + 1] = 0.5 + rand() * 0.9;
    dustSeed[i * 4 + 2] = 0.55 + rand() * 1.1;
    dustSeed[i * 4 + 3] = rand();
  }
  dustGeom.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  dustGeom.setAttribute("aSeed", new THREE.BufferAttribute(dustSeed, 4));

  // Embers concentrated near crimson lantern (right), blood moon shafts (upper center), and laptop (bottom right), keeping operator clean
  const emberHotspots: Array<[number, number, number, number, number]> = [
    // [u, v, depth, radiusUV, depthSpread]
    [0.95, 0.48, 0.16, 0.11, 0.10], // Right crimson hurricane lantern & neon shelf
    [0.59, 0.78, 0.07, 0.12, 0.08], // North blood-moon eclipse window shafts
    [0.93, 0.22, 0.50, 0.09, 0.10], // Bottom-right tactical laptop glow
    [0.06, 0.72, 0.16, 0.08, 0.08], // Left framed painting warm edge light
  ];

  const emberGeom = new THREE.BufferGeometry();
  const emberPos = new Float32Array(emberCount * 3);
  const emberSeed = new Float32Array(emberCount * 4); // phase, speed, size, heat
  for (let i = 0; i < emberCount; i++) {
    if (rand() < 0.80) {
      const hs = emberHotspots[Math.floor(rand() * emberHotspots.length)];
      const a = rand() * Math.PI * 2;
      const r = Math.sqrt(rand()) * hs[3];
      emberPos[i * 3] = THREE.MathUtils.clamp(hs[0] + Math.cos(a) * r, 0.02, 0.98);
      emberPos[i * 3 + 1] = THREE.MathUtils.clamp(hs[1] + Math.sin(a) * r, 0.02, 0.98);
      emberPos[i * 3 + 2] = THREE.MathUtils.clamp(hs[2] + (rand() - 0.4) * hs[4], 0.04, 0.90);
    } else {
      emberPos[i * 3] = 0.04 + rand() * 0.92;
      emberPos[i * 3 + 1] = 0.04 + rand() * 0.92;
      emberPos[i * 3 + 2] = 0.06 + rand() * 0.82;
    }
    emberSeed[i * 4] = rand() * Math.PI * 2;
    emberSeed[i * 4 + 1] = 0.5 + rand() * 1.0;
    emberSeed[i * 4 + 2] = 0.55 + rand() * 0.95;
    emberSeed[i * 4 + 3] = rand();
  }
  emberGeom.setAttribute("position", new THREE.BufferAttribute(emberPos, 3));
  emberGeom.setAttribute("aSeed", new THREE.BufferAttribute(emberSeed, 4));

  // Shared inverse of screenToPlateUv + POM parallax projection so 3D particles lock 1:1 with the POM camera
  const projectionHelperGlsl = /* glsl */ `
    const float POM_FOCUS_DEPTH = 0.28;

    vec2 projectPlate3DToClip(vec3 p3d, float zoom, float dollyShiftY, float roll, vec2 rayDelta, float vpAspect, float plAspect) {
      // Exact inverse of CinematicWarRoom POM raymarch (matches projectPlatePointToViewport)
      vec2 baseUv = p3d.xy - rayDelta * (p3d.z - POM_FOCUS_DEPTH);
      vec2 c = (baseUv - 0.5 - vec2(0.0, dollyShiftY)) * zoom;

      // Inverse gimbal roll in aspect-correct space
      float cr = cos(-roll);
      float sr = sin(-roll);
      vec2 metric = vec2(c.x * plAspect, c.y);
      metric = vec2(cr * metric.x - sr * metric.y, sr * metric.x + cr * metric.y);
      c = vec2(metric.x / plAspect, metric.y);

      // Inverse cover-fit mapping from plate space to viewport screen UV
      if (vpAspect > plAspect) {
        c.y *= vpAspect / plAspect;
      } else {
        c.x *= plAspect / vpAspect;
      }

      vec2 screenUv = c + 0.5;
      return screenUv * 2.0 - 1.0;
    }
  `;

  const makeUniforms = () => ({
    uTime: { value: 0 },
    uIntroFade: { value: 1 },
    uReducedMotion: { value: 0 },
    uLanternBright: { value: 1 },
    uZoom: { value: 1.08 },
    uDollyShiftY: { value: 0 },
    uRoll: { value: 0 },
    uRayDelta: { value: new THREE.Vector2(0, 0) },
    uViewportAspect: { value: 16 / 9 },
    uPlateAspect: { value: 16 / 9 },
    uResolution: { value: new THREE.Vector2(1280, 720) },
    uPointScale: { value: 1.0 },
    uSceneDepthTex: { value: null as THREE.Texture | null },
  });

  const dustMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendEquation: THREE.AddEquation,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneFactor,
    blendEquationAlpha: THREE.MaxEquation,
    uniforms: makeUniforms(),
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime;
      uniform float uIntroFade;
      uniform float uReducedMotion;
      uniform float uZoom;
      uniform float uDollyShiftY;
      uniform float uRoll;
      uniform vec2 uRayDelta;
      uniform float uViewportAspect;
      uniform float uPlateAspect;
      uniform float uPointScale;

      varying float vDepth;
      varying float vAlpha;
      varying float vTint;

      ${projectionHelperGlsl}

      void main() {
        float ph = aSeed.x;
        float spd = aSeed.y;
        float sz = aSeed.z;
        vTint = aSeed.w;

        float t = uTime * spd * (1.0 - uReducedMotion * 0.85);
        vec3 p = position;
        p.x = fract(p.x + sin(t * 0.24 + ph) * 0.022 + cos(t * 0.11 + ph * 1.7) * 0.010);
        p.y = fract(p.y + uTime * 0.009 * spd * (1.0 - uReducedMotion));
        p.z = clamp(p.z + sin(t * 0.18 + ph * 2.1) * 0.025, 0.03, 0.94);

        vDepth = p.z;
        vec2 clip = projectPlate3DToClip(p, uZoom, uDollyShiftY, uRoll, uRayDelta, uViewportAspect, uPlateAspect);

        float loopFade = smoothstep(0.0, 0.10, p.y) * (1.0 - smoothstep(0.90, 1.0, p.y));
        float shimmer = 0.55 + 0.45 * sin(uTime * (0.95 + spd * 0.55) + ph * 3.1);
        vAlpha = loopFade * shimmer * uIntroFade * 0.17;

        // Perspective size grows naturally for nearer foreground dust motes
        float depthScale = 0.52 + p.z * 1.35;
        gl_PointSize = clamp(sz * depthScale * 2.8 * uPointScale, 1.2, 10.0);
        gl_Position = vec4(clip, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uSceneDepthTex;
      uniform vec2 uResolution;

      varying float vDepth;
      varying float vAlpha;
      varying float vTint;

      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float r = length(c);
        if (r > 0.5) discard;

        // Exact POM-warped depth-map occlusion test (sceneTarget.a = surfaceDepth from depth.png)
        vec2 screenUv = clamp(gl_FragCoord.xy / max(uResolution, vec2(1.0)), vec2(0.001), vec2(0.999));
        float sceneDepth = texture2D(uSceneDepthTex, screenUv).a;
        float vis = smoothstep(sceneDepth - 0.024, sceneDepth + 0.022, vDepth);
        if (vis <= 0.008) discard;

        float disc = 1.0 - smoothstep(0.05, 0.5, r);
        float core = 1.0 - smoothstep(0.0, 0.22, r);
        float alpha = (disc * 0.62 + core * 0.38) * vAlpha * vis;

        vec3 warmAsh = vec3(0.92, 0.76, 0.64);
        vec3 crimsonMote = vec3(1.0, 0.28, 0.24);
        vec3 col = mix(warmAsh, crimsonMote, vTint * 0.58) * 0.85;
        // Alpha carries particle depth only when visible enough to influence foreground bokeh
        float depthTag = alpha > 0.06 ? vDepth : 0.0;
        gl_FragColor = vec4(col * alpha, depthTag);
      }
    `,
  });

  const emberMaterial = new THREE.ShaderMaterial({
    transparent: true,
    depthTest: false,
    depthWrite: false,
    blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor,
    blendDst: THREE.OneFactor,
    blendEquation: THREE.AddEquation,
    blendSrcAlpha: THREE.OneFactor,
    blendDstAlpha: THREE.OneFactor,
    blendEquationAlpha: THREE.MaxEquation,
    uniforms: makeUniforms(),
    vertexShader: /* glsl */ `
      attribute vec4 aSeed;
      uniform float uTime;
      uniform float uIntroFade;
      uniform float uReducedMotion;
      uniform float uLanternBright;
      uniform float uZoom;
      uniform float uDollyShiftY;
      uniform float uRoll;
      uniform vec2 uRayDelta;
      uniform float uViewportAspect;
      uniform float uPlateAspect;
      uniform float uPointScale;

      varying float vDepth;
      varying float vAlpha;
      varying float vHeat;
      varying float vAngle;

      ${projectionHelperGlsl}

      void main() {
        float ph = aSeed.x;
        float spd = aSeed.y;
        float sz = aSeed.z;
        vHeat = aSeed.w;

        float motion = 1.0 - uReducedMotion;
        float t = uTime * spd * motion;
        vec3 p = position;

        // Buoyant thermal rise with turbulent drift in 3D depth space
        float rise = (0.022 + spd * 0.020) * (0.85 + 0.15 * uLanternBright);
        float yLife = fract(p.y + uTime * rise * motion);
        p.y = yLife;
        float swirl = sin(t * 1.15 + ph + yLife * 6.4);
        float swirl2 = cos(t * 0.85 + ph * 1.9 + yLife * 4.2);
        p.x = clamp(p.x + swirl * 0.026 + swirl2 * 0.010, 0.01, 0.99);
        p.z = clamp(p.z + swirl2 * 0.032, 0.03, 0.94);

        vDepth = p.z;
        vec2 clip = projectPlate3DToClip(p, uZoom, uDollyShiftY, uRoll, uRayDelta, uViewportAspect, uPlateAspect);

        float lifeFade = smoothstep(0.0, 0.12, yLife) * (1.0 - smoothstep(0.76, 1.0, yLife));
        float flicker = 0.62 + 0.38 * sin(uTime * (5.4 + spd * 3.4) * motion + ph * 7.3);
        vAlpha = lifeFade * flicker * uIntroFade * (0.48 + 0.18 * uLanternBright);
        vAngle = swirl * 0.55;

        float depthScale = 0.55 + p.z * 1.25;
        gl_PointSize = clamp(sz * depthScale * 2.4 * uPointScale, 1.2, 9.5);
        gl_Position = vec4(clip, 0.0, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D uSceneDepthTex;
      uniform vec2 uResolution;

      varying float vDepth;
      varying float vAlpha;
      varying float vHeat;
      varying float vAngle;

      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float ca = cos(vAngle);
        float sa = sin(vAngle);
        vec2 rotC = vec2(c.x * ca - c.y * sa, c.x * sa + c.y * ca);
        vec2 sparkC = vec2(rotC.x * 1.45, rotC.y * 0.90);
        float r = length(sparkC);
        if (r > 0.5) discard;

        // Exact POM-warped depth-map occlusion test (hides embers cleanly behind mug, chess knight, rifle, operator & husky)
        vec2 screenUv = clamp(gl_FragCoord.xy / max(uResolution, vec2(1.0)), vec2(0.001), vec2(0.999));
        float sceneDepth = texture2D(uSceneDepthTex, screenUv).a;
        float vis = smoothstep(sceneDepth - 0.024, sceneDepth + 0.022, vDepth);
        if (vis <= 0.008) discard;

        float core = 1.0 - smoothstep(0.02, 0.18, r);
        float halo = 1.0 - smoothstep(0.05, 0.5, r);
        float intensity = (core * 0.92 + halo * halo * 0.28) * vAlpha * vis;

        // Fine crimson-gold sparks without milky bloom clutter
        vec3 deepCrimson = vec3(1.85, 0.16, 0.08);
        vec3 moltenGold = vec3(2.25, 0.62, 0.16);
        vec3 whiteHot = vec3(2.55, 1.35, 0.68);
        vec3 col = mix(deepCrimson, moltenGold, vHeat);
        col = mix(col, whiteHot, core * 0.52);

        float depthTag = intensity > 0.15 ? vDepth : 0.0;
        gl_FragColor = vec4(col * intensity, depthTag);
      }
    `,
  });

  const dustPoints = new THREE.Points(dustGeom, dustMaterial);
  dustPoints.frustumCulled = false;
  const emberPoints = new THREE.Points(emberGeom, emberMaterial);
  emberPoints.frustumCulled = false;
  scene.add(dustPoints, emberPoints);

  const syncUniforms = (mat: THREE.ShaderMaterial, f: PomParticleFrame) => {
    mat.uniforms.uTime.value = f.elapsedTime;
    mat.uniforms.uIntroFade.value = f.introFade;
    mat.uniforms.uReducedMotion.value = f.reducedMotion;
    mat.uniforms.uLanternBright.value = f.lanternBright;
    mat.uniforms.uZoom.value = f.zoom;
    mat.uniforms.uDollyShiftY.value = f.dollyShiftY;
    mat.uniforms.uRoll.value = f.roll;
    mat.uniforms.uRayDelta.value.set(f.rayDeltaX, f.rayDeltaY);
    mat.uniforms.uViewportAspect.value = f.viewportAspect;
    mat.uniforms.uPlateAspect.value = f.plateAspect;
    mat.uniforms.uResolution.value.set(f.pixelWidth, f.pixelHeight);
    mat.uniforms.uPointScale.value = Math.max(0.65, (f.pixelHeight / 900) * Math.min(f.pixelRatio, 1.5));
    mat.uniforms.uSceneDepthTex.value = f.sceneDepthTex;
  };

  return {
    scene,
    camera,
    update(frame: PomParticleFrame) {
      syncUniforms(dustMaterial, frame);
      syncUniforms(emberMaterial, frame);
    },
    dispose() {
      dustGeom.dispose();
      emberGeom.dispose();
      dustMaterial.dispose();
      emberMaterial.dispose();
    },
  };
}
