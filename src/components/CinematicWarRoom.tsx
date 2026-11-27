import { useEffect, useRef, type CSSProperties } from "react";
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import {
  DEFAULT_FOCUS_BAND,
  DEFAULT_FOCUS_DEPTH,
  type CinematicCameraFrame,
} from "../data/cinematicHotspots";
import {
  AdaptiveRenderScaler,
  AlphaDepthBokehPass,
  computeResponsiveLetterbox,
  createFinalGradeShader,
  selectPlateQuality,
  type PlateTier,
} from "../lib/cinematicPost";
import { createPomDepthDustAndEmberSystem } from "../lib/cinematicParticles";

export type CinematicTelemetry = {
  fps: number;
  scale: number;
  plateTier: PlateTier;
};

export interface CinematicWarRoomProps {
  className?: string;
  style?: CSSProperties;
  /** Pause the render loop (e.g. while an overlay or modal is open). */
  paused?: boolean;
  /** Plate resolution mode: "auto" picks 2K on mobile or low DPR, otherwise 4K when supported. */
  plateQuality?: "auto" | "4k" | "2k";
  /** Multiplier for parallax-occlusion depth strength (default 1.0). */
  parallaxStrength?: number;
  /** Target optical depth-of-field focal plane in depth.png (0 far .. 1 near). */
  focusDepth?: number;
  /** Sharp depth-of-field focal band half-width in perceptual depth space. */
  focusBand?: number;
  /** Optical bokeh aperture intensity (0 = crisp full-frame, 1 = shallow prime lens). */
  dofStrength?: number;
  /** Controls the practical crimson cage lantern intensity on the right wall. */
  lanternBright?: boolean;
  /** Toggle cinematic widescreen letterbox bars in the final grade pass (default true). */
  letterbox?: boolean;
  /** Called each rendered frame with the exact camera projection & POM shift for overlay lock. */
  onCameraFrame?: (frame: CinematicCameraFrame) => void;
  /** Called at ~4 Hz with live FPS, adaptive render scale, and selected plate tier. */
  onTelemetry?: (telemetry: CinematicTelemetry) => void;
  /** Called once all textures are uploaded and the opening sequence starts. */
  onReady?: () => void;
  /** Called with normalized 0..1 asset loading progress. */
  onProgress?: (progress: number) => void;
  /** Called if WebGL initialization or texture loading fails. */
  onError?: (error: Error) => void;
}

const PLATE_ASPECT = 16 / 9;

const VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = /* glsl */ `
uniform sampler2D uPlate;
uniform sampler2D uDepth;
uniform sampler2D uNormals;
uniform sampler2D uFx;

uniform float uTime;
uniform float uIntroTime;
uniform float uViewportAspect;
uniform float uPlateAspect;
uniform float uParallaxStrength;
uniform float uReducedMotion;
uniform float uLanternBright;

uniform vec2 uCamOffset;       // Spring-damped camera XY offset (~[-1.15, 1.15])
uniform vec2 uCamVelocity;     // Camera velocity for subtle gimbal micro-roll
uniform vec2 uMouseScreenUv;   // Spring-damped pointer in screen UV [0, 1] (Y-up)
uniform float uMouseActivity;  // Smooth 0..1 pointer engagement

varying vec2 vUv;

const int POM_STEPS = 48;
const int BINARY_STEPS = 6;
const int GODRAY_STEPS = 14;
const float FOCUS_DEPTH = 0.28;

// ---------------------------------------------------------------------------
// Hash & Procedural Noise
// ---------------------------------------------------------------------------
float sq(float x) {
  return x * x;
}

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  float a = hash12(i);
  float b = hash12(i + vec2(1.0, 0.0));
  float c = hash12(i + vec2(0.0, 1.0));
  float d = hash12(i + vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amp = 0.5;
  mat2 rot = mat2(0.80, -0.60, 0.60, 0.80);
  for (int i = 0; i < 4; i++) {
    value += amp * valueNoise(p);
    p = rot * p * 2.03 + vec2(17.1, 31.7);
    amp *= 0.5;
  }
  return value;
}

float interleavedGradientNoise(vec2 fragCoord) {
  return fract(52.9829189 * fract(dot(fragCoord, vec2(0.06711056, 0.00583715))));
}

// ---------------------------------------------------------------------------
// Cover-fit Screen UV -> Plate UV with Opening Dolly & Subtle Gimbal Roll
// ---------------------------------------------------------------------------
vec2 screenToPlateUv(vec2 screenUv, float zoom, vec2 dollyShift, float roll) {
  vec2 centered = screenUv - 0.5;

  // Aspect-preserving cover fit so the 16:9 4K plate fills any viewport cleanly
  if (uViewportAspect > uPlateAspect) {
    centered.y *= uPlateAspect / uViewportAspect;
  } else {
    centered.x *= uViewportAspect / uPlateAspect;
  }

  // Subtle camera roll in aspect-correct space
  float c = cos(roll);
  float s = sin(roll);
  vec2 metric = vec2(centered.x * uPlateAspect, centered.y);
  metric = vec2(c * metric.x - s * metric.y, s * metric.x + c * metric.y);
  centered = vec2(metric.x / uPlateAspect, metric.y);

  // Apply dolly-in zoom and vertical crane settle
  centered = centered / zoom + dollyShift;
  return centered + 0.5;
}

float sampleDepth(vec2 uv) {
  return texture2D(uDepth, clamp(uv, 0.001, 0.999)).r;
}

// ---------------------------------------------------------------------------
// Opening Neon Ballast Flicker-On Curve
// ---------------------------------------------------------------------------
float ballastIgnition(float t, float startT, float duration, float seed) {
  float u = clamp((t - startT) / max(duration, 0.01), 0.0, 1.0);
  if (u <= 0.0) return 0.0;
  if (u >= 1.0) return 1.0;

  // Three distinct sputter strikes before locking on steady
  float strike1 = smoothstep(0.04, 0.08, u) * (1.0 - smoothstep(0.11, 0.16, u)) * 0.72;
  float strike2 = smoothstep(0.24, 0.29, u) * (1.0 - smoothstep(0.35, 0.42, u)) * 0.95;
  float strike3 = smoothstep(0.50, 0.56, u) * (1.0 - smoothstep(0.61, 0.68, u)) * 0.55;
  float lockOn  = smoothstep(0.66, 0.90, u);
  float buzz    = 0.86 + 0.14 * sin((u * 48.0 + seed * 19.0) * 3.14159);

  // Brief bright surge right as the tube catches
  float surge = exp(-sq((u - 0.78) / 0.075)) * 0.24;
  return clamp(max(max(strike1, max(strike2, strike3)), lockOn) * buzz + surge, 0.0, 1.25);
}

// ---------------------------------------------------------------------------
// Procedural Raindrop Rivulets on Window Glass
// Returns vec3(gradX, gradY, highlightIntensity)
// ---------------------------------------------------------------------------
vec3 rainLayer(vec2 uv, float t, vec2 gridScale, float speed) {
  vec2 st = uv * gridScale;
  float colId = floor(st.x);
  float colSeed = hash12(vec2(colId, gridScale.x));

  // Staggered vertical fall (downward = increasing uv.y offset in cell space)
  float fall = t * speed * (0.72 + 0.56 * colSeed) + colSeed * 43.17;
  st.y += fall;

  vec2 cellId = floor(st);
  vec2 cellUv = fract(st) - 0.5;
  vec2 rnd = hash22(cellId + gridScale * 1.37);

  // Horizontal organic wiggle as water clings to glass
  float wiggle = sin(uv.y * 28.0 + rnd.x * 6.2831 + sin(uv.y * 12.0 + colId)) * 0.16;
  float dropX = (rnd.x - 0.5) * 0.56 + wiggle;

  // Main drop slides faster in surges, pauses briefly, then releases
  float surge = sin(t * speed * 1.45 + rnd.y * 6.2831);
  float dropY = -0.34 * sin(surge + 0.45 * sin(surge));

  vec2 dropPos = vec2(dropX, dropY);
  vec2 dVec = cellUv - dropPos;
  dVec.x *= gridScale.y / gridScale.x * 1.55;

  float dropRadius = 0.085 + 0.045 * rnd.y;
  float mainDrop = smoothstep(dropRadius, dropRadius * 0.22, length(dVec));

  // Trailing micro-droplets above the moving bead
  float trailMask = smoothstep(-0.02, 0.46, cellUv.y - dropY) * smoothstep(0.50, 0.12, cellUv.y);
  float trailY = fract((cellUv.y - dropY) * 6.5) - 0.5;
  vec2 trailVec = vec2((cellUv.x - dropX) * (gridScale.y / gridScale.x * 1.6), trailY * 0.19);
  float trailBeads = smoothstep(0.055, 0.015, length(trailVec)) * trailMask * 0.7;

  // Thin wet streak connecting the beads
  float streak = smoothstep(0.026, 0.005, abs(dVec.x)) * trailMask * 0.24;

  float mask = clamp(mainDrop + trailBeads, 0.0, 1.0);
  // Sparse columns stay quiet for realism
  float presence = smoothstep(0.22, 0.45, rnd.x);
  mask *= presence;
  streak *= presence;

  vec2 grad = dVec * mainDrop * 2.6 + trailVec * trailBeads * 1.5;
  // Bright bottom-rim catchlight inside each droplet
  float glint = smoothstep(0.01, 0.08, -dVec.y) * mainDrop * presence + trailBeads * presence * 0.35;
  return vec3(grad, clamp(glint + streak * 0.4, 0.0, 1.0));
}

// ---------------------------------------------------------------------------
// Eye Glint Helper (Iris Pulse + Specular Catchlight + Anamorphic Flare)
// ---------------------------------------------------------------------------
vec3 computeEyeGlint(
  vec2 uv,
  vec2 irisPos,
  vec2 catchPos,
  float irisRadius,
  float pulse,
  vec2 camShift,
  float intensity
) {
  vec2 aspectVec = vec2(uPlateAspect, 1.0);
  vec2 dIris = (uv - irisPos) * aspectVec;
  float rIris = length(dIris);
  float irisGlow = exp(-sq(rIris / max(irisRadius, 0.001)) * 2.4);

  // Wet-cornea specular shifts subtly with viewing angle
  vec2 dCatch = (uv - (catchPos + camShift)) * aspectVec;
  float pinpoint = exp(-dot(dCatch, dCatch) / (irisRadius * irisRadius * 0.042));

  // Subtle horizontal crimson anamorphic glint
  float anamorphic = exp(-sq(dCatch.x / (irisRadius * 1.75)) - sq(dCatch.y / (irisRadius * 0.16)));

  vec3 redIris = vec3(1.0, 0.06, 0.05) * irisGlow * (0.34 + 0.30 * pulse);
  vec3 redFlare = vec3(1.0, 0.18, 0.14) * anamorphic * (0.28 + 0.22 * pulse);
  vec3 hotCore = vec3(1.0, 0.72, 0.66) * pinpoint * (0.48 + 0.32 * pulse);
  return (redIris + redFlare + hotCore) * intensity;
}

// ---------------------------------------------------------------------------
// Selective Linear HDR Emissive Lift (targets ONLY lamp filaments, window & laptop lights)
// ---------------------------------------------------------------------------
vec3 baseHotEmissive(vec3 plateLin, float hotCore, float windowMask, float laptopMask) {
  float linLuma = dot(plateLin, vec3(0.2126, 0.7152, 0.0722));
  float hotFilament = smoothstep(0.74, 0.98, linLuma) * hotCore * 0.68;
  float winLights = smoothstep(0.58, 0.94, linLuma) * windowMask * 0.34;
  float screenLights = smoothstep(0.28, 0.76, plateLin.r) * laptopMask * 0.28;
  return plateLin * (hotFilament + winLights + screenLights);
}

void main() {
  float motionScale = mix(1.0, 0.0, uReducedMotion);

  // =========================================================================
  // 1. Opening Choreography (Snappy Fade-In, Gentle Dolly, Staggered Neon Ignition)
  // =========================================================================
  float introFade = mix(smoothstep(0.0, 0.55, uIntroTime), 1.0, uReducedMotion);

  float dollyProgress = clamp(uIntroTime / 1.8, 0.0, 1.0);
  float dollyInv = 1.0 - dollyProgress;
  float dollyEase = 1.0 - dollyInv * dollyInv * dollyInv * dollyInv;

  // Subtle living breath on camera focal length after dolly completes
  float idleZoomBreath = sin(uTime * 0.37) * 0.003 * motionScale;
  float zoom = mix(mix(1.012, 1.032, dollyEase) + idleZoomBreath, 1.0, uReducedMotion);
  vec2 dollyShift = mix(vec2(0.0, (1.0 - dollyEase) * -0.007), vec2(0.0), uReducedMotion);

  // Subtle camera roll driven by horizontal spring velocity
  float camRoll = clamp(-uCamVelocity.x * 0.0035, -0.0055, 0.0055) * motionScale;

  vec2 baseUv = screenToPlateUv(vUv, zoom, dollyShift, camRoll);
  vec2 mousePlateUv = screenToPlateUv(uMouseScreenUv, zoom, dollyShift, camRoll);

  // =========================================================================
  // 2. Parallax-Occlusion Raymarch (48 Linear Steps + 6 Binary Refinements)
  // =========================================================================
  vec2 parallaxScale = vec2(0.024, 0.016) * uParallaxStrength;
  vec2 rayDelta = uCamOffset * parallaxScale;

  float stepH = 1.0 / float(POM_STEPS);
  vec2 stepUv = -rayDelta * stepH;
  vec2 curUv = baseUv + rayDelta * (1.0 - FOCUS_DEPTH);
  float curH = 1.0;

  vec2 prevUv = curUv;
  float prevH = 1.0;
  bool hit = false;

  for (int i = 0; i < POM_STEPS; i++) {
    float d = sampleDepth(curUv);
    if (d >= curH) {
      hit = true;
      break;
    }
    prevUv = curUv;
    prevH = curH;
    curUv += stepUv;
    curH -= stepH;
  }

  vec2 pomUv = curUv;
  if (hit) {
    vec2 hiUv = prevUv;
    float hiH = prevH;
    vec2 loUv = curUv;
    float loH = curH;

    for (int j = 0; j < BINARY_STEPS; j++) {
      vec2 midUv = 0.5 * (hiUv + loUv);
      float midH = 0.5 * (hiH + loH);
      if (sampleDepth(midUv) >= midH) {
        loUv = midUv;
        loH = midH;
      } else {
        hiUv = midUv;
        hiH = midH;
      }
    }

    float dLo = sampleDepth(loUv) - loH;
    float dHi = sampleDepth(hiUv) - hiH;
    float denom = dLo - dHi;
    float weight = abs(denom) > 1e-5 ? clamp(dLo / denom, 0.0, 1.0) : 0.5;
    pomUv = mix(loUv, hiUv, weight);
  }

  pomUv = clamp(pomUv, 0.001, 0.999);
  float pomDepth = sampleDepth(pomUv);

  // =========================================================================
  // 3. Subtle Organic Breathing on Operator and Husky (Depth-Gated)
  // =========================================================================
  // Operator chest/shoulders/AK silhouette (depth band ~0.16..0.44)
  vec2 opDelta = (pomUv - vec2(0.445, 0.47)) / vec2(0.245, 0.34);
  float opRegion = smoothstep(1.0, 0.18, length(opDelta))
    * smoothstep(0.145, 0.195, pomDepth)
    * (1.0 - smoothstep(0.41, 0.51, pomDepth))
    * smoothstep(0.10, 0.25, pomUv.y);
  // Natural asymmetric inhale/exhale (~4.75s cycle)
  float opCycle = pow(max(0.5 + 0.5 * sin(uTime * 1.32 - 0.4), 1e-4), 1.55) - 0.45;
  // Slightly stronger rise on upper chest & shoulders, softer on head
  float opChestWeight = 0.55 + 0.45 * smoothstep(0.76, 0.46, pomUv.y);
  vec2 opShift = vec2(
    -(pomUv.x - 0.445) * 0.0052,
    -0.0028 * opChestWeight
  ) * opCycle * opRegion * motionScale;

  // Husky torso/head silhouette (depth band ~0.14..0.27)
  vec2 huDelta = (pomUv - vec2(0.695, 0.425)) / vec2(0.128, 0.215);
  float huRegion = smoothstep(1.0, 0.22, length(huDelta))
    * smoothstep(0.135, 0.175, pomDepth)
    * (1.0 - smoothstep(0.255, 0.325, pomDepth));
  // Independent faster canine breathing (~3.05s cycle)
  float huCycle = pow(max(0.5 + 0.5 * sin(uTime * 2.06 + 1.35), 1e-4), 1.45) - 0.45;
  vec2 huShift = vec2(
    -(pomUv.x - 0.695) * 0.0055,
    -0.0025
  ) * huCycle * huRegion * motionScale;

  vec2 candidateUv = clamp(pomUv + opShift + huShift, 0.001, 0.999);
  float candDepth = sampleDepth(candidateUv);
  // Prevent breathing warp from crossing sharp foreground/background silhouettes
  float safeBreath = 1.0 - smoothstep(0.035, 0.085, abs(candDepth - pomDepth));
  vec2 surfaceUv = mix(pomUv, candidateUv, safeBreath);
  float surfaceDepth = mix(pomDepth, candDepth, safeBreath);

  // =========================================================================
  // 4. Sample Plate, Normals, and FX Mask Channels
  //    fx.r = neon/lantern red emissives
  //    fx.g = gold metallic (AK-47 engravings & gold chess knight)
  //    fx.b = window glass
  //    fx.a = laptop screen
  //    Includes L1-cached channel probes so if fx.png was saved with
  //    premultiplied alpha (RGB zeroed outside laptop alpha), R/G/B derive
  //    cleanly from plate + depth while honoring intact fx.png channels 1:1.
  // =========================================================================
  vec4 fx = texture2D(uFx, surfaceUv);
  vec3 N = normalize(texture2D(uNormals, surfaceUv).rgb * 2.0 - 1.0);
  vec3 plateLinear = texture2D(uPlate, surfaceUv).rgb;
  vec3 plateSrgb = pow(max(plateLinear, vec3(1e-5)), vec3(1.0 / 2.2));

  float hasFxR = step(0.04,
    texture2D(uFx, vec2(0.985, 0.500)).r +
    texture2D(uFx, vec2(0.930, 0.850)).r +
    texture2D(uFx, vec2(0.059, 0.820)).r
  );
  float hasFxG = step(0.04,
    texture2D(uFx, vec2(0.568, 0.205)).g +
    texture2D(uFx, vec2(0.486, 0.295)).g +
    texture2D(uFx, vec2(0.115, 0.145)).g
  );
  float hasFxB = step(0.04,
    texture2D(uFx, vec2(0.545, 0.820)).b +
    texture2D(uFx, vec2(0.600, 0.820)).b
  );

  // Derived fallback masks (only used when corresponding fx.png channel is empty outside alpha)
  float maxGB = max(plateSrgb.g, plateSrgb.b);
  float redChroma = clamp((plateSrgb.r - maxGB - 0.13) / 0.34, 0.0, 1.0)
    * clamp((plateSrgb.r - 0.34) / 0.36, 0.0, 1.0);
  float sideTubes = (1.0 - smoothstep(0.07, 0.11, surfaceUv.x)) + smoothstep(0.90, 0.94, surfaceUv.x);
  float hotCore = smoothstep(0.76, 0.96, plateSrgb.r)
    * smoothstep(0.50, 0.92, plateSrgb.g)
    * clamp(sideTubes, 0.0, 1.0)
    * smoothstep(0.28, 0.42, surfaceUv.y);
  float derivedNeon = clamp(redChroma * (1.0 - smoothstep(0.55, 0.88, surfaceDepth) * 0.45) + hotCore, 0.0, 1.0);

  float luma = dot(plateSrgb, vec3(0.299, 0.587, 0.114));
  float grRatio = plateSrgb.g / max(plateSrgb.r, 0.001);
  float warmGold = clamp((plateSrgb.r - plateSrgb.b - 0.14) / 0.24, 0.0, 1.0)
    * clamp((plateSrgb.g - plateSrgb.b - 0.05) / 0.20, 0.0, 1.0)
    * clamp(1.0 - abs(grRatio - 0.72) / 0.32, 0.0, 1.0)
    * smoothstep(0.16, 0.42, luma);
  // AK-47 bounding region + depth band
  float akZone = smoothstep(0.27, 0.31, surfaceUv.x) * (1.0 - smoothstep(0.69, 0.73, surfaceUv.x))
    * smoothstep(0.04, 0.09, surfaceUv.y) * (1.0 - smoothstep(0.47, 0.52, surfaceUv.y))
    * smoothstep(0.19, 0.24, surfaceDepth) * (1.0 - smoothstep(0.48, 0.56, surfaceDepth));
  // Foreground 24K gold chess knight region + specular crest highlights
  float knightZone = smoothstep(0.068, 0.085, surfaceUv.x) * (1.0 - smoothstep(0.148, 0.168, surfaceUv.x))
    * smoothstep(0.01, 0.05, surfaceUv.y) * (1.0 - smoothstep(0.25, 0.29, surfaceUv.y))
    * smoothstep(0.54, 0.66, surfaceDepth);
  float knightHighlight = smoothstep(0.58, 0.88, luma) * smoothstep(-0.02, 0.10, plateSrgb.r - plateSrgb.b);
  float derivedGold = clamp(warmGold * akZone + max(warmGold, knightHighlight) * knightZone, 0.0, 1.0);

  // Tall mullioned blood-moon window behind operator
  float winBounds = smoothstep(0.502, 0.512, surfaceUv.x) * (1.0 - smoothstep(0.666, 0.676, surfaceUv.x))
    * smoothstep(0.51, 0.56, surfaceUv.y);
  float derivedWindow = smoothstep(0.065, 0.025, surfaceDepth) * winBounds;

  float neonMask   = mix(max(fx.r, derivedNeon), fx.r, hasFxR);
  float goldMask   = mix(max(fx.g, derivedGold), fx.g, hasFxG);
  float windowMask = mix(max(fx.b, derivedWindow), fx.b, hasFxB);
  float laptopMask = fx.a;

  // =========================================================================
  // 5. Rain on the Window Glass (Refracted City/Moon + Running Rivulets + Streaks)
  // =========================================================================
  vec3 color = plateLinear;

  if (windowMask > 0.004) {
    float rainTime = uTime * mix(1.0, 0.4, uReducedMotion);
    vec2 winAspectUv = vec2(surfaceUv.x * uPlateAspect, surfaceUv.y);

    vec3 r1 = rainLayer(winAspectUv, rainTime, vec2(15.0, 4.8), 0.28);
    vec3 r2 = rainLayer(winAspectUv + vec2(3.17, 1.43), rainTime, vec2(26.0, 8.2), 0.19);
    vec2 rainGrad = r1.xy * 0.72 + r2.xy * 0.42;
    float rainGlint = clamp(r1.z * 0.8 + r2.z * 0.55, 0.0, 1.0);

    // Refract city skyline & blood moon through raindrops on glass
    vec2 refractedUv = clamp(surfaceUv + rainGrad * 0.013 * windowMask, 0.001, 0.999);
    // Keep refraction strictly inside window glass (don't pull operator silhouette into glass)
    float refWindowOk = smoothstep(0.09, 0.03, sampleDepth(refractedUv));
    vec3 refractedPlate = texture2D(uPlate, mix(surfaceUv, refractedUv, refWindowOk)).rgb;
    color = mix(color, refractedPlate, windowMask * 0.92);

    // Subtle exterior wind-slanted rain streaks illuminated by blood moon & red skyline
    vec2 slantUv = vec2(winAspectUv.x + winAspectUv.y * 0.16, winAspectUv.y);
    float sCol = floor(slantUv.x * 82.0);
    float sRnd = hash12(vec2(sCol, 19.3));
    float sY = fract(slantUv.y * 2.6 + rainTime * (1.8 + sRnd * 1.4) + sRnd * 11.0);
    float streakLine = smoothstep(0.28, 0.0, abs(fract(slantUv.x * 82.0) - 0.5))
      * smoothstep(0.0, 0.18, sY) * smoothstep(0.62, 0.18, sY)
      * smoothstep(0.52, 0.85, sRnd);

    vec3 moonRainTint = mix(vec3(0.55, 0.12, 0.14), vec3(1.0, 0.32, 0.28), smoothstep(0.58, 0.92, surfaceUv.y));
    color += moonRainTint * (rainGlint * 0.34 + streakLine * 0.14) * windowMask;
  }

  // =========================================================================
  // 6. Opening Ignition & Live Neon / Lantern Flicker
  // =========================================================================
  // Zone weights: left frame neon, right bookshelf neon, right crimson hurricane lantern
  float lanternZone = smoothstep(0.88, 0.96, surfaceUv.x)
    * smoothstep(0.30, 0.42, surfaceUv.y)
    * (1.0 - smoothstep(0.58, 0.68, surfaceUv.y));
  float leftZone = 1.0 - smoothstep(0.14, 0.42, surfaceUv.x);

  float leftBoot   = ballastIgnition(uIntroTime, 0.12, 0.55, 1.1);
  float rightBoot  = ballastIgnition(uIntroTime, 0.22, 0.60, 2.7);
  float lanternBoot = ballastIgnition(uIntroTime, 0.30, 0.65, 4.3);

  float zoneBoot = mix(rightBoot, leftBoot, leftZone);
  zoneBoot = mix(zoneBoot, lanternBoot, lanternZone);

  // High-frequency neon tube hum + occasional power dip
  float dipCycle = fract(uTime * 0.14 + 0.37);
  float dipWindow = smoothstep(0.88, 0.91, dipCycle) * (1.0 - smoothstep(0.95, 0.99, dipCycle));
  float dipPulse = sin(uTime * 54.0) * sin(uTime * 23.0);
  float neonFlicker = 1.0
    + (0.032 * sin(uTime * 29.0) * sin(uTime * 7.3)
    + 0.022 * sin(uTime * 13.7 + surfaceUv.x * 5.0)
    - 0.16 * dipWindow * (0.5 + 0.5 * dipPulse)) * motionScale;

  // Warmer, organic hurricane lantern flame flicker scaled by lantern intensity toggle
  float lanternGain = mix(0.35, 1.0, uLanternBright);
  float lanternFlame = (1.0
    + (0.13 * sin(uTime * 4.7)
    + 0.08 * sin(uTime * 10.9 + 1.2)
    + 0.05 * sin(uTime * 19.3 + 2.4)) * motionScale) * lanternGain;

  float liveEmissiveMod = mix(neonFlicker, lanternFlame, lanternZone);
  float emissiveState = zoneBoot * liveEmissiveMod;

  // Suppress emissives before opening ignition, then bloom warmly as they flicker on
  float emissiveGate = neonMask * (1.0 - windowMask * 0.75) * (1.0 - laptopMask * 0.5);
  color *= mix(1.0, mix(0.14, 1.0, clamp(emissiveState, 0.0, 1.0)), emissiveGate);

  // Additive HDR crimson neon glow & warm hurricane lantern spill (tuned for clean selective bloom)
  float neonSurge = max(emissiveState - 0.62, 0.0);
  vec3 neonTint = mix(vec3(1.45, 0.09, 0.09), vec3(1.65, 0.24, 0.10), lanternZone);
  color += neonTint * emissiveGate * neonSurge * 0.22;
  // Lift hot lamp cores & neon filaments cleanly into HDR emissive range
  color += baseHotEmissive(plateLinear, hotCore, windowMask, laptopMask) * zoneBoot * liveEmissiveMod;

  // Soft dynamic lantern bounce cast onto nearby right-side props & globe
  float lanternDist = length((surfaceUv - vec2(0.985, 0.50)) * vec2(uPlateAspect, 1.0));
  float lanternHalo = exp(-lanternDist * lanternDist * 18.0) * smoothstep(0.05, 0.16, surfaceDepth);
  color += vec3(0.95, 0.14, 0.08) * lanternHalo * lanternBoot * (0.04 * lanternFlame);

  // =========================================================================
  // 7. Light Sweeps Across the Gold AK-47 and Gold Chess Knight
  // =========================================================================
  if (goldMask > 0.004) {
    // Periodic diagonal sweep gliding along the AK-47 axis (stock -> receiver -> 064532 -> barrel)
    float akPhase = fract(uTime * 0.19 + 0.12);
    float akPos = mix(-0.22, 0.62, smoothstep(0.06, 0.66, akPhase));
    float akDiag = dot(surfaceUv, vec2(0.74, -0.67));
    float akRibbon = exp(-sq((akDiag - akPos) / 0.062));
    float akActive = smoothstep(0.04, 0.12, akPhase) * (1.0 - smoothstep(0.60, 0.70, akPhase));

    // Independent sweep rising across the foreground 24K gold chess knight (base -> mane -> crown)
    float knPhase = fract(uTime * 0.24 + 0.58);
    float knPos = mix(0.00, 0.36, smoothstep(0.08, 0.66, knPhase));
    float knDiag = dot(surfaceUv, vec2(0.35, 0.94));
    float knRibbon = exp(-sq((knDiag - knPos) / 0.036));
    float knActive = smoothstep(0.06, 0.14, knPhase) * (1.0 - smoothstep(0.60, 0.70, knPhase));

    float isKnight = smoothstep(0.50, 0.64, surfaceDepth) * (1.0 - smoothstep(0.18, 0.26, surfaceUv.x));
    float sweep = mix(akRibbon * akActive, knRibbon * knActive, isKnight);

    // Camera-reactive anisotropic metallic glint using normals.png
    vec3 Vgold = normalize(vec3(uCamOffset * 0.45, 1.0));
    vec3 Lsweep = normalize(vec3(
      mix(-0.7, 0.7, mix(akPhase, knPhase, isKnight)) - uCamOffset.x * 0.35,
      0.45 - uCamOffset.y * 0.25,
      0.82
    ));
    vec3 Hgold = normalize(Lsweep + Vgold);
    float spec = pow(max(dot(N, Hgold), 1e-4), 16.0);
    float liveShimmer = pow(max(dot(N, normalize(vec3(0.25 - uCamOffset.x * 0.4, 0.55 - uCamOffset.y * 0.3, 0.85))), 1e-4), 26.0);

    float sheen = sweep * (0.62 + 0.98 * spec) + liveShimmer * 0.26;
    vec3 goldColor = mix(vec3(1.0, 0.76, 0.28), vec3(1.0, 0.96, 0.80), clamp(spec * sweep * 1.4, 0.0, 1.0));
    color += goldColor * goldMask * sheen * (0.45 + 0.55 * rightBoot);
  }

  // =========================================================================
  // 8. Volumetric Light Rays from the Blood Moon (Depth-Occluded Radial Scatter)
  // =========================================================================
  vec2 moonPlateUv = vec2(0.618, 0.896);
  // Align moon screen origin with far-plane parallax (h = 0.0)
  vec2 moonOrigin = moonPlateUv + rayDelta * FOCUS_DEPTH;
  vec2 toMoon = moonOrigin - baseUv;
  float moonDist = length(toMoon * vec2(uPlateAspect, 1.0));

  // Only march rays where blood-moon light reaches across the upper/mid war room
  float rayEnvelope = smoothstep(1.32, 0.06, moonDist) * smoothstep(0.05, 0.38, baseUv.y);
  if (rayEnvelope > 0.003) {
    float jitter = interleavedGradientNoise(gl_FragCoord.xy);
    float scatter = 0.0;
    float decay = 1.0;

    for (int k = 0; k < GODRAY_STEPS; k++) {
      float frac = (float(k) + jitter) / float(GODRAY_STEPS);
      vec2 tapBase = mix(baseUv, moonOrigin, frac * 0.92);
      // Sample mid-background occluders (operator hair, mullions, husky ears)
      vec2 tapUv = clamp(tapBase - rayDelta * (FOCUS_DEPTH * 0.65), 0.001, 0.999);
      float tapDepth = sampleDepth(tapUv);
      float tapOpen = smoothstep(0.115, 0.025, tapDepth);
      // Restrict sky transmission to actual window aperture
      float tapWin = smoothstep(0.495, 0.520, tapUv.x) * (1.0 - smoothstep(0.660, 0.682, tapUv.x))
        * smoothstep(0.50, 0.58, tapUv.y);
      scatter += tapOpen * tapWin * decay;
      decay *= 0.915;
    }
    scatter /= float(GODRAY_STEPS);

    // Subtle atmospheric ray breakup & slow smoke shimmer along radial angle
    float rayAngle = atan(toMoon.y, toMoon.x);
    float rayShafts = 0.68 + 0.32 * sin(rayAngle * 14.0 + uTime * 0.16)
      * (0.7 + 0.3 * fbm(vec2(rayAngle * 3.0, moonDist * 2.2 - uTime * 0.06)));
    // Soften rays slightly over very close foreground desk objects so beams sit behind them
    float fgSoft = 1.0 - smoothstep(0.42, 0.78, surfaceDepth) * 0.70;
    vec3 moonRayColor = mix(vec3(0.84, 0.06, 0.08), vec3(0.96, 0.22, 0.16), smoothstep(0.65, 0.05, moonDist));
    color += moonRayColor * scatter * rayEnvelope * rayShafts * fgSoft * 0.065;
  }

  // =========================================================================
  // 9. Subtle Distance Atmosphere (Restrained so Reference True Blacks Stay Crisp)
  // =========================================================================
  float dist = clamp(1.0 - surfaceDepth, 0.0, 1.0);
  float expFog = 1.0 - exp(-dist * dist * 1.25);
  float hazeTime = uTime * mix(1.0, 0.3, uReducedMotion);
  vec2 hazeUv = vec2(surfaceUv.x * uPlateAspect, surfaceUv.y);
  float mistA = fbm(hazeUv * 2.6 + vec2(hazeTime * 0.042, -hazeTime * 0.014));
  float mistB = fbm(hazeUv * 5.2 - vec2(hazeTime * 0.028, hazeTime * 0.019));
  float mistDensity = mix(0.55, 1.10, mistA * 0.65 + mistB * 0.35);

  float moonGlowProx = exp(-sq(length((surfaceUv - vec2(0.61, 0.82)) * vec2(uPlateAspect, 1.0))) * 4.5);
  vec3 hazeColor = vec3(0.018, 0.003, 0.005)
    + vec3(0.12, 0.012, 0.015) * moonGlowProx
    + vec3(0.10, 0.012, 0.008) * lanternHalo * lanternBoot;

  float hazeAmount = clamp(expFog * mistDensity * 0.045 * smoothstep(0.32, 0.95, dist), 0.0, 0.085);
  color = mix(color, color + hazeColor * 0.22, hazeAmount);
  color = mix(color, hazeColor * 0.95, expFog * mistA * 0.024 * windowMask);

  // =========================================================================
  // 10. Laptop Screen Scanlines (Driven by fx.a & fx.r)
  // =========================================================================
  if (laptopMask > 0.004) {
    float laptopBoot = ballastIgnition(uIntroTime, 0.30, 0.55, 6.2);
    // Align scanlines to the tilted laptop display perspective
    vec2 screenCoord = vec2(surfaceUv.x + surfaceUv.y * 0.14, surfaceUv.y - surfaceUv.x * 0.16);

    float scanline = 0.86 + 0.14 * sin(screenCoord.y * 620.0 + uTime * 3.2 * motionScale);
    float fineGrid = 0.95 + 0.05 * sin(screenCoord.x * 780.0);

    // Slow tactical radar sweep bar rolling top-to-bottom down the map
    float sweepPhase = fract(screenCoord.y * 3.4 + uTime * 0.24 * motionScale);
    float radarBar = exp(-sq(sweepPhase - 0.5) * 140.0);
    float screenFlicker = 0.97 + 0.03 * sin(uTime * 37.0) * sin(uTime * 11.0);

    vec3 laptopCol = color * mix(0.10, scanline * fineGrid * screenFlicker, clamp(laptopBoot, 0.0, 1.0));
    // Boost glowing red tactical map regions (fx.r) into linear HDR + add CRT sweep line
    laptopCol += vec3(2.1, 0.22, 0.22) * (radarBar * 0.42 + fx.r * 0.55 * (0.7 + 0.3 * sin(uTime * 3.1))) * laptopBoot;
    color = mix(color, laptopCol, laptopMask);
  }

  // =========================================================================
  // 11. Red Glints in the Operator and Husky Eyes
  // =========================================================================
  float eyeDepthGate = smoothstep(0.135, 0.175, surfaceDepth) * (1.0 - smoothstep(0.255, 0.305, surfaceDepth));
  if (eyeDepthGate > 0.004) {
    float opPulse = 0.5 + 0.5 * sin(uTime * 1.65);
    float huPulse = 0.5 + 0.5 * sin(uTime * 1.65 + 1.85);
    // Subtle extra predatory glint when cursor approaches their gaze
    float mouseNearOp = exp(-sq(length((mousePlateUv - vec2(0.496, 0.692)) * vec2(uPlateAspect, 1.0))) * 6.5) * uMouseActivity;
    float mouseNearHu = exp(-sq(length((mousePlateUv - vec2(0.712, 0.472)) * vec2(uPlateAspect, 1.0))) * 6.5) * uMouseActivity;

    vec2 eyeCamShift = uCamOffset * vec2(0.0011, 0.0009);
    float eyeIntro = smoothstep(0.20, 0.80, uIntroTime);

    vec3 opEye1 = computeEyeGlint(
      surfaceUv,
      vec2(0.4964, 0.6924),
      vec2(0.4956, 0.6942),
      0.0052,
      clamp(opPulse + mouseNearOp * 0.65, 0.0, 1.25),
      eyeCamShift,
      0.55
    );
    vec3 opEye2 = computeEyeGlint(
      surfaceUv,
      vec2(0.5212, 0.6674),
      vec2(0.5208, 0.6684),
      0.0040,
      clamp(opPulse + mouseNearOp * 0.55, 0.0, 1.25),
      eyeCamShift,
      0.26
    );
    vec3 huEye = computeEyeGlint(
      surfaceUv,
      vec2(0.7125, 0.4716),
      vec2(0.7115, 0.4769),
      0.0050,
      clamp(huPulse + mouseNearHu * 0.65, 0.0, 1.25),
      eyeCamShift,
      0.62
    );

    color += (opEye1 + opEye2 + huEye) * eyeDepthGate * eyeIntro;
  }

  // =========================================================================
  // 12. Interactive Mouse Red Rim Light (Driven by normals.png & depth)
  // =========================================================================
  float roomSurfaceMask = smoothstep(0.035, 0.095, surfaceDepth);
  vec3 fragPos = vec3((surfaceUv - 0.5) * vec2(uPlateAspect, 1.0), surfaceDepth * 0.44);
  vec3 lightPos = vec3((mousePlateUv - 0.5) * vec2(uPlateAspect, 1.0), 0.54);
  vec3 toLight = lightPos - fragPos;
  float lightDist = length(toLight);
  vec3 L = toLight / max(lightDist, 1e-4);
  vec3 V = normalize(vec3(uCamOffset * 0.24, 1.0));
  vec3 H = normalize(L + V);

  float att = 1.0 / (1.0 + lightDist * lightDist * 5.2);
  float ndotl = dot(N, L);
  float fresnel = pow(max(1.0 - clamp(dot(N, V), 0.0, 1.0), 1e-4), 2.6);
  // Edge-only crimson silhouette rim (zero diffuse red wash on true blacks or white husky fur)
  float rim = fresnel * smoothstep(0.05, 0.90, ndotl);
  float rimSpec = pow(max(dot(N, H), 1e-4), 26.0) * (0.35 + 0.75 * goldMask);
  float darkGuard = smoothstep(0.04, 0.20, luma);

  float rimStrength = mix(0.12, 0.65, uMouseActivity) * smoothstep(0.20, 0.80, uIntroTime);
  vec3 rimColor = vec3(1.0, 0.08, 0.08) * (rim * 0.52)
    + vec3(1.0, 0.42, 0.32) * rimSpec * 0.30;
  color += rimColor * att * roomSurfaceMask * darkGuard * rimStrength;

  // =========================================================================
  // 13. Opening Fade from Black -> Output Pure Linear HDR + POM Surface Depth
  //     (Bokeh DoF -> UnrealBloom -> Final ACES/Streaks/CA/Grain/Vignette/Letterbox run next)
  // =========================================================================
  color *= introFade;
  gl_FragColor = vec4(clamp(color, vec3(0.0), vec3(8.0)), clamp(surfaceDepth, 0.0, 1.0));
}
`;

function getDeviceOrientationCtor():
  | (typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> })
  | null {
  if (typeof window === "undefined" || !("DeviceOrientationEvent" in window)) {
    return null;
  }
  return window.DeviceOrientationEvent as typeof DeviceOrientationEvent & {
    requestPermission?: () => Promise<"granted" | "denied">;
  };
}

function loadTexture(
  loader: THREE.TextureLoader,
  url: string,
  configure: (tex: THREE.Texture) => void,
): Promise<THREE.Texture> {
  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (tex) => {
        configure(tex);
        resolve(tex);
      },
      undefined,
      () => reject(new Error(`Failed to load cinematic texture: ${url}`)),
    );
  });
}

function createPlaceholderTexture(r: number, g: number, b: number, a: number): THREE.DataTexture {
  const tex = new THREE.DataTexture(new Uint8Array([r, g, b, a]), 1, 1, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.needsUpdate = true;
  return tex;
}

export function CinematicWarRoom({
  className,
  style,
  paused = false,
  plateQuality = "auto",
  parallaxStrength = 1.0,
  focusDepth = DEFAULT_FOCUS_DEPTH,
  focusBand = DEFAULT_FOCUS_BAND,
  dofStrength = 0.44,
  lanternBright = true,
  letterbox = true,
  onCameraFrame,
  onTelemetry,
  onReady,
  onProgress,
  onError,
}: CinematicWarRoomProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const pausedRef = useRef(paused);
  const parallaxStrengthRef = useRef(parallaxStrength);
  const focusDepthRef = useRef(focusDepth);
  const focusBandRef = useRef(focusBand);
  const dofStrengthRef = useRef(dofStrength);
  const lanternBrightRef = useRef(lanternBright);
  const letterboxRef = useRef(letterbox);
  const onCameraFrameRef = useRef(onCameraFrame);
  const onTelemetryRef = useRef(onTelemetry);
  const onReadyRef = useRef(onReady);
  const onProgressRef = useRef(onProgress);
  const onErrorRef = useRef(onError);

  pausedRef.current = paused;
  parallaxStrengthRef.current = parallaxStrength;
  focusDepthRef.current = focusDepth;
  focusBandRef.current = focusBand;
  dofStrengthRef.current = dofStrength;
  lanternBrightRef.current = lanternBright;
  letterboxRef.current = letterbox;
  onCameraFrameRef.current = onCameraFrame;
  onTelemetryRef.current = onTelemetry;
  onReadyRef.current = onReady;
  onProgressRef.current = onProgress;
  onErrorRef.current = onError;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const params = new URLSearchParams(window.location.search);
    if (params.has("fallback") || params.has("nowebgl")) {
      onErrorRef.current?.(new Error("WebGL fallback requested"));
      return;
    }

    let disposed = false;
    let rafId = 0;
    let contextLost = false;
    let ready = false;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: false,
        depth: false,
        stencil: false,
        powerPreference: "high-performance",
      });
    } catch (err) {
      onErrorRef.current?.(err instanceof Error ? err : new Error("WebGL unavailable"));
      return;
    }

    const maxTexSize = renderer.capabilities.maxTextureSize;
    const deviceQuality = selectPlateQuality(maxTexSize);
    const scaler = new AdaptiveRenderScaler(
      deviceQuality.initialScale,
      deviceQuality.minScale,
      deviceQuality.maxScale,
    );

    // Disable renderer toneMapping so our FinalCinematicGradePass applies ACES once at the end
    renderer.toneMapping = THREE.NoToneMapping;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(scaler.getScale());
    renderer.setClearColor(0x000000, 1);

    const canvas = renderer.domElement;
    canvas.style.display = "block";
    canvas.style.width = "100%";
    canvas.style.height = "100%";
    canvas.style.touchAction = "pan-y";
    container.appendChild(canvas);

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);

    // Pass 1 HDR target: linear HDR RGB + POM-warped surfaceDepth in Alpha
    const sceneTarget = new THREE.WebGLRenderTarget(1, 1, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    sceneTarget.texture.colorSpace = THREE.NoColorSpace;
    sceneTarget.texture.generateMipmaps = false;

    // Pass 1B HDR target: depth-occluded 3D dust & glowing ember particles (RGB = HDR, A = particle depth)
    const particleTarget = new THREE.WebGLRenderTarget(1, 1, {
      format: THREE.RGBAFormat,
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    particleTarget.texture.colorSpace = THREE.NoColorSpace;
    particleTarget.texture.generateMipmaps = false;

    const particleSystem = createPomDepthDustAndEmberSystem(deviceQuality.isMobile);

    // 1x1 placeholders until plate & maps finish loading
    const placeholderPlate = createPlaceholderTexture(0, 0, 0, 255);
    const placeholderDepth = createPlaceholderTexture(72, 72, 72, 255);
    const placeholderNormals = createPlaceholderTexture(128, 128, 255, 255);
    const placeholderFx = createPlaceholderTexture(0, 0, 0, 0);

    const forceReducedMotion = params.has("rm") || params.get("reducedMotion") === "1";
    const reducedMotionQuery =
      typeof window.matchMedia === "function"
        ? window.matchMedia("(prefers-reduced-motion: reduce)")
        : null;
    let reducedMotion = forceReducedMotion || (reducedMotionQuery?.matches ?? false);

    const uniforms = {
      uPlate: { value: placeholderPlate as THREE.Texture },
      uDepth: { value: placeholderDepth as THREE.Texture },
      uNormals: { value: placeholderNormals as THREE.Texture },
      uFx: { value: placeholderFx as THREE.Texture },
      uTime: { value: 0 },
      uIntroTime: { value: reducedMotion ? 10 : 0 },
      uViewportAspect: { value: PLATE_ASPECT },
      uPlateAspect: { value: PLATE_ASPECT },
      uParallaxStrength: { value: parallaxStrengthRef.current },
      uReducedMotion: { value: reducedMotion ? 1.0 : 0.0 },
      uLanternBright: { value: lanternBrightRef.current ? 1.0 : 0.0 },
      uCamOffset: { value: new THREE.Vector2(0, 0) },
      uCamVelocity: { value: new THREE.Vector2(0, 0) },
      uMouseScreenUv: { value: new THREE.Vector2(0.5, 0.5) },
      uMouseActivity: { value: 0 },
    };

    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      uniforms,
      depthTest: false,
      depthWrite: false,
    });

    const quad = new THREE.Mesh(geometry, material);
    quad.frustumCulled = false;
    scene.add(quad);

    // -----------------------------------------------------------------------
    // Post-Processing Chain (EffectComposer in Linear HDR HalfFloat):
    //   1. AlphaDepthBokehPass (Golden-angle bokeh DoF + depth-occluded 3D particles)
    //   2. UnrealBloomPass (Selective bloom on linear HDR emissive areas)
    //   3. FinalCinematicGradePass (Chromatic aberration + Horizontal lens streaks +
    //      ACES Filmic tone mapping + sRGB + Vignette + Film grain + Letterbox bars)
    // -----------------------------------------------------------------------
    const composerTarget = new THREE.WebGLRenderTarget(1, 1, {
      type: THREE.HalfFloatType,
      minFilter: THREE.LinearFilter,
      magFilter: THREE.LinearFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    composerTarget.texture.generateMipmaps = false;

    const composer = new EffectComposer(renderer, composerTarget);
    const bokehPass = new AlphaDepthBokehPass(
      () => sceneTarget.texture,
      () => particleTarget.texture,
      1,
      1,
    );
    composer.addPass(bokehPass);

    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(1, 1),
      0.14,
      0.30,
      1.12,
    );
    composer.addPass(bloomPass);

    const gradePass = new ShaderPass(
      createFinalGradeShader({
        exposure: 1.12,
        streakThreshold: 1.38,
        streakStrength: 0.10,
        streakSpread: 0.011,
        chromaticAberration: 0.0014,
        grainStrength: 0.010,
        vignetteStrength: 0.16,
        letterbox: computeResponsiveLetterbox(
          Math.max(container.clientWidth, 1),
          Math.max(container.clientHeight, 1),
          letterboxRef.current,
        ),
        saturation: 1.05,
        contrast: 1.03,
        blackPoint: 0.005,
        redRichness: 0.04,
      }),
    );
    composer.addPass(gradePass);

    // -----------------------------------------------------------------------
    // Sizing (synced cleanly with AdaptiveRenderScaler!)
    // -----------------------------------------------------------------------
    let viewW = Math.max(container.clientWidth, 1);
    let viewH = Math.max(container.clientHeight, 1);
    let pixelW = 1;
    let pixelH = 1;

    const syncSize = () => {
      viewW = Math.max(container.clientWidth, 1);
      viewH = Math.max(container.clientHeight, 1);
      const scale = scaler.getScale();
      renderer.setPixelRatio(scale);
      renderer.setSize(viewW, viewH, false);
      pixelW = Math.max(1, Math.round(viewW * scale));
      pixelH = Math.max(1, Math.round(viewH * scale));
      sceneTarget.setSize(pixelW, pixelH);
      particleTarget.setSize(pixelW, pixelH);
      composer.setPixelRatio(scale);
      composer.setSize(viewW, viewH);
      uniforms.uViewportAspect.value = viewW / viewH;
      gradePass.uniforms.uResolution.value.set(pixelW, pixelH);
    };
    syncSize();

    const resizeObserver =
      typeof ResizeObserver !== "undefined" ? new ResizeObserver(syncSize) : null;
    resizeObserver?.observe(container);
    window.addEventListener("resize", syncSize, { passive: true });

    // -----------------------------------------------------------------------
    // Spring-Damped Camera & Pointer / Gyro Input State
    // -----------------------------------------------------------------------
    const pointerTarget = { x: 0, y: 0 };
    const mouseUvTarget = { x: 0.5, y: 0.5 };
    const gyroTarget = { x: 0, y: 0 };
    let gyroActive = false;
    let gyroBaseBeta: number | null = null;
    let gyroBaseGamma: number | null = null;
    let pointerEngaged = false;
    let lastPointerMoveAt = -10;

    // Second-order spring state for camera offset & rim-light pointer
    const camPos = { x: 0, y: 0 };
    const camVel = { x: 0, y: 0 };
    const rimPos = { x: 0.5, y: 0.5 };
    const rimVel = { x: 0, y: 0 };
    let mouseActivity = 0;

    const onPointerMove = (e: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const nx = THREE.MathUtils.clamp((e.clientX - rect.left) / rect.width, 0, 1);
      const ny = THREE.MathUtils.clamp(1 - (e.clientY - rect.top) / rect.height, 0, 1);
      pointerTarget.x = nx * 2 - 1;
      pointerTarget.y = ny * 2 - 1;
      mouseUvTarget.x = nx;
      mouseUvTarget.y = ny;
      pointerEngaged = true;
      lastPointerMoveAt = elapsedTime;
    };

    const onPointerLeave = () => {
      pointerEngaged = false;
      pointerTarget.x = 0;
      pointerTarget.y = 0;
    };

    const onDeviceOrientation = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      if (gyroBaseBeta === null || gyroBaseGamma === null) {
        gyroBaseBeta = e.beta;
        gyroBaseGamma = e.gamma;
      }
      const dGamma = THREE.MathUtils.clamp((e.gamma - gyroBaseGamma) / 24, -1, 1);
      const dBeta = THREE.MathUtils.clamp((e.beta - gyroBaseBeta) / 22, -1, 1);
      gyroTarget.x = dGamma;
      gyroTarget.y = -dBeta;
      gyroActive = true;
    };

    let gyroListenerAttached = false;
    let gyroPermissionRequested = false;

    const attachGyro = () => {
      if (gyroListenerAttached || disposed) return;
      window.addEventListener("deviceorientation", onDeviceOrientation, { passive: true });
      gyroListenerAttached = true;
    };

    const DeviceOrientationCtor = getDeviceOrientationCtor();
    if (DeviceOrientationCtor) {
      if (typeof DeviceOrientationCtor.requestPermission !== "function") {
        attachGyro();
      }
    }

    const onFirstUserGesture = () => {
      if (gyroPermissionRequested || gyroListenerAttached) return;
      const ctor = getDeviceOrientationCtor();
      if (ctor && typeof ctor.requestPermission === "function") {
        gyroPermissionRequested = true;
        ctor
          .requestPermission()
          .then((state) => {
            if (state === "granted") attachGyro();
          })
          .catch(() => {
            // Permission declined or unavailable; keep pointer-only control.
          });
      }
    };

    const onReducedMotionChange = (e: MediaQueryListEvent) => {
      reducedMotion = forceReducedMotion || e.matches;
      uniforms.uReducedMotion.value = reducedMotion ? 1.0 : 0.0;
      bokehPass.uniforms.uReducedMotion.value = reducedMotion ? 1.0 : 0.0;
      gradePass.uniforms.uReducedMotion.value = reducedMotion ? 1.0 : 0.0;
    };

    const onContextLost = (e: Event) => {
      e.preventDefault();
      contextLost = true;
      onErrorRef.current?.(new Error("WebGL context lost"));
    };
    const onContextRestored = () => {
      contextLost = false;
      syncSize();
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerleave", onPointerLeave, { passive: true });
    window.addEventListener("blur", onPointerLeave);
    window.addEventListener("pointerdown", onFirstUserGesture, { passive: true, once: true });
    reducedMotionQuery?.addEventListener("change", onReducedMotionChange);
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);

    // -----------------------------------------------------------------------
    // Texture Loading (2K plate on mobile or low DPR, 4K plate on HiDPI desktop)
    // -----------------------------------------------------------------------
    const loadedTextures: THREE.Texture[] = [];
    const loader = new THREE.TextureLoader();
    const maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    const chosenTier: PlateTier =
      plateQuality === "4k"
        ? "4k"
        : plateQuality === "2k"
          ? "2k"
          : deviceQuality.tier;
    const prefer4k = chosenTier === "4k" && maxTexSize >= 4096;
    const activeTier: PlateTier = prefer4k ? "4k" : "2k";

    let completedCount = 0;
    const totalAssets = 4;
    const markAssetLoaded = () => {
      completedCount += 1;
      onProgressRef.current?.(Math.min(completedCount / totalAssets, 1));
    };

    const configurePlate = (tex: THREE.Texture) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.minFilter = THREE.LinearMipmapLinearFilter;
      tex.magFilter = THREE.LinearFilter;
      tex.anisotropy = maxAniso;
      tex.needsUpdate = true;
    };

    const configureDataMap = (tex: THREE.Texture, isFx = false) => {
      tex.colorSpace = THREE.NoColorSpace;
      tex.wrapS = THREE.ClampToEdgeWrapping;
      tex.wrapT = THREE.ClampToEdgeWrapping;
      tex.generateMipmaps = false;
      tex.minFilter = THREE.LinearFilter;
      tex.magFilter = THREE.LinearFilter;
      if (isFx) {
        tex.premultiplyAlpha = false;
      }
      tex.needsUpdate = true;
    };

    const loadPlate = async (): Promise<THREE.Texture> => {
      const primary = prefer4k ? "/cinematic/painting-4k.jpg" : "/cinematic/painting-2k.jpg";
      const fallback = "/cinematic/painting-2k.jpg";
      try {
        return await loadTexture(loader, primary, configurePlate);
      } catch (err) {
        if (primary !== fallback) {
          return await loadTexture(loader, fallback, configurePlate);
        }
        throw err;
      }
    };

    Promise.all([
      loadPlate().then((tex) => {
        markAssetLoaded();
        return tex;
      }),
      loadTexture(loader, "/cinematic/depth.png", (t) => configureDataMap(t, false)).then((tex) => {
        markAssetLoaded();
        return tex;
      }),
      loadTexture(loader, "/cinematic/normals.png", (t) => configureDataMap(t, false)).then((tex) => {
        markAssetLoaded();
        return tex;
      }),
      loadTexture(loader, "/cinematic/fx.png", (t) => configureDataMap(t, true)).then((tex) => {
        markAssetLoaded();
        return tex;
      }),
    ])
      .then(([plateTex, depthTex, normalsTex, fxTex]) => {
        if (disposed) {
          plateTex.dispose();
          depthTex.dispose();
          normalsTex.dispose();
          fxTex.dispose();
          return;
        }
        loadedTextures.push(plateTex, depthTex, normalsTex, fxTex);
        uniforms.uPlate.value = plateTex;
        uniforms.uDepth.value = depthTex;
        uniforms.uNormals.value = normalsTex;
        uniforms.uFx.value = fxTex;

        const img = plateTex.image as { width?: number; height?: number } | undefined;
        if (img?.width && img?.height) {
          uniforms.uPlateAspect.value = img.width / img.height;
        }

        ready = true;
        readyAtMs = performance.now();
        container.dataset.ready = "true";
        container.dataset.plateTier = activeTier;
        onReadyRef.current?.();
      })
      .catch((err) => {
        if (!disposed) {
          onErrorRef.current?.(err instanceof Error ? err : new Error(String(err)));
        }
      });

    // -----------------------------------------------------------------------
    // Main Render, Adaptive 60 FPS Scaling & Spring Integration Loop
    // -----------------------------------------------------------------------
    let lastTimestamp = performance.now();
    let readyAtMs = -1;
    let elapsedTime = 0;
    let introTime = reducedMotion ? 10 : 0;
    let curFocusDepth = focusDepthRef.current;
    let curFocusBand = focusBandRef.current;
    let curDofStrength = dofStrengthRef.current;
    let curLanternBright = lanternBrightRef.current ? 1 : 0;
    let curLetterbox = computeResponsiveLetterbox(viewW, viewH, letterboxRef.current);
    let lastTelemetryAt = -1;
    const clearBlack = new THREE.Color(0x000000);

    const tick = (now: number) => {
      if (disposed) return;
      rafId = window.requestAnimationFrame(tick);

      const rawDt = (now - lastTimestamp) * 0.001;
      lastTimestamp = now;
      if (pausedRef.current || document.hidden || contextLost) return;

      const dt = Math.min(Math.max(rawDt, 0.0005), 0.05);
      if (!reducedMotion) {
        elapsedTime += dt;
        if (ready && readyAtMs >= 0) {
          introTime = Math.max(introTime + dt, (now - readyAtMs) * 0.001);
        }
      } else if (ready) {
        introTime = 10;
      }

      // Adaptive render scale controller targeting 60 fps
      const perf = scaler.sample(rawDt);
      if (perf.changed) {
        syncSize();
      }

      const motionScale = reducedMotion ? 0.0 : 1.0;

      // Slow organic multi-harmonic idle camera drift (zeroed under reduced motion)
      const driftX =
        (Math.sin(elapsedTime * 0.23) * 0.095 + Math.sin(elapsedTime * 0.41 + 1.3) * 0.045) *
        motionScale;
      const driftY =
        (Math.cos(elapsedTime * 0.19 + 0.5) * 0.065 + Math.sin(elapsedTime * 0.33 + 2.4) * 0.035) *
        motionScale;

      const inputX = THREE.MathUtils.clamp(
        pointerTarget.x * 0.88 + (gyroActive ? gyroTarget.x * 0.9 : 0),
        -1,
        1,
      );
      const inputY = THREE.MathUtils.clamp(
        pointerTarget.y * 0.82 + (gyroActive ? gyroTarget.y * 0.85 : 0),
        -1,
        1,
      );

      const controlRamp = THREE.MathUtils.smoothstep(introTime, 0.3, 2.2);
      const targetX = (inputX * controlRamp + driftX) * motionScale;
      const targetY = (inputY * controlRamp + driftY) * motionScale;

      if (reducedMotion) {
        camPos.x = 0;
        camPos.y = 0;
        camVel.x = 0;
        camVel.y = 0;
      } else {
        const camStiffness = 28.0;
        const camDamping = 9.4;
        const ax = (targetX - camPos.x) * camStiffness - camVel.x * camDamping;
        const ay = (targetY - camPos.y) * camStiffness - camVel.y * camDamping;
        camVel.x += ax * dt;
        camVel.y += ay * dt;
        camPos.x += camVel.x * dt;
        camPos.y += camVel.y * dt;
      }

      const pointerFresh = pointerEngaged && elapsedTime - lastPointerMoveAt < 5.0;
      const desiredRimX = pointerFresh
        ? mouseUvTarget.x
        : 0.5 + Math.sin(elapsedTime * 0.37) * 0.18 * motionScale;
      const desiredRimY = pointerFresh
        ? mouseUvTarget.y
        : 0.52 + Math.cos(elapsedTime * 0.29) * 0.12 * motionScale;

      if (reducedMotion) {
        rimPos.x = desiredRimX;
        rimPos.y = desiredRimY;
        rimVel.x = 0;
        rimVel.y = 0;
      } else {
        const rimStiffness = 62.0;
        const rimDamping = 14.5;
        rimVel.x += ((desiredRimX - rimPos.x) * rimStiffness - rimVel.x * rimDamping) * dt;
        rimVel.y += ((desiredRimY - rimPos.y) * rimStiffness - rimVel.y * rimDamping) * dt;
        rimPos.x += rimVel.x * dt;
        rimPos.y += rimVel.y * dt;
      }

      const targetActivity = pointerFresh ? 1.0 : 0.0;
      mouseActivity += (targetActivity - mouseActivity) * (reducedMotion ? 1 : Math.min(1, dt * 3.5));

      // Smoothly rack optical Depth of Field focus, letterbox & lantern brightness
      const dofLerp = reducedMotion ? 1.0 : 1.0 - Math.exp(-8.5 * dt);
      curFocusDepth += (focusDepthRef.current - curFocusDepth) * dofLerp;
      curFocusBand += (focusBandRef.current - curFocusBand) * dofLerp;
      curDofStrength += (dofStrengthRef.current - curDofStrength) * dofLerp;
      const goalLantern = lanternBrightRef.current ? 1.0 : 0.0;
      curLanternBright += (goalLantern - curLanternBright) * dofLerp;
      const goalLetterbox = computeResponsiveLetterbox(viewW, viewH, letterboxRef.current);
      curLetterbox += (goalLetterbox - curLetterbox) * dofLerp;

      // Shared camera frame values (used identically by POM painting, 3D particles & SVG overlays)
      const introFade = reducedMotion ? 1.0 : THREE.MathUtils.smoothstep(introTime, 0.0, 0.55);
      const dollyProgress = Math.min(1, Math.max(0, introTime / 1.8));
      const dollyInv = 1 - dollyProgress;
      const dollyEase = 1 - dollyInv * dollyInv * dollyInv * dollyInv;
      const idleZoomBreath = Math.sin(elapsedTime * 0.37) * 0.003 * motionScale;
      const zoom = reducedMotion
        ? 1.0
        : 1.012 + (1.032 - 1.012) * dollyEase + idleZoomBreath;
      const dollyShiftY = reducedMotion ? 0.0 : (1 - dollyEase) * -0.007;
      const roll = reducedMotion
        ? 0.0
        : THREE.MathUtils.clamp(-camVel.x * 0.0035, -0.0055, 0.0055);
      const pStrength = reducedMotion ? 0.0 : parallaxStrengthRef.current;
      const rayDeltaX = camPos.x * 0.024 * pStrength;
      const rayDeltaY = camPos.y * 0.016 * pStrength;

      // Push Pass 1 POM painting uniforms
      uniforms.uTime.value = elapsedTime;
      uniforms.uIntroTime.value = introTime;
      uniforms.uParallaxStrength.value = pStrength;
      uniforms.uReducedMotion.value = reducedMotion ? 1.0 : 0.0;
      uniforms.uLanternBright.value = curLanternBright;
      uniforms.uCamOffset.value.set(camPos.x, camPos.y);
      uniforms.uCamVelocity.value.set(camVel.x, camVel.y);
      uniforms.uMouseScreenUv.value.set(rimPos.x, rimPos.y);
      uniforms.uMouseActivity.value = mouseActivity;

      // Pass 1 -> sceneTarget (Linear HDR RGB + POM surfaceDepth in Alpha)
      renderer.setRenderTarget(sceneTarget);
      renderer.render(scene, camera);

      // Pass 1B -> particleTarget (3D dust & HDR embers hidden cleanly behind nearer objects using sceneTarget.a)
      particleSystem.update({
        elapsedTime,
        introFade,
        reducedMotion: reducedMotion ? 1.0 : 0.0,
        lanternBright: curLanternBright,
        zoom,
        dollyShiftY,
        roll,
        rayDeltaX,
        rayDeltaY,
        viewportAspect: uniforms.uViewportAspect.value,
        plateAspect: uniforms.uPlateAspect.value,
        pixelWidth: pixelW,
        pixelHeight: pixelH,
        pixelRatio: scaler.getScale(),
        sceneDepthTex: sceneTarget.texture,
      });
      renderer.setRenderTarget(particleTarget);
      renderer.setClearColor(clearBlack, 0);
      renderer.clear(true, false, false);
      renderer.render(particleSystem.scene, particleSystem.camera);
      renderer.setClearColor(clearBlack, 1);

      // Push Pass 2 (Golden-Angle Bokeh DoF) & Pass 4 (Final Grade) uniforms
      bokehPass.uniforms.uFocusDepth.value = curFocusDepth;
      bokehPass.uniforms.uFocusBand.value = curFocusBand;
      bokehPass.uniforms.uAperture.value = curDofStrength;
      bokehPass.uniforms.uTime.value = elapsedTime;
      bokehPass.uniforms.uReducedMotion.value = reducedMotion ? 1.0 : 0.0;

      gradePass.uniforms.uTime.value = elapsedTime;
      gradePass.uniforms.uReducedMotion.value = reducedMotion ? 1.0 : 0.0;
      gradePass.uniforms.uLetterbox.value = curLetterbox;

      // Execute full post-processing chain: Golden-Angle Bokeh DoF -> UnrealBloom -> Final ACES Grade
      composer.render(dt);

      // Report exact frame camera transform to keep SVG hotspot overlays sub-pixel locked
      if (onCameraFrameRef.current) {
        onCameraFrameRef.current({
          zoom,
          dollyShiftX: 0,
          dollyShiftY,
          roll,
          rayDeltaX,
          rayDeltaY,
          viewportAspect: uniforms.uViewportAspect.value,
          plateAspect: uniforms.uPlateAspect.value,
          viewW,
          viewH,
          focusDepth: curFocusDepth,
        });
      }

      // Throttled telemetry (~4 Hz)
      if (onTelemetryRef.current && elapsedTime - lastTelemetryAt > 0.25) {
        lastTelemetryAt = elapsedTime;
        onTelemetryRef.current({
          fps: perf.fps,
          scale: perf.scale,
          plateTier: activeTier,
        });
      }
    };

    rafId = window.requestAnimationFrame(tick);

    return () => {
      disposed = true;
      window.cancelAnimationFrame(rafId);
      resizeObserver?.disconnect();
      window.removeEventListener("resize", syncSize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerleave", onPointerLeave);
      window.removeEventListener("blur", onPointerLeave);
      window.removeEventListener("pointerdown", onFirstUserGesture);
      if (gyroListenerAttached) {
        window.removeEventListener("deviceorientation", onDeviceOrientation);
      }
      reducedMotionQuery?.removeEventListener("change", onReducedMotionChange);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      canvas.removeEventListener("webglcontextrestored", onContextRestored);

      for (const tex of loadedTextures) {
        tex.dispose();
      }
      placeholderPlate.dispose();
      placeholderDepth.dispose();
      placeholderNormals.dispose();
      placeholderFx.dispose();
      particleSystem.dispose();
      sceneTarget.dispose();
      particleTarget.dispose();
      bokehPass.dispose();
      bloomPass.dispose();
      gradePass.dispose();
      composer.dispose();
      geometry.dispose();
      material.dispose();
      renderer.dispose();

      if (canvas.parentNode === container) {
        container.removeChild(canvas);
      }
      delete container.dataset.ready;
      delete container.dataset.plateTier;
    };
  }, [plateQuality]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        backgroundColor: "#000000",
        ...style,
      }}
    />
  );
}

export default CinematicWarRoom;
