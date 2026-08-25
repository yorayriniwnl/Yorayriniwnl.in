'use client'

import React, { useEffect, useRef, useState } from 'react'
import { Canvas, useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import GameShell, { type GameRenderProps } from './GameShell'
import {
  ARENA_BOXES,
  ARENA_HALF_SIZE,
  ARENA_WALLS,
  ENEMY_HEIGHT,
  ENEMY_RADIUS,
  MAGAZINE_SIZE,
  MAX_ACTIVE_ENEMIES,
  MAX_PLAYER_HEALTH,
  MAX_RESERVE_AMMO,
  PLAYER_EYE_HEIGHT,
  PLAYER_RADIUS,
  clampPitch,
  collidesWithArena,
  directionFromAngles,
  lineBlockedByCover,
  nearestCoverDistance,
  pickSpawnPoint,
  raySphereDistance,
  type ArenaBox,
} from '../lib/games/fpsArena'
import { useKeyboard } from '../hooks/useKeyboard'

const MAX_IMPACTS = 12
const IMPACT_BASE_SCALE = 0.18

type ArenaEnemy = {
  id: number
  position: THREE.Vector3
  alive: boolean
  health: number
  maxHealth: number
  respawnTimer: number
  strafeDirection: -1 | 1
  decisionTimer: number
  shootCooldown: number
  hitFlash: number
}

type ArenaImpact = {
  id: number
  position: THREE.Vector3
  ttl: number
  scale: number
  color: string
}

type MatchState = {
  playerPosition: THREE.Vector3
  yaw: number
  pitch: number
  health: number
  ammo: number
  reserve: number
  fireCooldown: number
  reloadTimer: number
  kills: number
  wave: number
  enemies: ArenaEnemy[]
  impacts: ArenaImpact[]
  damageFlash: number
  muzzleFlash: number
  message: string
  messageTimer: number
  hudSyncTimer: number
}

type HudSnapshot = {
  health: number
  ammo: number
  reserve: number
  kills: number
  wave: number
  enemiesAlive: number
  reloading: boolean
  locked: boolean
  pointerSupported: boolean
  coarsePointer: boolean
  message: string
  objective: string
  damageFlash: number
  muzzleFlash: number
}

function keyPressed(keys: Record<string, boolean>, lower: string): boolean {
  return Boolean(keys[lower] || keys[lower.toUpperCase()])
}

function desiredEnemyCount(wave: number): number {
  if (wave >= 5) return MAX_ACTIVE_ENEMIES
  if (wave >= 3) return 4
  return 3
}

function createEnemy(id: number, playerPosition: THREE.Vector3, wave: number, seed = 0): ArenaEnemy {
  const spawn = pickSpawnPoint(playerPosition, seed + id)
  const maxHealth = 88 + wave * 14

  return {
    id,
    position: new THREE.Vector3(spawn.x, 0, spawn.z),
    alive: true,
    health: maxHealth,
    maxHealth,
    respawnTimer: 0,
    strafeDirection: (id % 2 === 0 ? 1 : -1) as -1 | 1,
    decisionTimer: 0.6 + id * 0.1,
    shootCooldown: 0.55 + id * 0.14,
    hitFlash: 0,
  }
}

function createInitialState(): MatchState {
  const playerPosition = new THREE.Vector3(0, 0, 8.2)
  const enemies = Array.from({ length: MAX_ACTIVE_ENEMIES }, (_, index) =>
    index < desiredEnemyCount(1)
      ? createEnemy(index, playerPosition, 1, index)
      : {
          id: index,
          position: new THREE.Vector3(0, 0, 0),
          alive: false,
          health: 0,
          maxHealth: 100,
          respawnTimer: 999,
          strafeDirection: (index % 2 === 0 ? 1 : -1) as -1 | 1,
          decisionTimer: 0.75,
          shootCooldown: 1,
          hitFlash: 0,
        },
  )

  return {
    playerPosition,
    yaw: Math.PI,
    pitch: -0.06,
    health: MAX_PLAYER_HEALTH,
    ammo: MAGAZINE_SIZE,
    reserve: MAX_RESERVE_AMMO,
    fireCooldown: 0,
    reloadTimer: 0,
    kills: 0,
    wave: 1,
    enemies,
    impacts: [],
    damageFlash: 0,
    muzzleFlash: 0,
    message: 'Secure the site and keep moving.',
    messageTimer: 1.4,
    hudSyncTimer: 0,
  }
}

function setMessage(state: MatchState, text: string, ttl = 0.9): void {
  state.message = text
  state.messageTimer = ttl
}

function addImpact(
  state: MatchState,
  position: THREE.Vector3,
  color: string,
  scale = IMPACT_BASE_SCALE,
): void {
  state.impacts.unshift({
    id: Date.now() + Math.floor(Math.random() * 1000),
    position: position.clone(),
    ttl: 0.22,
    scale,
    color,
  })

  if (state.impacts.length > MAX_IMPACTS) {
    state.impacts.length = MAX_IMPACTS
  }
}

function reviveEnemy(enemy: ArenaEnemy, nextState: ArenaEnemy): void {
  enemy.position.copy(nextState.position)
  enemy.alive = true
  enemy.health = nextState.health
  enemy.maxHealth = nextState.maxHealth
  enemy.respawnTimer = 0
  enemy.strafeDirection = nextState.strafeDirection
  enemy.decisionTimer = nextState.decisionTimer
  enemy.shootCooldown = nextState.shootCooldown
  enemy.hitFlash = 0
}

function canUsePointerLock(): boolean {
  return typeof document !== 'undefined' && 'pointerLockElement' in document
}

function hasCoarsePointer(): boolean {
  return typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
}

function makeHudSnapshot(
  state: MatchState,
  locked: boolean,
  pointerSupported: boolean,
  coarsePointer: boolean,
): HudSnapshot {
  const enemiesAlive = state.enemies.filter((enemy) => enemy.alive).length
  const defaultMessage = !pointerSupported
    ? 'Pointer lock is not available in this browser.'
    : coarsePointer
      ? 'Mouse and keyboard are recommended for this mode.'
      : locked
        ? 'Live arena. Hold angles, strafe, reload, survive.'
        : 'Click Enter Arena to lock the mouse and take control.'

  return {
    health: state.health,
    ammo: state.ammo,
    reserve: state.reserve,
    kills: state.kills,
    wave: state.wave,
    enemiesAlive,
    reloading: state.reloadTimer > 0,
    locked,
    pointerSupported,
    coarsePointer,
    message: state.messageTimer > 0 ? state.message : defaultMessage,
    objective: enemiesAlive > 1 ? 'Contain the rush and clear the lane.' : 'Finish the last contact.',
    damageFlash: state.damageFlash,
    muzzleFlash: state.muzzleFlash,
  }
}

function nearestHitPoint(
  origin: THREE.Vector3,
  direction: THREE.Vector3,
  distance: number,
): THREE.Vector3 {
  return origin.clone().add(direction.clone().multiplyScalar(distance))
}

function ArenaHud({
  hud,
  onEngage,
}: {
  hud: HudSnapshot
  onEngage: () => void
}): JSX.Element {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 2,
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: '1rem',
          left: '1rem',
          display: 'grid',
          gap: '0.6rem',
        }}
      >
        <div
          style={{
            display: 'flex',
            gap: '0.7rem',
            flexWrap: 'wrap',
          }}
        >
          {[
            { label: 'HP', value: String(hud.health).padStart(3, '0') },
            { label: 'Ammo', value: `${String(hud.ammo).padStart(2, '0')} / ${String(hud.reserve).padStart(2, '0')}` },
            { label: 'Kills', value: String(hud.kills).padStart(2, '0') },
            { label: 'Wave', value: String(hud.wave).padStart(2, '0') },
          ].map((item) => (
            <div
              key={item.label}
              style={{
                minWidth: '5.4rem',
                padding: '0.55rem 0.8rem',
                borderRadius: '0.9rem',
                border: '1px solid rgba(201, 168, 76, 0.22)',
                background: 'rgba(9, 11, 18, 0.72)',
                boxShadow: '0 16px 42px rgba(0, 0, 0, 0.25)',
              }}
            >
              <div
                style={{
                  fontFamily: 'var(--ds-font-mono)',
                  fontSize: '0.65rem',
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color: 'rgba(255,255,255,0.58)',
                }}
              >
                {item.label}
              </div>
              <div
                style={{
                  marginTop: '0.15rem',
                  fontFamily: 'var(--ds-font-display)',
                  fontSize: '1rem',
                  color: item.label === 'HP' && hud.health < 35 ? '#fca5a5' : '#f5ecd8',
                }}
              >
                {item.value}
              </div>
            </div>
          ))}
        </div>

        <div
          style={{
            maxWidth: '26rem',
            padding: '0.6rem 0.8rem',
            borderRadius: '0.9rem',
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(7, 10, 16, 0.58)',
            color: '#d7d0bc',
            fontSize: '0.88rem',
            lineHeight: 1.5,
          }}
        >
          <div
            style={{
              fontFamily: 'var(--ds-font-mono)',
              fontSize: '0.68rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'rgba(255,255,255,0.54)',
              marginBottom: '0.2rem',
            }}
          >
            Objective
          </div>
          {hud.objective}
        </div>
      </div>

      <div
        style={{
          position: 'absolute',
          top: '1.1rem',
          right: '1rem',
          padding: '0.7rem 0.9rem',
          borderRadius: '0.9rem',
          border: '1px solid rgba(86, 213, 139, 0.2)',
          background: 'rgba(7, 10, 16, 0.64)',
          textAlign: 'right',
        }}
      >
        <div
          style={{
            fontFamily: 'var(--ds-font-mono)',
            fontSize: '0.66rem',
            letterSpacing: '0.11em',
            textTransform: 'uppercase',
            color: 'rgba(255,255,255,0.54)',
          }}
        >
          Contacts alive
        </div>
        <div
          style={{
            marginTop: '0.15rem',
            color: '#86efac',
            fontFamily: 'var(--ds-font-display)',
            fontSize: '1.15rem',
          }}
        >
          {hud.enemiesAlive}
        </div>
      </div>

      <div
        aria-hidden
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: '1.8rem',
          height: '1.8rem',
          marginLeft: '-0.9rem',
          marginTop: '-0.9rem',
          opacity: hud.locked ? 0.95 : 0.35,
          transform: hud.reloading ? 'scale(1.22)' : 'scale(1)',
          transition: 'transform 120ms ease',
        }}
      >
        <span
          style={{
            position: 'absolute',
            left: '50%',
            top: '0.1rem',
            width: '2px',
            height: '0.55rem',
            marginLeft: '-1px',
            background: '#f7f0de',
          }}
        />
        <span
          style={{
            position: 'absolute',
            left: '50%',
            bottom: '0.1rem',
            width: '2px',
            height: '0.55rem',
            marginLeft: '-1px',
            background: '#f7f0de',
          }}
        />
        <span
          style={{
            position: 'absolute',
            left: '0.1rem',
            top: '50%',
            width: '0.55rem',
            height: '2px',
            marginTop: '-1px',
            background: '#f7f0de',
          }}
        />
        <span
          style={{
            position: 'absolute',
            right: '0.1rem',
            top: '50%',
            width: '0.55rem',
            height: '2px',
            marginTop: '-1px',
            background: '#f7f0de',
          }}
        />
      </div>

      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: '1.1rem',
          transform: 'translateX(-50%)',
          width: 'min(32rem, calc(100% - 2rem))',
          padding: '0.65rem 0.9rem',
          borderRadius: '0.95rem',
          border: '1px solid rgba(255,255,255,0.12)',
          background: 'rgba(7, 10, 16, 0.62)',
          color: '#ddd5c0',
          fontSize: '0.9rem',
          lineHeight: 1.45,
          textAlign: 'center',
        }}
      >
        {hud.message}
      </div>

      {!hud.locked && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1.25rem',
            background: 'radial-gradient(circle at center, rgba(7, 10, 16, 0.18), rgba(5, 7, 10, 0.76))',
            pointerEvents: 'auto',
          }}
        >
          <div
            style={{
              width: 'min(30rem, 100%)',
              padding: '1.4rem',
              borderRadius: '1.2rem',
              border: '1px solid rgba(201, 168, 76, 0.24)',
              background: 'rgba(12, 15, 20, 0.9)',
              boxShadow: '0 26px 74px rgba(0, 0, 0, 0.48)',
              textAlign: 'center',
            }}
          >
            <div
              style={{
                fontFamily: 'var(--ds-font-mono)',
                fontSize: '0.7rem',
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: 'rgba(255,255,255,0.58)',
              }}
            >
              3D training range
            </div>
            <h2
              style={{
                margin: '0.55rem 0 0.7rem',
                fontFamily: 'var(--ds-font-display)',
                fontSize: 'clamp(1.4rem, 4vw, 2rem)',
                color: '#f5ecd8',
              }}
            >
              Yor Strike Arena
            </h2>
            <p
              style={{
                margin: 0,
                color: '#d7d0bc',
                lineHeight: 1.65,
              }}
            >
              A browser-built, Counter-Strike 1.6 inspired skirmish arena with strafing bots,
              cover boxes, manual reloads, and pointer-lock aiming.
            </p>
            <div
              style={{
                marginTop: '1rem',
                display: 'grid',
                gap: '0.6rem',
                gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))',
              }}
            >
              {[
                'WASD to move',
                'Mouse to aim',
                'Click to fire',
                'R to reload',
              ].map((item) => (
                <div
                  key={item}
                  style={{
                    padding: '0.65rem 0.75rem',
                    borderRadius: '0.85rem',
                    border: '1px solid rgba(255,255,255,0.08)',
                    background: 'rgba(255,255,255,0.03)',
                    color: '#f4ebd4',
                    fontFamily: 'var(--ds-font-mono)',
                    fontSize: '0.78rem',
                    letterSpacing: '0.05em',
                  }}
                >
                  {item}
                </div>
              ))}
            </div>
            <div
              style={{
                marginTop: '1rem',
                color: 'rgba(255,255,255,0.62)',
                fontSize: '0.83rem',
                lineHeight: 1.55,
              }}
            >
              {hud.pointerSupported
                ? hud.coarsePointer
                  ? 'Desktop is recommended. Mobile browsers usually do not expose comfortable pointer-lock controls.'
                  : 'Click into the arena to capture the mouse. Press Esc to pause and release control.'
                : 'This browser does not expose pointer lock, so the FPS controls cannot be engaged here.'}
            </div>
            <button
              type="button"
              onClick={onEngage}
              disabled={!hud.pointerSupported}
              style={{
                marginTop: '1rem',
                padding: '0.8rem 1.5rem',
                borderRadius: '999px',
                border: hud.pointerSupported ? '1px solid rgba(201, 168, 76, 0.46)' : '1px solid rgba(255,255,255,0.12)',
                background: hud.pointerSupported
                  ? 'linear-gradient(135deg, rgba(201, 168, 76, 0.24), rgba(201, 168, 76, 0.1))'
                  : 'rgba(255,255,255,0.03)',
                color: hud.pointerSupported ? '#f5ecd8' : 'rgba(255,255,255,0.44)',
                fontFamily: 'var(--ds-font-mono)',
                letterSpacing: '0.06em',
                cursor: hud.pointerSupported ? 'pointer' : 'not-allowed',
              }}
            >
              {hud.pointerSupported ? 'Enter Arena' : 'Pointer Lock Unavailable'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function ArenaGeometry({ box, yOffset = 0 }: { box: ArenaBox; yOffset?: number }): JSX.Element {
  const isWall = box.tone === 'wall'

  return (
    <mesh position={[box.x, yOffset + box.height / 2, box.z]} castShadow receiveShadow>
      <boxGeometry args={[box.width, box.height, box.depth]} />
      <meshStandardMaterial
        color={isWall ? '#7a6545' : box.tone === 'cover' ? '#b18758' : '#8e6942'}
        roughness={0.88}
        metalness={0.08}
      />
    </mesh>
  )
}

function ArenaSimulation({
  stateRef,
  keys,
  isPaused,
  isGameOver,
  setGameOver,
  onHudSync,
}: {
  stateRef: React.MutableRefObject<MatchState>
  keys: Record<string, boolean>
  isPaused: boolean
  isGameOver: boolean
  setGameOver: (gameOver: boolean, finalScore?: number) => void
  onHudSync: (state: MatchState) => void
}): JSX.Element {
  const { camera } = useThree()
  const enemyGroupRefs = useRef<Array<THREE.Group | null>>([])
  const enemyBodyRefs = useRef<Array<THREE.Mesh | null>>([])
  const enemyHeadRefs = useRef<Array<THREE.Mesh | null>>([])
  const enemyHealthRefs = useRef<Array<THREE.Mesh | null>>([])
  const impactRefs = useRef<Array<THREE.Mesh | null>>([])
  const cameraEuler = useRef(new THREE.Euler(0, 0, 0, 'YXZ'))

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 0.05)
    const state = stateRef.current
    const wasReloading = state.reloadTimer > 0

    state.fireCooldown = Math.max(0, state.fireCooldown - delta)
    state.reloadTimer = Math.max(0, state.reloadTimer - delta)
    state.damageFlash = Math.max(0, state.damageFlash - delta * 1.9)
    state.muzzleFlash = Math.max(0, state.muzzleFlash - delta * 9)
    state.messageTimer = Math.max(0, state.messageTimer - delta)

    if (wasReloading && state.reloadTimer === 0 && state.ammo < MAGAZINE_SIZE && state.reserve > 0) {
      const needed = MAGAZINE_SIZE - state.ammo
      const moved = Math.min(needed, state.reserve)
      state.ammo += moved
      state.reserve -= moved
      setMessage(state, 'Magazine seated. Hold the angle.', 0.7)
    }

    if (!isPaused && !isGameOver) {
      const forward = new THREE.Vector3(Math.sin(state.yaw), 0, -Math.cos(state.yaw))
      const right = new THREE.Vector3(Math.cos(state.yaw), 0, Math.sin(state.yaw))
      const move = new THREE.Vector3()
      const sprint = Boolean(keys.Shift)
      const speed = sprint ? 7.4 : 5.8

      if (keyPressed(keys, 'w')) move.add(forward)
      if (keyPressed(keys, 's')) move.sub(forward)
      if (keyPressed(keys, 'a')) move.sub(right)
      if (keyPressed(keys, 'd')) move.add(right)

      if (move.lengthSq() > 0) {
        move.normalize().multiplyScalar(speed * delta)

        const nextX = state.playerPosition.x + move.x
        if (!collidesWithArena(nextX, state.playerPosition.z, PLAYER_RADIUS)) {
          state.playerPosition.x = nextX
        }

        const nextZ = state.playerPosition.z + move.z
        if (!collidesWithArena(state.playerPosition.x, nextZ, PLAYER_RADIUS)) {
          state.playerPosition.z = nextZ
        }
      }

      state.wave = 1 + Math.floor(state.kills / 4)

      let aliveEnemies = 0
      const requiredEnemies = desiredEnemyCount(state.wave)

      for (let enemyIndex = 0; enemyIndex < state.enemies.length; enemyIndex++) {
        const enemy = state.enemies[enemyIndex]
        enemy.hitFlash = Math.max(0, enemy.hitFlash - delta * 4)

        if (!enemy.alive) {
          if (enemy.respawnTimer !== 999) {
            enemy.respawnTimer -= delta
            if (enemy.respawnTimer <= 0 && aliveEnemies < requiredEnemies) {
              const respawned = createEnemy(enemy.id, state.playerPosition, state.wave, state.kills + enemy.id)
              reviveEnemy(enemy, respawned)
            }
          }
          continue
        }

        aliveEnemies++

        const toPlayer = new THREE.Vector3().subVectors(state.playerPosition, enemy.position)
        const planarDistance = Math.max(0.001, Math.hypot(toPlayer.x, toPlayer.z))
        const planarDirection = new THREE.Vector3(toPlayer.x / planarDistance, 0, toPlayer.z / planarDistance)

        enemy.decisionTimer -= delta
        if (enemy.decisionTimer <= 0) {
          enemy.strafeDirection = (Math.random() > 0.5 ? 1 : -1) as -1 | 1
          enemy.decisionTimer = 0.8 + Math.random() * 0.7
        }

        const strafeVector = new THREE.Vector3(-planarDirection.z, 0, planarDirection.x)
        const moveVector = new THREE.Vector3()
        const spacingBias = planarDistance > 7.5 ? 1 : planarDistance < 4.4 ? -1 : 0.15
        moveVector.addScaledVector(planarDirection, spacingBias)
        moveVector.addScaledVector(strafeVector, enemy.strafeDirection * 0.68)

        if (moveVector.lengthSq() > 0.001) {
          moveVector.normalize().multiplyScalar((2.05 + state.wave * 0.13) * delta)

          const enemyNextX = enemy.position.x + moveVector.x
          if (!collidesWithArena(enemyNextX, enemy.position.z, ENEMY_RADIUS)) {
            enemy.position.x = enemyNextX
          }

          const enemyNextZ = enemy.position.z + moveVector.z
          if (!collidesWithArena(enemy.position.x, enemyNextZ, ENEMY_RADIUS)) {
            enemy.position.z = enemyNextZ
          }
        }

        enemy.shootCooldown -= delta
        if (enemy.shootCooldown <= 0 && planarDistance < 16.5) {
          const enemyEye = new THREE.Vector3(enemy.position.x, PLAYER_EYE_HEIGHT - 0.18, enemy.position.z)
          const playerEye = new THREE.Vector3(state.playerPosition.x, PLAYER_EYE_HEIGHT, state.playerPosition.z)

          if (!lineBlockedByCover(enemyEye, playerEye)) {
            enemy.shootCooldown = Math.max(0.38, 1.2 - state.wave * 0.05) + Math.random() * 0.35
            const accuracy = THREE.MathUtils.clamp(0.3 + state.wave * 0.045 - planarDistance * 0.011, 0.18, 0.72)

            if (Math.random() < accuracy) {
              state.health = Math.max(0, state.health - (8 + state.wave * 2))
              state.damageFlash = 0.45
              addImpact(state, playerEye.clone().add(new THREE.Vector3(0, -0.62, 0)), '#ef4444', 0.22)
              setMessage(state, 'Taking fire. Reposition.', 0.5)

              if (state.health <= 0) {
                state.health = 0
                setGameOver(true, state.kills)
              }
            } else {
              addImpact(
                state,
                playerEye.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.8, -0.75, (Math.random() - 0.5) * 0.8)),
                '#f59e0b',
                0.12,
              )
            }
          }
        }
      }

      for (const enemy of state.enemies) {
        if (!enemy.alive && enemy.respawnTimer === 999 && aliveEnemies < requiredEnemies) {
          const respawned = createEnemy(enemy.id, state.playerPosition, state.wave, state.kills + enemy.id)
          reviveEnemy(enemy, respawned)
          aliveEnemies++
        }
      }

      state.impacts = state.impacts
        .map((impact) => ({ ...impact, ttl: impact.ttl - delta }))
        .filter((impact) => impact.ttl > 0)
    }

    camera.position.set(state.playerPosition.x, PLAYER_EYE_HEIGHT, state.playerPosition.z)
    cameraEuler.current.set(state.pitch, state.yaw, 0, 'YXZ')
    camera.quaternion.setFromEuler(cameraEuler.current)

    for (let index = 0; index < MAX_ACTIVE_ENEMIES; index++) {
      const enemy = state.enemies[index]
      const group = enemyGroupRefs.current[index]
      const body = enemyBodyRefs.current[index]
      const head = enemyHeadRefs.current[index]
      const healthFill = enemyHealthRefs.current[index]

      if (!group || !body || !head || !healthFill) continue

      group.visible = Boolean(enemy?.alive)
      if (!enemy?.alive) continue

      group.position.set(enemy.position.x, 0, enemy.position.z)
      group.rotation.y = Math.atan2(
        state.playerPosition.x - enemy.position.x,
        state.playerPosition.z - enemy.position.z,
      )

      const bodyMaterial = body.material as THREE.MeshStandardMaterial
      const headMaterial = head.material as THREE.MeshStandardMaterial
      bodyMaterial.color.set(enemy.hitFlash > 0 ? '#ef4444' : '#86efac')
      headMaterial.color.set(enemy.hitFlash > 0 ? '#fca5a5' : '#f5d0a0')

      healthFill.scale.x = Math.max(0.08, enemy.health / enemy.maxHealth)
      healthFill.position.x = -0.55 + healthFill.scale.x * 0.55
    }

    for (let index = 0; index < MAX_IMPACTS; index++) {
      const impact = state.impacts[index]
      const mesh = impactRefs.current[index]
      if (!mesh) continue

      mesh.visible = Boolean(impact)
      if (!impact) continue

      const fade = impact.ttl / 0.22
      mesh.position.copy(impact.position)
      mesh.scale.setScalar(impact.scale * fade)
      const material = mesh.material as THREE.MeshBasicMaterial
      material.color.set(impact.color)
      material.opacity = Math.max(0, fade)
    }

    state.hudSyncTimer += delta
    if (state.hudSyncTimer >= 0.08) {
      state.hudSyncTimer = 0
      onHudSync(state)
    }
  })

  return (
    <>
      <color attach="background" args={['#c0d0db']} />
      <fog attach="fog" args={['#c0d0db', 12, 32]} />

      <ambientLight intensity={0.6} />
      <hemisphereLight args={['#f6efe2', '#7b6646', 0.6]} />
      <directionalLight
        castShadow
        position={[7, 14, 5]}
        intensity={1.15}
        color="#fff6dc"
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.01, 0]} receiveShadow>
        <planeGeometry args={[ARENA_HALF_SIZE * 2 + 4, ARENA_HALF_SIZE * 2 + 4]} />
        <meshStandardMaterial color="#caa67b" roughness={0.95} metalness={0.02} />
      </mesh>
      <gridHelper args={[ARENA_HALF_SIZE * 2 + 2, 26, '#8e6d47', '#b89265']} position={[0, 0.01, 0]} />

      {ARENA_WALLS.map((wall) => (
        <ArenaGeometry key={wall.id} box={wall} />
      ))}
      {ARENA_BOXES.map((box) => (
        <ArenaGeometry key={box.id} box={box} />
      ))}

      {Array.from({ length: MAX_ACTIVE_ENEMIES }, (_, index) => (
        <group
          key={`enemy-${index}`}
          ref={(node: any) => {
            enemyGroupRefs.current[index] = node
          }}
          visible={false}
        >
          <mesh
            ref={(node: any) => {
              enemyBodyRefs.current[index] = node
            }}
            castShadow
            position={[0, 0.9, 0]}
          >
            <boxGeometry args={[0.8, 1.45, 0.52]} />
            <meshStandardMaterial color="#86efac" roughness={0.65} metalness={0.12} />
          </mesh>
          <mesh
            ref={(node: any) => {
              enemyHeadRefs.current[index] = node
            }}
            castShadow
            position={[0, ENEMY_HEIGHT, 0]}
          >
            <sphereGeometry args={[0.28, 18, 18]} />
            <meshStandardMaterial color="#f5d0a0" roughness={0.82} metalness={0.05} />
          </mesh>
          <mesh position={[0, ENEMY_HEIGHT + 0.42, 0]} rotation={[0, 0, 0]}>
            <boxGeometry args={[1.2, 0.08, 0.06]} />
            <meshBasicMaterial color="#1f2937" transparent opacity={0.75} />
          </mesh>
          <mesh
            ref={(node: any) => {
              enemyHealthRefs.current[index] = node
            }}
            position={[0, ENEMY_HEIGHT + 0.42, 0.04]}
          >
            <boxGeometry args={[1.1, 0.05, 0.05]} />
            <meshBasicMaterial color="#22c55e" />
          </mesh>
        </group>
      ))}

      {Array.from({ length: MAX_IMPACTS }, (_, index) => (
        <mesh
          key={`impact-${index}`}
          ref={(node: any) => {
            impactRefs.current[index] = node
          }}
          visible={false}
        >
          <sphereGeometry args={[0.25, 12, 12]} />
          <meshBasicMaterial transparent opacity={0} color="#fde68a" />
        </mesh>
      ))}
    </>
  )
}

function ArenaStage(props: {
  stateRef: React.MutableRefObject<MatchState>
  keys: Record<string, boolean>
  isPaused: boolean
  isGameOver: boolean
  setGameOver: (gameOver: boolean, finalScore?: number) => void
  onHudSync: (state: MatchState) => void
}): JSX.Element {
  return (
    <Canvas
      shadows
      dpr={[1, 1.4]}
      gl={{ antialias: true }}
      camera={{ position: [0, PLAYER_EYE_HEIGHT, 8.2], fov: 76 }}
      style={{ width: '100%', height: '100%' }}
    >
      <ArenaSimulation {...props} />
    </Canvas>
  )
}

function ClassicShooterViewport({
  isPaused,
  isGameOver,
  setScore,
  setGameOver,
}: GameRenderProps): JSX.Element {
  const wrapperRef = useRef<HTMLDivElement>(null)
  const [initialState] = useState(createInitialState)
  const stateRef = useRef<MatchState>(initialState)
  const lockTimestampRef = useRef(0)
  const [locked, setLocked] = useState(false)
  const [pointerSupported] = useState(canUsePointerLock)
  const [coarsePointer] = useState(hasCoarsePointer)
  const [hud, setHud] = useState<HudSnapshot>(() =>
    makeHudSnapshot(initialState, false, canUsePointerLock(), hasCoarsePointer()),
  )

  const keys = useKeyboard(['w', 'a', 's', 'd', 'r', 'Shift'])

  useEffect(() => {
    function onPointerLockChange() {
      const nextLocked = document.pointerLockElement === wrapperRef.current
      if (nextLocked) {
        lockTimestampRef.current = performance.now()
      }
      setLocked(nextLocked)
      setHud(makeHudSnapshot(stateRef.current, nextLocked, pointerSupported, coarsePointer))
    }

    function onMouseMove(event: MouseEvent) {
      if (document.pointerLockElement !== wrapperRef.current) return
      if (isPaused || isGameOver) return

      const state = stateRef.current
      state.yaw -= event.movementX * 0.0025
      state.pitch = clampPitch(state.pitch - event.movementY * 0.0021)
    }

    document.addEventListener('pointerlockchange', onPointerLockChange)
    document.addEventListener('mousemove', onMouseMove)

    return () => {
      document.removeEventListener('pointerlockchange', onPointerLockChange)
      document.removeEventListener('mousemove', onMouseMove)
    }
  }, [coarsePointer, isGameOver, isPaused, pointerSupported])

  useEffect(() => {
    if ((isPaused || isGameOver) && document.pointerLockElement === wrapperRef.current) {
      document.exitPointerLock()
    }
  }, [isGameOver, isPaused])

  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      if (event.button !== 0) return
      if (document.pointerLockElement !== wrapperRef.current) return
      if (isPaused || isGameOver) return
      if (performance.now() - lockTimestampRef.current < 180) return

      const state = stateRef.current
      if (state.reloadTimer > 0 || state.fireCooldown > 0) return

      if (state.ammo <= 0) {
        if (state.reserve > 0) {
          state.reloadTimer = 1.05
          setMessage(state, 'Reloading weapon.', 0.9)
          setHud(makeHudSnapshot(state, true, pointerSupported, coarsePointer))
        } else {
          setMessage(state, 'No reserve rounds left.', 0.9)
          setHud(makeHudSnapshot(state, true, pointerSupported, coarsePointer))
        }
        return
      }

      const origin = new THREE.Vector3(state.playerPosition.x, PLAYER_EYE_HEIGHT, state.playerPosition.z)
      const direction = directionFromAngles(state.yaw, state.pitch, new THREE.Vector3())
      const coverDistance = nearestCoverDistance(origin, direction) ?? Infinity
      let hitEnemy: ArenaEnemy | null = null
      let enemyDistance = Infinity
      let hitPoint = origin.clone().add(direction.clone().multiplyScalar(28))

      for (const enemy of state.enemies) {
        if (!enemy.alive) continue
        const enemyCenter = new THREE.Vector3(enemy.position.x, 0.96, enemy.position.z)
        const hit = raySphereDistance(origin, direction, enemyCenter, ENEMY_RADIUS)
        if (hit === null || hit >= enemyDistance || hit >= coverDistance) continue
        enemyDistance = hit
        hitEnemy = enemy
      }

      state.ammo -= 1
      state.fireCooldown = 0.16
      state.muzzleFlash = 0.18

      if (hitEnemy) {
        const damage = 34 + state.wave * 2
        hitEnemy.health -= damage
        hitEnemy.hitFlash = 0.35
        hitPoint = nearestHitPoint(origin, direction, enemyDistance)
        addImpact(state, hitPoint, '#fde68a', 0.18)

        if (hitEnemy.health <= 0) {
          hitEnemy.alive = false
          hitEnemy.respawnTimer = Math.max(0.85, 2.2 - state.wave * 0.08) + Math.random() * 0.45
          state.kills += 1
          state.wave = 1 + Math.floor(state.kills / 4)
          setScore(state.kills)
          setMessage(state, `Enemy down. ${state.kills} confirmed.`, 0.85)
        } else {
          setMessage(state, 'Hit confirmed. Keep pressure.', 0.55)
        }
      } else {
        if (coverDistance < Infinity) {
          hitPoint = nearestHitPoint(origin, direction, coverDistance)
        }
        addImpact(state, hitPoint, '#f59e0b', 0.12)
      }

      setHud(makeHudSnapshot(state, true, pointerSupported, coarsePointer))
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (isPaused || isGameOver) return
      if (event.repeat) return
      if (event.key !== 'r' && event.key !== 'R') return

      const state = stateRef.current
      if (state.reloadTimer > 0 || state.ammo >= MAGAZINE_SIZE || state.reserve <= 0) return

      state.reloadTimer = 1.05
      setMessage(state, 'Reloading weapon.', 0.9)
      setHud(makeHudSnapshot(state, locked, pointerSupported, coarsePointer))
    }

    window.addEventListener('mousedown', handleMouseDown)
    window.addEventListener('keydown', handleKeyDown)

    return () => {
      window.removeEventListener('mousedown', handleMouseDown)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [coarsePointer, isGameOver, isPaused, locked, pointerSupported, setScore])

  function handleEngage() {
    if (!pointerSupported || coarsePointer || isPaused || isGameOver) return
    wrapperRef.current?.requestPointerLock()
  }

  function handleHudSync(state: MatchState) {
    if (state.health <= 0) {
      setGameOver(true, state.kills)
    }
    setHud(makeHudSnapshot(state, locked, pointerSupported, coarsePointer))
  }

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: '32rem',
        background: 'linear-gradient(180deg, #c8d7e2 0%, #8fa1af 100%)',
        overflow: 'hidden',
      }}
    >
      <ArenaStage
        stateRef={stateRef}
        keys={keys}
        isPaused={isPaused}
        isGameOver={isGameOver}
        setGameOver={setGameOver}
        onHudSync={handleHudSync}
      />

      <ArenaHud hud={hud} onEngage={handleEngage} />

      {hud.damageFlash > 0 && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            background: `rgba(220, 38, 38, ${Math.min(0.28, hud.damageFlash * 0.42)})`,
            zIndex: 3,
          }}
        />
      )}

      {hud.muzzleFlash > 0 && (
        <div
          aria-hidden
          style={{
            position: 'absolute',
            right: '1.4rem',
            bottom: '4.2rem',
            width: '5rem',
            height: '5rem',
            borderRadius: '999px',
            background: `radial-gradient(circle, rgba(253, 224, 71, ${Math.min(0.38, hud.muzzleFlash)}) 0%, rgba(253, 224, 71, 0) 70%)`,
            pointerEvents: 'none',
            zIndex: 3,
          }}
        />
      )}
    </div>
  )
}

const STRIKE_ARENA_TOP_SCORER = {
  recordKey: 'yor:strike-arena:top-scorer',
  label: 'Best operator',
  defaultName: 'Dust Runner',
} as const

export default function ClassicShooter3D(): JSX.Element {
  return (
    <GameShell
      title="Yor Strike Arena"
      highScoreKey="yor:strike-arena:highscore"
      namedHighScore={STRIKE_ARENA_TOP_SCORER}
      controls={[
        { key: 'W A S D', action: 'Move and strafe around cover' },
        { key: 'Mouse', action: 'Aim after pointer lock engages' },
        { key: 'Click', action: 'Fire the sidearm' },
        { key: 'R', action: 'Reload the magazine' },
        { key: 'Shift', action: 'Sprint between angles' },
        { key: 'Esc', action: 'Pause and release the mouse' },
      ]}
    >
      {(props) => <ClassicShooterViewport key={props.roundId} {...props} />}
    </GameShell>
  )
}
