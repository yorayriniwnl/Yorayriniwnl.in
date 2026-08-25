import type { DevWord } from '../../data/devWords'

// ─── Types ────────────────────────────────────────────────────────────────────

export type LetterResult = 'correct' | 'present' | 'absent'

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * True when `word` (case-insensitive) appears in the provided word list.
 * Used for strict "not in word list" rejection. Pass the active length
 * slice to avoid cross-length false positives.
 */
export function isValidGuess(word: string, wordList: DevWord[]): boolean {
  return wordList.some((w) => w.word === word.toUpperCase())
}

// ─── Core evaluation ──────────────────────────────────────────────────────────

/**
 * Evaluate `guess` against `answer` using standard Wordle duplicate rules.
 *
 * Algorithm:
 *  1. First pass — mark correct positions. Remove matched letters from the
 *     answer pool so they cannot be double-counted as "present".
 *  2. Second pass — for each remaining position, consume one instance of the
 *     guessed letter from the pool to mark "present".
 *
 * Both strings must be the same length and uppercase.
 */
export function evaluateGuess(guess: string, answer: string): LetterResult[] {
  const len    = answer.length
  const result: LetterResult[]  = new Array(len).fill('absent')
  const pool:   (string | null)[] = answer.split('')

  // Pass 1 — correct
  for (let i = 0; i < len; i++) {
    if (guess[i] === answer[i]) {
      result[i] = 'correct'
      pool[i]   = null          // consume; can't be "present" for another guess letter
    }
  }

  // Pass 2 — present (wrong position)
  for (let i = 0; i < len; i++) {
    if (result[i] === 'correct') continue

    const poolIdx = pool.indexOf(guess[i])
    if (poolIdx !== -1) {
      result[i]       = 'present'
      pool[poolIdx]   = null    // consume to avoid double-marking
    }
  }

  return result
}

// ─── Word selection ───────────────────────────────────────────────────────────

/** djb2 hash over an arbitrary string → stable positive 32-bit integer. */
function hashString(s: string): number {
  let h = 5381
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h, 33) ^ s.charCodeAt(i)
  }
  return Math.abs(h >>> 0)
}

/**
 * Deterministic daily word: same answer for every player on a given calendar
 * day. Uses `new Date().toDateString()` as seed so it changes at local midnight.
 */
export function getDailyWord(wordList: DevWord[], length: 5 | 6): DevWord {
  const filtered = wordList.filter((w) => w.length === length)
  const seed     = new Date().toDateString() + String(length)
  const idx      = hashString(seed) % filtered.length
  return filtered[idx]
}

/** Uniformly random word from the filtered list. */
export function getRandomWord(wordList: DevWord[], length: 5 | 6): DevWord {
  const filtered = wordList.filter((w) => w.length === length)
  return filtered[Math.floor(Math.random() * filtered.length)]
}

// ─── Scoring ──────────────────────────────────────────────────────────────────

/** Points awarded for solving in `guessCount` out of `maxAttempts`. */
export function calcScore(guessCount: number, maxAttempts: number): number {
  return (maxAttempts - guessCount + 1) * 100
}

// ─── Keyboard helper ──────────────────────────────────────────────────────────

/**
 * Merge a new guess's results into the running per-key status map.
 * "correct" > "present" > "absent" — once a key is marked correct it can't
 * be downgraded.
 */
export function mergeKeyStatuses(
  current: Record<string, LetterResult>,
  guess:   string,
  results: LetterResult[],
): Record<string, LetterResult> {
  const PRIORITY: Record<LetterResult, number> = { correct: 2, present: 1, absent: 0 }
  const next = { ...current }

  for (let i = 0; i < guess.length; i++) {
    const letter = guess[i]
    const prev   = next[letter]
    const now    = results[i]
    if (prev == null || PRIORITY[now] > PRIORITY[prev]) {
      next[letter] = now
    }
  }

  return next
}
