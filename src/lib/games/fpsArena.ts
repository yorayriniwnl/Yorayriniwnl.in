import * as THREE from 'three'

export type ArenaBox = {
  id: string
  x: number
  z: number
  width: number
  depth: number
  height: number
  tone?: 'cover' | 'crate' | 'wall'
}

export type SpawnPoint = {
  x: number
  z: number
}

export const ARENA_HALF_SIZE = 12
export const PLAYER_RADIUS = 0.38
export const PLAYER_EYE_HEIGHT = 1.62
export const ENEMY_RADIUS = 0.55
export const ENEMY_HEIGHT = 1.7
export const MAX_PLAYER_HEALTH = 100
export const MAGAZINE_SIZE = 12
export const MAX_RESERVE_AMMO = 60
export const MAX_ACTIVE_ENEMIES = 5

export const ARENA_BOXES: ArenaBox[] = [
  { id: 'center-stack', x: 0, z: -0.8, width: 2.6, depth: 2.2, height: 2.4, tone: 'cover' },
  { id: 'left-crate', x: -5.4, z: -3.8, width: 2.2, depth: 2.2, height: 1.8, tone: 'crate' },
  { id: 'left-box', x: -3.8, z: 4.8, width: 3.2, depth: 1.8, height: 1.65, tone: 'cover' },
  { id: 'right-crate', x: 5.2, z: 3.6, width: 2.2, depth: 2.2, height: 1.8, tone: 'crate' },
  { id: 'right-box', x: 4.2, z: -5.2, width: 3.4, depth: 1.9, height: 1.65, tone: 'cover' },
  { id: 'tunnel-left', x: -8.4, z: 0.3, width: 1.8, depth: 4.6, height: 2.1, tone: 'cover' },
  { id: 'tunnel-right', x: 8.4, z: -0.3, width: 1.8, depth: 4.6, height: 2.1, tone: 'cover' },
]

export const ARENA_WALLS: ArenaBox[] = [
  { id: 'north-wall', x: 0, z: -ARENA_HALF_SIZE - 0.5, width: ARENA_HALF_SIZE * 2 + 1, depth: 1, height: 3.2, tone: 'wall' },
  { id: 'south-wall', x: 0, z: ARENA_HALF_SIZE + 0.5, width: ARENA_HALF_SIZE * 2 + 1, depth: 1, height: 3.2, tone: 'wall' },
  { id: 'west-wall', x: -ARENA_HALF_SIZE - 0.5, z: 0, width: 1, depth: ARENA_HALF_SIZE * 2 + 1, height: 3.2, tone: 'wall' },
  { id: 'east-wall', x: ARENA_HALF_SIZE + 0.5, z: 0, width: 1, depth: ARENA_HALF_SIZE * 2 + 1, height: 3.2, tone: 'wall' },
]

export const ENEMY_SPAWNS: SpawnPoint[] = [
  { x: -8.8, z: -8.8 },
  { x: 8.6, z: -8.2 },
  { x: -8.5, z: 8.4 },
  { x: 8.8, z: 8.8 },
  { x: 0, z: -9.6 },
  { x: 0, z: 9.4 },
]

const TMP_DIRECTION = new THREE.Vector3()

export function clampPitch(value: number): number {
  return THREE.MathUtils.clamp(value, -1.15, 1.05)
}

export function directionFromAngles(
  yaw: number,
  pitch: number,
  target = new THREE.Vector3(),
): THREE.Vector3 {
  return target.set(
    Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch),
  ).normalize()
}

export function circleIntersectsBox(
  x: number,
  z: number,
  radius: number,
  box: ArenaBox,
): boolean {
  const halfWidth = box.width / 2
  const halfDepth = box.depth / 2
  const closestX = THREE.MathUtils.clamp(x, box.x - halfWidth, box.x + halfWidth)
  const closestZ = THREE.MathUtils.clamp(z, box.z - halfDepth, box.z + halfDepth)
  const dx = x - closestX
  const dz = z - closestZ
  return dx * dx + dz * dz < radius * radius
}

export function collidesWithArena(x: number, z: number, radius = PLAYER_RADIUS): boolean {
  if (Math.abs(x) > ARENA_HALF_SIZE - radius || Math.abs(z) > ARENA_HALF_SIZE - radius) {
    return true
  }

  return ARENA_BOXES.some((box) => circleIntersectsBox(x, z, radius, box))
}

export function raySphereDistance(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  center: THREE.Vector3,
  radius: number,
): number | null {
  TMP_DIRECTION.copy(origin).sub(center)
  const b = TMP_DIRECTION.dot(direction)
  const c = TMP_DIRECTION.lengthSq() - radius * radius
  const discriminant = b * b - c

  if (discriminant < 0) return null

  const root = Math.sqrt(discriminant)
  const near = -b - root
  const far = -b + root

  if (near >= 0) return near
  if (far >= 0) return far
  return null
}

export function rayBoxDistance(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  box: ArenaBox,
): number | null {
  const minX = box.x - box.width / 2
  const maxX = box.x + box.width / 2
  const minY = 0
  const maxY = box.height
  const minZ = box.z - box.depth / 2
  const maxZ = box.z + box.depth / 2

  let tMin = -Infinity
  let tMax = Infinity

  const axes: Array<[number, number, number, number]> = [
    [origin.x, direction.x, minX, maxX],
    [origin.y, direction.y, minY, maxY],
    [origin.z, direction.z, minZ, maxZ],
  ]

  for (const [originValue, directionValue, minValue, maxValue] of axes) {
    if (Math.abs(directionValue) < 1e-6) {
      if (originValue < minValue || originValue > maxValue) return null
      continue
    }

    const near = (minValue - originValue) / directionValue
    const far = (maxValue - originValue) / directionValue
    const entry = Math.min(near, far)
    const exit = Math.max(near, far)

    tMin = Math.max(tMin, entry)
    tMax = Math.min(tMax, exit)

    if (tMin > tMax) return null
  }

  if (tMax < 0) return null
  return tMin >= 0 ? tMin : tMax
}

export function nearestCoverDistance(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
): number | null {
  let closest: number | null = null

  for (const box of ARENA_BOXES) {
    const hit = rayBoxDistance(origin, direction, box)
    if (hit === null) continue
    if (closest === null || hit < closest) closest = hit
  }

  return closest
}

export function lineBlockedByCover(from: THREE.Vector3, to: THREE.Vector3): boolean {
  const distance = TMP_DIRECTION.copy(to).sub(from).length()
  if (distance <= 0.001) return false

  TMP_DIRECTION.copy(to).sub(from).normalize()
  const hit = nearestCoverDistance(from, TMP_DIRECTION)
  return hit !== null && hit < distance - 0.25
}

export function pickSpawnPoint(playerPosition: THREE.Vector3, seed = 0): SpawnPoint {
  const ranked = ENEMY_SPAWNS
    .map((spawn, index) => ({
      spawn,
      index,
      score:
        playerPosition.distanceToSquared(new THREE.Vector3(spawn.x, 0, spawn.z)) +
        ((index + seed) % ENEMY_SPAWNS.length) * 0.01,
    }))
    .sort((left, right) => right.score - left.score)

  return ranked[0]?.spawn ?? ENEMY_SPAWNS[0]
}
