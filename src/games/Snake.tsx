'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import GameShell from './GameShell'
import type { GameRenderProps } from './GameShell'
import { useGameLoop } from '../hooks/useGameLoop'
import { useKeyboard } from '../hooks/useKeyboard'

// ─── Types ────────────────────────────────────────────────────────────────────

type GridSize = 'small' | 'medium' | 'large'
type Pos      = { x: number; y: number }
type Dir      = { x: number; y: number }

// ─── Constants ────────────────────────────────────────────────────────────────

const GRID: Record<GridSize, { cols: number; rows: number }> = {
  small:  { cols: 15, rows: 15 },
  medium: { cols: 20, rows: 20 },
  large:  { cols: 30, rows: 30 },
}

const DIR_RIGHT: Dir = {  x:  1, y:  0 }
const DIR_LEFT:  Dir = {  x: -1, y:  0 }
const DIR_UP:    Dir = {  x:  0, y: -1 }
const DIR_DOWN:  Dir = {  x:  0, y:  1 }

const INITIAL_SPEED    = 8    // ticks / sec
const MAX_SPEED        = 20
const FOODS_PER_SPEEDUP = 5
const PTS_PER_FOOD     = 10
const FOOD_TYPE_COUNT  = 6
const CANVAS_PADDING   = 1    // px inset per segment side
const SCORE_KEY        = 'yor:snake:highscore'

// Snake gradient anchors (R, G, B)
const RGB_HEAD:        [number, number, number] = [74,  222, 128]
const RGB_TAIL:        [number, number, number] = [20,  110,  58]
const RGB_BORDER_HEAD: [number, number, number] = [134, 239, 172]
const RGB_BORDER_TAIL: [number, number, number] = [22,   90,  50]
const FIELD_BORDER      = 'rgba(201, 168, 76, 0.35)'
const FIELD_BORDER_WRAP = 'rgba(122, 112, 96, 0.55)'

const SNAKE_CONTROLS = [
  { key: '↑ / W',     action: 'Move up'          },
  { key: '↓ / S',     action: 'Move down'        },
  { key: '← / A',     action: 'Move left'        },
  { key: '→ / D',     action: 'Move right'       },
  { key: 'Swipe',     action: 'Steer (mobile)'   },
  { key: 'Esc',       action: 'Pause / resume'   },
]

// ─── Colour helpers ──────────────────────────────────────────────────────────

function lerpRGB(
  from: [number, number, number],
  to:   [number, number, number],
  t:    number,
): string {
  const r = Math.round(from[0] + (to[0] - from[0]) * t)
  const g = Math.round(from[1] + (to[1] - from[1]) * t)
  const b = Math.round(from[2] + (to[2] - from[2]) * t)
  return `rgb(${r},${g},${b})`
}

// ─── Canvas helpers ───────────────────────────────────────────────────────────

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  w: number, h: number,
  r: number,
) {
  r = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + w - r, y)
  ctx.arcTo(x + w, y,     x + w, y + r,     r)
  ctx.lineTo(x + w, y + h - r)
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r)
  ctx.lineTo(x + r, y + h)
  ctx.arcTo(x, y + h,     x, y + h - r,     r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y,         x + r, y,         r)
  ctx.closePath()
}

// ─── Food drawing functions ──────────────────────────────────────────────────

/** 0 — React atom: nucleus + three orbiting ellipses */
function drawReactAtom(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const lw = Math.max(1, s * 0.1)
  ctx.strokeStyle = '#61dafb'
  ctx.fillStyle   = '#61dafb'
  ctx.lineWidth   = lw

  // nucleus
  ctx.beginPath()
  ctx.arc(cx, cy, s * 0.18, 0, Math.PI * 2)
  ctx.fill()

  // 3 elliptical orbits at 0°, 60°, 120°
  for (let i = 0; i < 3; i++) {
    ctx.save()
    ctx.translate(cx, cy)
    ctx.rotate((i * Math.PI) / 3)
    ctx.beginPath()
    ctx.ellipse(0, 0, s * 0.88, s * 0.3, 0, 0, Math.PI * 2)
    ctx.stroke()
    ctx.restore()
  }
}

/** 1 — Rust crab: oval body, two arc-claws, six leg strokes */
function drawRustCrab(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const col = '#e05d2e'
  ctx.fillStyle   = col
  ctx.strokeStyle = col
  ctx.lineWidth   = Math.max(1, s * 0.12)

  // body
  ctx.beginPath()
  ctx.ellipse(cx, cy, s * 0.52, s * 0.38, 0, 0, Math.PI * 2)
  ctx.fill()

  // left claw
  ctx.beginPath()
  ctx.arc(cx - s * 0.72, cy - s * 0.08, s * 0.26, Math.PI * 0.15, Math.PI * 1.2)
  ctx.stroke()

  // right claw
  ctx.beginPath()
  ctx.arc(cx + s * 0.72, cy - s * 0.08, s * 0.26, -Math.PI * 0.15, -Math.PI * 1.2, true)
  ctx.stroke()

  // six legs (three pairs)
  const legOffsets = [-0.28, 0, 0.3]
  ctx.lineWidth = Math.max(1, s * 0.08)
  for (const yo of legOffsets) {
    // left
    ctx.beginPath()
    ctx.moveTo(cx - s * 0.44, cy + s * yo)
    ctx.lineTo(cx - s * 0.82, cy + s * (yo + 0.22))
    ctx.stroke()
    // right
    ctx.beginPath()
    ctx.moveTo(cx + s * 0.44, cy + s * yo)
    ctx.lineTo(cx + s * 0.82, cy + s * (yo + 0.22))
    ctx.stroke()
  }
}

/** 2 — Python logo: two offset rounded-rect "snake bodies" (blue + yellow) */
function drawPythonLogo(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const r = s * 0.22
  const w = s * 0.62
  const h = s * 0.72

  // Blue body (top-right)
  ctx.fillStyle = '#3572A5'
  ctx.save()
  roundedRect(ctx, cx - w * 0.05, cy - h * 0.96, w, h, r)
  ctx.fill()
  ctx.restore()

  // Yellow body (bottom-left), slightly overlapping
  ctx.fillStyle = '#ffd43b'
  ctx.save()
  roundedRect(ctx, cx - w * 0.95, cy - h * 0.05, w, h, r)
  ctx.fill()
  ctx.restore()

  // Eyes
  ctx.fillStyle = 'white'
  ctx.beginPath()
  ctx.arc(cx + s * 0.32, cy - s * 0.6, s * 0.1, 0, Math.PI * 2)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(cx - s * 0.32, cy + s * 0.6, s * 0.1, 0, Math.PI * 2)
  ctx.fill()
}

/** 3 — JS logo: filled yellow square with "JS" text */
function drawJSLogo(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const half = s * 0.82
  ctx.fillStyle = '#f7df1e'
  roundedRect(ctx, cx - half, cy - half, half * 2, half * 2, s * 0.12)
  ctx.fill()

  ctx.fillStyle   = '#222'
  ctx.font        = `bold ${Math.round(s * 0.85)}px monospace`
  ctx.textAlign   = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText('JS', cx + s * 0.06, cy + s * 0.05)
}

/** 4 — Five-point star */
function drawStar(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const outerR = s * 0.9
  const innerR = s * 0.38
  ctx.fillStyle = '#ffd700'
  ctx.beginPath()
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5 - Math.PI / 2
    const r     = i % 2 === 0 ? outerR : innerR
    const x     = cx + Math.cos(angle) * r
    const y     = cy + Math.sin(angle) * r
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)
  }
  ctx.closePath()
  ctx.fill()
  // Subtle inner glow stroke
  ctx.strokeStyle = '#fff7aa'
  ctx.lineWidth   = Math.max(1, s * 0.06)
  ctx.stroke()
}

/** 5 — Heart via bezier curves */
function drawHeart(ctx: CanvasRenderingContext2D, cx: number, cy: number, s: number) {
  const sc = s * 0.88
  ctx.fillStyle = '#ff6b9d'
  ctx.beginPath()
  ctx.moveTo(cx, cy + sc * 0.3)
  ctx.bezierCurveTo(
    cx - sc * 1.0, cy - sc * 0.4,
    cx - sc * 1.2, cy + sc * 0.5,
    cx,            cy + sc * 0.95,
  )
  ctx.bezierCurveTo(
    cx + sc * 1.2, cy + sc * 0.5,
    cx + sc * 1.0, cy - sc * 0.4,
    cx,            cy + sc * 0.3,
  )
  ctx.closePath()
  ctx.fill()
  ctx.strokeStyle = '#ffb3cf'
  ctx.lineWidth   = Math.max(1, s * 0.06)
  ctx.stroke()
}

const FOOD_DRAW_FNS = [
  drawReactAtom,
  drawRustCrab,
  drawPythonLogo,
  drawJSLogo,
  drawStar,
  drawHeart,
]

// ─── Game logic helpers ───────────────────────────────────────────────────────

function spawnFood(snake: Pos[], cols: number, rows: number): Pos {
  const occupied = new Set(snake.map((p) => `${p.x},${p.y}`))
  const free: Pos[] = []
  for (let y = 0; y < rows; y++)
    for (let x = 0; x < cols; x++)
      if (!occupied.has(`${x},${y}`)) free.push({ x, y })
  return free.length > 0
    ? free[Math.floor(Math.random() * free.length)]
    : { x: 0, y: 0 }
}

function opposites(a: Dir, b: Dir): boolean {
  return a.x === -b.x && a.y === -b.y
}

function speedForCount(count: number): number {
  const bumps = Math.floor(count / FOODS_PER_SPEEDUP)
  return Math.min(INITIAL_SPEED + bumps * 2, MAX_SPEED)
}

// ─── SnakeCanvas — inner component ───────────────────────────────────────────

interface SnakeCanvasProps extends GameRenderProps {
  cols:      number
  rows:      number
  wrapMode:  boolean
  resetKey:  number   // increment externally to force a new game
}

function SnakeCanvas({
  isPaused,
  isGameOver,
  setScore,
  setGameOver,
  cols,
  rows,
  wrapMode,
  resetKey,
}: SnakeCanvasProps) {
  const canvasRef  = useRef<HTMLCanvasElement>(null)
  const wrapperRef = useRef<HTMLDivElement>(null)

  // ── All mutable game state lives in refs (no re-renders from the loop) ─────
  const snakeRef      = useRef<Pos[]>([])
  const dirRef        = useRef<Dir>(DIR_RIGHT)
  const pendingDirRef = useRef<Dir | null>(null)
  const foodRef       = useRef<Pos>({ x: 0, y: 0 })
  const foodTypeRef   = useRef<number>(0)
  const foodCountRef  = useRef<number>(0)
  const scoreRef      = useRef<number>(0)
  const speedRef      = useRef<number>(INITIAL_SPEED)
  const doneRef       = useRef<boolean>(false)

  // Prop mirrors in refs (read inside RAF without stale closures)
  const colsRef     = useRef(cols)
  const rowsRef     = useRef(rows)
  const wrapRef     = useRef(wrapMode)
  const cellSizeRef = useRef<number>(20)
  const drawFrameRef = useRef<(ctx: CanvasRenderingContext2D, cw: number, ch: number) => void>(() => {})

  useEffect(() => { colsRef.current = cols    }, [cols])
  useEffect(() => { rowsRef.current = rows    }, [rows])
  useEffect(() => { wrapRef.current = wrapMode }, [wrapMode])

  // Accumulator for variable-speed ticking inside the RAF callback
  const accumRef = useRef<number>(0)

  // ── Canvas responsive sizing ──────────────────────────────────────────────
  useEffect(() => {
    const wrapper = wrapperRef.current
    if (!wrapper) return
    const measure = () => {
      const canvas = canvasRef.current
      if (!canvas) return
      const W = wrapper.clientWidth
      const H = wrapper.clientHeight
      const cs = Math.max(6, Math.floor(Math.min(W / colsRef.current, H / rowsRef.current)))
      cellSizeRef.current = cs
      canvas.width  = colsRef.current * cs
      canvas.height = rowsRef.current * cs
    }
    measure()
    const obs = new ResizeObserver(measure)
    obs.observe(wrapper)
    return () => obs.disconnect()
  }, [])  // intentionally no deps — refs hold latest values

  // ── Game init / reset ─────────────────────────────────────────────────────
  const initGame = useCallback(() => {
    const c = colsRef.current
    const r = rowsRef.current
    const sx = Math.floor(c / 2)
    const sy = Math.floor(r / 2)
    snakeRef.current    = [{ x: sx, y: sy }, { x: sx - 1, y: sy }, { x: sx - 2, y: sy }]
    dirRef.current      = DIR_RIGHT
    pendingDirRef.current = null
    foodCountRef.current  = 0
    scoreRef.current      = 0
    speedRef.current      = INITIAL_SPEED
    doneRef.current       = false
    accumRef.current      = 0
    foodRef.current       = spawnFood(snakeRef.current, c, r)
    foodTypeRef.current   = 0
    setScore(0)
  }, [setScore])

  // Reset on resetKey change or grid dimension change
  useEffect(() => { initGame() }, [resetKey, cols, rows, initGame])

  // Reset when GameShell triggers "Play Again" (isGameOver: true → false)
  const prevGameOverRef = useRef(false)
  useEffect(() => {
    if (prevGameOverRef.current && !isGameOver) initGame()
    prevGameOverRef.current = isGameOver
  }, [isGameOver, initGame])

  // ── Keyboard input ────────────────────────────────────────────────────────
  const keys    = useKeyboard(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'])
  const keysRef = useRef(keys)
  useEffect(() => { keysRef.current = keys }, [keys])

  // ── Touch / swipe input ───────────────────────────────────────────────────
  const touchStartRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onStart = (e: TouchEvent) => {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    }
    const onEnd = (e: TouchEvent) => {
      if (!touchStartRef.current) return
      const dx = e.changedTouches[0].clientX - touchStartRef.current.x
      const dy = e.changedTouches[0].clientY - touchStartRef.current.y
      touchStartRef.current = null
      if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return
      pendingDirRef.current =
        Math.abs(dx) > Math.abs(dy)
          ? dx > 0 ? DIR_RIGHT : DIR_LEFT
          : dy > 0 ? DIR_DOWN  : DIR_UP
    }

    canvas.addEventListener('touchstart', onStart, { passive: true })
    canvas.addEventListener('touchend',   onEnd,   { passive: true })
    return () => {
      canvas.removeEventListener('touchstart', onStart)
      canvas.removeEventListener('touchend',   onEnd)
    }
  }, [])

  // ── Game loop ─────────────────────────────────────────────────────────────
  useGameLoop(
    (dt: number) => {
      if (doneRef.current) return
      const canvas = canvasRef.current
      if (!canvas) return
      const ctx = canvas.getContext('2d')
      if (!ctx) return

      // Queue direction from keyboard
      const k   = keysRef.current
      const cur = dirRef.current
      if ((k['ArrowUp']    || k['w']) && !opposites(DIR_UP,    cur)) pendingDirRef.current = DIR_UP
      if ((k['ArrowDown']  || k['s']) && !opposites(DIR_DOWN,  cur)) pendingDirRef.current = DIR_DOWN
      if ((k['ArrowLeft']  || k['a']) && !opposites(DIR_LEFT,  cur)) pendingDirRef.current = DIR_LEFT
      if ((k['ArrowRight'] || k['d']) && !opposites(DIR_RIGHT, cur)) pendingDirRef.current = DIR_RIGHT

      // Tick the game at the configured speed
      accumRef.current += dt
      const interval = 1 / speedRef.current

      while (accumRef.current >= interval) {
        accumRef.current -= interval

        // Apply pending direction (validate again at tick time)
        if (pendingDirRef.current && !opposites(pendingDirRef.current, dirRef.current)) {
          dirRef.current = pendingDirRef.current
        }
        pendingDirRef.current = null

        const d    = dirRef.current
        const head = snakeRef.current[0]
        const cols = colsRef.current
        const rows = rowsRef.current
        let nx = head.x + d.x
        let ny = head.y + d.y

        if (wrapRef.current) {
          nx = (nx + cols) % cols
          ny = (ny + rows) % rows
        } else {
          // Wall collision
          if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) {
            doneRef.current = true
            setGameOver(true, scoreRef.current)
            break
          }
        }

        // Self-collision (skip tail — it will move)
        const body = snakeRef.current
        for (let i = 0; i < body.length - 1; i++) {
          if (body[i].x === nx && body[i].y === ny) {
            doneRef.current = true
            setGameOver(true, scoreRef.current)
            break
          }
        }
        if (doneRef.current) break

        // Move
        const newHead = { x: nx, y: ny }
        const ate = foodRef.current.x === nx && foodRef.current.y === ny

        const newSnake = [newHead, ...body]
        if (!ate) newSnake.pop()  // remove tail unless growing

        snakeRef.current = newSnake

        if (ate) {
          foodCountRef.current += 1
          scoreRef.current     += PTS_PER_FOOD
          speedRef.current      = speedForCount(foodCountRef.current)
          foodTypeRef.current   = foodCountRef.current % FOOD_TYPE_COUNT
          foodRef.current       = spawnFood(newSnake, cols, rows)
          setScore(scoreRef.current)
        }
      }

      // Draw every frame for smooth rendering
      drawFrameRef.current(ctx, canvas.width, canvas.height)
    },
    { paused: isPaused },
  )

  // ── Drawing ───────────────────────────────────────────────────────────────

  const drawFrame = useCallback((ctx: CanvasRenderingContext2D, cw: number, ch: number) => {
    const cs     = cellSizeRef.current
    const snake  = snakeRef.current
    const food   = foodRef.current
    const dir    = dirRef.current
    const ftype  = foodTypeRef.current
    const inset  = CANVAS_PADDING
    const radius = Math.max(2, cs * 0.28)

    // Background
    ctx.fillStyle = '#0a0906'
    ctx.fillRect(0, 0, cw, ch)

    // Subtle grid
    ctx.strokeStyle = 'rgba(255,255,255,0.025)'
    ctx.lineWidth   = 0.5
    for (let x = 0; x <= colsRef.current; x++) {
      ctx.beginPath(); ctx.moveTo(x * cs, 0); ctx.lineTo(x * cs, ch); ctx.stroke()
    }
    for (let y = 0; y <= rowsRef.current; y++) {
      ctx.beginPath(); ctx.moveTo(0, y * cs); ctx.lineTo(cw, y * cs); ctx.stroke()
    }

    // Playfield boundary so the walls stay visible against the dark shell.
    ctx.save()
    ctx.strokeStyle = wrapRef.current ? FIELD_BORDER_WRAP : FIELD_BORDER
    ctx.lineWidth = Math.max(2, cs * 0.12)
    ctx.strokeRect(ctx.lineWidth / 2, ctx.lineWidth / 2, cw - ctx.lineWidth, ch - ctx.lineWidth)
    ctx.restore()

    if (snake.length === 0) return

    const n = snake.length

    // ── Segment connectors (drawn beneath rounded rects) ──────────────────
    for (let i = 0; i < n - 1; i++) {
      const a  = snake[i]
      const b  = snake[i + 1]
      const dx = Math.abs(a.x - b.x)
      const dy = Math.abs(a.y - b.y)
      if (dx + dy !== 1) continue  // skip wrap-around adjacency

      const t   = i / Math.max(n - 1, 1)
      ctx.fillStyle = lerpRGB(RGB_HEAD, RGB_TAIL, t)

      const ax = a.x * cs
      const ay = a.y * cs
      const bx = b.x * cs
      const by = b.y * cs

      if (dx === 1) {
        const bridgeX = (a.x < b.x ? ax : bx) + cs - 1
        ctx.fillRect(bridgeX, Math.min(ay, by) + inset, 2, cs - inset * 2)
      } else {
        const bridgeY = (a.y < b.y ? ay : by) + cs - 1
        ctx.fillRect(Math.min(ax, bx) + inset, bridgeY, cs - inset * 2, 2)
      }
    }

    // ── Body segments ─────────────────────────────────────────────────────
    for (let i = n - 1; i > 0; i--) {
      const p = snake[i]
      const t = i / Math.max(n - 1, 1)
      const fillCol   = lerpRGB(RGB_HEAD,        RGB_TAIL,        t)
      const borderCol = lerpRGB(RGB_BORDER_HEAD,  RGB_BORDER_TAIL, t)

      const x = p.x * cs + inset
      const y = p.y * cs + inset
      const w = cs - inset * 2
      const h = cs - inset * 2

      // Fill
      ctx.fillStyle = fillCol
      roundedRect(ctx, x, y, w, h, radius)
      ctx.fill()

      // Border
      ctx.strokeStyle = borderCol
      ctx.lineWidth   = Math.max(1, cs * 0.06)
      ctx.stroke()
    }

    // ── Head ──────────────────────────────────────────────────────────────
    const head = snake[0]
    const headInset = Math.max(0, inset - 1)
    const hx = head.x * cs + headInset
    const hy = head.y * cs + headInset
    const hw = cs - headInset * 2
    const hh = cs - headInset * 2

    ctx.fillStyle = lerpRGB(RGB_HEAD, RGB_TAIL, 0)
    roundedRect(ctx, hx, hy, hw, hh, radius + 1)
    ctx.fill()

    ctx.strokeStyle = lerpRGB(RGB_BORDER_HEAD, RGB_BORDER_TAIL, 0)
    ctx.lineWidth   = Math.max(1, cs * 0.07)
    ctx.stroke()

    // Eyes — offset toward direction
    const eyeR  = Math.max(1.5, cs * 0.09)
    const eyeOff = cs * 0.22   // perpendicular offset
    const eyeAdv = cs * 0.22   // forward offset from cell centre
    const hcx    = head.x * cs + cs / 2
    const hcy    = head.y * cs + cs / 2

    // Perpendicular to direction
    const px = -dir.y
    const py =  dir.x

    const eye1x = hcx + dir.x * eyeAdv + px * eyeOff
    const eye1y = hcy + dir.y * eyeAdv + py * eyeOff
    const eye2x = hcx + dir.x * eyeAdv - px * eyeOff
    const eye2y = hcy + dir.y * eyeAdv - py * eyeOff

    ctx.fillStyle = 'white'
    ctx.beginPath(); ctx.arc(eye1x, eye1y, eyeR, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(eye2x, eye2y, eyeR, 0, Math.PI * 2); ctx.fill()

    // Pupils
    ctx.fillStyle = '#0a0906'
    const pupilR = eyeR * 0.5
    ctx.beginPath(); ctx.arc(eye1x + dir.x * pupilR * 0.4, eye1y + dir.y * pupilR * 0.4, pupilR, 0, Math.PI * 2); ctx.fill()
    ctx.beginPath(); ctx.arc(eye2x + dir.x * pupilR * 0.4, eye2y + dir.y * pupilR * 0.4, pupilR, 0, Math.PI * 2); ctx.fill()

    // ── Food ──────────────────────────────────────────────────────────────
    const fcx   = food.x * cs + cs / 2
    const fcy   = food.y * cs + cs / 2
    const fsize = cs * 0.42
    ctx.save()
    FOOD_DRAW_FNS[ftype](ctx, fcx, fcy, fsize)
    ctx.restore()

    // ── Floating score (top-right of canvas) ──────────────────────────────
    const scoreText = `${scoreRef.current}`
    const fontSize  = Math.max(10, Math.round(cs * 0.72))
    ctx.font        = `600 ${fontSize}px monospace`
    ctx.textAlign   = 'right'
    ctx.textBaseline = 'top'

    const tw     = ctx.measureText(scoreText).width
    const pill   = { x: cw - tw - fontSize * 0.9, y: fontSize * 0.32, w: tw + fontSize * 0.8, h: fontSize * 1.35 }
    ctx.fillStyle = 'rgba(10,9,6,0.65)'
    roundedRect(ctx, pill.x, pill.y, pill.w, pill.h, fontSize * 0.3)
    ctx.fill()

    ctx.fillStyle = '#c9a84c'
    ctx.fillText(scoreText, cw - fontSize * 0.45, fontSize * 0.42)

    // ── Wrap-mode indicator (top-left, subtle) ────────────────────────────
    if (wrapRef.current) {
      const indFont = Math.max(8, Math.round(cs * 0.52))
      ctx.font        = `${indFont}px monospace`
      ctx.textAlign   = 'left'
      ctx.textBaseline = 'top'
      ctx.fillStyle   = 'rgba(201,168,76,0.3)'
      ctx.fillText('∞', indFont * 0.25, indFont * 0.3)
    }
  }, [])

  useEffect(() => {
    drawFrameRef.current = drawFrame
  }, [drawFrame])

  return (
    <div
      className="game-scene game-scene--snake"
      ref={wrapperRef}
      style={{
        flex:            1,
        minHeight:       0,
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        overflow:        'hidden',
        background:      '#0a0906',
      }}
    >
      <div
        style={{
          padding: '0.45rem',
          borderRadius: '1rem',
          border: '1px solid rgba(201, 168, 76, 0.22)',
          background: 'linear-gradient(180deg, rgba(18,16,11,0.95), rgba(10,9,6,0.98))',
          boxShadow: '0 0 0 1px rgba(201,168,76,0.08), 0 18px 48px rgba(0,0,0,0.45)',
        }}
      >
        <canvas
          ref={canvasRef}
          style={{
            imageRendering: 'pixelated',
            display: 'block',
            borderRadius: '0.7rem',
          }}
          aria-label="Snake game canvas"
        />
      </div>
    </div>
  )
}

// ─── Settings bar (grid size + wrap toggle) ───────────────────────────────────

interface SettingsBarProps {
  gridSize:      GridSize
  wrapMode:      boolean
  onGridChange:  (g: GridSize) => void
  onWrapToggle:  () => void
}

function SettingsBar({ gridSize, wrapMode, onGridChange, onWrapToggle }: SettingsBarProps) {
  const btnBase: React.CSSProperties = {
    fontFamily:    'var(--ds-font-mono, monospace)',
    fontSize:      '0.68rem',
    letterSpacing: '0.04em',
    padding:       '0.2rem 0.65rem',
    borderRadius:  '999px',
    border:        '1px solid rgba(42,37,32,0.95)',
    background:    'transparent',
    color:         '#7a7060',
    cursor:        'pointer',
    transition:    'all 0.12s ease',
    whiteSpace:    'nowrap' as const,
  }

  const btnActive: React.CSSProperties = {
    ...btnBase,
    borderColor: 'rgba(201,168,76,0.5)',
    background:  'rgba(201,168,76,0.1)',
    color:       '#c9a84c',
  }

  const gridOptions: GridSize[] = ['small', 'medium', 'large']

  return (
    <div
      style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            '0.4rem',
        padding:        '0.4rem 0.75rem',
        flexShrink:     0,
        borderTop:      '1px solid rgba(42,37,32,0.8)',
        background:     'rgba(10,9,6,0.9)',
        flexWrap:       'wrap',
      }}
    >
      <span
        style={{
          fontSize:      '0.62rem',
          fontFamily:    'var(--ds-font-mono, monospace)',
          color:         '#4a4035',
          letterSpacing: '0.08em',
          textTransform: 'uppercase' as const,
          marginRight:   '0.25rem',
        }}
      >
        Grid
      </span>
      {gridOptions.map((g) => (
        <button
          key={g}
          onClick={() => onGridChange(g)}
          style={gridSize === g ? btnActive : btnBase}
        >
          {g === 'small' ? '15×15' : g === 'medium' ? '20×20' : '30×30'}
        </button>
      ))}

      <div
        aria-hidden
        style={{
          width:      '1px',
          height:     '1rem',
          background: 'rgba(42,37,32,0.8)',
          margin:     '0 0.2rem',
          flexShrink: 0,
        }}
      />

      <button
        onClick={onWrapToggle}
        title="Toggle wall wrap-around"
        style={wrapMode ? btnActive : btnBase}
      >
        {wrapMode ? '∞ wrap on' : '∞ wrap off'}
      </button>
    </div>
  )
}

// ─── Snake — outer component (default export) ─────────────────────────────────

export default function Snake() {
  const [gridSize, setGridSize] = useState<GridSize>('medium')
  const [wrapMode, setWrapMode] = useState(false)
  const [resetKey, setResetKey] = useState(0)

  const { cols, rows } = GRID[gridSize]

  const handleGridChange = useCallback((g: GridSize) => {
    setGridSize(g)
    setResetKey((k) => k + 1)
  }, [])

  const handleWrapToggle = useCallback(() => {
    setWrapMode((w) => !w)
    setResetKey((k) => k + 1)
  }, [])

  return (
    <GameShell
      title="Snake"
      highScoreKey={SCORE_KEY}
      controls={SNAKE_CONTROLS}
    >
      {(props: GameRenderProps) => (
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
          <SnakeCanvas
            {...props}
            cols={cols}
            rows={rows}
            wrapMode={wrapMode}
            resetKey={resetKey}
          />
          <SettingsBar
            gridSize={gridSize}
            wrapMode={wrapMode}
            onGridChange={handleGridChange}
            onWrapToggle={handleWrapToggle}
          />
        </div>
      )}
    </GameShell>
  )
}
