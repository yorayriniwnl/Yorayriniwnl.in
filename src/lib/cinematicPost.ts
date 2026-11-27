import * as THREE from "three";
import { Pass, FullScreenQuad } from "three/examples/jsm/postprocessing/Pass.js";

export type PlateTier = "2k" | "4k";

export type PlateQualityInfo = {
  tier: PlateTier;
  plateUrl: string;
  isMobile: boolean;
  dpr: number;
  initialScale: number;
  minScale: number;
  maxScale: number;
};

/**
 * Selects the 2K plate on mobile devices or when devicePixelRatio is low (<= 1.25),
 * or if GPU maxTextureSize < 4096; otherwise selects the 4K master plate.
 * Also provides safe adaptive render-scale bounds targeting 60 fps.
 */
export function selectPlateQuality(maxTextureSize = 4096): PlateQualityInfo {
  const hasWindow = typeof window !== "undefined";
  const dpr = hasWindow ? Math.max(1, window.devicePixelRatio || 1) : 1;
  const coarse = hasWindow && Boolean(window.matchMedia?.("(pointer: coarse)").matches);
  const narrow = hasWindow && window.innerWidth <= 900;
  const mobileUa =
    typeof navigator !== "undefined" &&
    /Mobi|Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  const isMobile = coarse || narrow || mobileUa;
  const use2k = isMobile || dpr <= 1.25 || maxTextureSize < 4096;

  const maxScale = isMobile ? Math.min(dpr, 1.15) : Math.min(dpr, 1.65);
  const minScale = isMobile ? 0.55 : 0.65;
  const initialScale = THREE.MathUtils.clamp(
    isMobile ? Math.min(dpr, 0.95) : Math.min(dpr, 1.35),
    minScale,
    maxScale,
  );

  return {
    tier: use2k ? "2k" : "4k",
    plateUrl: use2k ? "/cinematic/painting-2k.jpg" : "/cinematic/painting-4k.jpg",
    isMobile,
    dpr,
    initialScale,
    minScale,
    maxScale,
  };
}

export type AdaptiveScalerSample = {
  changed: boolean;
  scale: number;
  fps: number;
  emaMs: number;
};

/**
 * Hysteresis-stabilized adaptive render scale controller targeting 60 fps (16.67 ms/frame).
 * Steps render scale down promptly when sustained frame times exceed budget, and recovers
 * smoothly when GPU headroom returns. Zero per-frame heap allocations.
 */
export class AdaptiveRenderScaler {
  private scale: number;
  private readonly minScale: number;
  private readonly maxScale: number;
  private emaMs = 16.67;
  private slowFrames = 0;
  private fastFrames = 0;
  private cooldownSec = 1.2;
  private readonly result: AdaptiveScalerSample = {
    changed: false,
    scale: 1,
    fps: 60,
    emaMs: 16.67,
  };

  constructor(initialScale: number, minScale = 0.55, maxScale = 1.65) {
    this.minScale = minScale;
    this.maxScale = Math.max(minScale, maxScale);
    this.scale = THREE.MathUtils.clamp(initialScale, this.minScale, this.maxScale);
    this.result.scale = this.scale;
  }

  getScale(): number {
    return this.scale;
  }

  sample(deltaSec: number): AdaptiveScalerSample {
    const dtMs = deltaSec * 1000;
    this.result.changed = false;

    if (dtMs <= 1.0 || dtMs > 125.0) {
      this.result.scale = this.scale;
      this.result.emaMs = this.emaMs;
      this.result.fps = Math.min(144, Math.max(1, Math.round(1000 / Math.max(this.emaMs, 4))));
      return this.result;
    }

    this.emaMs = this.emaMs * 0.92 + dtMs * 0.08;
    this.cooldownSec = Math.max(0, this.cooldownSec - deltaSec);

    // Target 60 fps (16.67 ms): step down above 19.2 ms (< ~52 fps), recover below 13.8 ms (> ~72 fps)
    if (this.emaMs > 19.2) {
      this.slowFrames += 1;
      this.fastFrames = Math.max(0, this.fastFrames - 2);
    } else if (this.emaMs < 13.8) {
      this.fastFrames += 1;
      this.slowFrames = Math.max(0, this.slowFrames - 2);
    } else {
      this.slowFrames = Math.max(0, this.slowFrames - 1);
      this.fastFrames = Math.max(0, this.fastFrames - 1);
    }

    if (this.cooldownSec <= 0) {
      if (this.slowFrames >= 26 && this.scale > this.minScale + 0.005) {
        const drop = this.emaMs > 26.0 ? 0.12 : 0.07;
        const next = Math.max(
          this.minScale,
          Math.round((this.scale - drop) * 20) / 20,
        );
        if (Math.abs(next - this.scale) >= 0.01) {
          this.scale = next;
          this.slowFrames = 0;
          this.fastFrames = 0;
          this.cooldownSec = 0.95;
          this.result.changed = true;
        }
      } else if (this.fastFrames >= 90 && this.scale < this.maxScale - 0.005) {
        const next = Math.min(
          this.maxScale,
          Math.round((this.scale + 0.05) * 20) / 20,
        );
        if (Math.abs(next - this.scale) >= 0.01) {
          this.scale = next;
          this.slowFrames = 0;
          this.fastFrames = 0;
          this.cooldownSec = 2.4;
          this.result.changed = true;
        }
      }
    }

    this.result.scale = this.scale;
    this.result.emaMs = this.emaMs;
    this.result.fps = Math.min(144, Math.max(1, Math.round(1000 / Math.max(this.emaMs, 4))));
    return this.result;
  }
}

export type ExternalDepthBokehConfig = {
  focusDistance?: number;
  focusRange?: number;
  focusDeadzone?: number;
  maxBlur?: number;
  highlightGain?: number;
  anamorphicRatio?: number;
  strength?: number;
};

/**
 * Golden-Angle Spiral Bokeh DoF Pass operating on the EffectComposer's readBuffer (linear HDR)
 * and an external hardware DepthTexture (e.g. from GTAOPass's normalRenderTarget).
 * Preserves linear HDR values for downstream UnrealBloomPass.
 */
export class ExternalDepthBokehPass extends Pass {
  private camera: THREE.PerspectiveCamera;
  private getDepthTexture: () => THREE.Texture | null;
  private material: THREE.ShaderMaterial;
  private fsQuad: FullScreenQuad;
  public uniforms: Record<string, THREE.IUniform>;

  constructor(
    camera: THREE.PerspectiveCamera,
    getDepthTexture: () => THREE.Texture | null,
    width: number,
    height: number,
    config: ExternalDepthBokehConfig = {},
  ) {
    super();
    this.camera = camera;
    this.getDepthTexture = getDepthTexture;
    this.needsSwap = true;

    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));

    this.uniforms = {
      tDiffuse: { value: null },
      tDepth: { value: null },
      uResolution: { value: new THREE.Vector2(w, h) },
      uAspect: { value: w / Math.max(h, 1) },
      uNear: { value: camera.near },
      uFar: { value: camera.far },
      uFocusDistance: { value: config.focusDistance ?? 2.2 },
      uFocusRange: { value: config.focusRange ?? 2.2 },
      uFocusDeadzone: { value: config.focusDeadzone ?? 0.5 },
      uMaxBlur: { value: config.maxBlur ?? 0.013 },
      uHighlightGain: { value: config.highlightGain ?? 0.55 },
      uAnamorphicRatio: { value: config.anamorphicRatio ?? 0.86 },
      uStrength: { value: config.strength ?? 1.0 },
    };

    this.material = new THREE.ShaderMaterial({
      name: "ExternalDepthGoldenAngleBokeh",
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tDiffuse;
        uniform sampler2D tDepth;
        uniform vec2 uResolution;
        uniform float uAspect;
        uniform float uNear;
        uniform float uFar;
        uniform float uFocusDistance;
        uniform float uFocusRange;
        uniform float uFocusDeadzone;
        uniform float uMaxBlur;
        uniform float uHighlightGain;
        uniform float uAnamorphicRatio;
        uniform float uStrength;

        varying vec2 vUv;

        const float GOLDEN_ANGLE = 2.399963229728653;
        const int SAMPLES = 24;

        float interleavedGradientNoise(vec2 fragCoord) {
          return fract(52.9829189 * fract(dot(fragCoord, vec2(0.06711056, 0.00583715))));
        }

        float linearizeDepth(float depthSample) {
          float zNdc = depthSample * 2.0 - 1.0;
          float denom = max(uFar + uNear - zNdc * (uFar - uNear), 1e-4);
          return (2.0 * uNear * uFar) / denom;
        }

        float computeCoc(float linearDist) {
          float delta = abs(linearDist - uFocusDistance);
          float dead = max(uFocusDeadzone, 0.001);
          float span = max(uFocusRange, 0.05);
          float fgBoost = linearDist < uFocusDistance ? 1.25 : 1.0;
          float norm = clamp((delta * fgBoost - dead) / span, 0.0, 1.0);
          return smoothstep(0.0, 1.0, norm);
        }

        void main() {
          vec3 centerCol = texture2D(tDiffuse, vUv).rgb;
          if (uStrength <= 0.001) {
            gl_FragColor = vec4(centerCol, 1.0);
            return;
          }

          float centerDepth = linearizeDepth(texture2D(tDepth, vUv).x);
          float centerCoc = computeCoc(centerDepth) * uStrength;

          vec2 texelScale = vec2(uAnamorphicRatio / max(uAspect, 0.2), 1.0);
          float maxRadius = uMaxBlur * max(centerCoc, 0.08 * uStrength);

          // Fast path for tack-sharp focal regions with no blurred foreground neighbors
          if (centerCoc < 0.012) {
            float fgPeek = 0.0;
            vec2 pOff = texelScale * uMaxBlur * 0.55;
            float dL = linearizeDepth(texture2D(tDepth, clamp(vUv + vec2(-pOff.x, 0.0), 0.001, 0.999)).x);
            float dR = linearizeDepth(texture2D(tDepth, clamp(vUv + vec2(pOff.x, 0.0), 0.001, 0.999)).x);
            float dU = linearizeDepth(texture2D(tDepth, clamp(vUv + vec2(0.0, pOff.y), 0.001, 0.999)).x);
            float dD = linearizeDepth(texture2D(tDepth, clamp(vUv + vec2(0.0, -pOff.y), 0.001, 0.999)).x);
            float minNeighbor = min(min(dL, dR), min(dU, dD));
            if (minNeighbor < centerDepth - 0.16) {
              fgPeek = computeCoc(minNeighbor) * uStrength;
            }
            if (fgPeek < 0.04) {
              gl_FragColor = vec4(centerCol, 1.0);
              return;
            }
            maxRadius = uMaxBlur * fgPeek;
          }

          vec3 accum = centerCol * 0.55;
          float totalWeight = 0.55;
          float angle = interleavedGradientNoise(gl_FragCoord.xy) * 6.2831853;

          for (int i = 0; i < SAMPLES; i++) {
            angle += GOLDEN_ANGLE;
            float rNorm = sqrt((float(i) + 0.5) / float(SAMPLES));
            vec2 dir = vec2(cos(angle), sin(angle));
            vec2 sampleUv = clamp(vUv + dir * (rNorm * maxRadius) * texelScale, vec2(0.001), vec2(0.999));

            vec3 sCol = texture2D(tDiffuse, sampleUv).rgb;
            float sDepth = linearizeDepth(texture2D(tDepth, sampleUv).x);
            float sCoc = computeCoc(sDepth) * uStrength;

            float isForeground = step(sDepth, centerDepth - 0.05);
            float cocWeight = mix(
              smoothstep(0.0, max(centerCoc, 0.02), sCoc) * centerCoc,
              max(sCoc, centerCoc * 0.65),
              isForeground
            );

            float reachEdge = max(sCoc, centerCoc);
            float reachMask = 1.0 - smoothstep(reachEdge * 0.92, reachEdge * 1.15 + 0.02, rNorm * (maxRadius / max(uMaxBlur, 1e-4)));
            float luma = dot(sCol, vec3(0.2126, 0.7152, 0.0722));
            float bokehSparkle = 1.0 + smoothstep(0.85, 2.2, luma) * uHighlightGain * sCoc;

            float w = max(cocWeight * reachMask, 0.0) * bokehSparkle;
            accum += sCol * w;
            totalWeight += w;
          }

          vec3 blurred = accum / max(totalWeight, 1e-4);
          gl_FragColor = vec4(clamp(blurred, vec3(0.0), vec3(12.0)), 1.0);
        }
      `,
    });

    this.fsQuad = new FullScreenQuad(this.material);
  }

  override setSize(width: number, height: number) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    this.uniforms.uResolution.value.set(w, h);
    this.uniforms.uAspect.value = w / Math.max(h, 1);
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    readBuffer: THREE.WebGLRenderTarget,
  ) {
    const depthTex = this.getDepthTexture();
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.tDepth.value = depthTex;
    this.uniforms.uNear.value = this.camera.near;
    this.uniforms.uFar.value = this.camera.far;

    if (!depthTex) {
      this.uniforms.uStrength.value = 0.0;
    }

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }
    this.fsQuad.render(renderer);
  }

  override dispose() {
    this.material.dispose();
    this.fsQuad.dispose();
  }
}

/**
 * Golden-Angle Spiral Bokeh DoF Pass for linear HDR scenes with normalized depth [0..1] in Alpha
 * (used by CinematicWarRoom's POM pipeline, optionally compositing a depth-occluded 3D particle target
 * BEFORE bokeh so foreground/background dust & embers receive real golden-angle bokeh!).
 */
export class AlphaDepthBokehPass extends Pass {
  private getSceneTexture: () => THREE.Texture;
  private getParticleTexture: () => THREE.Texture | null;
  private material: THREE.ShaderMaterial;
  private fsQuad: FullScreenQuad;
  public uniforms: Record<string, THREE.IUniform>;

  constructor(
    getSceneTexture: () => THREE.Texture,
    getParticleTexture: () => THREE.Texture | null,
    width: number,
    height: number,
  ) {
    super();
    this.getSceneTexture = getSceneTexture;
    this.getParticleTexture = getParticleTexture;
    this.needsSwap = true;

    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));

    this.uniforms = {
      uSceneTex: { value: getSceneTexture() },
      uParticleTex: { value: getParticleTexture() },
      uHasParticles: { value: getParticleTexture() ? 1.0 : 0.0 },
      uResolution: { value: new THREE.Vector2(w, h) },
      uFocusDepth: { value: 0.275 },
      uFocusBand: { value: 0.14 },
      uAperture: { value: 0.48 },
      uAnamorphicRatio: { value: 0.86 },
      uTime: { value: 0 },
      uReducedMotion: { value: 0 },
    };

    this.material = new THREE.ShaderMaterial({
      name: "AlphaDepthGoldenAngleBokeh",
      uniforms: this.uniforms,
      depthTest: false,
      depthWrite: false,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D uSceneTex;
        uniform sampler2D uParticleTex;
        uniform float uHasParticles;
        uniform vec2 uResolution;
        uniform float uFocusDepth;
        uniform float uFocusBand;
        uniform float uAperture;
        uniform float uAnamorphicRatio;
        uniform float uTime;
        uniform float uReducedMotion;

        varying vec2 vUv;

        float perceptualDepth(float d) {
          return pow(clamp(d, 0.0, 1.0), 0.55);
        }

        float computeCoc(float depthSample) {
          float dist = abs(perceptualDepth(depthSample) - perceptualDepth(uFocusDepth));
          return smoothstep(uFocusBand, uFocusBand + 0.30, dist) * uAperture;
        }

        float interleavedGradientNoise(vec2 fragCoord) {
          return fract(52.9829189 * fract(dot(fragCoord, vec2(0.06711056, 0.00583715))));
        }

        // Composite linear HDR scene + depth-occluded 3D particles cleanly
        vec4 sampleCombined(vec2 uv) {
          vec4 sc = texture2D(uSceneTex, uv);
          if (uHasParticles > 0.5) {
            vec4 pt = texture2D(uParticleTex, uv);
            // pt.rgb is pre-occluded additive HDR dust/ember energy, pt.a encodes foreground particle depth if strong
            float ptEnergy = dot(pt.rgb, vec3(0.2126, 0.7152, 0.0722));
            float ptDepth = pt.a > 0.005 ? max(sc.a, pt.a) : sc.a;
            float depthBlend = smoothstep(0.18, 0.85, ptEnergy);
            return vec4(sc.rgb + pt.rgb, mix(sc.a, ptDepth, depthBlend));
          }
          return sc;
        }

        void main() {
          vec4 center = sampleCombined(vUv);
          float centerDepth = center.a;
          float centerCoc = computeCoc(centerDepth);

          float maxRadiusPx = clamp(uResolution.y * 0.016, 7.5, 22.0);
          vec2 texel = vec2(uAnamorphicRatio, 1.0) / max(uResolution, vec2(1.0));

          vec3 accum = center.rgb;
          float totalWeight = 1.0;

          if (uAperture > 0.015) {
            const int TAPS = 24;
            const float GOLDEN_ANGLE = 2.39996323;
            float rot = interleavedGradientNoise(gl_FragCoord.xy) * 6.2831853 * (1.0 - uReducedMotion);
            float searchRadius = max(centerCoc, uAperture * 0.88);

            for (int i = 1; i <= TAPS; i++) {
              float fi = float(i);
              float rNorm = sqrt((fi - 0.5) / float(TAPS));
              float theta = fi * GOLDEN_ANGLE + rot;
              vec2 dir = vec2(cos(theta), sin(theta));

              float radiusPx = rNorm * maxRadiusPx * searchRadius;
              vec2 sampleUv = clamp(vUv + dir * radiusPx * texel, vec2(0.001), vec2(0.999));
              vec4 s = sampleCombined(sampleUv);
              float sCoc = computeCoc(s.a);

              float reqCoc = rNorm * searchRadius;
              float fgReach = s.a > centerDepth + 0.015
                ? smoothstep(reqCoc - 0.16, reqCoc + 0.06, sCoc)
                : 0.0;
              float bgReach = smoothstep(reqCoc - 0.16, reqCoc + 0.06, centerCoc)
                * (s.a > centerDepth + 0.03 ? smoothstep(0.06, 0.28, sCoc) : 1.0);
              float w = max(fgReach, bgReach);

              // HDR specular bokeh disc bloom on bright emissives & embers
              float luma = dot(s.rgb, vec3(0.2126, 0.7152, 0.0722));
              float highlightBoost = 1.0 + 0.85 * smoothstep(0.65, 2.2, luma) * sCoc;
              w *= highlightBoost;

              accum += s.rgb * w;
              totalWeight += w;
            }
          }

          vec3 color = accum / max(totalWeight, 1e-4);

          // Subtle optical clarity lift on the sharp focal plane
          float sharpness = 1.0 - clamp(centerCoc / max(uAperture, 0.001), 0.0, 1.0);
          color = mix(color * 0.96, color * 1.025, sharpness * smoothstep(0.18, 0.85, uAperture));

          // Output linear HDR (unclamped up to 12.0) for downstream UnrealBloomPass!
          gl_FragColor = vec4(clamp(color, vec3(0.0), vec3(12.0)), 1.0);
        }
      `,
    });

    this.fsQuad = new FullScreenQuad(this.material);
  }

  override setSize(width: number, height: number) {
    const w = Math.max(1, Math.floor(width));
    const h = Math.max(1, Math.floor(height));
    this.uniforms.uResolution.value.set(w, h);
  }

  override render(
    renderer: THREE.WebGLRenderer,
    writeBuffer: THREE.WebGLRenderTarget,
    _readBuffer: THREE.WebGLRenderTarget,
  ) {
    this.uniforms.uSceneTex.value = this.getSceneTexture();
    const pTex = this.getParticleTexture();
    this.uniforms.uParticleTex.value = pTex;
    this.uniforms.uHasParticles.value = pTex ? 1.0 : 0.0;

    if (this.renderToScreen) {
      renderer.setRenderTarget(null);
    } else {
      renderer.setRenderTarget(writeBuffer);
      if (this.clear) renderer.clear();
    }
    this.fsQuad.render(renderer);
  }

  override dispose() {
    this.material.dispose();
    this.fsQuad.dispose();
  }
}

export type FinalGradeConfig = {
  exposure?: number;
  streakThreshold?: number;
  streakStrength?: number;
  streakSpread?: number;
  chromaticAberration?: number;
  grainStrength?: number;
  vignetteStrength?: number;
  letterbox?: number;
  saturation?: number;
  contrast?: number;
  blackPoint?: number;
  redRichness?: number;
};

/**
 * Final Cinematic Grade Pass:
 * 1. Radial chromatic aberration toward frame edges
 * 2. Horizontal anamorphic lens streaks on bright lights (in linear HDR space)
 * 3. ACES Filmic tone mapping (exact RRT+ODT fit)
 * 4. Optional obsidian black-point, filmic contrast, saturation & crimson richness
 * 5. Exact piecewise Linear -> sRGB encoding
 * 6. Optical lens vignette
 * 7. Animated luma-weighted 35mm film grain
 * 8. Antialiased cinematic letterbox bars
 */
export function createFinalGradeShader(config: FinalGradeConfig = {}) {
  return {
    name: "FinalCinematicGradeShader",
    uniforms: {
      tDiffuse: { value: null as THREE.Texture | null },
      uTime: { value: 0 },
      uReducedMotion: { value: 0 },
      uResolution: { value: new THREE.Vector2(1280, 720) },
      uExposure: { value: config.exposure ?? 1.06 },
      uStreakThreshold: { value: config.streakThreshold ?? 0.94 },
      uStreakStrength: { value: config.streakStrength ?? 0.36 },
      uStreakSpread: { value: config.streakSpread ?? 0.016 },
      uChromaticAberration: { value: config.chromaticAberration ?? 0.0044 },
      uGrainStrength: { value: config.grainStrength ?? 0.028 },
      uVignetteStrength: { value: config.vignetteStrength ?? 0.44 },
      uLetterbox: { value: config.letterbox ?? 0.052 },
      uSaturation: { value: config.saturation ?? 1.05 },
      uContrast: { value: config.contrast ?? 1.04 },
      uBlackPoint: { value: config.blackPoint ?? 0.0 },
      uRedRichness: { value: config.redRichness ?? 0.05 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform sampler2D tDiffuse;
      uniform float uTime;
      uniform float uReducedMotion;
      uniform vec2 uResolution;
      uniform float uExposure;
      uniform float uStreakThreshold;
      uniform float uStreakStrength;
      uniform float uStreakSpread;
      uniform float uChromaticAberration;
      uniform float uGrainStrength;
      uniform float uVignetteStrength;
      uniform float uLetterbox;
      uniform float uSaturation;
      uniform float uContrast;
      uniform float uBlackPoint;
      uniform float uRedRichness;

      varying vec2 vUv;

      // Exact Three.js / Stephen Hill RRT+ODT fitted ACES Filmic tone mapping
      vec3 RRTAndODTFit(vec3 v) {
        vec3 a = v * (v + 0.0245786) - 0.000090537;
        vec3 b = v * (0.983729 * v + 0.4329510) + 0.238081;
        return a / b;
      }

      vec3 ACESFilmic(vec3 color, float exposure) {
        const mat3 ACESInputMat = mat3(
          vec3(0.59719, 0.07600, 0.02840),
          vec3(0.35458, 0.90834, 0.13383),
          vec3(0.04823, 0.01566, 0.83777)
        );
        const mat3 ACESOutputMat = mat3(
          vec3( 1.60475, -0.10208, -0.00327),
          vec3(-0.53108,  1.10813, -0.07276),
          vec3(-0.07367, -0.00605,  1.07602)
        );
        color *= exposure / 0.6;
        color = ACESInputMat * color;
        color = RRTAndODTFit(color);
        color = ACESOutputMat * color;
        return clamp(color, 0.0, 1.0);
      }

      // Exact IEC 61966-2-1 linear -> sRGB transfer
      vec3 linearToSrgb(vec3 c) {
        vec3 clamped = max(c, vec3(0.0));
        vec3 lo = clamped * 12.92;
        vec3 hi = 1.055 * pow(max(clamped, vec3(1e-5)), vec3(1.0 / 2.4)) - 0.055;
        return mix(lo, hi, step(vec3(0.0031308), clamped));
      }

      float filmHash(vec2 p) {
        vec3 p3 = fract(vec3(p.xyx) * 0.1031);
        p3 += dot(p3, p3.yzx + 33.33);
        return fract((p3.x + p3.y) * p3.z);
      }

      vec3 sampleStreakEnergy(vec2 uv) {
        vec3 c = max(texture2D(tDiffuse, clamp(uv, vec2(0.001), vec2(0.999))).rgb, vec3(0.0));
        float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
        float peak = max(luma, max(c.r, max(c.g, c.b)) * 0.82);
        float excess = max(peak - uStreakThreshold, 0.0);
        float gain = excess / (peak + 1e-4);
        return c * gain;
      }

      void main() {
        // 0. Crisp antialiased cinema letterbox bars
        float barH = clamp(uLetterbox, 0.0, 0.22);
        float pxY = 1.25 / max(uResolution.y, 1.0);
        float topMask = 1.0 - smoothstep(1.0 - barH - pxY, 1.0 - barH + pxY, vUv.y);
        float botMask = smoothstep(barH - pxY, barH + pxY, vUv.y);
        float letterboxMask = barH > 0.0005 ? (topMask * botMask) : 1.0;

        if (letterboxMask <= 0.001) {
          gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
          return;
        }

        // 1. Chromatic aberration toward frame edges (0 at optical center)
        vec2 centered = vUv - 0.5;
        float aspect = uResolution.x / max(uResolution.y, 1.0);
        vec2 aspectCentered = vec2(centered.x * aspect, centered.y);
        float r2 = dot(centered, centered);
        float edgeCurve = pow(clamp(r2 * 2.8, 0.0, 1.0), 1.35);
        vec2 caOffset = centered * (uChromaticAberration * edgeCurve);

        vec2 uvR = clamp(vUv + caOffset, vec2(0.001), vec2(0.999));
        vec2 uvB = clamp(vUv - caOffset, vec2(0.001), vec2(0.999));
        vec3 col = vec3(
          texture2D(tDiffuse, uvR).r,
          texture2D(tDiffuse, vUv).g,
          texture2D(tDiffuse, uvB).b
        );
        col = clamp(col, vec3(0.0), vec3(12.0));

        // 2. Smooth continuous horizontal anamorphic lens streaks on bright emissives (16 dense taps + sub-step IGN jitter = zero beading)
        if (uStreakStrength > 0.001) {
          vec3 streakAccum = vec3(0.0);
          float streakWeightSum = 0.0;
          float yTap = 1.0 / max(uResolution.y, 1.0);
          float ign = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
          const int STREAK_TAPS = 16;
          float maxSpan = uStreakSpread * 3.1;
          for (int i = 0; i < STREAK_TAPS; i++) {
            float t = (float(i) + 0.35 + 0.55 * ign) / float(STREAK_TAPS);
            // Smooth mild curve keeps tap spacing dense (~2-4px) so pinpoint speculars smear seamlessly
            float dx = maxSpan * (t * 0.68 + t * t * 0.32);
            float w = exp(-t * 2.65);
            vec3 sL = sampleStreakEnergy(vUv - vec2(dx, 0.0));
            vec3 sR = sampleStreakEnergy(vUv + vec2(dx, 0.0));
            if (i < 6) {
              sL = 0.64 * sL
                + 0.18 * sampleStreakEnergy(vUv - vec2(dx, yTap))
                + 0.18 * sampleStreakEnergy(vUv - vec2(dx, -yTap));
              sR = 0.64 * sR
                + 0.18 * sampleStreakEnergy(vUv + vec2(dx, yTap))
                + 0.18 * sampleStreakEnergy(vUv + vec2(dx, -yTap));
            }
            streakAccum += (sL + sR) * w;
            streakWeightSum += w * 2.0;
          }
          vec3 streak = streakAccum / max(streakWeightSum, 1e-4);
          // Anamorphic cinema optical coating tint preserving crimson & amber flares
          vec3 coated = mix(streak, streak * vec3(1.24, 0.80, 0.86), 0.38);
          col += coated * uStreakStrength;
        }

        // 3. ACES Filmic tone mapping (HDR linear -> [0..1] display linear)
        col = ACESFilmic(col, uExposure);

        // 4. Linear -> sRGB display encoding
        col = linearToSrgb(col);

        // 5. Filmic obsidian black-point, contrast, saturation & selective crimson richness
        if (uBlackPoint > 0.0005) {
          col = max(col - vec3(uBlackPoint), vec3(0.0)) / max(1.0 - uBlackPoint, 0.001);
        }
        col = clamp((col - 0.46) * uContrast + 0.46, 0.0, 1.0);
        float srgbLuma = dot(col, vec3(0.2126, 0.7152, 0.0722));
        col = mix(vec3(srgbLuma), col, uSaturation);
        if (uRedRichness > 0.0005) {
          float redDom = smoothstep(0.06, 0.34, col.r - max(col.g, col.b));
          col.r += redDom * uRedRichness * (1.0 - col.r * 0.45);
          col.gb -= redDom * uRedRichness * 0.16;
          col = clamp(col, 0.0, 1.0);
        }

        // 6. Optical lens vignette
        float vigDist = length(aspectCentered * vec2(0.74, 1.04));
        float vig = 1.0 - smoothstep(0.42, 1.30, vigDist) * uVignetteStrength;
        col *= clamp(vig, 0.22, 1.0);

        // 7. Luma-weighted animated 35mm film grain (frozen under reduced motion)
        if (uGrainStrength > 0.0005) {
          float grainT = uTime * (1.0 - uReducedMotion);
          vec2 grainCoord = floor(gl_FragCoord.xy)
            + vec2(fract(grainT * 23.17) * 517.3, fract(grainT * 17.83) * 389.7);
          float n1 = filmHash(grainCoord);
          float n2 = filmHash(grainCoord + vec2(19.31, 41.17));
          float triNoise = (n1 + n2) - 1.0;
          float lum = dot(col, vec3(0.299, 0.587, 0.114));
          float grainMask = (1.0 - smoothstep(0.55, 0.98, lum)) * 0.82 + 0.18;
          col += triNoise * uGrainStrength * grainMask;
        }

        col = clamp(col, 0.0, 1.0) * letterboxMask;
        gl_FragColor = vec4(col, 1.0);
      }
    `,
  };
}

/**
 * Computes responsive cinema letterbox bar height based on viewport aspect ratio
 * so 16:9 gets sleek cinema framing while ultrawide and portrait displays stay comfortable.
 */
export function computeResponsiveLetterbox(width: number, height: number, enabled: boolean): number {
  if (!enabled) return 0.0;
  const aspect = width / Math.max(height, 1);
  if (aspect > 2.25) return 0.02;
  if (aspect < 1.0) return 0.032;
  return 0.052;
}
