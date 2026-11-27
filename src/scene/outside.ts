import * as THREE from "three";

/** Everything beyond the glass: crimson sky, eclipse, skyline, aircraft, rain. */
export type Outside = { group: THREE.Group; update: (t: number) => void; glass: THREE.Mesh };

const hash = (n: number) => {
  const x = Math.sin(n * 127.1) * 43758.5453;
  return x - Math.floor(x);
};

export function buildOutside(opts: { lowPower: boolean; window: { x0: number; x1: number; y0: number; y1: number; z: number } }): Outside {
  const group = new THREE.Group();
  const uniforms = { uTime: { value: 0 } };

  // ---------------------------------------------------------------- sky ---
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(220, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms,
      vertexShader: "varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `
        varying vec3 vDir; uniform float uTime;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        float fbm(vec2 p){ float a=.5, s=0.; for(int i=0;i<5;i++){ s+=a*n(p); p*=2.03; a*=.5; } return s; }
        void main(){
          float y = vDir.y;
          vec3 horizon = vec3(0.24, 0.022, 0.024);
          vec3 mid = vec3(0.05, 0.005, 0.008);
          vec3 top = vec3(0.012, 0.002, 0.004);
          vec3 col = mix(horizon, mid, smoothstep(-0.12, 0.14, y));
          col = mix(col, top, smoothstep(0.12, 0.5, y));
          vec2 uv = vDir.xz / max(0.15, vDir.y + 0.25) * 1.6;
          float c = fbm(uv + vec2(uTime * 0.006, 0.0));
          col += vec3(0.22, 0.02, 0.025) * smoothstep(0.45, 0.85, c) * smoothstep(0.55, 0.05, y) * 0.9;
          col *= 0.85 + 0.15 * fbm(uv * 3.0 - uTime * 0.01);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  group.add(sky);

  // ------------------------------------------------------------ eclipse ---
  const eclipse = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms,
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `
        varying vec2 vUv; uniform float uTime;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f);
          return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
        void main(){
          vec2 p = (vUv - 0.5) * 2.0;
          float r = length(p);
          float a = atan(p.y, p.x);
          float disc = 0.36;
          float flare = n(vec2(a * 6.0, uTime * 0.15)) * 0.5 + n(vec2(a * 17.0, -uTime * 0.2)) * 0.25;
          float ring = exp(-pow((r - disc) / (0.012 + 0.02 * flare), 2.0)) * 2.6;
          float corona = exp(-(r - disc) * (5.0 - 2.0 * flare)) * step(disc, r) * 0.9;
          float body = smoothstep(disc, disc - 0.01, r);
          // faint surface lit from behind
          vec3 col = vec3(1.0, 0.07, 0.04) * (ring + corona);
          col += vec3(0.25, 0.01, 0.01) * body * (0.25 + 0.35 * n(p * 6.0)) * smoothstep(disc * 0.2, disc, r);
          // thin cross-star like the poster
          float star = (exp(-abs(p.x) * 160.0) * exp(-abs(p.y) * 1.3) + exp(-abs(p.y) * 160.0) * exp(-abs(p.x) * 2.2) * 0.6) * 0.5;
          col += vec3(1.0, 0.25, 0.2) * star * smoothstep(1.0, 0.2, r);
          float alpha = clamp(max(max(col.r, col.g), col.b), 0.0, 1.0);
          gl_FragColor = vec4(col, alpha) * smoothstep(1.0, 0.85, r);
        }`,
    }),
  );
  eclipse.scale.setScalar(36);
  eclipse.position.set(-34, 40, -195);
  eclipse.lookAt(0, 1.6, 0);
  group.add(eclipse);

  // ------------------------------------------------------------ skyline ---
  const count = opts.lowPower ? 420 : 900;
  const geo = new THREE.BoxGeometry(1, 1, 1);
  geo.translate(0, 0.5, 0);
  const cityMat = new THREE.ShaderMaterial({
    uniforms: { ...uniforms, uFog: { value: new THREE.Color("#2a0306") } },
    vertexShader: `
      attribute float aSeed;
      varying vec3 vPos; varying vec3 vNormalW; varying float vSeed; varying float vDepth; varying vec3 vScale;
      void main(){
        vec4 wp = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vPos = wp.xyz;
        vScale = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
        vNormalW = normalize(mat3(modelMatrix * instanceMatrix) * normal);
        vSeed = aSeed;
        vec4 mv = viewMatrix * wp;
        vDepth = -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform float uTime; uniform vec3 uFog;
      varying vec3 vPos; varying vec3 vNormalW; varying float vSeed; varying float vDepth; varying vec3 vScale;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      void main(){
        vec3 n = abs(vNormalW);
        vec2 f = n.x > 0.5 ? vPos.zy : vPos.xy;
        vec3 col = vec3(0.006, 0.004, 0.006);
        if (n.y < 0.5) {
          vec2 cell = floor(f * vec2(0.8, 0.5));
          vec2 g = fract(f * vec2(0.8, 0.5));
          float win = step(0.12, g.x) * step(g.x, 0.88) * step(0.3, g.y) * step(g.y, 0.85);
          float lit = step(0.8 - 0.14 * fract(vSeed * 7.0), h(cell + vSeed * 31.0));
          float flick = step(0.995, h(cell + floor(uTime * 0.5 + vSeed * 9.0)));
          vec3 warm = mix(vec3(1.0, 0.55, 0.3), vec3(1.0, 0.18, 0.12), h(cell * 1.7));
          col += warm * win * max(lit, flick) * (0.35 + 0.6 * h(cell + 3.1));
        }
        // crimson aviation light on the roofline
        float roof = smoothstep(0.8, 1.0, n.y) * step(0.93, vSeed);
        col += vec3(1.0, 0.05, 0.03) * roof * (0.5 + 0.5 * sin(uTime * 3.0 + vSeed * 40.0)) * 3.0;
        float fog = 1.0 - exp(-vDepth * 0.006);
        col = mix(col, uFog, clamp(fog, 0.0, 0.92));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const city = new THREE.InstancedMesh(geo, cityMat, count);
  const seeds = new Float32Array(count);
  const m = new THREE.Matrix4();
  let i = 0;
  for (let k = 0; i < count && k < count * 4; k++) {
    const x = (hash(k * 1.3) - 0.5) * 300;
    const z = -55 - hash(k * 7.7) * 150;
    const centre = Math.exp(-Math.pow(x / 70, 2)) * Math.exp(-Math.pow((z + 110) / 60, 2));
    // tops sit a few degrees above eye level, with taller towers mid-frame
    const dist = Math.hypot(x, z);
    const height = 60 + dist * (0.004 + 0.055 * hash(k * 3.1)) + centre * dist * 0.17 * Math.pow(hash(k * 5.9), 2);
    const w = 5 + hash(k * 2.2) * 9;
    const d = 5 + hash(k * 4.4) * 9;
    m.makeScale(w, height, d);
    m.setPosition(x, -60, z);
    city.setMatrixAt(i, m);
    seeds[i] = hash(k * 9.1);
    i++;
  }
  city.count = i;
  geo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(seeds, 1));
  city.frustumCulled = false;
  group.add(city);

  // ------------------------------------------------------------ aircraft ---
  const sprite = (() => {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d")!;
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.2, "rgba(255,255,255,.6)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  const craft: { root: THREE.Group; speed: number; phase: number; lights: THREE.Sprite[]; rotor: THREE.Mesh }[] = [];
  const hullMat = new THREE.MeshBasicMaterial({ color: "#050304", fog: false });
  for (let k = 0; k < 3; k++) {
    const root = new THREE.Group();
    const hull = new THREE.Mesh(new THREE.CapsuleGeometry(0.6, 1.6, 4, 8), hullMat);
    hull.rotation.z = Math.PI / 2;
    root.add(hull);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.18, 0.18), hullMat);
    tail.position.x = -1.8;
    root.add(tail);
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(5, 0.04, 0.2), hullMat);
    rotor.position.y = 0.75;
    root.add(rotor);
    const lights: THREE.Sprite[] = [];
    for (const [x, y, col] of [[0.9, -0.4, "#ff2a1a"], [-2.9, 0.1, "#ffffff"], [0.2, 0.6, "#ff2a1a"]] as const) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: sprite, color: col, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
      s.scale.setScalar(1.6);
      s.position.set(x, y, 0);
      root.add(s);
      lights.push(s);
    }
    root.scale.setScalar(1.0 + k * 0.25);
    group.add(root);
    craft.push({ root, speed: 0.012 + k * 0.004, phase: k * 0.37, lights, rotor });
  }

  // ---------------------------------------------------------- rain glass ---
  const { x0, x1, y0, y1, z } = opts.window;
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(x1 - x0, y1 - y0),
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { ...uniforms, uAspect: { value: (x1 - x0) / (y1 - y0) } },
      vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: `
        varying vec2 vUv; uniform float uTime; uniform float uAspect;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float drops(vec2 uv, float t, float scale){
          vec2 p = uv * vec2(uAspect, 1.0) * scale;
          vec2 id = floor(p);
          vec2 g = fract(p) - 0.5;
          float r = h(id);
          vec2 o = (vec2(h(id + 3.1), h(id + 7.7)) - 0.5) * 0.6;
          float s = smoothstep(0.09 * r + 0.02, 0.0, length(g - o)) * step(0.5, r);
          // one running drop per active column, sliding down with a fading trail
          float isOn = step(0.75, h(vec2(id.x, 2.0)));
          float sp = 0.5 + h(vec2(id.x, 1.0)) * 0.8;
          float y = 1.0 - fract(t * sp * 0.12 + h(vec2(id.x, 9.0)));
          float dx = g.x - (h(vec2(id.x, 4.0)) - 0.5) * 0.5;
          float head = smoothstep(0.14, 0.0, length(vec2(dx, (uv.y - y) * scale * 1.4)));
          float trail = smoothstep(0.05, 0.0, abs(dx)) * step(y, uv.y) * smoothstep(y + 0.3, y, uv.y);
          return s + (head * 1.5 + trail * 0.3) * isOn;
        }
        void main(){
          float d = drops(vUv, uTime, 22.0) + drops(vUv + 0.37, uTime * 1.3, 38.0) * 0.6;
          vec3 tint = mix(vec3(1.0, 0.25, 0.2), vec3(1.0, 0.7, 0.6), vUv.y);
          float fogTop = 0.05 + 0.1 * smoothstep(0.6, 0.0, vUv.y);
          gl_FragColor = vec4(tint * (d * 0.55 + fogTop * 0.4), clamp(d * 0.35 + fogTop, 0.0, 0.6));
        }`,
    }),
  );
  glass.position.set((x0 + x1) / 2, (y0 + y1) / 2, z + 0.02);
  group.add(glass);

  // --------------------------------------------------------- rain streaks ---
  const rainCount = opts.lowPower ? 500 : 1400;
  const rainGeo = new THREE.BufferGeometry();
  const rp = new Float32Array(rainCount * 6);
  for (let k = 0; k < rainCount; k++) {
    const x = (hash(k + 0.1) - 0.5) * 30;
    const y = hash(k + 0.2) * 24 - 10;
    const zz = z - 1.5 - hash(k + 0.3) * 14;
    rp.set([x, y, zz, x - 0.05, y - 0.6, zz], k * 6);
  }
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rp, 3));
  const rain = new THREE.LineSegments(
    rainGeo,
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms,
      vertexShader: `uniform float uTime; varying float vA;
        void main(){ vec3 p = position; p.y = mod(p.y - uTime * 14.0 + 10.0, 24.0) - 10.0; vA = 0.25;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`,
      fragmentShader: "varying float vA; void main(){ gl_FragColor = vec4(1.0, 0.45, 0.4, vA); }",
    }),
  );
  rain.frustumCulled = false;
  group.add(rain);

  const update = (t: number) => {
    uniforms.uTime.value = t;
    for (const c of craft) {
      const u = ((t * c.speed + c.phase) % 1) * 2 - 1;
      c.root.position.set(u * 70, 9 + Math.sin(t * 0.3 + c.phase * 10) * 1.5 + c.phase * 14, -40 - c.phase * 60);
      c.root.rotation.y = Math.PI;
      c.rotor.rotation.y = t * 30;
      const blink = Math.sin(t * 6 + c.phase * 20) > 0.6 ? 1 : 0.15;
      c.lights[0].material.opacity = blink;
      c.lights[1].material.opacity = Math.sin(t * 4 + c.phase * 7) > 0.85 ? 1 : 0.0;
      c.lights[2].material.opacity = 1.0 - blink * 0.8;
    }
  };

  return { group, update, glass };
}
