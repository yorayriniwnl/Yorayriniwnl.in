import * as THREE from "three";
import { noiseTexture } from "./textures";

type Std = THREE.MeshStandardMaterial;

const RED = new THREE.Color("#ff2418");

/**
 * The GLBs carry plain PBR materials with stable names (see art/*.py).
 * Here they are upgraded into the final look: sheen cloth, lacquered
 * engraving, emissive neon, glowing eyes.
 */
export function upgradeMaterial(src: Std, quality: "high" | "low"): THREE.Material {
  const name = src.name;
  const base = {
    name,
    color: src.color.clone(),
    map: src.map,
    normalMap: src.normalMap,
    roughness: src.roughness,
    metalness: src.metalness,
    roughnessMap: src.roughnessMap,
    metalnessMap: src.metalnessMap,
    vertexColors: src.vertexColors,
    side: src.side,
  };
  const physical = (extra: THREE.MeshPhysicalMaterialParameters) => new THREE.MeshPhysicalMaterial({ ...base, ...extra });
  const tileNormal = (repeat: number, scale: number) => {
    if (!src.normalMap) return {};
    const n = src.normalMap.clone();
    n.wrapS = n.wrapT = THREE.RepeatWrapping;
    n.repeat.set(repeat, repeat);
    n.needsUpdate = true;
    return { normalMap: n, normalScale: new THREE.Vector2(scale, scale) };
  };

  if (name.startsWith("cloth_jacket") || name.startsWith("cloth_hood")) {
    return physical({ roughness: 0.82, sheen: 1, sheenColor: new THREE.Color("#5a1414"), sheenRoughness: 0.55, ...tileNormal(9, 0.35) });
  }
  if (name.startsWith("cloth_pants") || name.startsWith("cloth_mask")) {
    return physical({ color: new THREE.Color(name.startsWith("cloth_mask") ? "#070707" : "#0d0c0d"), roughness: 0.9, sheen: 1, sheenColor: new THREE.Color("#3a2a2a"), sheenRoughness: 0.6, ...tileNormal(10, 0.35) });
  }
  if (name.startsWith("cloth_red")) {
    return physical({ color: new THREE.Color("#4a0508"), roughness: 0.75, sheen: 1, sheenColor: new THREE.Color("#ff3a3a"), sheenRoughness: 0.4 });
  }
  if (name.startsWith("leather")) {
    const sofa = name === "leather_sofa";
    return physical({
      color: new THREE.Color(sofa ? "#2a0406" : "#0b0a0a"),
      roughness: sofa ? 0.38 : 0.48,
      clearcoat: sofa ? 0.6 : 0.35,
      clearcoatRoughness: 0.35,
      ...tileNormal(sofa ? 1 : 1, 0.5),
    });
  }
  if (name === "hair") {
    return physical({ color: new THREE.Color("#060505"), roughness: 0.42, sheen: 1, sheenColor: new THREE.Color("#4a2020"), sheenRoughness: 0.32, clearcoat: 0.25, clearcoatRoughness: 0.5 });
  }
  if (name === "skin") {
    return physical({ color: new THREE.Color("#5a3424"), roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color("#ff9070"), sheenRoughness: 0.5 });
  }
  if (name === "eye_iris") {
    return new THREE.MeshStandardMaterial({ name, color: new THREE.Color("#300000"), emissive: RED, emissiveIntensity: 3.2, roughness: 0.2 });
  }
  if (name === "husky_eye") {
    return new THREE.MeshStandardMaterial({ name, color: new THREE.Color("#300000"), emissive: RED, emissiveIntensity: 2.2, roughness: 0.15 });
  }
  if (name === "eye_white") {
    return new THREE.MeshStandardMaterial({ name, color: new THREE.Color("#2a2222"), roughness: 0.2 });
  }
  if (name.startsWith("neon_red")) {
    return new THREE.MeshStandardMaterial({ name, color: new THREE.Color("#200000"), emissive: RED, emissiveIntensity: 3.0, roughness: 0.4 });
  }
  if (name.startsWith("neon_amber")) {
    return new THREE.MeshStandardMaterial({ name, color: new THREE.Color("#201000"), emissive: new THREE.Color("#ff8a2a"), emissiveIntensity: 4.0 });
  }
  if (name.startsWith("logo_red") || name.startsWith("tag_red")) {
    return physical({ color: new THREE.Color("#7a0a0e"), emissive: new THREE.Color("#ff1a1a"), emissiveIntensity: 0.35, roughness: 0.5 });
  }
  if (name.startsWith("lens_red")) {
    return physical({ color: new THREE.Color("#140000"), emissive: RED, emissiveIntensity: 0.9, roughness: 0.05, clearcoat: 1 });
  }
  if (name === "gun_engraved") {
    return physical({ roughness: 1, metalness: 1, clearcoat: 0.9, clearcoatRoughness: 0.18, envMapIntensity: 1.6 });
  }
  if (name.startsWith("metal_gold") || name.startsWith("metal_brass")) {
    return physical({ envMapIntensity: 1.8, clearcoat: 0.3 });
  }
  if (name.startsWith("metal")) return physical({ envMapIntensity: 1.3 });
  if (name.startsWith("glass_lantern")) {
    return physical({ color: new THREE.Color("#ff9a5a"), transmission: quality === "high" ? 0.6 : 0, transparent: true, opacity: 0.35, roughness: 0.1 });
  }
  if (name === "fur_coat") {
    return new THREE.MeshStandardMaterial({ name, vertexColors: true, roughness: 0.95, color: new THREE.Color(FUR_TINT) });
  }
  if (name.startsWith("wood")) return physical({ clearcoat: 0.7, clearcoatRoughness: 0.25 });
  return physical({});
}

const furNoise = noiseTexture(256, 7);
const FUR_TINT = "#a49e98";

/**
 * Shell-textured fur: N offset copies of the mesh, each discarding more of
 * a strand noise field, darker at the root. Cheap and convincing at the
 * distances this scene is viewed from.
 */
export function addFurShells(mesh: THREE.Mesh, layers: number, length: number, strandsPerMetre = 700): THREE.Mesh[] {
  const shells: THREE.Mesh[] = [];
  // The GLB has no UVs (and is quantized), so strands are sampled
  // triplanar in object space, scaled back to metres.
  mesh.updateWorldMatrix(true, false);
  const ws = mesh.getWorldScale(new THREE.Vector3());
  const toMetres = (ws.x + ws.y + ws.z) / 3;
  const density = (strandsPerMetre / 256) * toMetres;
  const len = length / toMetres;
  for (let i = 1; i <= layers; i++) {
    const h = i / layers;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, color: new THREE.Color(FUR_TINT).multiplyScalar(0.5 + 0.5 * h) });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uH = { value: h };
      shader.uniforms.uLen = { value: len };
      shader.uniforms.uNoise = { value: furNoise };
      shader.uniforms.uDensity = { value: density };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uH; uniform float uLen; varying vec3 vFurP; varying vec3 vFurN;")
        .replace(
          "#include <begin_vertex>",
          "#include <begin_vertex>\ntransformed += normalize(objectNormal) * uH * uLen;\ntransformed.y -= uH * uH * uLen * 0.35;\nvFurP = position; vFurN = abs(normalize(objectNormal));",
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nuniform float uH; uniform sampler2D uNoise; uniform float uDensity; varying vec3 vFurP; varying vec3 vFurN;\nvec2 furTri(float d){ vec3 w = vFurN / (vFurN.x + vFurN.y + vFurN.z + 1e-4); vec3 p = vFurP * d; return texture2D(uNoise, p.yz).rg * w.x + texture2D(uNoise, p.xz).rg * w.y + texture2D(uNoise, p.xy).rg * w.z; }")
        .replace(
          "#include <clipping_planes_fragment>",
          "#include <clipping_planes_fragment>\nfloat strand = furTri(uDensity).r;\nfloat clump = furTri(uDensity * 0.13).g;\nif (strand * (0.75 + 0.5 * clump) < uH * 0.95 + 0.04) discard;",
        );
    };
    m.customProgramCacheKey = () => "fur" + i;
    const shell = new THREE.Mesh(mesh.geometry, m);
    shell.castShadow = false;
    shell.receiveShadow = true;
    shell.renderOrder = 2 + i;
    mesh.add(shell);
    shells.push(shell);
  }
  return shells;
}
