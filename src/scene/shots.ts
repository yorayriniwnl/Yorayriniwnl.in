import * as THREE from "three";

export type Shot = { pos: THREE.Vector3; target: THREE.Vector3; fov: number };
type Keyed = Shot & { id: string; portrait?: Partial<Shot> };

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** One camera shot per page section, in scroll order. */
export const SHOTS: Keyed[] = [
  { id: "hero", pos: v(0.3, 1.3, 3.05), target: v(0.02, 1.0, -1.0), fov: 36, portrait: { pos: v(0.12, 1.3, 3.95), target: v(0.12, -0.1, -1.15), fov: 52 } },
  { id: "dossier", pos: v(-1.5, 1.72, 0.75), target: v(-2.35, 1.86, -1.99), fov: 42, portrait: { pos: v(-2.15, 1.78, 1.55), target: v(-2.45, 1.86, -1.99), fov: 56 } },
  { id: "arsenal", pos: v(1.7, 1.55, 0.7), target: v(2.7, 1.45, -1.85), fov: 42, portrait: { pos: v(2.85, 1.5, 1.3), target: v(3.2, 1.42, -1.85), fov: 58 } },
  { id: "operations", pos: v(0.98, 0.98, 1.05), target: v(0.36, 0.56, 0.12), fov: 38, portrait: { pos: v(0.62, 1.1, 1.38), target: v(0.42, 0.56, 0.14), fov: 52 } },
  { id: "offduty", pos: v(-0.42, 0.74, 0.98), target: v(-0.1, 0.52, 0.32), fov: 36, portrait: { pos: v(-0.22, 0.82, 1.25), target: v(-0.08, 0.52, 0.32), fov: 50 } },
  { id: "comms", pos: v(0.08, 1.3, -0.05), target: v(-0.3, 1.2, -1.22), fov: 32, portrait: { pos: v(-0.12, 1.45, 0.6), target: v(-0.3, 0.85, -1.22), fov: 46 } },
];

export const SECTION_IDS = SHOTS.map((s) => s.id);
