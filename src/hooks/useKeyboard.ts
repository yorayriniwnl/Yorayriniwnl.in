import { useEffect, useRef, useState } from 'react'

/**
 * useKeyboard
 *
 * Tracks the pressed state of a fixed set of keys using native `keydown` /
 * `keyup` events. Returns a snapshot object that re-renders the consumer
 * only when the pressed state of a **watched** key actually changes.
 *
 * Keys are matched against `KeyboardEvent.key` (case-sensitive). Pass the
 * same string you would compare against in a `keydown` handler:
 *   - Arrow keys  → `'ArrowUp'`, `'ArrowLeft'`, etc.
 *   - Space       → `' '`
 *   - Letters     → `'a'`, `'w'`, etc.  (lowercase as the browser reports)
 *   - Enter       → `'Enter'`
 *
 * @example
 * ```tsx
 * function PlayerController() {
 *   const keys = useKeyboard(['ArrowUp', 'ArrowLeft', 'ArrowRight', ' '])
 *
 *   useGameLoop((dt) => {
 *     if (keys['ArrowLeft'])  player.x -= SPEED * dt
 *     if (keys['ArrowRight']) player.x += SPEED * dt
 *     if (keys[' '])          player.jump()
 *   })
 * }
 * ```
 *
 * @param keys - Array of `KeyboardEvent.key` strings to watch.
 * @returns An object mapping each watched key to its current held state.
 */
export function useKeyboard(keys: string[]): Record<string, boolean> {
  // Keep a stable Set of watched keys so the effect only re-runs if the
  // caller passes a genuinely different array (by value, not reference).
  const watchedKeysRef = useRef<Set<string>>(new Set(keys))

  // The live pressed map is stored in a ref so event handlers always read
  // the latest state without stale-closure problems.
  const pressedRef = useRef<Record<string, boolean>>(
    Object.fromEntries(keys.map((k) => [k, false])),
  )

  // Exposed to React so components re-render on changes.
  const [snapshot, setSnapshot] = useState<Record<string, boolean>>(
    () => ({ ...pressedRef.current }),
  )

  // Re-sync the watched set and initial pressed map if the keys prop changes.
  // We intentionally stringify for a stable comparison rather than adding
  // the array itself as a dependency (arrays are new references every render).
  const keysKey = keys.join('|')
  useEffect(() => {
    const next = new Set(keys)
    watchedKeysRef.current = next
    // Preserve existing pressed state for keys that are still watched,
    // add false for new ones, drop removed keys.
    const merged: Record<string, boolean> = {}
    for (const k of next) {
      merged[k] = pressedRef.current[k] ?? false
    }
    pressedRef.current = merged
    setSnapshot({ ...merged })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keysKey])

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const key = e.key
      if (!watchedKeysRef.current.has(key)) return
      if (pressedRef.current[key] === true) return // already held, skip re-render

      pressedRef.current = { ...pressedRef.current, [key]: true }
      setSnapshot({ ...pressedRef.current })
    }

    function handleKeyUp(e: KeyboardEvent) {
      const key = e.key
      if (!watchedKeysRef.current.has(key)) return
      if (pressedRef.current[key] === false) return // already released, skip re-render

      pressedRef.current = { ...pressedRef.current, [key]: false }
      setSnapshot({ ...pressedRef.current })
    }

    // Use `window` rather than `document` to catch events even when no
    // focusable element has explicit focus (e.g. canvas games).
    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    // Release all watched keys on unmount so a remounted component starts
    // with a clean slate (avoids ghost key-held state across route changes).
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)

      const released = Object.fromEntries(
        [...watchedKeysRef.current].map((k) => [k, false]),
      )
      pressedRef.current = released
      // No setSnapshot here — the component is unmounting anyway.
    }
  }, []) // Stable: all mutable state is accessed through refs

  return snapshot
}
