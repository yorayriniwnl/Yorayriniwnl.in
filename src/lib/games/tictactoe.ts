// ─── Types ────────────────────────────────────────────────────────────────────

export type Cell       = null | 'X' | 'O'
export type Board      = Cell[]
export type Difficulty = 'easy' | 'medium' | 'hard'

export interface WinResult {
  winner:  'X' | 'O'
  indices: number[]      // winning cell indices (length === board size)
}

// ─── Win-line generation ──────────────────────────────────────────────────────
// For an N×N board the winning condition is N-in-a-row (3 for 3×3, 4 for 4×4).
// This produces rows, columns, and the two full diagonals.

export function getWinLines(size: number): number[][] {
  const lines: number[][] = []

  // Rows
  for (let r = 0; r < size; r++)
    lines.push(Array.from({ length: size }, (_, i) => r * size + i))

  // Columns
  for (let c = 0; c < size; c++)
    lines.push(Array.from({ length: size }, (_, i) => i * size + c))

  // Diagonal ↘  (top-left → bottom-right)
  lines.push(Array.from({ length: size }, (_, i) => i * size + i))

  // Diagonal ↙  (top-right → bottom-left)
  lines.push(Array.from({ length: size }, (_, i) => i * size + (size - 1 - i)))

  return lines
}

// ─── Check winner ─────────────────────────────────────────────────────────────

export function checkWinner(board: Board, size = 3): WinResult | null {
  for (const line of getWinLines(size)) {
    const first = board[line[0]]
    if (first !== null && line.every(i => board[i] === first))
      return { winner: first, indices: line }
  }
  return null
}

// ─── AI move ─────────────────────────────────────────────────────────────────

export function getAIMove(
  board:      Board,
  difficulty: Difficulty,
  aiSymbol:   'X' | 'O',
  size = 3,
): number {
  const human: 'X' | 'O' = aiSymbol === 'X' ? 'O' : 'X'
  const empty = board.reduce<number[]>((acc, c, i) => (c === null ? [...acc, i] : acc), [])
  if (empty.length === 0) return -1

  // ── Easy: random empty cell ───────────────────────────────────────────────
  if (difficulty === 'easy')
    return empty[Math.floor(Math.random() * empty.length)]

  // ── Medium: win if possible, block if needed, else random ─────────────────
  if (difficulty === 'medium') {
    for (const i of empty) {
      const b = board.slice(); b[i] = aiSymbol
      if (checkWinner(b, size)) return i
    }
    for (const i of empty) {
      const b = board.slice(); b[i] = human
      if (checkWinner(b, size)) return i
    }
    return empty[Math.floor(Math.random() * empty.length)]
  }

  // ── Hard: full minimax with alpha-beta pruning (perfect play) ─────────────
  let bestScore = -Infinity
  let bestMove  = empty[0]
  const working = board.slice()

  for (const i of empty) {
    working[i] = aiSymbol
    const score = _minimax(working, size, 0, -Infinity, Infinity, false, aiSymbol, human)
    working[i] = null
    if (score > bestScore) { bestScore = score; bestMove = i }
  }
  return bestMove
}

function _minimax(
  board:  Board,
  size:   number,
  depth:  number,
  alpha:  number,
  beta:   number,
  maxing: boolean,
  ai:     'X' | 'O',
  human:  'X' | 'O',
): number {
  const w = checkWinner(board, size)
  if (w) return w.winner === ai ? 10 - depth : depth - 10

  const empty = board.reduce<number[]>((acc, c, i) => (c === null ? [...acc, i] : acc), [])
  if (empty.length === 0) return 0  // draw

  if (maxing) {
    let best = -Infinity
    for (const i of empty) {
      board[i] = ai
      best  = Math.max(best, _minimax(board, size, depth + 1, alpha, beta, false, ai, human))
      board[i] = null
      alpha = Math.max(alpha, best)
      if (beta <= alpha) break
    }
    return best
  } else {
    let best = Infinity
    for (const i of empty) {
      board[i] = human
      best = Math.min(best, _minimax(board, size, depth + 1, alpha, beta, true, ai, human))
      board[i] = null
      beta = Math.min(beta, best)
      if (beta <= alpha) break
    }
    return best
  }
}
