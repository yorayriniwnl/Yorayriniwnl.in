'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import GameShell from './GameShell'
import { MEMORY_CARDS } from '../data/memoryCards'
import type { MemoryCard } from '../data/memoryCards'
import type { GameRenderProps } from './GameShell'

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type Difficulty = 'easy' | 'hard'

interface CardInstance {
  instanceId: string   // unique per position in this grid
  defId:      string   // links to MemoryCard.id — match condition
  def:        MemoryCard
  isFlipped:  boolean
  isMatched:  boolean
  isShaking:  boolean
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const EASY_PAIRS = 8    // 4 × 4 grid
const HARD_PAIRS = 18   // 6 × 6 grid

const CONTROLS = [
  { key: 'Click',  action: 'Flip a card'     },
  { key: 'Enter',  action: 'Flip focused card' },
  { key: 'Esc',    action: 'Pause / Resume'  },
]

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers
// ─────────────────────────────────────────────────────────────────────────────

function calcTimeBonus(seconds: number): number {
  if (seconds <= 30)  return 500
  if (seconds >= 120) return 0
  return Math.round(500 * (1 - (seconds - 30) / 90))
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60).toString().padStart(2, '0')
  const s = (seconds % 60).toString().padStart(2, '0')
  return `${m}:${s}`
}

function buildCardGrid(difficulty: Difficulty): CardInstance[] {
  return buildCardGridWithRandom(difficulty, Math.random)
}

function buildCardGridWithRandom(
  difficulty: Difficulty,
  random: () => number,
): CardInstance[] {
  const count    = difficulty === 'easy' ? EASY_PAIRS : HARD_PAIRS
  const selected = MEMORY_CARDS.slice(0, count)

  // Create two instances of every card
  const instances: CardInstance[] = selected.flatMap(def => [
    { instanceId: `${def.id}-a`, defId: def.id, def, isFlipped: false, isMatched: false, isShaking: false },
    { instanceId: `${def.id}-b`, defId: def.id, def, isFlipped: false, isMatched: false, isShaking: false },
  ])

  // Fisher-Yates shuffle
  for (let i = instances.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[instances[i], instances[j]] = [instances[j], instances[i]]
  }

  return instances
}

function createSeededRandom(seed: string): () => number {
  let hash = 2166136261
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }

  return () => {
    hash = Math.imul(hash ^ (hash >>> 15), 2246822507)
    hash = Math.imul(hash ^ (hash >>> 13), 3266489909)
    hash ^= hash >>> 16
    return (hash >>> 0) / 4294967296
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Inner game — receives render props from GameShell
// ─────────────────────────────────────────────────────────────────────────────

function MemoryMatchInner({
  isPaused,
  isGameOver,
  roundId,
  setScore,
  setGameOver,
}: GameRenderProps) {
  // ── Game state ──────────────────────────────────────────────────────────────
  const [difficulty,    setDifficulty]   = useState<Difficulty>('easy')
  const [cards,         setCards]        = useState<CardInstance[]>(() =>
    buildCardGridWithRandom('easy', createSeededRandom(`easy:${roundId}`)),
  )
  const [pending,       setPending]      = useState<string[]>([])  // ≤ 2 instanceIds awaiting eval
  const [locked,        setLocked]       = useState(false)         // block input during eval
  const [started,       setStarted]      = useState(false)         // first flip → start timer
  const [elapsed,       setElapsed]      = useState(0)             // seconds
  const [matchedPairs,  setMatchedPairs] = useState(0)

  // Refs that must be readable inside setTimeout callbacks without stale closures
  const elapsedRef     = useRef(0)

  // ── Init / reset ────────────────────────────────────────────────────────────

  const initGame = useCallback((diff: Difficulty) => {
    setCards(buildCardGrid(diff))
    setPending([])
    setLocked(false)
    setStarted(false)
    setElapsed(0)
    setMatchedPairs(0)
    elapsedRef.current = 0
    setScore(0)
  }, [setScore])


  // Detect GameShell "Play Again" (isGameOver: true → false)

  // ── Timer ───────────────────────────────────────────────────────────────────
  // Starts on first flip, pauses when isPaused or isGameOver.

  useEffect(() => {
    if (!started || isPaused || isGameOver) return
    const id = setInterval(() => {
      setElapsed(prev => {
        const next = prev + 1
        elapsedRef.current = next   // keep ref in sync for setTimeout callbacks
        return next
      })
    }, 1000)
    return () => clearInterval(id)
  }, [started, isPaused, isGameOver])

  // ── Card click handler ──────────────────────────────────────────────────────

  function handleCardClick(instanceId: string) {
    if (isPaused || isGameOver || locked) return

    const card = cards.find(c => c.instanceId === instanceId)
    if (!card || card.isFlipped || card.isMatched) return
    if (pending.length >= 2) return

    // Start the timer on the very first flip
    if (!started) setStarted(true)

    // Flip this card face-up
    const nextCards = cards.map(c =>
      c.instanceId === instanceId ? { ...c, isFlipped: true } : c
    )
    setCards(nextCards)

    const newPending = [...pending, instanceId]
    setPending(newPending)

    // Second card → evaluate the pair
    if (newPending.length === 2) {
      setLocked(true)

      const [id1, id2] = newPending

      // defId never changes — safe to read from pre-flip state
      const firstCard = cards.find(c => c.instanceId === id1)
      const secondCard = cards.find(c => c.instanceId === id2)

      if (!firstCard || !secondCard) {
        setPending([])
        setLocked(false)
        return
      }

      const def1 = firstCard.defId
      const def2 = secondCard.defId

      if (def1 === def2) {
        // ── Match ─────────────────────────────────────────────────────────────
        // Capture values now (locked prevents re-entrant calls)
        const newMatchedPairs = matchedPairs + 1
        const baseScore       = newMatchedPairs * 10
        const totalPairs      = difficulty === 'easy' ? EASY_PAIRS : HARD_PAIRS

        // Brief pause lets the second card finish flipping before marking matched
        setTimeout(() => {
          setCards(prev => prev.map(c =>
            c.instanceId === id1 || c.instanceId === id2
              ? { ...c, isMatched: true }
              : c
          ))
          setMatchedPairs(newMatchedPairs)
          setScore(baseScore)
          setPending([])
          setLocked(false)

          // All pairs matched → game complete
          if (newMatchedPairs === totalPairs) {
            const timeBonus  = calcTimeBonus(elapsedRef.current)
            const finalScore = baseScore + timeBonus
            setScore(finalScore)
            setGameOver(true, finalScore)
          }
        }, 420)
      } else {
        // ── Mismatch ──────────────────────────────────────────────────────────
        // Wait a moment so the player can see both faces, then shake + flip back

        setTimeout(() => {
          // Apply shake class
          setCards(prev => prev.map(c =>
            c.instanceId === id1 || c.instanceId === id2
              ? { ...c, isShaking: true }
              : c
          ))

          setTimeout(() => {
            // Remove shake, flip back
            setCards(prev => prev.map(c =>
              c.instanceId === id1 || c.instanceId === id2
                ? { ...c, isFlipped: false, isShaking: false }
                : c
            ))
            setPending([])
            setLocked(false)
          }, 380)           // shake duration
        }, 520)             // view delay  →  total ≈ 900 ms
      }
    }
  }

  // ── Difficulty toggle ───────────────────────────────────────────────────────

  function changeDifficulty(d: Difficulty) {
    if (d === difficulty) return
    setDifficulty(d)
    initGame(d)
  }

  // ── Derived ────────────────────────────────────────────────────────────────

  const totalPairs = difficulty === 'easy' ? EASY_PAIRS : HARD_PAIRS
  const cols       = difficulty === 'easy' ? 4 : 6
  const maxWidth   = cols === 4 ? 500 : 620

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      style={{
        height: '100%',
        overflowY: 'auto',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.85rem 0.75rem 1.75rem',
      }}
    >
      {/* ── Scoped CSS — animations can't be inlined ── */}
      <style>{`
        /* ─── Card outer ─────────────────────────────────────────────────── */
        .mm-card {
          cursor: pointer;
          border-radius: 10px;
          transition: transform 280ms ease, box-shadow 280ms ease;
          position: relative;
          aspect-ratio: 1 / 1;
          user-select: none;
          -webkit-tap-highlight-color: transparent;
          outline: none;
        }
        .mm-card:focus-visible {
          box-shadow: 0 0 0 2px rgba(201,168,76,0.70);
        }
        .mm-card:not(.mm-card--matched):not(.mm-card--shaking):hover {
          transform: translateY(-3px) scale(1.02);
        }

        /* Matched — gold glow + slight pop */
        .mm-card--matched {
          transform: scale(1.05) !important;
          box-shadow:
            0 0 0 1.5px rgba(201,168,76,0.50),
            0 0 18px rgba(201,168,76,0.38),
            0 0 40px rgba(201,168,76,0.12);
          cursor: default;
          pointer-events: none;
        }

        /* Mismatch shake — translateX only, never conflicts with matched scale */
        .mm-card--shaking {
          animation: mm-shake 380ms ease forwards;
        }
        @keyframes mm-shake {
          0%, 100% { transform: translateX(0); }
          15%       { transform: translateX(-5px); }
          40%       { transform: translateX(5px); }
          65%       { transform: translateX(-4px); }
          85%       { transform: translateX(3px); }
        }

        /* ─── 3-D flip ───────────────────────────────────────────────────── */
        .mm-perspective {
          width: 100%;
          height: 100%;
          perspective: 700px;
        }
        .mm-inner {
          width: 100%;
          height: 100%;
          position: relative;
          transform-style: preserve-3d;
          transition: transform 400ms cubic-bezier(0.45, 0.05, 0.55, 0.95);
          border-radius: 10px;
        }
        .mm-inner--flipped {
          transform: rotateY(180deg);
        }

        /* ─── Both faces ─────────────────────────────────────────────────── */
        .mm-back,
        .mm-face {
          position: absolute;
          inset: 0;
          border-radius: 10px;
          backface-visibility: hidden;
          -webkit-backface-visibility: hidden;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          overflow: hidden;
        }

        /* ── Back face — shows initially ─────────────────────────────────── */
        .mm-back {
          background:
            radial-gradient(circle, rgba(201,168,76,0.07) 1px, transparent 1px),
            linear-gradient(155deg, #1c1912 0%, #0d0c09 100%);
          background-size: 14px 14px, 100% 100%;
          border: 1px solid rgba(42, 37, 32, 0.95);
        }

        /* ── Front face — pre-rotated, shows when flipped ────────────────── */
        .mm-face {
          transform: rotateY(180deg);
          background: linear-gradient(155deg, #1e1b12 0%, #131008 100%);
          border: 1px solid rgba(201, 168, 76, 0.22);
          gap: 0.28rem;
          padding: 0.2rem;
        }
        .mm-card--matched .mm-face {
          background: linear-gradient(155deg, #241f13 0%, #18140a 100%);
          border-color: rgba(201, 168, 76, 0.45);
        }

        /* ─── Back content ───────────────────────────────────────────────── */
        .mm-back-monogram {
          font-family: var(--ds-font-display, serif);
          font-weight: 700;
          font-size: clamp(0.7rem, 2.8vw, 1.05rem);
          color: rgba(201, 168, 76, 0.52);
          letter-spacing: 0.05em;
          user-select: none;
          position: relative;
          z-index: 1;
        }
        .mm-back-corner {
          position: absolute;
          width: 3.5px;
          height: 3.5px;
          border-radius: 50%;
          background: rgba(201, 168, 76, 0.28);
        }

        /* ─── Face content ───────────────────────────────────────────────── */
        .mm-emoji {
          font-size: clamp(1.15rem, 4.5vw, 1.9rem);
          line-height: 1;
          user-select: none;
        }
        .mm-label {
          font-size: clamp(0.52rem, 1.6vw, 0.7rem);
          font-family: var(--ds-font-mono, monospace);
          color: rgba(201, 168, 76, 0.80);
          letter-spacing: 0.03em;
          text-align: center;
          padding: 0 3px;
          line-height: 1.2;
          user-select: none;
        }
        .mm-card--matched .mm-label {
          color: rgba(232, 201, 110, 1);
        }

        /* ─── Difficulty buttons ─────────────────────────────────────────── */
        .mm-diff-btn {
          padding: 0.32rem 0.85rem;
          border-radius: 999px;
          font-size: 0.76rem;
          font-family: var(--ds-font-mono, monospace);
          letter-spacing: 0.04em;
          cursor: pointer;
          transition: all 150ms ease;
          border: 1px solid rgba(42, 37, 32, 0.95);
          background: transparent;
          color: #7a7060;
          white-space: nowrap;
        }
        .mm-diff-btn:hover:not(.mm-diff-btn--active) {
          border-color: rgba(201, 168, 76, 0.35);
          color: #c9a84c;
          background: rgba(201, 168, 76, 0.04);
        }
        .mm-diff-btn--active {
          border-color: rgba(201, 168, 76, 0.55) !important;
          background: rgba(201, 168, 76, 0.12) !important;
          color: #c9a84c !important;
          font-weight: 600;
        }

        /* ─── Grid ───────────────────────────────────────────────────────── */
        .mm-grid {
          display: grid;
          width: 100%;
        }
      `}</style>

      {/* ── Top controls: difficulty + live stats ── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          width: '100%',
          maxWidth: `${maxWidth}px`,
          flexWrap: 'wrap',
          gap: '0.5rem',
        }}
      >
        {/* Difficulty toggle */}
        <div style={{ display: 'flex', gap: '0.3rem' }}>
          {(['easy', 'hard'] as Difficulty[]).map(d => (
            <button
              key={d}
              className={`mm-diff-btn${difficulty === d ? ' mm-diff-btn--active' : ''}`}
              onClick={() => changeDifficulty(d)}
              aria-pressed={difficulty === d}
            >
              {d === 'easy' ? 'Easy  4×4' : 'Hard  6×6'}
            </button>
          ))}
        </div>

        {/* Live stats */}
        <div
          style={{
            display: 'flex',
            gap: '0.65rem',
            fontFamily: 'var(--ds-font-mono, monospace)',
            fontSize: '0.72rem',
            letterSpacing: '0.04em',
            alignItems: 'center',
          }}
        >
          <span style={{ color: started ? '#a89878' : '#484038' }}>
            ⏱ {formatTime(elapsed)}
          </span>

          <span style={{ color: 'rgba(42,37,32,0.95)' }}>|</span>

          <span>
            <span
              style={{
                color: matchedPairs > 0 ? '#c9a84c' : '#6a5e50',
                fontWeight: matchedPairs > 0 ? 600 : 400,
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {matchedPairs}
            </span>
            <span style={{ color: '#6a5e50' }}>/{totalPairs} pairs</span>
          </span>
        </div>
      </div>

      {/* ── Gold rule ── */}
      <div
        aria-hidden
        style={{
          width: '100%',
          maxWidth: `${maxWidth}px`,
          height: '1px',
          background: 'linear-gradient(90deg, transparent, rgba(201,168,76,0.18), transparent)',
          flexShrink: 0,
        }}
      />

      {/* ── Card grid ── */}
      <div
        className="mm-grid"
        role="grid"
        aria-label={`Memory match, ${cols}×${cols} grid`}
        style={{
          gridTemplateColumns: `repeat(${cols}, 1fr)`,
          gap: `clamp(0.28rem, 1.1vw, 0.5rem)`,
          maxWidth: `${maxWidth}px`,
        }}
      >
        {cards.map(card => (
          <div
            key={card.instanceId}
            role="gridcell"
            tabIndex={card.isMatched ? -1 : 0}
            aria-label={
              card.isFlipped || card.isMatched
                ? `${card.def.label}, ${card.isMatched ? 'matched' : 'face up'}`
                : 'Hidden card'
            }
            className={[
              'mm-card',
              card.isMatched ? 'mm-card--matched' : '',
              card.isShaking ? 'mm-card--shaking' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onClick={() => handleCardClick(card.instanceId)}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                handleCardClick(card.instanceId)
              }
            }}
          >
            <div className="mm-perspective">
              <div
                className={`mm-inner${
                  card.isFlipped || card.isMatched ? ' mm-inner--flipped' : ''
                }`}
              >
                {/* ── Back face — "YA" monogram ── */}
                <div className="mm-back" aria-hidden="true">
                  {/* Four corner dots */}
                  <div className="mm-back-corner" style={{ top: '13%', left: '13%'  }} />
                  <div className="mm-back-corner" style={{ top: '13%', right: '13%' }} />
                  <div className="mm-back-corner" style={{ bottom: '13%', left: '13%'  }} />
                  <div className="mm-back-corner" style={{ bottom: '13%', right: '13%' }} />
                  <span className="mm-back-monogram">YA</span>
                </div>

                {/* ── Front face — emoji + label ── */}
                <div className="mm-face" aria-hidden="true">
                  <span
                    className="mm-emoji"
                    role="img"
                    aria-label={card.def.label}
                  >
                    {card.def.emoji}
                  </span>
                  <span className="mm-label">{card.def.label}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* ── Bonus hint strip — only visible before game starts ── */}
      {!started && (
        <p
          style={{
            fontFamily: 'var(--ds-font-mono, monospace)',
            fontSize: '0.68rem',
            color: '#4a4036',
            letterSpacing: '0.06em',
            textAlign: 'center',
            margin: '0.25rem 0 0',
          }}
        >
          Finish under 30 s for a 500-point speed bonus · under 120 s for a partial bonus
        </p>
      )}
    </div>
  )
}

// ─────────────────────────────────────────────────────────────────────────────
// Export — wraps the inner game with GameShell chrome
// ─────────────────────────────────────────────────────────────────────────────

export default function MemoryMatch() {
  return (
    <GameShell
      title="Memory Match"
      highScoreKey="memory-match"
      controls={CONTROLS}
    >
      {props => <MemoryMatchInner {...props} />}
    </GameShell>
  )
}
