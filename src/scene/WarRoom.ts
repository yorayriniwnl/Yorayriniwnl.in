import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { RectAreaLightUniformsLib } from "three/examples/jsm/lights/RectAreaLightUniformsLib.js";
import { addFurShells, upgradeMaterial } from "./materials";
import { buildOutside, type Outside } from "./outside";
import { buildRoom, makeLaptopScreen, makeNotebookCover, ROOM, WINDOW } from "./room";
import { glowSprite } from "./textures";
import { SHOTS, type Shot } from "./shots";

export type Quality = "high" | "low";

export type WarRoomOptions = {
  canvas: HTMLCanvasElement;
  quality: Quality;
  reducedMotion: boolean;
  creed: readonly string[];
  skills: readonly string[];
  onProgress?: (p: number) => void;
  dpr?: number;
};

const v3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** Positions in the room (metres, Y up, camera looks toward -Z). */
const PLACE = {
  sofa: v3(0, 0, -1.15),
  operator: v3(-0.32, 0.0, -1.12),
  husky: v3(0.62, 0.45, -1.22),
  table: v3(0.0, 0, 0.1),
  laptop: v3(0.42, 0.447, 0.18),
  notebook: v3(-0.4, 0.447, 0.26),
  mug: v3(-0.66, 0.447, 0.02),
  knight: v3(-0.08, 0.447, 0.34),
  pens: v3(0.08, 0.447, 0.42),
};

/** The optimizer drops UVs from untextured meshes; rebuild a planar set from the bounds. */
function planarUV(g: THREE.BufferGeometry) {
  if (g.getAttribute("uv")) return;
  g.computeBoundingBox();
  const b = g.boundingBox!;
  const size = b.getSize(new THREE.Vector3());
  const flat = size.y < size.z && size.y < size.x;
  const pos = g.getAttribute("position");
  const uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    uv[i * 2] = (pos.getX(i) - b.min.x) / (size.x || 1);
    uv[i * 2 + 1] = flat ? (b.max.z - pos.getZ(i)) / (size.z || 1) : (pos.getY(i) - b.min.y) / (size.y || 1);
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
}

export class WarRoom {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  private composer!: EffectComposer;
  private bloom!: UnrealBloomPass;
  private grade!: ShaderPass;
  private last = 0;
  private elapsed = 0;
  private outside!: Outside;
  private neon: THREE.Mesh[] = [];
  private neonLights: THREE.PointLight[] = [];
  private operatorHead?: THREE.Object3D;
  private operatorBody?: THREE.Object3D;
  private huskyHead?: THREE.Object3D;
  private huskyTail?: THREE.Object3D;
  private headBase = new THREE.Euler();
  private huskyBase = new THREE.Euler();
  private tailBase = new THREE.Euler();
  private laptop = makeLaptopScreen();
  private dust?: THREE.Points;
  private pointer = new THREE.Vector2();
  private pointerSmooth = new THREE.Vector2();
  private progress = 0;
  private progressSmooth = 0;
  private camPos = new THREE.Vector3();
  private camTarget = new THREE.Vector3();
  private raf = 0;
  private running = false;
  private visible = true;
  private aspect = 1;
  private lastScreen = 0;
  private frameTimes: number[] = [];
  private dprScale = 1;

  constructor(private opts: WarRoomOptions) {
    const high = opts.quality === "high";
    this.renderer = new THREE.WebGLRenderer({ canvas: opts.canvas, antialias: false, powerPreference: "high-performance", stencil: false });
    this.dprScale = opts.dpr ?? Math.min(window.devicePixelRatio, high ? 1.75 : 1.25);
    this.renderer.setPixelRatio(this.dprScale);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = high;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.camera = new THREE.PerspectiveCamera(38, 1, 0.05, 400);
    this.scene.fog = new THREE.FogExp2("#070102", 0.03);
    this.scene.background = new THREE.Color("#020001");
    RectAreaLightUniformsLib.init();
  }

  async load(): Promise<void> {
    const { quality, onProgress } = this.opts;
    const high = quality === "high";
    let done = 0;
    const total = 5;
    const tick = () => onProgress?.(++done / total);

    this.buildEnvironment();
    const room = await buildRoom({ creed: this.opts.creed, skills: this.opts.skills, lowPower: !high });
    this.scene.add(room.group);
    this.neon.push(...room.neon);
    tick();

    this.outside = buildOutside({ lowPower: !high, window: WINDOW });
    this.scene.add(this.outside.group);

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    const load = (url: string) =>
      new Promise<THREE.Group>((res, rej) => loader.load(url, (g) => res(g.scene), undefined, rej)).finally(tick);
    const [operator, husky, props] = await Promise.all([load("/models/operator.glb"), load("/models/husky.glb"), load("/models/props.glb")]);

    for (const root of [operator, husky, props]) this.prepare(root);

    operator.position.copy(PLACE.operator);
    this.scene.add(operator);
    this.operatorHead = operator.getObjectByName("operator_head");
    this.operatorBody = operator.getObjectByName("operator_body");
    if (this.operatorHead) this.headBase.copy(this.operatorHead.rotation);

    husky.position.copy(PLACE.husky);
    husky.rotation.y = -0.62;
    this.scene.add(husky);
    this.huskyHead = husky.getObjectByName("husky_head");
    this.huskyTail = husky.getObjectByName("husky_tail");
    if (this.huskyHead) this.huskyBase.copy(this.huskyHead.rotation);
    if (this.huskyTail) this.tailBase.copy(this.huskyTail.rotation);
    husky.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh && (m.material as THREE.Material).name === "fur_coat") addFurShells(m, high ? 12 : 6, 0.012, 650);
    });

    const place = (name: string, pos: THREE.Vector3, rotY = 0) => {
      const o = props.getObjectByName(name);
      if (!o) return undefined;
      o.position.copy(pos);
      o.rotation.y = rotY;
      this.scene.add(o);
      return o;
    };
    place("prop_sofa", PLACE.sofa);
    place("prop_table", PLACE.table);
    place("prop_laptop", PLACE.laptop, 0.3);
    place("prop_notebook", PLACE.notebook, 0.35);
    place("prop_mug", PLACE.mug, 0.6);
    place("prop_knight", PLACE.knight, -0.35);
    place("prop_pens", PLACE.pens, 0.2);
    place("prop_crate_a", v3(-2.3, 0, -0.6), 0.25);
    place("prop_crate_b", v3(-2.25, 0.42, -0.62), 0.1);
    place("prop_crate_c", v3(2.2, 0, -0.9), -0.35);
    place("prop_helmet", v3(-2.2, 0.76, -0.6), 0.6);
    const lantern = place("prop_lantern", v3(2.15, 0.38, -0.85));
    const lantern2 = props.getObjectByName("prop_lantern")?.clone();
    if (lantern2) {
      lantern2.position.set(-1.25, 0.0, -1.5);
      lantern2.scale.setScalar(1.3);
      this.scene.add(lantern2);
    }

    // runtime-drawn surfaces
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const mat = m.material as THREE.MeshStandardMaterial;
      if (mat.name === "screen_laptop" || mat.name === "cover_notebook") planarUV(m.geometry);
      if (mat.name === "screen_laptop") {
        m.material = new THREE.MeshBasicMaterial({ map: this.laptop.tex, toneMapped: true, color: new THREE.Color(1.6, 1.6, 1.6) });
      } else if (mat.name === "cover_notebook") {
        const tex = makeNotebookCover();
        m.material = new THREE.MeshPhysicalMaterial({ map: tex, roughness: 0.6, clearcoat: 0.2 });
      }
    });

    this.addLights(lantern);
    if (high) this.addDust();
    this.buildPost();
    tick();
  }

  /** Material upgrade, shadows, frustum settings. */
  private prepare(root: THREE.Object3D) {
    const cache = new Map<THREE.Material, THREE.Material>();
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      m.castShadow = true;
      m.receiveShadow = true;
      const swap = (mat: THREE.Material) => {
        if (!cache.has(mat)) cache.set(mat, upgradeMaterial(mat as THREE.MeshStandardMaterial, this.opts.quality));
        return cache.get(mat)!;
      };
      m.material = Array.isArray(m.material) ? m.material.map(swap) : swap(m.material);
    });
  }

  private buildEnvironment() {
    // Reflections from a small virtual room: dark walls, crimson strips,
    // a warm softbox and the window glow.
    const env = new THREE.Scene();
    env.background = new THREE.Color("#030001");
    const panel = (color: string, intensity: number, w: number, h: number, pos: THREE.Vector3) => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide }));
      m.position.copy(pos);
      m.lookAt(0, 0, 0);
      env.add(m);
    };
    panel("#ff2a1a", 1.2, 4, 3, v3(0, 1, -5));
    panel("#ffc8a0", 2.0, 2, 2, v3(-4, 3, 3));
    panel("#ff1a10", 1.5, 0.3, 4, v3(4, 1, -2));
    panel("#ff1a10", 1.5, 0.3, 4, v3(-4, 1, -2));
    panel("#ffffff", 0.6, 3, 1, v3(0, 5, 2));
    const pm = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pm.fromScene(env, 0.02).texture;
    this.scene.environmentIntensity = 0.35;
    pm.dispose();
  }

  private addLights(lantern?: THREE.Object3D) {
    const high = this.opts.quality === "high";
    this.scene.add(new THREE.HemisphereLight("#3a2224", "#040203", 0.22));

    // warm key from the front-left, the only shadow caster
    const key = new THREE.SpotLight("#ffd6b8", 34, 12, 0.42, 0.85, 2);
    key.position.set(-1.6, 3.0, 1.9);
    key.target.position.set(-0.2, 1.0, -1.1);
    key.castShadow = high;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    this.scene.add(key, key.target);

    // crimson rim from the window behind the sofa
    const rim = new THREE.SpotLight("#ff2414", 16, 9, 0.6, 0.7, 2);
    rim.position.set(0.4, 2.7, -2.4);
    rim.target.position.set(-0.1, 1.0, -0.8);
    this.scene.add(rim, rim.target);
    const rim2 = new THREE.SpotLight("#ff3020", 7, 8, 0.6, 0.8, 2);
    rim2.position.set(-2.0, 2.4, -2.0);
    rim2.target.position.set(0.0, 1.0, -1.0);
    this.scene.add(rim2, rim2.target);

    const windowGlow = new THREE.RectAreaLight("#ff3a2a", 0.9, WINDOW.x1 - WINDOW.x0, WINDOW.y1 - WINDOW.y0);
    windowGlow.position.set(0, (WINDOW.y0 + WINDOW.y1) / 2, WINDOW.z + 0.05);
    windowGlow.lookAt(0, 1.2, 2);
    this.scene.add(windowGlow);

    // laptop screen spill onto the hands and jacket
    const screen = new THREE.PointLight("#ff3828", 0.25, 1.2, 2);
    screen.position.copy(PLACE.laptop).add(v3(0.05, 0.22, 0.12));
    this.scene.add(screen);

    const amber = new THREE.PointLight("#ff9a4a", 1.4, 2.5, 2);
    if (lantern) amber.position.copy(lantern.position).add(v3(0, 0.2, 0));
    this.scene.add(amber);
    const amber2 = new THREE.PointLight("#ff8a3a", 1.0, 2.5, 2);
    amber2.position.set(-1.25, 0.3, -1.5);
    this.scene.add(amber2);

    // neon spill (flickers with the strips)
    for (const pos of [v3(-1.45, 2.0, -1.8), v3(1.45, 2.0, -1.8), v3(3.1, 1.6, -1.6), v3(-2.45, 1.2, -1.7)]) {
      const p = new THREE.PointLight("#ff1e14", high ? 0.9 : 0.7, 2.6, 2);
      p.position.copy(pos);
      this.scene.add(p);
      this.neonLights.push(p);
    }

    // tight warm spot on the operator's face and hands, like the painting
    const face = new THREE.SpotLight("#ffb48c", 7, 5, 0.16, 0.7, 2);
    face.position.set(0.7, 1.9, 0.7);
    face.target.position.set(-0.3, 1.12, -1.15);
    this.scene.add(face, face.target);

    // front fill so the faces read on dark screens
    const fill = new THREE.PointLight("#ffc2aa", 2.4, 6, 2);
    fill.position.set(0.8, 1.4, 1.8);
    this.scene.add(fill);
  }

  private addDust() {
    const n = 600;
    const pos = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 6;
      pos[i * 3 + 1] = Math.random() * 3.2;
      pos[i * 3 + 2] = -2 + Math.random() * 5;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(
      g,
      new THREE.PointsMaterial({ size: 0.012, map: glowSprite(), color: new THREE.Color("#ff9a80"), transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
    );
    this.scene.add(this.dust);
  }

  private buildPost() {
    const high = this.opts.quality === "high";
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: high ? 4 : 0 });
    this.composer = new EffectComposer(this.renderer, rt);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), high ? 0.5 : 0.42, 0.45, 0.92);
    this.composer.addPass(this.bloom);
    this.grade = new ShaderPass({
      uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uAspect: { value: 1 }, uFade: { value: 0 } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `
        uniform sampler2D tDiffuse; uniform float uTime; uniform float uAspect; uniform float uFade; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
        void main(){
          vec2 c = vUv - 0.5;
          float r2 = dot(c * vec2(uAspect, 1.0), c * vec2(uAspect, 1.0));
          vec2 off = c * 0.0035 * (0.4 + r2 * 2.0);
          vec3 col;
          col.r = texture2D(tDiffuse, vUv + off).r;
          col.g = texture2D(tDiffuse, vUv).g;
          col.b = texture2D(tDiffuse, vUv - off).b;
          // crimson grade: lift shadows toward oxblood, keep highlights warm
          col = mix(col, col * vec3(1.04, 0.97, 0.95) + vec3(0.004, 0.0, 0.001), 0.8);
          float vig = smoothstep(1.05, 0.25, r2 * 1.6);
          col *= mix(0.35, 1.0, vig);
          col += (h(vUv * 1000.0 + fract(uTime) * 100.0) - 0.5) * 0.035;
          col *= uFade;
          gl_FragColor = vec4(col, 1.0);
        }`,
    });
    this.composer.addPass(this.grade);
    this.composer.addPass(new OutputPass());
  }

  resize(w: number, h: number) {
    this.aspect = w / h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = this.aspect;
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
      this.grade.uniforms.uAspect.value = this.aspect;
    }
  }

  setProgress(p: number) {
    this.progress = p;
  }

  setPointer(x: number, y: number) {
    this.pointer.set(x, y);
  }

  setProject(p: { title: string; index: string; ping: readonly [number, number] }) {
    this.laptop.set(p);
  }

  setVisible(v: boolean) {
    this.visible = v;
    this.last = 0;
  }

  /** Deterministic capture for screenshots/tests: advance time and render n frames. */
  step(frames = 1, dt = 1 / 30) {
    this.grade.uniforms.uFade.value = 1;
    for (let i = 0; i < frames; i++) {
      this.captureTime += dt;
      this.frame(dt, this.captureTime);
    }
  }

  private captureTime = 0;

  start() {
    if (this.running) return;
    this.running = true;
    const fade = { v: 0 };
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (!this.visible) return;
      const now = performance.now() / 1000;
      const dt = Math.min(this.last ? now - this.last : 1 / 60, 0.05);
      this.last = now;
      this.elapsed += dt;
      fade.v = Math.min(1, fade.v + dt * 0.6);
      this.grade.uniforms.uFade.value = fade.v * fade.v;
      this.frame(dt, this.elapsed);
    };
    loop();
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private shotAt(p: number): Shot {
    const portrait = this.aspect < 0.9;
    const shots = SHOTS.map((s) => (portrait && s.portrait ? { ...s, ...s.portrait } : s));
    const i = Math.max(0, Math.min(shots.length - 1, Math.floor(p)));
    const j = Math.min(shots.length - 1, i + 1);
    const f = p - i;
    const e = f * f * (3 - 2 * f);
    const a = shots[i];
    const b = shots[j];
    return {
      pos: a.pos.clone().lerp(b.pos, e),
      target: a.target.clone().lerp(b.target, e),
      fov: a.fov + (b.fov - a.fov) * e,
    };
  }

  private frame(dt: number, t: number) {
    const rm = this.opts.reducedMotion;
    const k = rm ? 1 : 1 - Math.exp(-dt * 3.2);
    this.progressSmooth += (this.progress - this.progressSmooth) * k;
    this.pointerSmooth.lerp(this.pointer, rm ? 1 : 1 - Math.exp(-dt * 4));

    const shot = this.shotAt(this.progressSmooth);
    const sway = rm ? 0 : 1;
    this.camPos.copy(shot.pos).add(v3(this.pointerSmooth.x * 0.12 * sway + Math.sin(t * 0.21) * 0.02 * sway, -this.pointerSmooth.y * 0.06 * sway + Math.sin(t * 0.33) * 0.01 * sway, 0));
    this.camTarget.copy(shot.target);
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camTarget);
    if (Math.abs(this.camera.fov - shot.fov) > 0.01) {
      this.camera.fov = shot.fov;
      this.camera.updateProjectionMatrix();
    }

    // living details
    if (this.operatorHead) {
      const lookX = this.pointerSmooth.x * 0.28;
      const lookY = this.pointerSmooth.y * 0.08;
      this.operatorHead.rotation.set(this.headBase.x - lookY + Math.sin(t * 0.7) * 0.012, this.headBase.y + lookX * 0.6, this.headBase.z - lookX * 0.15 + Math.sin(t * 0.5) * 0.01);
    }
    if (this.operatorBody) {
      const b = 1 + Math.sin(t * 1.5) * 0.0035;
      this.operatorBody.scale.set(1 + (b - 1) * 0.6, b, 1 + (b - 1) * 1.2);
    }
    if (this.huskyHead) {
      this.huskyHead.rotation.set(this.huskyBase.x + Math.sin(t * 0.9) * 0.02, this.huskyBase.y + this.pointerSmooth.x * 0.25 + Math.sin(t * 0.37) * 0.06, this.huskyBase.z);
    }
    if (this.huskyTail) {
      this.huskyTail.rotation.set(this.tailBase.x, this.tailBase.y + Math.sin(t * 5.5) * 0.12, this.tailBase.z + Math.sin(t * 5.5 + 0.6) * 0.05);
    }
    // neon flicker: mostly steady, occasional stutter
    const stutter = Math.sin(t * 13.0) * Math.sin(t * 7.3) > 0.93 ? 0.35 : 1;
    const breathe = 0.9 + 0.1 * Math.sin(t * 2.0);
    for (const m of this.neon) {
      const mat = m.material as THREE.MeshStandardMaterial & THREE.MeshBasicMaterial;
      if ("emissiveIntensity" in mat && mat.emissive) mat.emissiveIntensity = 2.2 * breathe * stutter;
    }
    for (const l of this.neonLights) l.intensity = (this.opts.quality === "high" ? 0.9 : 0.7) * breathe * stutter;

    if (this.dust && !rm) {
      this.dust.rotation.y = t * 0.01;
      this.dust.position.y = Math.sin(t * 0.2) * 0.05;
    }
    this.outside.update(rm ? 0 : t);
    if (t - this.lastScreen > 1 / 30) {
      this.laptop.draw(rm ? 0 : t);
      this.lastScreen = t;
    }
    this.grade.uniforms.uTime.value = t;
    this.composer.render(dt);
    this.adaptQuality(dt);
  }

  /** Drop resolution if the device cannot hold ~45 fps. */
  private adaptQuality(dt: number) {
    if (!this.running) return;
    this.frameTimes.push(dt);
    if (this.frameTimes.length < 90) return;
    const avg = this.frameTimes.reduce((a, b) => a + b, 0) / this.frameTimes.length;
    this.frameTimes.length = 0;
    if (avg > 1 / 45 && this.dprScale > 0.8) {
      this.dprScale = Math.max(0.8, this.dprScale - 0.2);
      this.renderer.setPixelRatio(this.dprScale);
      const s = this.renderer.getSize(new THREE.Vector2());
      this.resize(s.x, s.y);
    }
  }

  dispose() {
    this.stop();
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        mats.forEach((x) => x.dispose());
      }
    });
    this.composer?.dispose();
    this.renderer.dispose();
  }
}

export { ROOM };
