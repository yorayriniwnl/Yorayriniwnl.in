'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import GameShell, { type GameRenderProps } from './GameShell'
import {
  type Board,
  type Difficulty,
  type WinResult,
  checkWinner,
  getAIMove,
} from '../lib/games/tictactoe'

// ─── Constants ────────────────────────────────────────────────────────────────

const PLAYER: 'X' | 'O' = 'X'
const AI:     'X' | 'O' = 'O'
const AI_DELAY           = 500   // ms feel-good delay
const UNLOCK_AT          = 10    // games before 4×4 unlocks

const CONTROLS = [
  { key: 'Click / Tap', action: 'Place your X mark'   },
  { key: 'Esc',         action: 'Pause / Resume game'  },
]

// ─── CSS Animations (injected once) ──────────────────────────────────────────

const GLOBAL_CSS = `
  @keyframes ttt-draw {
    to { stroke-dashoffset: 0; }
  }
  @keyframes ttt-win-line {
    to { stroke-dashoffset: 0; }
  }
  @keyframes ttt-toast {
    0%   { opacity: 0; transform: translateX(-50%) translateY(1.5rem) scale(.93); }
    12%  { opacity: 1; transform: translateX(-50%) translateY(0)      scale(1);   }
    88%  { opacity: 1; transform: translateX(-50%) translateY(0)      scale(1);   }
    100% { opacity: 0; transform: translateX(-50%) translateY(1.5rem) scale(.93); }
  }
  @keyframes ttt-blink {
    0%, 100% { opacity: .35; }
    50%       { opacity: 1;   }
  }
  @keyframes ttt-result-in {
    from { opacity: 0; transform: scale(.92); }
    to   { opacity: 1; transform: scale(1);   }
  }
  .ttt-cell-btn:not(:disabled):hover {
    background: rgba(201, 168, 76, 0.07) !important;
  }
  .ttt-cell-btn:not(:disabled):active {
    background: rgba(201, 168, 76, 0.13) !important;
  }
  .ttt-diff-btn:hover {
    border-color: rgba(201, 168, 76, 0.45) !important;
    color: #e8c96e !important;
  }
  .ttt-diff-btn.active {
    border-color: rgba(201, 168, 76, 0.55) !important;
    background: rgba(201, 168, 76, 0.12) !important;
    color: #c9a84c !important;
  }
`

// ─── Types ────────────────────────────────────────────────────────────────────

type Phase   = 'setup' | 'playing' | 'roundOver'
interface Session { player: number; ai: number; draws: number }

// ─── Animated X Mark ──────────────────────────────────────────────────────────

const X_DIAG = Math.hypot(40, 40)   // ≈ 56.57 SVG units

function XMark({ dim }: { dim: boolean }) {
  return (
    <svg
      viewBox="0 0 60 60"
      width="100%"
      height="100%"
      style={{ display: 'block', width: '68%', height: '68%', opacity: dim ? 0.27 : 1, transition: 'opacity 0.35s ease' }}
      aria-hidden
    >
      <line
        x1="10" y1="10" x2="50" y2="50"
        stroke="#f0e8d8" strokeWidth="5.5" strokeLinecap="round"
        style={{
          strokeDasharray:  X_DIAG,
          strokeDashoffset: X_DIAG,
          animation: 'ttt-draw 0.19s ease forwards',
        }}
      />
      <line
        x1="50" y1="10" x2="10" y2="50"
        stroke="#f0e8d8" strokeWidth="5.5" strokeLinecap="round"
        style={{
          strokeDasharray:  X_DIAG,
          strokeDashoffset: X_DIAG,
          animation: 'ttt-draw 0.19s ease 0.09s forwards',
        }}
      />
    </svg>
  )
}

// ─── Animated O Mark ─────────────────────────────────────────────────────────

const O_CIRC = 2 * Math.PI * 21   // ≈ 131.95 SVG units

function OMark({ dim }: { dim: boolean }) {
  return (
    <svg
      viewBox="0 0 60 60"
      width="100%"
      height="100%"
      style={{ display: 'block', width: '68%', height: '68%', opacity: dim ? 0.27 : 1, transition: 'opacity 0.35s ease' }}
      aria-hidden
    >
      <circle
        cx="30" cy="30" r="21"
        stroke="#a89878" strokeWidth="5.5" fill="none" strokeLinecap="round"
        style={{
          strokeDasharray:  O_CIRC,
          strokeDashoffset: O_CIRC,
          animation: 'ttt-draw 0.26s ease forwards',
        }}
      />
    </svg>
  )
}

// ─── Win Line Overlay ─────────────────────────────────────────────────────────

function WinLine({ indices, size }: { indices: number[]; size: number }) {
  const a  = indices[0]
  const b  = indices[indices.length - 1]
  const r1 = Math.floor(a / size);  const c1 = a % size
  const r2 = Math.floor(b / size);  const c2 = b % size
  const x1 = ((c1 + 0.5) / size) * 100
  const y1 = ((r1 + 0.5) / size) * 100
  const x2 = ((c2 + 0.5) / size) * 100
  const y2 = ((r2 + 0.5) / size) * 100
  const len = Math.hypot(x2 - x1, y2 - y1)

  return (
    <svg
      viewBox="0 0 100 100"
      width="100%"
      height="100%"
      aria-hidden
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6 }}
    >
      {/* Glow copy */}
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="rgba(212,175,55,0.25)" strokeWidth="6" strokeLinecap="round"
        style={{
          strokeDasharray:  len,
          strokeDashoffset: len,
          animation: 'ttt-win-line 0.3s ease forwards 0.14s',
        }}
      />
      {/* Sharp line */}
      <line
        x1={x1} y1={y1} x2={x2} y2={y2}
        stroke="#D4AF37" strokeWidth="2.2" strokeLinecap="round"
        style={{
          strokeDasharray:  len,
          strokeDashoffset: len,
          animation: 'ttt-win-line 0.3s ease forwards 0.14s',
        }}
      />
    </svg>
  )
}

// ─── Setup Screen ─────────────────────────────────────────────────────────────

function SetupScreen({
  difficulty, onDifficulty,
  use4x4, onUse4x4, unlocked4x4,
  session, totalGames,
  onStart,
}: {
  difficulty: Difficulty
  onDifficulty: (d: Difficulty) => void
  use4x4: boolean
  onUse4x4: (v: boolean) => void
  unlocked4x4: boolean
  session: Session
  totalGames: number
  onStart: () => void
}) {
  const DIFFS: { id: Difficulty; label: string; desc: string }[] = [
    { id: 'easy',   label: 'Easy',   desc: 'Random moves'              },
    { id: 'medium', label: 'Medium', desc: 'Blocks and grabs wins'     },
    { id: 'hard',   label: 'Hard',   desc: 'Perfect · minimax AI'      },
  ]

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      gap: '1.5rem', padding: '1rem', maxWidth: '22rem', width: '100%',
    }}>
      {/* Title */}
      <div style={{ textAlign: 'center' }}>
        <p style={{
          fontFamily: 'var(--ds-font-display, serif)', fontSize: '1.7rem',
          fontWeight: 700, color: '#f0e8d8', margin: 0, letterSpacing: '-0.02em',
        }}>
          Tic-Tac-Toe
        </p>
        <p style={{ fontSize: '0.75rem', color: '#7a7060', fontFamily: 'var(--ds-font-mono, monospace)', margin: '0.4rem 0 0', letterSpacing: '0.05em' }}>
          You are <span style={{ color: '#f0e8d8' }}>X</span> · AI is <span style={{ color: '#a89878' }}>O</span>
        </p>
      </div>

      {/* Difficulty */}
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.68rem', color: '#7a7060', fontFamily: 'var(--ds-font-mono, monospace)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Difficulty
        </span>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {DIFFS.map(({ id, label, desc }) => (
            <button
              key={id}
              className={`ttt-diff-btn${difficulty === id ? ' active' : ''}`}
              onClick={() => onDifficulty(id)}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                gap: '0.25rem', padding: '0.6rem 0.4rem',
                borderRadius: 'var(--ds-radius-sm, 0.65rem)',
                border: '1px solid rgba(42, 37, 32, 0.95)',
                background: 'rgba(16, 13, 8, 0.7)',
                color: '#7a7060', cursor: 'pointer', transition: 'all 0.15s ease',
              }}
            >
              <span style={{ fontFamily: 'var(--ds-font-mono, monospace)', fontSize: '0.78rem', fontWeight: 500 }}>{label}</span>
              <span style={{ fontSize: '0.62rem', opacity: 0.75, textAlign: 'center', lineHeight: 1.3 }}>{desc}</span>
            </button>
          ))}
        </div>
        {difficulty === 'hard' && (
          <p style={{ margin: 0, fontSize: '0.72rem', color: '#7a7060', fontFamily: 'var(--ds-font-mono, monospace)', textAlign: 'center', letterSpacing: '0.03em' }}>
            Unbeatable mode — try for a draw!
          </p>
        )}
      </div>

      {/* 4×4 toggle */}
      {unlocked4x4 && (
        <div style={{
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.65rem 0.85rem',
          borderRadius: 'var(--ds-radius-sm, 0.65rem)',
          border: '1px solid rgba(201, 168, 76, 0.25)',
          background: 'rgba(201, 168, 76, 0.06)',
        }}>
          <div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: '#c9a84c', fontFamily: 'var(--ds-font-mono, monospace)', fontWeight: 500 }}>
              🏆 4×4 Ultimate
            </p>
            <p style={{ margin: '0.15rem 0 0', fontSize: '0.68rem', color: '#7a7060', fontFamily: 'var(--ds-font-mono, monospace)' }}>
              Need 4 in a row
            </p>
          </div>
          <button
            onClick={() => onUse4x4(!use4x4)}
            style={{
              width: '2.6rem', height: '1.4rem', borderRadius: '999px', border: 'none',
              background: use4x4 ? '#c9a84c' : 'rgba(42, 37, 32, 0.95)',
              cursor: 'pointer', position: 'relative', transition: 'background 0.2s ease', flexShrink: 0,
            }}
            aria-checked={use4x4}
            role="switch"
            aria-label="4×4 mode"
          >
            <span style={{
              position: 'absolute', top: '50%', left: use4x4 ? 'calc(100% - 1.1rem)' : '0.15rem',
              transform: 'translateY(-50%)',
              width: '1.1rem', height: '1.1rem', borderRadius: '50%',
              background: '#f0e8d8', transition: 'left 0.2s ease',
              display: 'block',
            }} />
          </button>
        </div>
      )}

      {/* Session score if returning */}
      {totalGames > 0 && (
        <div style={{
          display: 'flex', gap: '0.4rem', alignItems: 'center',
          fontFamily: 'var(--ds-font-mono, monospace)', fontSize: '0.75rem', color: '#7a7060',
        }}>
          <span>Session:</span>
          <span style={{ color: session.player > session.ai ? '#c9a84c' : '#a89878' }}>You {session.player}</span>
          <span>—</span>
          <span style={{ color: session.ai > session.player ? '#c9a84c' : '#a89878' }}>AI {session.ai}</span>
          <span>—</span>
          <span>Draws {session.draws}</span>
        </div>
      )}

      {/* Start button */}
      <button
        onClick={onStart}
        style={{
          width: '100%', padding: '0.7rem 1.5rem',
          borderRadius: 'var(--ds-radius-sm, 0.65rem)',
          border: '1px solid rgba(201, 168, 76, 0.5)',
          background: 'linear-gradient(135deg, rgba(201,168,76,0.22), rgba(201,168,76,0.1))',
          color: '#e8c96e',
          fontFamily: 'var(--ds-font-mono, monospace)', fontSize: '0.88rem', fontWeight: 500,
          letterSpacing: '0.06em', cursor: 'pointer', transition: 'all 0.15s ease',
        }}
        onMouseEnter={e => { const b = e.currentTarget; b.style.background = 'linear-gradient(135deg,rgba(201,168,76,.35),rgba(201,168,76,.18))'; b.style.color = '#f0e8d8' }}
        onMouseLeave={e => { const b = e.currentTarget; b.style.background = 'linear-gradient(135deg,rgba(201,168,76,.22),rgba(201,168,76,.1))'; b.style.color = '#e8c96e' }}
      >
        {totalGames === 0 ? 'Start Game' : 'New Game'}
      </button>
    </div>
  )
}

// ─── Round Result Overlay (sits on top of board) ──────────────────────────────

function RoundOverlay({
  winner, isDraw, difficulty, boardSize,
  onNextRound, onSettings,
}: {
  winner:    WinResult | null
  isDraw:    boolean
  difficulty: Difficulty
  boardSize: 3 | 4
  onNextRound: () => void
  onSettings: () => void
}) {
  const playerWon = winner?.winner === PLAYER

  const heading = isDraw ? 'Draw!' : playerWon ? 'You win!' : 'AI wins!'
  const subtext  = isDraw
    ? 'Well matched.'
    : playerWon
    ? '🎉 Nice move!'
    : difficulty === 'hard' && boardSize === 3
    ? 'Perfect play — try for a draw next time!'
    : 'The AI prevailed.'

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'absolute', inset: 0, zIndex: 10,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: '0.85rem',
        background: 'rgba(8, 7, 4, 0.78)',
        backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
        animation: 'ttt-result-in 0.22s ease forwards',
      }}
    >
      <p style={{
        margin: 0, fontFamily: 'var(--ds-font-display, serif)',
        fontSize: 'clamp(1.4rem, 5vmin, 2rem)', fontWeight: 700,
        color: isDraw ? '#a89878' : playerWon ? '#c9a84c' : '#f0e8d8',
        letterSpacing: '-0.02em',
      }}>
        {heading}
      </p>
      <p style={{
        margin: 0, fontSize: '0.75rem', color: '#7a7060',
        fontFamily: 'var(--ds-font-mono, monospace)', letterSpacing: '0.03em',
        maxWidth: '16rem', textAlign: 'center',
      }}>
        {subtext}
      </p>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
        {/* Next Round */}
        <button
          onClick={onNextRound}
          style={{
            padding: '0.5rem 1.25rem',
            borderRadius: 'var(--ds-radius-sm, 0.65rem)',
            border: '1px solid rgba(201, 168, 76, 0.5)',
            background: 'linear-gradient(135deg, rgba(201,168,76,0.22), rgba(201,168,76,0.1))',
            color: '#e8c96e', fontFamily: 'var(--ds-font-mono, monospace)',
            fontSize: '0.78rem', fontWeight: 500, cursor: 'pointer', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { const b = e.currentTarget; b.style.background='linear-gradient(135deg,rgba(201,168,76,.35),rgba(201,168,76,.18))'; b.style.color='#f0e8d8' }}
          onMouseLeave={e => { const b = e.currentTarget; b.style.background='linear-gradient(135deg,rgba(201,168,76,.22),rgba(201,168,76,.1))'; b.style.color='#e8c96e' }}
        >
          Next Round
        </button>

        {/* Settings */}
        <button
          onClick={onSettings}
          style={{
            padding: '0.5rem 1.1rem',
            borderRadius: 'var(--ds-radius-sm, 0.65rem)',
            border: '1px solid rgba(42, 37, 32, 0.95)',
            background: 'transparent', color: '#a89878',
            fontFamily: 'var(--ds-font-mono, monospace)',
            fontSize: '0.78rem', cursor: 'pointer', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { const b = e.currentTarget; b.style.borderColor='rgba(201,168,76,.35)'; b.style.color='#c9a84c' }}
          onMouseLeave={e => { const b = e.currentTarget; b.style.borderColor='rgba(42,37,32,.95)'; b.style.color='#a89878' }}
        >
          ⚙ Settings
        </button>
      </div>
    </div>
  )
}

// ─── Inner game (proper component so hooks can be used freely) ────────────────

function TicTacToeInner({ isPaused, setScore }: Pick<GameRenderProps, 'isPaused' | 'setScore'>) {
  // ── Core state ──────────────────────────────────────────────────────────────
  const [boardSize, setBoardSize] = useState<3 | 4>(3)
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')
  const [phase, setPhase]           = useState<Phase>('setup')
  const [board, setBoard]           = useState<Board>(Array(9).fill(null))
  const [aiTurn, setAITurn]         = useState(false)
  const [thinking, setThinking]     = useState(false)
  const [winner, setWinner]         = useState<WinResult | null>(null)
  const [isDraw, setIsDraw]         = useState(false)
  const [session, setSession]       = useState<Session>({ player: 0, ai: 0, draws: 0 })
  const [totalGames, setTotalGames] = useState(0)
  const [unlocked4x4, setUnlocked4x4] = useState(false)
  const [use4x4, setUse4x4]         = useState(false)
  const [showToast, setShowToast]   = useState(false)

  // ── Stable refs (avoid stale closures in effects & timers) ─────────────────
  const boardR      = useRef<Board>(board)
  const phaseR      = useRef<Phase>('setup')
  const totalR      = useRef(0)
  const unlockedR   = useRef(false)
  const diffR       = useRef<Difficulty>('medium')
  const sizeR       = useRef<3 | 4>(3)
  const pausedR     = useRef(false)

  // Keep pausedR in sync — isPaused comes from the parent render prop
  useEffect(() => {
    pausedR.current = isPaused
  }, [isPaused])

  // ── Sync player wins → GameShell score (for "Best" tracking) ──────────────
  useEffect(() => {
    setScore(session.player)
  }, [session.player, setScore])

  // ── Unlock 4×4 check ───────────────────────────────────────────────────────
  const tryUnlock = useCallback((nextTotal: number) => {
    if (nextTotal >= UNLOCK_AT && !unlockedR.current) {
      setUnlocked4x4(true)
      unlockedR.current = true
      setShowToast(true)
      setTimeout(() => setShowToast(false), 4500)
    }
  }, [])

  // ── End a round ─────────────────────────────────────────────────────────────
  const endRound = useCallback((w: WinResult | null, _draw: boolean) => {
    if (w) {
      setWinner(w)
      setSession(prev => ({
        ...prev,
        player: prev.player + (w.winner === PLAYER ? 1 : 0),
        ai:     prev.ai     + (w.winner === AI     ? 1 : 0),
      }))
    } else {
      setIsDraw(true)
      setSession(prev => ({ ...prev, draws: prev.draws + 1 }))
    }
    const n = totalR.current + 1
    setTotalGames(n)
    totalR.current = n
    setPhase('roundOver')
    phaseR.current = 'roundOver'
    tryUnlock(n)
  }, [tryUnlock])

  // ── Player click ────────────────────────────────────────────────────────────
  const handleClick = useCallback((idx: number) => {
    if (
      phaseR.current !== 'playing' ||
      boardR.current[idx] !== null ||
      aiTurn ||
      pausedR.current
    ) return

    const nb = boardR.current.slice() as Board
    nb[idx] = PLAYER
    boardR.current = nb
    setBoard(nb)

    const w = checkWinner(nb, sizeR.current)
    if (w)                        { endRound(w, false); return }
    if (nb.every(c => c !== null)){ endRound(null, true); return }

    setThinking(true)
    setAITurn(true)
  }, [aiTurn, endRound])

  // ── AI move effect ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!aiTurn) return

    const t = setTimeout(() => {
      // Re-check phase in case round ended while timer was ticking
      if (phaseR.current !== 'playing') {
        setThinking(false); setAITurn(false); return
      }

      const sz   = sizeR.current
      const diff = sz === 4 ? 'medium' : diffR.current   // minimax too slow for 4×4
      const mv   = getAIMove(boardR.current, diff, AI, sz)

      if (mv === -1) { setThinking(false); setAITurn(false); return }

      const nb = boardR.current.slice() as Board
      nb[mv] = AI
      boardR.current = nb
      setBoard(nb)
      setThinking(false)

      const w = checkWinner(nb, sz)
      if (w)                        { endRound(w, false); setAITurn(false); return }
      if (nb.every(c => c !== null)){ endRound(null, true); setAITurn(false); return }

      setAITurn(false)
    }, AI_DELAY)

    return () => clearTimeout(t)
  }, [aiTurn, endRound])

  // ── Start / restart round ───────────────────────────────────────────────────
  const startRound = useCallback((sz: 3 | 4, diff: Difficulty) => {
    const b = Array(sz * sz).fill(null) as Board
    boardR.current = b; sizeR.current = sz; diffR.current = diff
    setBoardSize(sz); setBoard(b)
    setWinner(null); setIsDraw(false)
    setAITurn(false); setThinking(false)
    setPhase('playing'); phaseR.current = 'playing'
  }, [])

  const handleStart = useCallback(() => {
    const sz: 3 | 4 = use4x4 ? 4 : 3
    startRound(sz, difficulty)
  }, [use4x4, difficulty, startRound])

  const handleNextRound = useCallback(() => {
    startRound(sizeR.current, diffR.current)
  }, [startRound])

  const handleGoSettings = useCallback(() => {
    // Reset board display but keep session intact
    const b = Array(sizeR.current * sizeR.current).fill(null) as Board
    boardR.current = b; setBoard(b)
    setWinner(null); setIsDraw(false)
    setAITurn(false); setThinking(false)
    setPhase('setup'); phaseR.current = 'setup'
  }, [])

  // ── Computed ────────────────────────────────────────────────────────────────
  const winSet = winner ? new Set(winner.indices) : null
  const isLosing = winner !== null   // there's a winner → non-winners dim
  const showHardModeHint = difficulty === 'hard' && boardSize === 3 && phase === 'playing'
  const boardDimension = 'min(90cqw, max(10rem, calc(100cqh - 9rem)), 30rem)'

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      style={{
        height: '100%', display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: '0.85rem', padding: '1rem',
        width: '100%',
        boxSizing: 'border-box',
        overflow: 'hidden',
        containerType: 'size',
        background: 'var(--ds-bg, #0a0906)',
      }}
    >
      {/* ── Setup ──────────────────────────────────────────────────────────── */}
      {phase === 'setup' && (
        <SetupScreen
          difficulty={difficulty}
          onDifficulty={d => { setDifficulty(d); diffR.current = d }}
          use4x4={use4x4}
          onUse4x4={setUse4x4}
          unlocked4x4={unlocked4x4}
          session={session}
          totalGames={totalGames}
          onStart={handleStart}
        />
      )}

      {/* ── Game area ──────────────────────────────────────────────────────── */}
      {phase !== 'setup' && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: '0.85rem',
            width: '100%',
            flexShrink: 0,
          }}
        >
          {/* Session score */}
          <div
            style={{
              display: 'flex', alignItems: 'center', gap: '0.45rem',
              fontFamily: 'var(--ds-font-mono, monospace)', fontSize: '0.78rem', color: '#7a7060',
              letterSpacing: '0.04em',
              flexShrink: 0,
            }}
          >
            <span>You</span>
            <span style={{ color: session.player > session.ai ? '#c9a84c' : '#a89878', fontWeight: 500, fontSize: '0.88rem' }}>
              {session.player}
            </span>
            <span style={{ color: '#3a3530' }}>—</span>
            <span>AI</span>
            <span style={{ color: session.ai > session.player ? '#c9a84c' : '#a89878', fontWeight: 500, fontSize: '0.88rem' }}>
              {session.ai}
            </span>
            <span style={{ color: '#3a3530' }}>—</span>
            <span>Draws</span>
            <span style={{ fontWeight: 500, fontSize: '0.88rem' }}>{session.draws}</span>
          </div>

          {/* Board */}
          <div
            role="grid"
            aria-label="Tic-Tac-Toe board"
            style={{
              position: 'relative',
              width: boardDimension,
              maxWidth: '100%',
              aspectRatio: '1 / 1',
              flexShrink: 0,
              display: 'grid',
              gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))`,
              gridTemplateRows: `repeat(${boardSize}, minmax(0, 1fr))`,
              gap: '2px',
              background: 'rgba(201, 168, 76, 0.22)',
              borderRadius: '0.65rem',
              overflow: 'hidden',
              boxShadow: '0 0 0 1px rgba(201,168,76,0.18), 0 20px 60px rgba(0,0,0,0.55)',
            }}
          >
            {board.map((cell, idx) => {
              const isWinCell = winSet?.has(idx) ?? false
              const dim       = isLosing && !isWinCell

              return (
                <button
                  key={`${idx}-${cell ?? 'e'}`}
                  className="ttt-cell-btn"
                  role="gridcell"
                  aria-label={`Row ${Math.floor(idx / boardSize) + 1}, Column ${(idx % boardSize) + 1}${cell ? `, ${cell}` : ', empty'}`}
                  onClick={() => handleClick(idx)}
                  disabled={phase !== 'playing' || cell !== null || aiTurn || isPaused}
                  style={{
                    background: '#0d0b08',
                    border: 'none',
                    padding: 0,
                    minWidth: 0,
                    minHeight: 0,
                    cursor: phase === 'playing' && !cell && !aiTurn && !isPaused ? 'pointer' : 'default',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'background 0.14s ease',
                  }}
                >
                  {cell === 'X' && <XMark dim={dim} />}
                  {cell === 'O' && <OMark dim={dim} />}
                </button>
              )
            })}

            {/* Win line */}
            {winner && <WinLine indices={winner.indices} size={boardSize} />}

            {/* Round result overlay */}
            {phase === 'roundOver' && (
              <RoundOverlay
                winner={winner}
                isDraw={isDraw}
                difficulty={difficulty}
                boardSize={boardSize}
                onNextRound={handleNextRound}
                onSettings={handleGoSettings}
              />
            )}
          </div>

          {/* Turn / thinking indicator */}
          <div
            aria-live="polite"
            style={{
              fontFamily: 'var(--ds-font-mono, monospace)',
              fontSize: '0.75rem',
              minHeight: '1.1em',
              letterSpacing: '0.04em',
              flexShrink: 0,
            }}
          >
            {phase === 'playing' && (
              thinking || aiTurn
                ? <span style={{ color: '#7a7060', animation: 'ttt-blink 1.1s ease infinite' }}>AI is thinking…</span>
                : <span style={{ color: '#c9a84c' }}>Your turn</span>
            )}
            {phase === 'roundOver' && (
              <span style={{ color: '#7a7060' }}>Round complete</span>
            )}
          </div>

          {/* Hard-mode motivational hint */}
          <div
            style={{
              minHeight: '1.05rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            {showHardModeHint && (
              <p
                style={{
                  margin: 0, fontSize: '0.7rem', color: '#7a7060',
                  fontFamily: 'var(--ds-font-mono, monospace)',
                  letterSpacing: '0.03em', textAlign: 'center',
                }}
              >
                Unbeatable mode — try for a draw!
              </p>
            )}
          </div>
        </div>
      )}

      {/* 4×4 Unlock Toast */}
      {showToast && (
        <div
          role="alert"
          style={{
            position: 'fixed', bottom: '2rem', left: '50%',
            padding: '0.7rem 1.4rem',
            borderRadius: '999px',
            border: '1px solid rgba(201, 168, 76, 0.5)',
            background: 'rgba(14, 11, 7, 0.97)',
            color: '#c9a84c',
            fontFamily: 'var(--ds-font-mono, monospace)', fontSize: '0.82rem', fontWeight: 500,
            zIndex: 200,
            boxShadow: '0 8px 40px rgba(0,0,0,0.65), 0 0 0 1px rgba(201,168,76,0.1)',
            animation: 'ttt-toast 4.5s ease forwards',
            whiteSpace: 'nowrap',
            pointerEvents: 'none',
          }}
        >
          🏆 4×4 Mode Unlocked!
        </div>
      )}
    </div>
  )
}

// ─── Public wrapper ───────────────────────────────────────────────────────────

export default function TicTacToe() {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: GLOBAL_CSS }} />
      <GameShell
        title="Tic-Tac-Toe"
        highScoreKey="hs:tictactoe:wins"
        controls={CONTROLS}
      >
        {({ isPaused, setScore }) => (
          <TicTacToeInner isPaused={isPaused} setScore={setScore} />
        )}
      </GameShell>
    </>
  )
}
