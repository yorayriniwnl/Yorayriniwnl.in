// War room built from the painting itself: the image on a depth-displaced
// plane (depth from art/depth.py), a scroll-driven camera and shader effects
// for rain, neon, gold, eyes and lantern. Served at /warroom.html.
import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

const IMG_W = 1672, IMG_H = 941, IA = IMG_W / IMG_H;
const px = (x, y) => new THREE.Vector2(x / IMG_W, 1 - y / IMG_H); // painting pixels -> uv

// Camera shots, in painting pixels: centre and zoom (1 = whole frame).
const SHOTS = {
  hero: { c: [836, 470], z: 1.0, pz: 1.0, pc: [800, 470] },
  dossier: { c: [320, 175], z: 2.1, pz: 1.35, pc: [330, 200] },
  arsenal: { c: [1440, 230], z: 1.8, pz: 1.3, pc: [1560, 260] },
  operations: { c: [1360, 640], z: 1.65, pz: 1.25, pc: [1500, 650] },
  offduty: { c: [270, 780], z: 1.9, pz: 1.3, pc: [260, 760] },
  comms: { c: [830, 330], z: 2.3, pz: 1.4, pc: [835, 340] },
};

const params = new URLSearchParams(location.search);
const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || params.has("rm");
let paused = reduce;
let fxOn = true;

const canvas = document.getElementById("stage");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: params.has("capture") });
} catch (e) {
  canvas.remove();
  const f = document.createElement("div"); f.className = "fallback"; document.body.prepend(f);
  document.getElementById("loading").classList.add("done");
  throw e;
}
const dprCap = Number(params.get("dpr")) || Math.min(window.devicePixelRatio || 1, 2);
renderer.setPixelRatio(dprCap);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 20);

const loader = new THREE.TextureLoader();
const load = (u) => new Promise((res, rej) => loader.load(u, res, undefined, rej));
const [map, depth] = await Promise.all([load("/media/warroom/painting.webp"), load("/media/warroom/depth.png")]);
map.colorSpace = THREE.SRGBColorSpace;
map.anisotropy = renderer.capabilities.getMaxAnisotropy();
map.generateMipmaps = true; map.minFilter = THREE.LinearMipmapLinearFilter;
depth.colorSpace = THREE.NoColorSpace;
depth.minFilter = THREE.LinearFilter; depth.generateMipmaps = false;

// ------------------------------------------------------------------ painting
const uniforms = {
  uMap: { value: map }, uDepth: { value: depth }, uTime: { value: 0 }, uFx: { value: 1 },
  uAmp: { value: 0.22 }, uRes: { value: new THREE.Vector2(IMG_W, IMG_H) },
  uWin: { value: new THREE.Vector4(856 / IMG_W, 1 - 398 / IMG_H, 1118 / IMG_W, 1.0) },
  uEyeA: { value: px(835, 287) }, uEyeB: { value: px(878, 306) }, uEyeH: { value: px(1190, 495) },
  uMoon: { value: px(1003, 74) }, uRing: { value: px(1283, 113) },
  uLamp: { value: px(1641, 447) }, uHeli1: { value: px(990, 104) }, uHeli2: { value: px(1003, 284) },
  uLaptop: { value: new THREE.Vector4(1570 / IMG_W, 1 - 840 / IMG_H, 1672 / IMG_W, 1 - 625 / IMG_H) },
};
const vert = /* glsl */ `
  uniform sampler2D uDepth; uniform float uAmp;
  varying vec2 vUv; varying float vD;
  void main(){
    vUv = uv;
    float d = texture2D(uDepth, uv).r;
    vD = d;
    vec3 p = position;
    p.z += (d - 0.5) * uAmp;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;
const frag = /* glsl */ `
  uniform sampler2D uMap; uniform float uTime; uniform float uFx; uniform vec2 uRes; uniform vec4 uWin;
  uniform vec2 uEyeA, uEyeB, uEyeH, uMoon, uRing, uLamp, uHeli1, uHeli2; uniform vec4 uLaptop;
  varying vec2 vUv; varying float vD;
  float h1(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
    return mix(mix(h1(i), h1(i+vec2(1,0)), f.x), mix(h1(i+vec2(0,1)), h1(i+vec2(1,1)), f.x), f.y); }
  float fbm(vec2 p){ float a = .5, s = 0.; for (int i = 0; i < 4; i++){ s += a*n2(p); p *= 2.07; a *= .5; } return s; }
  vec2 toPx(vec2 uv){ return vec2(uv.x * uRes.x, (1.0 - uv.y) * uRes.y); }
  float glow(vec2 c, float r){ vec2 d = toPx(vUv) - toPx(c); return exp(-dot(d, d) / (r * r)); }

  // rain on the window glass: sliding drops plus static beads, returns uv offset
  vec3 rain(vec2 uv, float t){
    vec2 p = (uv - uWin.xy) / (uWin.zw - uWin.xy);
    vec2 g = vec2(9.0, 5.0);
    vec2 st = p * g; st.y += t * 0.18;
    vec2 id = floor(st); vec2 f = fract(st) - .5;
    float r = h1(id);
    float yy = fract(-t * (0.12 + r * 0.25) + r) - .5;
    float wob = sin(t * 2.0 + r * 30.0) * 0.05;
    vec2 dp = f - vec2((r - .5) * .6 + wob, yy * .9);
    float drop = smoothstep(.09, .0, length(dp * vec2(1.0, 1.4)));
    float trail = smoothstep(.04, .0, abs(f.x - (r - .5) * .6 - wob)) * smoothstep(-.05, .05, dp.y) * smoothstep(.45, .0, dp.y) * .5;
    vec2 st2 = p * vec2(38.0, 22.0);
    vec2 id2 = floor(st2); vec2 f2 = fract(st2) - .5;
    float r2 = h1(id2 + 7.0);
    float bead = smoothstep(.16, .0, length(f2 - (vec2(h1(id2 + 1.3), h1(id2 + 2.9)) - .5) * .6)) * step(.72, r2) * (.5 + .5 * sin(t * .7 + r2 * 40.0));
    vec2 off = dp * drop * 0.9 + (f2) * bead * 0.25;
    return vec3(off, drop + bead * .6 + trail);
  }

  void main(){
    vec2 uv = vUv;
    float inWin = step(uWin.x, uv.x) * step(uv.x, uWin.z) * step(uWin.y, uv.y);
    float t = uTime;
    vec3 rn = vec3(0.0);
    if (uFx > .5 && inWin > .5) { rn = rain(uv, t); uv += rn.xy * vec2(0.012, 0.02); }
    vec3 base = texture2D(uMap, uv).rgb;
    vec3 col = base;
    if (uFx > .5) {
      float luma = dot(base, vec3(.299, .587, .114));
      // window: glass sheen and twinkling city lights
      if (inWin > .5) {
        col += vec3(.08, .03, .03) * rn.z;
        vec2 cell = floor(toPx(vUv) / 5.0);
        float tw = step(.5, luma) * (0.75 + 0.5 * n2(cell * .37 + t * 0.6 + h1(cell) * 9.0));
        col = mix(col, col * tw, step(.5, luma) * .8);
        float streak = smoothstep(.993, 1.0, h1(vec2(floor(toPx(vUv).x / 2.0), 3.0))) * fract(toPx(vUv).y / 60.0 + t * 2.2 + h1(vec2(floor(toPx(vUv).x / 2.0), 9.0)));
        col += vec3(.25, .12, .12) * streak * .35;
      }
      // neon: strongly red, bright pixels breathe and stutter like tubes
      float red = smoothstep(.38, .78, base.r) * smoothstep(.2, .0, max(base.g, base.b) - base.r * .32);
      float stutter = step(.965, h1(vec2(floor(t * 12.0), 1.0))) * .5;
      float breathe = .55 + .25 * sin(t * 1.7) + .1 * sin(t * 5.3);
      col += base * red * (breathe - stutter) * .9;
      // gold engraving: a slow specular sweep along the rifle and the trinkets
      float gold = smoothstep(.42, .8, base.r) * smoothstep(.06, .2, base.g - base.b) * smoothstep(.28, .55, base.g);
      float s = dot(toPx(vUv), normalize(vec2(1.0, 0.62))) / uRes.x;
      float phase = fract(t * 0.11) * 1.8 - .25;
      float band = exp(-pow((s - phase) * 26.0, 2.0));
      col += vec3(1.0, .82, .55) * gold * band * .9;
      // eyes
      float blink = 1.0 - step(.97, fract(t * .14)) ;
      float eyes = (glow(uEyeA, 7.0) + glow(uEyeB, 5.0) * .7) * blink;
      col += vec3(1.0, .12, .08) * eyes * (.42 + .16 * sin(t * 2.3));
      col += vec3(1.0, .12, .08) * glow(uEyeA, 22.0) * blink * .08;
      col += vec3(1.0, .1, .06) * glow(uEyeH, 6.0) * (.45 + .15 * sin(t * 1.9 + 1.0));
      col += vec3(1.0, .1, .06) * glow(uEyeH, 20.0) * .07;
      // eclipse rings
      vec2 dm = toPx(vUv) - toPx(uMoon);
      float moon = exp(-pow((length(dm) - 52.0) / 9.0, 2.0));
      col += vec3(1.0, .1, .06) * moon * (.25 + .2 * sin(t * .8)) * inWin;
      vec2 dr = toPx(vUv) - toPx(uRing);
      float ring = exp(-pow((length(dr) - 119.0) / 6.0, 2.0));
      col += vec3(1.0, .16, .1) * ring * (.35 + .3 * sin(t * .9 + 2.0));
      // lantern flame
      float fl = .75 + .25 * n2(vec2(t * 7.0, 1.0)) + .1 * sin(t * 23.0);
      col += vec3(1.0, .35, .12) * glow(uLamp, 26.0) * fl * .5;
      col *= mix(1.0, .9 + .2 * fl, glow(uLamp, 140.0));
      // helicopter strobes
      col += vec3(1.0, .15, .1) * glow(uHeli1, 3.0) * step(.82, fract(t * .9)) * 2.0;
      col += vec3(1.0, .9, .8) * glow(uHeli2, 2.5) * step(.86, fract(t * .9 + .45)) * 2.0;
      // laptop map: scanline and pulse
      float inLap = step(uLaptop.x, vUv.x) * step(vUv.x, uLaptop.z) * step(uLaptop.y, vUv.y) * step(vUv.y, uLaptop.w);
      float scan = smoothstep(.0, .02, abs(fract(vUv.y * 60.0 - t * .8) - .5) - .45);
      col += base * inLap * red * (scan * .5 + .3 * sin(t * 3.0));
      // haze drifting through the back of the room, and shafts from the window
      vec2 q = toPx(vUv) / uRes.y;
      float haze = fbm(q * 3.0 + vec2(t * .02, t * .008));
      col += vec3(.3, .03, .035) * smoothstep(.45, .9, haze) * (1.0 - vD) * .22;
      vec2 sq = vec2(q.x * .82 + q.y * .55, q.y);
      float shaft = smoothstep(.55, .9, fbm(vec2(sq.x * 9.0 + t * .03, .5))) * smoothstep(.2, .45, q.x * 1.0 - q.y * .1) * smoothstep(1.2, .6, q.x);
      col += vec3(.35, .04, .04) * shaft * (1.0 - vD) * .12;
    }
    gl_FragColor = vec4(col, 1.0);
  }`;

const segX = innerWidth < 700 ? 256 : 420;
const plane = new THREE.Mesh(
  new THREE.PlaneGeometry(IA, 1, segX, Math.round(segX / IA)),
  new THREE.ShaderMaterial({ uniforms, vertexShader: vert, fragmentShader: frag }),
);
scene.add(plane);

// ---------------------------------------------------------------- dust motes
const DUST = innerWidth < 700 ? 260 : 600;
const dustGeo = new THREE.BufferGeometry();
const dp = new Float32Array(DUST * 3), ds = new Float32Array(DUST);
for (let i = 0; i < DUST; i++) {
  dp[i * 3] = (Math.random() - .5) * IA * 1.1;
  dp[i * 3 + 1] = (Math.random() - .5) * 1.1;
  dp[i * 3 + 2] = .05 + Math.random() * .6;
  ds[i] = Math.random();
}
dustGeo.setAttribute("position", new THREE.BufferAttribute(dp, 3));
dustGeo.setAttribute("aSeed", new THREE.BufferAttribute(ds, 1));
const dustMat = new THREE.ShaderMaterial({
  transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  uniforms: { uTime: uniforms.uTime, uScale: { value: 1 } },
  vertexShader: `uniform float uTime; uniform float uScale; attribute float aSeed; varying float vA;
    void main(){ vec3 p = position;
      p.x += sin(uTime * .15 + aSeed * 40.0) * .02; p.y += mod(uTime * .006 * (.5 + aSeed) + aSeed, 1.1) - .55 - position.y * 0.0;
      vec4 mv = modelViewMatrix * vec4(p, 1.0);
      gl_PointSize = uScale * (1.0 + aSeed * 2.0) / -mv.z;
      vA = .25 + .5 * fract(aSeed * 7.3);
      gl_Position = projectionMatrix * mv; }`,
  fragmentShader: `varying float vA; void main(){ float d = length(gl_PointCoord - .5); gl_FragColor = vec4(vec3(1.0, .55, .42) * vA * smoothstep(.5, .0, d), 1.0); }`,
});
const dust = new THREE.Points(dustGeo, dustMat);
scene.add(dust);

// --------------------------------------------------------------------- post
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), .42, .5, .86);
composer.addPass(bloom);
const grade = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uTime: uniforms.uTime, uAspect: { value: 1 } },
  vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }",
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform float uAspect; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){ vec2 c = vUv - .5; float r2 = dot(c * vec2(uAspect, 1.), c * vec2(uAspect, 1.));
      vec2 off = c * .0025 * (.3 + r2 * 2.0);
      vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      col *= mix(.55, 1.0, smoothstep(1.1, .25, r2 * 1.5));
      col += (h(vUv * 900. + fract(uTime) * 50.) - .5) * .025;
      gl_FragColor = vec4(col, 1.0); }`,
});
composer.addPass(grade);
composer.addPass(new OutputPass());

// ------------------------------------------------------------------ camera
const sections = [...document.querySelectorAll("section[data-shot]")];
let W = 1, H = 1, portrait = false;
function resize() {
  W = innerWidth; H = innerHeight; portrait = W / H < 0.9;
  renderer.setSize(W, H, false);
  composer.setPixelRatio(renderer.getPixelRatio());
  composer.setSize(W, H);
  camera.aspect = W / H; camera.updateProjectionMatrix();
  grade.uniforms.uAspect.value = W / H;
  dustMat.uniforms.uScale.value = H * renderer.getPixelRatio() * 0.0022;
}
addEventListener("resize", resize);
resize();

const ease = (x) => x * x * (3 - 2 * x);
function shotAt(i) {
  const s = SHOTS[sections[Math.max(0, Math.min(sections.length - 1, i))].dataset.shot];
  return portrait ? { c: s.pc, z: s.pz } : { c: s.c, z: s.z };
}
function scrollShot() {
  const mid = scrollY + H * .5;
  let i = 0;
  for (let k = 0; k < sections.length; k++) if (sections[k].offsetTop <= mid) i = k;
  const sec = sections[i];
  const local = (mid - sec.offsetTop) / sec.offsetHeight;
  const blend = ease(Math.min(1, Math.max(0, (local - .55) / .45)));
  const a = shotAt(i), b = shotAt(i + 1);
  return { cx: a.c[0] + (b.c[0] - a.c[0]) * blend, cy: a.c[1] + (b.c[1] - a.c[1]) * blend, z: a.z + (b.z - a.z) * blend };
}

const pointer = new THREE.Vector2(), smooth = new THREE.Vector2();
addEventListener("pointermove", (e) => { pointer.set(e.clientX / W * 2 - 1, e.clientY / H * 2 - 1); });
const cur = { cx: 836, cy: 470, z: 1 };
let first = true;

function place(t) {
  const target = scrollShot();
  const k = first ? 1 : 0.08;
  first = false;
  cur.cx += (target.cx - cur.cx) * k; cur.cy += (target.cy - cur.cy) * k; cur.z += (target.z - cur.z) * k;
  smooth.lerp(pointer, 0.06);
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const va = W / H;
  const hMax = Math.min(1, IA / va) * 0.9;           // leave room for parallax at the edges
  const vh = hMax / cur.z;
  const dist = vh / (2 * Math.tan(fov / 2));
  let x = (cur.cx / IMG_W - .5) * IA, y = (.5 - cur.cy / IMG_H);
  const mx = Math.max(0, (IA - vh * va) / 2 - .03), my = Math.max(0, (1 - vh) / 2 - .03);
  x = THREE.MathUtils.clamp(x, -mx, mx); y = THREE.MathUtils.clamp(y, -my, my);
  const drift = paused ? 0 : 1;
  const ox = (smooth.x * .03 + Math.sin(t * .13) * .012 * drift) * vh;
  const oy = (-smooth.y * .02 + Math.sin(t * .09) * .008 * drift) * vh;
  camera.position.set(x + ox, y + oy, dist + .11);
  camera.lookAt(x - ox * .4, y - oy * .4, 0);
}

// ---------------------------------------------------------------- controls
const cmp = document.getElementById("compare");
cmp.addEventListener("click", () => {
  fxOn = !fxOn; uniforms.uFx.value = fxOn ? 1 : 0;
  bloom.enabled = fxOn; dust.visible = fxOn; grade.enabled = fxOn;
  cmp.setAttribute("aria-pressed", String(!fxOn));
  cmp.textContent = fxOn ? "Show original" : "Show live";
});
const mot = document.getElementById("motion");
mot.setAttribute("aria-pressed", String(paused));
mot.textContent = paused ? "Play motion" : "Pause motion";
mot.addEventListener("click", () => {
  paused = !paused;
  mot.setAttribute("aria-pressed", String(paused));
  mot.textContent = paused ? "Play motion" : "Pause motion";
});

// -------------------------------------------------------------------- loop
let clock = 0, last = performance.now(), slow = 0;
function frame(now) {
  const dt = Math.min(.05, (now - last) / 1000); last = now;
  if (!paused) clock += dt;
  uniforms.uTime.value = clock;
  place(clock);
  composer.render();
  // drop resolution if frames are slow
  slow = dt > 1 / 40 ? slow + 1 : Math.max(0, slow - 1);
  if (slow > 90 && renderer.getPixelRatio() > 1) { renderer.setPixelRatio(Math.max(1, renderer.getPixelRatio() - .25)); resize(); slow = 0; }
  requestAnimationFrame(frame);
}
window.__room = { step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) { clock += dt; uniforms.uTime.value = clock; place(clock); composer.render(); } }, renderer };
if (!params.has("capture")) requestAnimationFrame(frame); else { place(0); composer.render(); }
document.getElementById("loading").classList.add("done");
