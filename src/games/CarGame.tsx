'use client'

import React, { useCallback, useEffect, useRef } from 'react'
import GameShell, { type GameRenderProps } from './GameShell'
import { useGameLoop } from '../hooks/useGameLoop'
import { useKeyboard } from '../hooks/useKeyboard'

// ─── Virtual canvas dimensions (all game coordinates are in these units) ──────
const VW = 420
const VH = 560

// ─── Perspective constants ────────────────────────────────────────────────────
const HORIZON_Y = 174          // y of the vanishing point (virtual units)
const VP_X = VW / 2            // x of the vanishing point = 210
const ROAD_HALF_W = 150        // half-width of road at its widest (bottom)
const ROAD_LEFT_BTM = VP_X - ROAD_HALF_W   // = 60
const ROAD_RIGHT_BTM = VP_X + ROAD_HALF_W  // = 360
const NUM_LANES = 3

// Car dimensions at progress t = 1 (full-size, at player's row)
const CAR_BASE_W = 38
const CAR_BASE_H = 62

// Player sits at this fixed progress value (0 = horizon, 1 = very bottom)
const PLAYER_T = 0.925

// ─── Fuel ─────────────────────────────────────────────────────────────────────
const MAX_FUEL = 100

// ─── Obstacle colours ─────────────────────────────────────────────────────────
const OBS_COLORS = [
  '#ef4444', '#f97316', '#3b82f6', '#8b5cf6', '#6b7280', '#14b8a6', '#ec4899',
]

// ─── Pre-computed skyline segment (widths tile horizontally near horizon) ─────
interface Building { w: number; h: number }
const SKYLINE: Building[] = [
  { w: 28, h: 42 }, { w: 16, h: 56 }, { w: 22, h: 36 }, { w: 38, h: 62 },
  { w: 18, h: 46 }, { w: 32, h: 34 }, { w: 26, h: 58 }, { w: 14, h: 44 },
  { w: 36, h: 30 }, { w: 20, h: 50 }, { w: 30, h: 60 }, { w: 16, h: 38 },
]
const SKYLINE_TOTAL_W = SKYLINE.reduce((s, b) => s + b.w + 3, -3)

// ─── Perspective helpers ──────────────────────────────────────────────────────

/** Screen-y for a given road progress t (0 = horizon, 1 = bottom). */
function perspY(t: number): number {
  return HORIZON_Y + t * (VH - HORIZON_Y)
}

/** Screen-x for the centre of `lane` (0–2) at road progress t. */
function perspX(t: number, lane: number): number {
  const f = (lane + 0.5) / NUM_LANES - 0.5  // –0.333, 0, +0.333
  return VP_X + f * 2 * ROAD_HALF_W * t
}

/** Left and right road-edge x at a given progress t. */
function roadEdge(t: number): [number, number] {
  return [VP_X - ROAD_HALF_W * t, VP_X + ROAD_HALF_W * t]
}

// ─── Colour utilities ─────────────────────────────────────────────────────────

function shade(hex: string, amt: number): string {
  const n = parseInt(hex.replace('#', ''), 16)
  const r = Math.min(255, Math.max(0, (n >> 16) + amt))
  const g = Math.min(255, Math.max(0, ((n >> 8) & 0xff) + amt))
  const b = Math.min(255, Math.max(0, (n & 0xff) + amt))
  return `rgb(${r},${g},${b})`
}

/** Rounded-rectangle path (does not stroke/fill). */
function rrect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number,
) {
  r = Math.min(r, Math.abs(w) / 2, Math.abs(h) / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y, x + w, y + r, r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h, x, y + h - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

// ─── Palette definitions ──────────────────────────────────────────────────────

type PaletteKey = 'day' | 'night' | 'mountain'

interface Palette {
  skyTop: string; skyBot: string
  skylineColor: string
  roadTop: string; roadBot: string
  grassColor: string
  edgeColor: string
  lampPole: string; lampHead: string; lampGlow: string
  dashColor: string
}

const PALETTES: Record<PaletteKey, Palette> = {
  day: {
    skyTop: '#0a1628', skyBot: '#0d1f3e',
    skylineColor: 'rgba(8,18,42,0.92)',
    roadTop: '#14142a', roadBot: '#1c1c36',
    grassColor: '#0b2216',
    edgeColor: '#f97316',
    lampPole: '#6b7280', lampHead: '#9ca3af', lampGlow: '#d1d5db',
    dashColor: 'rgba(255,255,255,0.28)',
  },
  night: {
    skyTop: '#000408', skyBot: '#010510',
    skylineColor: 'rgba(1,3,10,0.96)',
    roadTop: '#080812', roadBot: '#0c0c1a',
    grassColor: '#04090a',
    edgeColor: '#f97316',
    lampPole: '#c2800a', lampHead: '#f59e0b', lampGlow: '#fbbf24',
    dashColor: 'rgba(255,235,160,0.32)',
  },
  mountain: {
    skyTop: '#18181e', skyBot: '#1c1e28',
    skylineColor: 'rgba(10,10,20,0.94)',
    roadTop: '#20202c', roadBot: '#282838',
    grassColor: '#112210',
    edgeColor: '#f97316',
    lampPole: '#7a9a7a', lampHead: '#a0c4a0', lampGlow: '#c0dfc0',
    dashColor: 'rgba(190,240,190,0.28)',
  },
}

// ─── Game types ───────────────────────────────────────────────────────────────

type PowerupKind = 'heart' | 'star' | 'fuel'

interface Obstacle {
  lane: number
  t: number
  color: string
}

interface Powerup {
  lane: number
  t: number
  kind: PowerupKind
}

/** A roadside lamp post: `t` tracks its current road progress, `side` is ±1. */
interface LampPost {
  t: number
  side: -1 | 1
}

interface GameState {
  // core
  score: number
  lives: number
  speed: number
  fuel: number
  frame: number
  over: boolean
  // entities
  obstacles: Obstacle[]
  powerups: Powerup[]
  // player
  invincible: boolean
  invincibleTimer: number
  shakeTimer: number
  playerLane: number
  playerX: number        // current smoothed screen-x
  playerTargetX: number
  // environment
  palette: PaletteKey
  bannerText: string | null
  bannerTimer: number
  // parallax state
  lampPosts: LampPost[]
  lineOffset: number     // lane dash animation offset (pixels, scrolling)
  skylineScroll: number  // skyline horizontal scroll offset (pixels)
  // input tracking
  prevLeft: boolean
  prevRight: boolean
  lastSwitchMs: number
  touchStartX: number
}

function makeInitState(): GameState {
  // Seed lamp posts evenly along the road on alternating sides
  const lampPosts: LampPost[] = Array.from({ length: 10 }, (_, i) => ({
    t: i / 10,
    side: (i % 2 === 0 ? -1 : 1) as -1 | 1,
  }))
  const startX = perspX(PLAYER_T, 1)
  return {
    score: 0, lives: 3, speed: 4, fuel: MAX_FUEL, frame: 0, over: false,
    obstacles: [], powerups: [],
    invincible: false, invincibleTimer: 0, shakeTimer: 0,
    playerLane: 1, playerX: startX, playerTargetX: startX,
    palette: 'day', bannerText: null, bannerTimer: 0,
    lampPosts, lineOffset: 0, skylineScroll: 0,
    prevLeft: false, prevRight: false, lastSwitchMs: 0, touchStartX: 0,
  }
}

// ─── Drawing: background, road, parallax ─────────────────────────────────────

function drawEnvironment(ctx: CanvasRenderingContext2D, st: GameState): void {
  const pal = PALETTES[st.palette]

  // ── Sky gradient ──────────────────────────────────────────────────────────
  const sky = ctx.createLinearGradient(0, 0, 0, HORIZON_Y)
  sky.addColorStop(0, pal.skyTop)
  sky.addColorStop(1, pal.skyBot)
  ctx.fillStyle = sky
  ctx.fillRect(0, 0, VW, HORIZON_Y + 2)

  // ── City skyline silhouette (parallax layer 2 — scrolls at 0.6× road) ────
  {
    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, VW, HORIZON_Y)
    ctx.clip()
    ctx.fillStyle = pal.skylineColor
    for (let pass = 0; pass <= Math.ceil(VW / SKYLINE_TOTAL_W) + 1; pass++) {
      let bx = pass * SKYLINE_TOTAL_W - (st.skylineScroll % SKYLINE_TOTAL_W)
      for (const { w, h } of SKYLINE) {
        if (bx > VW) break
        if (bx + w > 0) ctx.fillRect(bx, HORIZON_Y - h, w, h)
        bx += w + 3
      }
    }
    ctx.restore()
  }

  // ── Ground (grass / terrain sides) ───────────────────────────────────────
  ctx.fillStyle = pal.grassColor
  ctx.fillRect(0, HORIZON_Y, VW, VH - HORIZON_Y)

  // ── Road surface — perspective trapezoid converging to vanishing point ────
  const roadGrad = ctx.createLinearGradient(0, HORIZON_Y, 0, VH)
  roadGrad.addColorStop(0, pal.roadTop)
  roadGrad.addColorStop(1, pal.roadBot)
  ctx.fillStyle = roadGrad
  ctx.beginPath()
  ctx.moveTo(VP_X, HORIZON_Y)
  ctx.lineTo(ROAD_RIGHT_BTM, VH)
  ctx.lineTo(ROAD_LEFT_BTM, VH)
  ctx.closePath()
  ctx.fill()

  // Road edge kerb lines
  ctx.strokeStyle = pal.edgeColor
  ctx.lineWidth = 4
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(VP_X, HORIZON_Y)
  ctx.lineTo(ROAD_LEFT_BTM, VH)
  ctx.stroke()
  ctx.beginPath()
  ctx.moveTo(VP_X, HORIZON_Y)
  ctx.lineTo(ROAD_RIGHT_BTM, VH)
  ctx.stroke()

  // ── Lane dividers — perspective dashes, speed-reactive length ────────────
  {
    // speedT: 0 at min speed, 1 at max speed
    const speedT = Math.min(1, (st.speed - 4) / 16)
    // At high speed, dashes stretch to near-continuous lines
    const dashT = 0.028 + speedT * 0.064
    const gapT  = Math.max(0.006, 0.038 - speedT * 0.032)
    // Animated offset as a fraction of t-space
    const animOffset = (st.lineOffset / (VH - HORIZON_Y)) * (dashT + gapT)

    for (let div = 1; div < NUM_LANES; div++) {
      // Fractional position across road width: 1/3, 2/3
      const f = div / NUM_LANES
      let t = animOffset % (dashT + gapT)
      while (t < 1.0) {
        const t1 = t
        const t2 = Math.min(1.0, t + dashT)
        // Fade in near horizon to avoid sharp pop-in
        const alpha = Math.min(1, (t1 - 0.08) / 0.12)
        if (alpha > 0) {
          const x1 = VP_X + (f - 0.5) * 2 * ROAD_HALF_W * t1
          const y1 = perspY(t1)
          const x2 = VP_X + (f - 0.5) * 2 * ROAD_HALF_W * t2
          const y2 = perspY(t2)
          ctx.save()
          ctx.globalAlpha = alpha
          ctx.strokeStyle = pal.dashColor
          ctx.lineWidth = 1.5 + t1 * 2
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(x1, y1)
          ctx.lineTo(x2, y2)
          ctx.stroke()
          ctx.restore()
        }
        t += dashT + gapT
      }
    }
  }

  // ── Lamp posts (parallax layer 1 — perspective-positioned, 0.3× speed) ───
  {
    for (const lp of st.lampPosts) {
      if (lp.t < 0.05) continue
      const [edgeL, edgeR] = roadEdge(lp.t)
      const lx = lp.side === -1
        ? edgeL - 20 * lp.t   // left of road, scales with perspective
        : edgeR + 20 * lp.t
      const sy = perspY(lp.t)

      const poleH = 52 * lp.t
      const poleW = Math.max(1, 3.5 * lp.t)
      const headR = Math.max(1.5, 8 * lp.t)

      // Pole
      ctx.fillStyle = pal.lampPole
      ctx.fillRect(lx - poleW / 2, sy - poleH, poleW, poleH)

      // Lamp head + optional night glow
      if (st.palette === 'night') {
        ctx.save()
        ctx.shadowBlur = 22 * lp.t
        ctx.shadowColor = pal.lampGlow
      }
      ctx.fillStyle = pal.lampHead
      ctx.beginPath()
      ctx.arc(lx, sy - poleH, headR, 0, Math.PI * 2)
      ctx.fill()
      if (st.palette === 'night') ctx.restore()
    }
  }
}

// ─── Drawing: cars ────────────────────────────────────────────────────────────

function drawCar(
  ctx: CanvasRenderingContext2D,
  cx: number,        // centre x in virtual units
  bottomY: number,   // bottom y in virtual units
  t: number,         // perspective scale factor (0–1)
  color: string,
  isPlayer: boolean,
  _frame: number,
): void {
  const W = CAR_BASE_W * t
  const H = CAR_BASE_H * t
  const x = cx - W / 2
  const y = bottomY - H

  // Too small to detail — draw a simple coloured blip
  if (t < 0.12) {
    ctx.fillStyle = color
    rrect(ctx, x, y, W, H, W * 0.15)
    ctx.fill()
    return
  }

  const r = W * 0.14
  ctx.save()

  // ── Wheels (behind body) ──────────────────────────────────────────────────
  const wW = W * 0.30
  const wH = H * 0.185
  const wR = wW * 0.42
  const wPositions: Array<[number, number]> = [
    [x - wW * 0.28, y + H * 0.06],
    [x + W - wW * 0.72, y + H * 0.06],
    [x - wW * 0.28, y + H * 0.73],
    [x + W - wW * 0.72, y + H * 0.73],
  ]
  for (const [wx, wy] of wPositions) {
    ctx.fillStyle = '#191919'
    rrect(ctx, wx, wy, wW, wH, wR)
    ctx.fill()
    ctx.fillStyle = '#404040'
    rrect(ctx, wx + 1.5 * t, wy + 1.5 * t, wW - 3 * t, wH - 3 * t, wR)
    ctx.fill()
  }

  // ── Car body ──────────────────────────────────────────────────────────────
  const bodyGrad = ctx.createLinearGradient(x, y, x + W, y + H)
  bodyGrad.addColorStop(0, color)
  bodyGrad.addColorStop(0.55, shade(color, -18))
  bodyGrad.addColorStop(1, shade(color, -48))
  ctx.fillStyle = bodyGrad
  rrect(ctx, x + wW * 0.1, y + H * 0.03, W - wW * 0.2, H * 0.94, r)
  ctx.fill()

  // Subtle roof highlight line
  ctx.strokeStyle = `rgba(255,255,255,${0.12 * t})`
  ctx.lineWidth = 1 * t
  ctx.beginPath()
  ctx.moveTo(x + W * 0.25, y + H * 0.28)
  ctx.lineTo(x + W * 0.75, y + H * 0.28)
  ctx.stroke()

  // ── Hood (front) — trapezoid ──────────────────────────────────────────────
  ctx.fillStyle = shade(color, -14)
  ctx.beginPath()
  ctx.moveTo(x + W * 0.16, y + H * 0.01)
  ctx.lineTo(x + W * 0.84, y + H * 0.01)
  ctx.lineTo(x + W * 0.78, y + H * 0.20)
  ctx.lineTo(x + W * 0.22, y + H * 0.20)
  ctx.closePath()
  ctx.fill()

  // ── Windshield — trapezoid (wide at bottom, narrows at top) ──────────────
  ctx.fillStyle = isPlayer ? 'rgba(170,222,255,0.88)' : 'rgba(96,148,200,0.62)'
  ctx.beginPath()
  ctx.moveTo(x + W * 0.20, y + H * 0.06)
  ctx.lineTo(x + W * 0.80, y + H * 0.06)
  ctx.lineTo(x + W * 0.76, y + H * 0.27)
  ctx.lineTo(x + W * 0.24, y + H * 0.27)
  ctx.closePath()
  ctx.fill()

  // Windshield glare
  ctx.fillStyle = `rgba(255,255,255,${0.20 * t})`
  ctx.beginPath()
  ctx.moveTo(x + W * 0.22, y + H * 0.07)
  ctx.lineTo(x + W * 0.42, y + H * 0.07)
  ctx.lineTo(x + W * 0.38, y + H * 0.25)
  ctx.lineTo(x + W * 0.24, y + H * 0.25)
  ctx.closePath()
  ctx.fill()

  // ── Rear window — trapezoid ───────────────────────────────────────────────
  ctx.fillStyle = isPlayer ? 'rgba(110,178,238,0.65)' : 'rgba(65,106,160,0.52)'
  ctx.beginPath()
  ctx.moveTo(x + W * 0.25, y + H * 0.57)
  ctx.lineTo(x + W * 0.75, y + H * 0.57)
  ctx.lineTo(x + W * 0.78, y + H * 0.73)
  ctx.lineTo(x + W * 0.22, y + H * 0.73)
  ctx.closePath()
  ctx.fill()

  // ── Headlights / tail-lights ──────────────────────────────────────────────
  const hlR = W * 0.095
  if (isPlayer) {
    ctx.save()
    ctx.shadowBlur = 14 * t
    ctx.shadowColor = '#fde68a'
    ctx.fillStyle = '#fde68a'
    ctx.beginPath(); ctx.arc(x + W * 0.17, y + H * 0.04, hlR, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(x + W * 0.83, y + H * 0.04, hlR, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  } else {
    // Opponent headlights (front — oncoming)
    ctx.fillStyle = 'rgba(230,240,255,0.9)'
    ctx.beginPath(); ctx.arc(x + W * 0.17, y + H * 0.04, hlR, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(x + W * 0.83, y + H * 0.04, hlR, 0, Math.PI * 2); ctx.fill()
    // Tail-lights (rear)
    ctx.fillStyle = 'rgba(255,45,45,0.88)'
    ctx.beginPath(); ctx.arc(x + W * 0.17, y + H * 0.94, hlR * 0.85, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(x + W * 0.83, y + H * 0.94, hlR * 0.85, 0, Math.PI * 2); ctx.fill()
  }

  ctx.restore()
}

// ─── Drawing: powerups ────────────────────────────────────────────────────────

function drawPowerup(ctx: CanvasRenderingContext2D, p: Powerup, frame: number): void {
  const cx = perspX(p.t, p.lane)
  const cy = perspY(p.t)
  const s = p.t

  ctx.save()
  // Gentle bobbing animation
  ctx.translate(cx, cy + Math.sin(frame * 0.07) * 3 * s)

  if (p.kind === 'fuel') {
    // Fuel canister: yellow rounded rect + cap + emoji
    const fw = 24 * s; const fh = 28 * s; const fr = 4 * s
    ctx.save()
    ctx.shadowBlur = 10 * s; ctx.shadowColor = '#fbbf24'
    ctx.fillStyle = '#f59e0b'
    rrect(ctx, -fw / 2, -fh, fw, fh, fr); ctx.fill()
    // Cap nozzle
    ctx.fillStyle = '#92400e'
    rrect(ctx, -fw * 0.28, -fh - 5 * s, fw * 0.56, 5 * s, 2 * s); ctx.fill()
    ctx.restore()
    if (s > 0.28) {
      ctx.font = `${Math.max(8, Math.round(14 * s))}px serif`
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
      ctx.fillText('⛽', 0, -fh / 2)
    }
  } else {
    const emoji = p.kind === 'heart' ? '❤️' : '⭐'
    const glowColor = p.kind === 'heart' ? '#f43f5e' : '#fbbf24'
    ctx.save()
    ctx.shadowBlur = 14 * s; ctx.shadowColor = glowColor
    ctx.font = `${Math.max(10, Math.round(26 * s))}px serif`
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(emoji, 0, 0)
    ctx.restore()
  }

  ctx.restore()
}

// ─── Drawing: HUD overlays ────────────────────────────────────────────────────

function drawSpeedometer(ctx: CanvasRenderingContext2D, speed: number): void {
  const cx = VW - 56; const cy = VH - 56; const R = 36

  // 270° arc: starts lower-left (135°), ends lower-right (405° = 45°)
  const START = Math.PI * 0.75
  const END   = Math.PI * 2.25
  const frac  = Math.min(1, (speed - 4) / 16)
  const valueAngle = START + frac * (END - START)
  const mph = Math.round(frac * 200)

  ctx.save()

  // Background disc
  ctx.fillStyle = 'rgba(0,0,0,0.58)'
  ctx.beginPath(); ctx.arc(cx, cy, R + 6, 0, Math.PI * 2); ctx.fill()

  // Track arc
  ctx.strokeStyle = 'rgba(255,255,255,0.12)'
  ctx.lineWidth = 5; ctx.lineCap = 'butt'
  ctx.beginPath(); ctx.arc(cx, cy, R, START, END); ctx.stroke()

  // Value arc (green → yellow → red with speed)
  const arcR = Math.round(Math.min(255, frac * 2 * 255))
  const arcG = Math.round(Math.min(220, (1 - Math.max(0, frac - 0.5) * 2) * 200))
  ctx.strokeStyle = `rgb(${arcR},${arcG},40)`
  ctx.lineWidth = 5; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.arc(cx, cy, R, START, valueAngle); ctx.stroke()

  // Needle
  const nx = cx + Math.cos(valueAngle) * (R - 9)
  const ny = cy + Math.sin(valueAngle) * (R - 9)
  ctx.strokeStyle = '#f8f8f8'; ctx.lineWidth = 1.8; ctx.lineCap = 'round'
  ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(nx, ny); ctx.stroke()

  // Centre pivot
  ctx.fillStyle = '#e5e7eb'
  ctx.beginPath(); ctx.arc(cx, cy, 3.5, 0, Math.PI * 2); ctx.fill()

  // MPH readout
  ctx.fillStyle = '#e5e7eb'
  ctx.font = `bold ${mph >= 100 ? 11 : 12}px monospace`
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(String(mph), cx, cy + 9)

  ctx.fillStyle = 'rgba(255,255,255,0.38)'
  ctx.font = '7px monospace'
  ctx.fillText('MPH', cx, cy + 19)

  ctx.restore()
}

function drawFuelBar(ctx: CanvasRenderingContext2D, fuel: number): void {
  const bx = 8; const by = 118; const bw = 8; const bh = 158
  const frac = fuel / MAX_FUEL
  const fuelColor = frac > 0.5 ? '#22c55e' : frac > 0.25 ? '#f59e0b' : '#ef4444'

  ctx.save()

  // Outer border
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  rrect(ctx, bx - 2, by - 12, bw + 4, bh + 16, 5); ctx.fill()

  // Track
  ctx.fillStyle = 'rgba(255,255,255,0.08)'
  rrect(ctx, bx, by, bw, bh, 3); ctx.fill()

  // Fuel fill (bottom-up)
  const fillH = bh * frac
  ctx.save()
  ctx.beginPath(); rrect(ctx, bx, by, bw, bh, 3); ctx.clip()
  ctx.fillStyle = fuelColor
  ctx.fillRect(bx, by + bh - fillH, bw, fillH)
  ctx.restore()

  // Low-fuel warning pulse
  if (frac < 0.25) {
    ctx.fillStyle = `rgba(239,68,68,${0.3 + 0.3 * Math.sin(Date.now() / 180)})`
    rrect(ctx, bx - 1, by - 1, bw + 2, bh + 2, 4); ctx.fill()
  }

  // Icon
  ctx.font = '8px serif'; ctx.textAlign = 'center'
  ctx.fillText('⛽', bx + bw / 2, by - 3)

  ctx.restore()
}

function drawHUD(ctx: CanvasRenderingContext2D, st: GameState): void {
  ctx.save()

  // ── Score badge ───────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(0,0,0,0.56)'
  rrect(ctx, 22, 10, 128, 32, 7); ctx.fill()
  ctx.fillStyle = '#fde68a'; ctx.font = 'bold 13px monospace'; ctx.textAlign = 'left'
  ctx.fillText(`SCORE: ${st.score}`, 30, 30)

  // ── Lives (hearts) ────────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(0,0,0,0.56)'
  rrect(ctx, VW - 98, 10, 88, 32, 7); ctx.fill()
  ctx.font = '14px serif'; ctx.textAlign = 'left'
  ctx.fillText('❤️'.repeat(st.lives), VW - 90, 30)

  // ── Speed text badge ──────────────────────────────────────────────────────
  ctx.fillStyle = 'rgba(0,0,0,0.46)'
  rrect(ctx, 22, 48, 96, 19, 5); ctx.fill()
  ctx.fillStyle = '#6ee7b7'; ctx.font = '10px monospace'; ctx.textAlign = 'left'
  const mph = Math.round((Math.min(1, (st.speed - 4) / 16)) * 200)
  ctx.fillText(`SPD  ${mph} MPH`, 28, 61)

  // ── Star-power flash ──────────────────────────────────────────────────────
  if (st.invincible) {
    ctx.fillStyle = '#fbbf24'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'
    ctx.fillText('⭐ STAR POWER!', VW / 2, 26)
  }

  // ── Fuel bar (left edge) ──────────────────────────────────────────────────
  drawFuelBar(ctx, st.fuel)

  // ── Speedometer arc (bottom-right) ───────────────────────────────────────
  drawSpeedometer(ctx, st.speed)

  ctx.restore()
}

function drawBanner(ctx: CanvasRenderingContext2D, text: string, timer: number): void {
  const alpha = Math.min(1, timer / 25) * Math.min(1, (timer / 150) * 3)
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.fillStyle = 'rgba(4,6,16,0.72)'
  rrect(ctx, VP_X - 138, VH / 2 - 28, 276, 56, 10); ctx.fill()
  ctx.strokeStyle = 'rgba(201,168,76,0.45)'; ctx.lineWidth = 1
  rrect(ctx, VP_X - 138, VH / 2 - 28, 276, 56, 10); ctx.stroke()
  ctx.fillStyle = '#fde68a'; ctx.font = 'bold 17px monospace'
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
  ctx.fillText(text, VP_X, VH / 2)
  ctx.restore()
}

// ─── Inner game canvas ────────────────────────────────────────────────────────

function CarGameCanvas(props: GameRenderProps): React.ReactElement {
  const { isPaused, isGameOver, setScore, setGameOver } = props

  const wrapperRef = useRef<HTMLDivElement>(null)
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const sizeRef    = useRef({ w: VW, h: VH })
  const stRef      = useRef<GameState>(makeInitState())
  const prevGORef  = useRef(false)

  // Stable refs for props that change (avoids re-creating gameTick on every score update)
  const isGORef        = useRef(isGameOver)
  const setScoreRef    = useRef(setScore)
  const setGameOverRef = useRef(setGameOver)
  useEffect(() => { isGORef.current = isGameOver }, [isGameOver])
  useEffect(() => { setScoreRef.current = setScore }, [setScore])
  useEffect(() => { setGameOverRef.current = setGameOver }, [setGameOver])

  // Keyboard state — useKeyboard returns a snapshot; keep a stable ref
  const keysSnap = useKeyboard(['ArrowLeft', 'ArrowRight'])
  const keysRef  = useRef(keysSnap)
  useEffect(() => { keysRef.current = keysSnap }, [keysSnap])

  // ── Responsive canvas (ResizeObserver) ─────────────────────────────────────
  useEffect(() => {
    const wrapper = wrapperRef.current
    const canvas  = canvasRef.current
    if (!wrapper || !canvas) return

    // Set an initial size immediately so the first tick has valid dimensions
    const rect = wrapper.getBoundingClientRect()
    const initW = Math.round(rect.width) || VW
    const initH = Math.round(rect.height) || VH
    canvas.width = initW; canvas.height = initH
    sizeRef.current = { w: initW, h: initH }

    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      const w = Math.round(width) || VW
      const h = Math.round(height) || VH
      canvas.width = w; canvas.height = h
      sizeRef.current = { w, h }
    })
    ro.observe(wrapper)
    return () => ro.disconnect()
  }, [])

  // ── Touch controls (swipe to switch lane) ──────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    function onTouchStart(e: TouchEvent) {
      const touch = e.touches.item(0)
      if (!touch) return
      stRef.current.touchStartX = touch.clientX
    }
    function onTouchEnd(e: TouchEvent) {
      const touch = e.changedTouches.item(0)
      if (!touch) return
      const dx = touch.clientX - stRef.current.touchStartX
      const now = Date.now()
      const st = stRef.current
      if (now - st.lastSwitchMs < 150) return
      if (dx < -30 && st.playerLane > 0) {
        st.playerLane--
        st.playerTargetX = perspX(PLAYER_T, st.playerLane)
        st.lastSwitchMs = now
      } else if (dx > 30 && st.playerLane < NUM_LANES - 1) {
        st.playerLane++
        st.playerTargetX = perspX(PLAYER_T, st.playerLane)
        st.lastSwitchMs = now
      }
    }
    canvas.addEventListener('touchstart', onTouchStart, { passive: true })
    canvas.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      canvas.removeEventListener('touchstart', onTouchStart)
      canvas.removeEventListener('touchend', onTouchEnd)
    }
  }, [])

  // ── Main game tick (stable — all mutable state accessed via refs) ───────────
  const gameTick = useCallback((dt: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const { w, h } = sizeRef.current

    // Detect "Play Again" — isGameOver just transitioned false→…→false
    if (!isGORef.current && prevGORef.current) {
      stRef.current = makeInitState()
    }
    prevGORef.current = isGORef.current

    const prev = stRef.current
    if (isGORef.current || prev.over) return

    const st: GameState = {
      ...prev,
      obstacles: prev.obstacles.map((obs) => ({ ...obs })),
      powerups: prev.powerups.map((powerup) => ({ ...powerup })),
      lampPosts: prev.lampPosts.map((lampPost) => ({ ...lampPost })),
    }

    // ── Input ─────────────────────────────────────────────────────────────────
    const left  = keysRef.current['ArrowLeft']  ?? false
    const right = keysRef.current['ArrowRight'] ?? false
    const now   = Date.now()

    // Rising-edge detection so held keys don't repeat every frame
    if (left && !st.prevLeft && now - st.lastSwitchMs > 150 && st.playerLane > 0) {
      st.playerLane--
      st.playerTargetX = perspX(PLAYER_T, st.playerLane)
      st.lastSwitchMs = now
    }
    if (right && !st.prevRight && now - st.lastSwitchMs > 150 && st.playerLane < 2) {
      st.playerLane++
      st.playerTargetX = perspX(PLAYER_T, st.playerLane)
      st.lastSwitchMs = now
    }
    st.prevLeft = left; st.prevRight = right

    st.frame++

    // ── Core game logic ───────────────────────────────────────────────────────

    // Speed ramps with score, capped at 20
    st.speed = Math.min(20, 4 + st.score * 0.04)

    // Fuel drains at 1 unit/second
    st.fuel = Math.max(0, st.fuel - dt)
    if (st.fuel === 0) {
      st.over = true
      stRef.current = st
      setGameOverRef.current(true, st.score)
      return
    }

    // Milestone palette shift
    const targetPalette: PaletteKey =
      st.score >= 1000 ? 'mountain' : st.score >= 500 ? 'night' : 'day'
    if (targetPalette !== st.palette) {
      st.palette = targetPalette
      const labels: Record<PaletteKey, string> = {
        day: '', night: '⚡  NIGHT HIGHWAY', mountain: '🏔  MOUNTAIN PASS',
      }
      if (labels[targetPalette]) {
        st.bannerText = labels[targetPalette]
        st.bannerTimer = 150
      }
    }
    if (st.bannerTimer > 0) st.bannerTimer--
    else st.bannerText = null

    // Smooth lane-switch lerp
    st.playerX += (st.playerTargetX - st.playerX) * 0.18

    // Fraction of t-space covered per second (converts speed px/frame at 60fps → t/s)
    const tStep = (st.speed * 60) / (VH - HORIZON_Y)

    // Parallax scrolling offsets
    st.lineOffset    = (st.lineOffset    + st.speed * dt * 60) % (VH - HORIZON_Y)
    st.skylineScroll = (st.skylineScroll + st.speed * 0.06 * dt * 60) % SKYLINE_TOTAL_W

    // Lamp posts move at 0.3× road speed in t-space
    for (const lp of st.lampPosts) {
      lp.t += tStep * 0.3 * dt
      if (lp.t > 1.14) lp.t -= 1.1   // wrap back to near horizon
    }

    // Invincibility countdown
    if (st.invincible) {
      st.invincibleTimer--
      if (st.invincibleTimer <= 0) st.invincible = false
    }

    // Screen-shake cooldown
    if (st.shakeTimer > 0) st.shakeTimer--

    // Spawn obstacles (interval decreases with score)
    const interval = Math.max(40, 80 - Math.floor(st.score / 5))
    if (st.frame % interval === 0) {
      st.obstacles.push({
        lane: Math.floor(Math.random() * 3),
        t: 0.06,
        color: OBS_COLORS[Math.floor(Math.random() * OBS_COLORS.length)],
      })
    }

    // Spawn powerups: heart 40%, star 35%, fuel 25%
    if (st.frame % 180 === 0) {
      const roll = Math.random()
      st.powerups.push({
        lane: Math.floor(Math.random() * 3),
        t: 0.06,
        kind: roll < 0.40 ? 'heart' : roll < 0.75 ? 'star' : 'fuel',
      })
    }

    // ── Obstacle updates ──────────────────────────────────────────────────────
    for (let i = st.obstacles.length - 1; i >= 0; i--) {
      st.obstacles[i].t += tStep * dt

      const obs = st.obstacles[i]

      // Collision: same lane, car height window centred on PLAYER_T
      if (
        !st.invincible &&
        obs.lane === st.playerLane &&
        obs.t >= PLAYER_T - 0.13 &&
        obs.t <= PLAYER_T + 0.04
      ) {
        st.obstacles.splice(i, 1)
        st.lives--
        st.shakeTimer = 18
        if (st.lives <= 0) {
          st.over = true
          stRef.current = st
          setGameOverRef.current(true, st.score)
          return
        }
        continue
      }

      // Passed player → score point
      if (obs.t > PLAYER_T + 0.08) {
        st.obstacles.splice(i, 1)
        st.score++
        setScoreRef.current(st.score)
      }
    }

    // ── Powerup updates ───────────────────────────────────────────────────────
    for (let i = st.powerups.length - 1; i >= 0; i--) {
      st.powerups[i].t += tStep * 0.8 * dt

      const p = st.powerups[i]

      // Collection
      if (
        p.lane === st.playerLane &&
        p.t >= PLAYER_T - 0.10 &&
        p.t <= PLAYER_T + 0.04
      ) {
        st.powerups.splice(i, 1)
        if (p.kind === 'heart') {
          st.lives = Math.min(3, st.lives + 1)
        } else if (p.kind === 'star') {
          st.invincible = true
          st.invincibleTimer = 180
        } else {
          // Fuel canister: restore 40%
          st.fuel = Math.min(MAX_FUEL, st.fuel + MAX_FUEL * 0.4)
        }
        continue
      }

      if (p.t > PLAYER_T + 0.10) st.powerups.splice(i, 1)
    }

    // ── Draw frame ────────────────────────────────────────────────────────────
    ctx.clearRect(0, 0, w, h)

    // Scale virtual canvas to fit the actual canvas, letterboxing if necessary
    const scale = Math.min(w / VW, h / VH)
    const ox = (w - VW * scale) / 2
    const oy = (h - VH * scale) / 2

    ctx.save()
    ctx.translate(ox, oy)
    ctx.scale(scale, scale)

    // Clip to virtual area
    ctx.beginPath(); ctx.rect(0, 0, VW, VH); ctx.clip()

    // Screen shake on collision
    if (st.shakeTimer > 0) {
      ctx.translate((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8)
    }

    // Background, road, parallax (lamp posts + skyline)
    drawEnvironment(ctx, st)

    // Powerups
    for (const p of st.powerups) {
      if (p.t > 0.05) drawPowerup(ctx, p, st.frame)
    }

    // Obstacles — draw back to front (ascending t = far to near)
    const sortedObs = st.obstacles.slice().sort((a, b) => a.t - b.t)
    for (const obs of sortedObs) {
      drawCar(ctx, perspX(obs.t, obs.lane), perspY(obs.t), obs.t, obs.color, false, st.frame)
    }

    // Player car
    {
      const pY = perspY(PLAYER_T)
      ctx.save()
      if (st.invincible) {
        ctx.shadowBlur = 22; ctx.shadowColor = '#fbbf24'
        if (st.frame % 6 < 3) ctx.globalAlpha = 0.62
      }
      drawCar(
        ctx, st.playerX, pY, PLAYER_T,
        st.invincible ? '#fbbf24' : '#6366f1',
        true, st.frame,
      )
      ctx.restore()
    }

    // HUD (score, lives, fuel, speedometer)
    drawHUD(ctx, st)

    // Milestone banner
    if (st.bannerText && st.bannerTimer > 0) {
      drawBanner(ctx, st.bannerText, st.bannerTimer)
    }

    ctx.restore()
    stRef.current = st
  }, []) // stable — all values read through refs

  useGameLoop(gameTick, { paused: isPaused })

  return (
    <div
      ref={wrapperRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: '#060b18',
        // Enforce 3:4 game aspect ratio when the shell container has flexible height
        // (falls back gracefully to filling all available height)
        minHeight: '360px',
      }}
    >
      <canvas
        ref={canvasRef}
        style={{ display: 'block', width: '100%', height: '100%' }}
      />
    </div>
  )
}

// ─── Public export ────────────────────────────────────────────────────────────

const ROAD_RUNNER_TOP_SCORER = {
  recordKey: 'yor:road-racing:top-scorer',
  label: 'Top scorer',
  defaultName: 'Road Runner Ace',
} as const

export default function CarGame(): React.ReactElement {
  return (
    <GameShell
      title="Yor Road Runner"
      highScoreKey="yor:road-racing:highscore"
      namedHighScore={ROAD_RUNNER_TOP_SCORER}
      controls={[
        { key: '← →', action: 'Switch lane' },
        { key: 'Swipe', action: 'Switch lane (mobile)' },
        { key: 'Esc', action: 'Pause / resume' },
      ]}
    >
      {(props) => <CarGameCanvas {...props} />}
    </GameShell>
  )
}
