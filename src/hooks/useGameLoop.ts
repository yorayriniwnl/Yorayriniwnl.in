import { useCallback, useEffect, useRef, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

interface GameLoopOptions {
  /** Suspend the callback while keeping the RAF loop alive for instant resume. */
  paused?: boolean
  /** Cap the update rate to this many frames per second. Uncapped by default. */
  targetFPS?: number
  /** Called once when the loop transitions from running → paused. */
  onPause?: () => void
  /** Called once when the loop transitions from paused → running. */
  onResume?: () => void
}

interface GameLoopResult {
  /** Rolling 60-frame average of the actual render rate. */
  fps: number
  /** Total frames dispatched to the callback since mount. */
  frameCount: number
  /** Pause imperatively (mirrors the `paused` prop). */
  pause: () => void
  /** Resume imperatively. */
  resume: () => void
  /** True when the loop is paused by either the prop or imperative call. */
  isPaused: boolean
}

/**
 * useGameLoop
 *
 * A zero-dependency requestAnimationFrame driver that handles timing,
 * FPS throttling, pause/resume, and cleanup so individual game components
 * contain only their own logic.
 *
 * @example
 * ```tsx
 * function SnakeGame() {
 *   const { fps, pause, resume, isPaused } = useGameLoop(
 *     (dt) => {
 *       // dt is seconds since last frame, capped at 0.1 s
 *       moveSnake(dt)
 *       draw()
 *     },
 *     { targetFPS: 20, paused: !hasFocus }
 *   )
 *
 *   return (
 *     <>
 *       <canvas ref={canvasRef} />
 *       <span>{fps.toFixed(1)} fps</span>
 *       <button onClick={isPaused ? resume : pause}>
 *         {isPaused ? 'Resume' : 'Pause'}
 *       </button>
 *     </>
 *   )
 * }
 * ```
 */
export function useGameLoop(
  callback: (deltaTime: number) => void,
  options: GameLoopOptions = {},
): GameLoopResult {
  const { paused: externalPaused = false, targetFPS, onPause, onResume } = options

  // ── Imperative pause state ────────────────────────────────────────────────
  const [imperativePaused, setImperativePaused] = useState(false)
  const [fps, setFps] = useState(0)
  const [frameCount, setFrameCount] = useState(0)

  // isPaused is true if EITHER the external prop or an imperative call says so
  const isPaused = externalPaused || imperativePaused

  // ── Stable refs so the RAF closure never goes stale ───────────────────────
  const callbackRef = useRef(callback)
  useEffect(() => { callbackRef.current = callback }, [callback])

  const isPausedRef = useRef(isPaused)
  useEffect(() => { isPausedRef.current = isPaused }, [isPaused])

  const onPauseRef = useRef(onPause)
  useEffect(() => { onPauseRef.current = onPause }, [onPause])

  const onResumeRef = useRef(onResume)
  useEffect(() => { onResumeRef.current = onResume }, [onResume])

  // Track the previous paused state so we only fire callbacks on transitions
  const wasRunningRef = useRef(!isPaused)

  // ── Timing bookkeeping ────────────────────────────────────────────────────
  const rafIdRef = useRef<number | null>(null)
  const lastTimestampRef = useRef<number | null>(null)

  // Frame-skip state for targetFPS throttling
  const minFrameMs = targetFPS != null ? 1000 / targetFPS : 0
  const minFrameMsRef = useRef(minFrameMs)
  useEffect(() => { minFrameMsRef.current = minFrameMs }, [minFrameMs])
  const lastDispatchedTimestampRef = useRef<number | null>(null)

  // Rolling 60-frame buffer for FPS measurement
  const fpsBufferRef = useRef<number[]>([])
  const frameCountRef = useRef(0)

  // ── Imperative controls ───────────────────────────────────────────────────
  const pause = useCallback(() => setImperativePaused(true), [])
  const resume = useCallback(() => setImperativePaused(false), [])

  // ── Main loop ─────────────────────────────────────────────────────────────
  useEffect(() => {
    let alive = true

    function tick(timestamp: number) {
      if (!alive) return

      // ── Delta time (seconds), capped at 100 ms to avoid spiral-of-death ──
      const lastTs = lastTimestampRef.current ?? timestamp
      const rawDeltaMs = timestamp - lastTs
      lastTimestampRef.current = timestamp
      const deltaTime = Math.min(rawDeltaMs / 1000, 0.1)

      // ── Pause / resume transition callbacks ──────────────────────────────
      const currentlyPaused = isPausedRef.current
      if (wasRunningRef.current && currentlyPaused) {
        onPauseRef.current?.()
        wasRunningRef.current = false
      } else if (!wasRunningRef.current && !currentlyPaused) {
        onResumeRef.current?.()
        wasRunningRef.current = true
        // Reset timestamps so the first resumed frame gets a near-zero delta
        lastTimestampRef.current = timestamp
        lastDispatchedTimestampRef.current = null
      }

      // ── FPS measurement (runs even while paused so the value stays live) ─
      if (rawDeltaMs > 0) {
        const instantFps = 1000 / rawDeltaMs
        fpsBufferRef.current.push(instantFps)
        if (fpsBufferRef.current.length > 60) fpsBufferRef.current.shift()
        const avg =
          fpsBufferRef.current.reduce((sum, v) => sum + v, 0) /
          fpsBufferRef.current.length
        setFps(parseFloat(avg.toFixed(1)))
      }

      // ── Dispatch callback (skip when paused or frame-budget not reached) ─
      if (!currentlyPaused) {
        const lastDispatched = lastDispatchedTimestampRef.current ?? 0
        const sinceLast = timestamp - lastDispatched

        if (sinceLast >= minFrameMsRef.current) {
          lastDispatchedTimestampRef.current = timestamp
          callbackRef.current(deltaTime)
          frameCountRef.current += 1
          setFrameCount(frameCountRef.current)
        }
      }

      rafIdRef.current = requestAnimationFrame(tick)
    }

    rafIdRef.current = requestAnimationFrame(tick)

    return () => {
      alive = false
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current)
        rafIdRef.current = null
      }
      // Reset timing so a remount starts clean
      lastTimestampRef.current = null
      lastDispatchedTimestampRef.current = null
      fpsBufferRef.current = []
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // Intentionally empty: all mutable values are accessed via refs

  return { fps, frameCount, pause, resume, isPaused }
}
