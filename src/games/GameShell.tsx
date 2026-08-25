'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ControlItem {
  key: string
  action: string
}

export interface GameRenderProps {
  isPaused: boolean
  isGameOver: boolean
  roundId: number
  score: number
  setScore: (n: number) => void
  setGameOver: (over: boolean, finalScore?: number) => void
  highScore: number
}

type NamedScoreRecord = {
  name: string
  score: number
  updatedAt: string
}

export interface NamedHighScoreConfig {
  recordKey: string
  label?: string
  defaultName?: string
}

export interface GameShellProps {
  title: string
  highScoreKey: string
  controls: ControlItem[]
  onPause?: (paused: boolean) => void
  namedHighScore?: NamedHighScoreConfig
  children: (props: GameRenderProps) => React.ReactNode
}

function readNumericScore(key: string): number {
  try {
    const stored = localStorage.getItem(key)
    return stored !== null ? parseInt(stored, 10) || 0 : 0
  } catch {
    return 0
  }
}

function sanitizeNamedScoreRecord(
  value: Partial<NamedScoreRecord> | null | undefined,
  fallbackName: string,
): NamedScoreRecord | null {
  if (!value || typeof value.score !== 'number') return null

  return {
    name:
      typeof value.name === 'string' && value.name.trim().length > 0
        ? value.name.trim().slice(0, 24)
        : fallbackName,
    score: Math.max(0, Math.trunc(value.score)),
    updatedAt: typeof value.updatedAt === 'string' ? value.updatedAt : '',
  }
}

function readNamedScoreRecord(recordKey: string, fallbackName: string): NamedScoreRecord | null {
  try {
    const raw = localStorage.getItem(recordKey)
    if (!raw) return null
    return sanitizeNamedScoreRecord(JSON.parse(raw) as Partial<NamedScoreRecord>, fallbackName)
  } catch {
    return null
  }
}

function writeNamedScoreRecord(recordKey: string, record: NamedScoreRecord) {
  try {
    localStorage.setItem(recordKey, JSON.stringify(record))
  } catch {
    // localStorage unavailable
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function TopBarButton({
  onClick,
  title,
  children,
  active = false,
}: {
  onClick: () => void
  title: string
  children: React.ReactNode
  active?: boolean
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      aria-label={title}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '2rem',
        height: '2rem',
        borderRadius: 'var(--ds-radius-sm, 0.65rem)',
        border: active
          ? '1px solid rgba(201, 168, 76, 0.55)'
          : '1px solid rgba(42, 37, 32, 0.95)',
        background: active
          ? 'rgba(201, 168, 76, 0.14)'
          : 'rgba(26, 23, 16, 0.7)',
        color: active ? '#c9a84c' : '#a89878',
        fontSize: '0.95rem',
        cursor: 'pointer',
        transition: 'all 0.15s ease',
        flexShrink: 0,
      }}
      onMouseEnter={(e) => {
        if (!active) {
          ;(e.currentTarget as HTMLButtonElement).style.borderColor =
            'rgba(201, 168, 76, 0.35)'
          ;(e.currentTarget as HTMLButtonElement).style.color = '#c9a84c'
        }
      }}
      onMouseLeave={(e) => {
        if (!active) {
          ;(e.currentTarget as HTMLButtonElement).style.borderColor =
            'rgba(42, 37, 32, 0.95)'
          ;(e.currentTarget as HTMLButtonElement).style.color = '#a89878'
        }
      }}
    >
      {children}
    </button>
  )
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function GameShell({
  title,
  highScoreKey,
  controls,
  onPause,
  namedHighScore,
  children,
}: GameShellProps) {
  // ── State ──────────────────────────────────────────────────────────────────
  const [isPaused, setIsPaused] = useState(false)
  const [isGameOver, setIsGameOver] = useState(false)
  const [roundId, setRoundId] = useState(0)
  const [score, setScore] = useState(0)
  const [finalScore, setFinalScore] = useState(0)
  const [highScore, setHighScore] = useState(0)
  const [isNewBest, setIsNewBest] = useState(false)
  const [topScorer, setTopScorer] = useState<NamedScoreRecord | null>(null)
  const [pendingTopScorerName, setPendingTopScorerName] = useState('')
  const [needsTopScorerName, setNeedsTopScorerName] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const containerRef = useRef<HTMLDivElement>(null)
  const onPauseRef = useRef(onPause)
  useEffect(() => { onPauseRef.current = onPause }, [onPause])
  const topScorerLabel = namedHighScore?.label ?? 'Top scorer'
  const fallbackTopScorerName = namedHighScore?.defaultName ?? 'Road Runner Ace'

  // ── Load high score from localStorage ─────────────────────────────────────
  useEffect(() => {
    const storedTopScorer = namedHighScore?.recordKey
      ? readNamedScoreRecord(namedHighScore.recordKey, fallbackTopScorerName)
      : null

    setHighScore(Math.max(readNumericScore(highScoreKey), storedTopScorer?.score ?? 0))
    setTopScorer(storedTopScorer)
  }, [fallbackTopScorerName, highScoreKey, namedHighScore?.recordKey])

  // ── Pause toggle ───────────────────────────────────────────────────────────
  const togglePause = useCallback(() => {
    if (isGameOver) return
    setIsPaused((prev) => {
      const next = !prev
      onPauseRef.current?.(next)
      return next
    })
  }, [isGameOver])

  // ── Game over handler ──────────────────────────────────────────────────────
  const handleSetGameOver = useCallback(
    (over: boolean, fs?: number) => {
      setIsGameOver(over)
      if (over) {
        setIsPaused(false)
        const reported = fs ?? score
        const storedTopScorer = namedHighScore?.recordKey
          ? readNamedScoreRecord(namedHighScore.recordKey, fallbackTopScorerName)
          : null
        const previousBest = Math.max(readNumericScore(highScoreKey), storedTopScorer?.score ?? 0)
        setFinalScore(reported)
        if (reported > previousBest) {
          try {
            localStorage.setItem(highScoreKey, String(reported))
          } catch {
            // localStorage unavailable
          }
          setHighScore(reported)
          setIsNewBest(true)
        } else {
          setHighScore(previousBest)
          setIsNewBest(false)
        }

        if (namedHighScore?.recordKey) {
          setTopScorer(storedTopScorer)
          if (reported > (storedTopScorer?.score ?? 0)) {
            setPendingTopScorerName(storedTopScorer?.name ?? '')
            setNeedsTopScorerName(true)
          } else {
            setPendingTopScorerName('')
            setNeedsTopScorerName(false)
          }
        }
      }
    },
    [fallbackTopScorerName, highScoreKey, namedHighScore, score],
  )

  const handleSaveTopScorer = useCallback(
    (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!namedHighScore?.recordKey) return

      const nextRecord: NamedScoreRecord = {
        name: pendingTopScorerName.trim().slice(0, 24) || fallbackTopScorerName,
        score: finalScore,
        updatedAt: new Date().toISOString(),
      }

      writeNamedScoreRecord(namedHighScore.recordKey, nextRecord)
      setTopScorer(nextRecord)
      setHighScore((prev) => Math.max(prev, nextRecord.score))
      setPendingTopScorerName(nextRecord.name)
      setNeedsTopScorerName(false)
    },
    [fallbackTopScorerName, finalScore, namedHighScore, pendingTopScorerName],
  )

  // ── Play again ─────────────────────────────────────────────────────────────
  const handlePlayAgain = useCallback(() => {
    setIsGameOver(false)
    setRoundId((prev) => prev + 1)
    setIsNewBest(false)
    setNeedsTopScorerName(false)
    setPendingTopScorerName('')
    setScore(0)
    setIsPaused(false)
  }, [])

  // ── Escape → toggle pause ──────────────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (showControls) {
          setShowControls(false)
          return
        }
        togglePause()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [togglePause, showControls])

  // ── Fullscreen API ─────────────────────────────────────────────────────────
  useEffect(() => {
    function onFsChange() {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }
    document.addEventListener('fullscreenchange', onFsChange)
    return () => document.removeEventListener('fullscreenchange', onFsChange)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    if (!containerRef.current) return
    try {
      if (!document.fullscreenElement) {
        await containerRef.current.requestFullscreen()
      } else {
        await document.exitFullscreen()
      }
    } catch {
      /* Fullscreen not supported — silently ignore */
    }
  }, [])

  // ── Render props ───────────────────────────────────────────────────────────
  const renderProps: GameRenderProps = {
    isPaused,
    isGameOver,
    roundId,
    score,
    setScore,
    setGameOver: handleSetGameOver,
    highScore,
  }

  // ── Styles (inline so this file is standalone) ────────────────────────────
  const overlayBase: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1.25rem',
    backgroundColor: 'rgba(0,0,0,0.72)',
    backdropFilter: 'blur(6px)',
    WebkitBackdropFilter: 'blur(6px)',
    zIndex: 20,
  }

  const overlayCard: React.CSSProperties = {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
    padding: '2rem 2.5rem',
    borderRadius: 'var(--ds-radius-lg, 1.35rem)',
    border: '1px solid rgba(201, 168, 76, 0.28)',
    background: 'rgba(16, 13, 8, 0.96)',
    boxShadow: '0 24px 64px rgba(0,0,0,0.55), 0 0 0 1px rgba(201,168,76,0.08)',
    minWidth: '18rem',
    maxWidth: '90vw',
  }

  const primaryBtn: React.CSSProperties = {
    padding: '0.55rem 1.5rem',
    borderRadius: 'var(--ds-radius-sm, 0.65rem)',
    border: '1px solid rgba(201, 168, 76, 0.5)',
    background: 'linear-gradient(135deg, rgba(201,168,76,0.22), rgba(201,168,76,0.1))',
    color: '#e8c96e',
    fontFamily: 'var(--ds-font-mono, monospace)',
    fontSize: '0.85rem',
    fontWeight: 500,
    letterSpacing: '0.06em',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  }

  const ghostBtn: React.CSSProperties = {
    padding: '0.5rem 1.25rem',
    borderRadius: 'var(--ds-radius-sm, 0.65rem)',
    border: '1px solid rgba(42, 37, 32, 0.95)',
    background: 'transparent',
    color: '#a89878',
    fontFamily: 'var(--ds-font-mono, monospace)',
    fontSize: '0.8rem',
    cursor: 'pointer',
    transition: 'all 0.15s ease',
  }

  const inputStyle: React.CSSProperties = {
    flex: '1 1 12rem',
    minWidth: 0,
    padding: '0.7rem 0.85rem',
    borderRadius: 'var(--ds-radius-sm, 0.65rem)',
    border: '1px solid rgba(201, 168, 76, 0.24)',
    background: 'rgba(8, 7, 4, 0.7)',
    color: '#f0e8d8',
    fontFamily: 'var(--ds-font-mono, monospace)',
    fontSize: '0.82rem',
    letterSpacing: '0.04em',
  }

  const overlayTitle: React.CSSProperties = {
    fontFamily: 'var(--ds-font-display, serif)',
    fontSize: 'clamp(1.6rem, 5vw, 2.25rem)',
    fontWeight: 700,
    color: '#f0e8d8',
    letterSpacing: '-0.02em',
    margin: 0,
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        minHeight: 0,
        background: 'var(--ds-bg, #0a0906)',
        fontFamily: 'var(--ds-font-body, sans-serif)',
      }}
    >
      {/* ── Top Bar ──────────────────────────────────────────────────────────── */}
      <div
        role="toolbar"
        aria-label="Game controls"
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0 0.75rem',
          height: '2.5rem',
          flexShrink: 0,
          borderBottom: '1px solid rgba(42, 37, 32, 0.95)',
          background: 'rgba(10, 9, 6, 0.9)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 10,
        }}
      >
        {/* Back link */}
        <a
          href="#arcade"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            color: '#7a7060',
            textDecoration: 'none',
            fontSize: '0.78rem',
            fontFamily: 'var(--ds-font-mono, monospace)',
            letterSpacing: '0.03em',
            flexShrink: 0,
            padding: '0.25rem 0.5rem',
            borderRadius: 'var(--ds-radius-sm, 0.65rem)',
            transition: 'color 0.15s',
          }}
          onMouseEnter={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = '#c9a84c')}
          onMouseLeave={(e) => ((e.currentTarget as HTMLAnchorElement).style.color = '#7a7060')}
        >
          ← arcade
        </a>

        {/* Separator */}
        <div
          aria-hidden
          style={{
            width: '1px',
            height: '1.1rem',
            background: 'rgba(42, 37, 32, 0.95)',
            flexShrink: 0,
          }}
        />

        {/* Title */}
        <span
          style={{
            fontFamily: 'var(--ds-font-display, serif)',
            fontSize: '0.92rem',
            fontWeight: 700,
            color: '#c9a84c',
            letterSpacing: '-0.01em',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flexShrink: 1,
            minWidth: 0,
          }}
        >
          {title}
        </span>

        {/* Spacer */}
        <div style={{ flex: 1, minWidth: '0.25rem' }} />

        {/* Score */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: '0.7rem',
              color: '#7a7060',
              fontFamily: 'var(--ds-font-mono, monospace)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Score
          </span>
          <span
            style={{
              fontSize: '0.85rem',
              fontFamily: 'var(--ds-font-mono, monospace)',
              fontWeight: 500,
              color: '#ddd5c0',
              minWidth: '2ch',
              textAlign: 'right',
            }}
          >
            {score}
          </span>
        </div>

        {/* Separator */}
        <div
          aria-hidden
          style={{
            width: '1px',
            height: '1.1rem',
            background: 'rgba(42, 37, 32, 0.95)',
            flexShrink: 0,
          }}
        />

        {/* Best */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.3rem',
            flexShrink: 0,
          }}
        >
          <span
            style={{
              fontSize: '0.7rem',
              color: '#7a7060',
              fontFamily: 'var(--ds-font-mono, monospace)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}
          >
            Best
          </span>
          <span
            style={{
              fontSize: '0.85rem',
              fontFamily: 'var(--ds-font-mono, monospace)',
              fontWeight: 500,
              color: highScore > 0 ? '#c9a84c' : '#7a7060',
              minWidth: '2ch',
              textAlign: 'right',
            }}
          >
            {highScore}
          </span>
        </div>

        {/* Action buttons */}
        <div
          style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', flexShrink: 0 }}
        >
          <TopBarButton
            onClick={() => setShowControls(true)}
            title="How to play"
          >
            ?
          </TopBarButton>

          <TopBarButton
            onClick={togglePause}
            title={isPaused ? 'Resume (Esc)' : 'Pause (Esc)'}
            active={isPaused}
          >
            {isPaused ? '▶' : '⏸'}
          </TopBarButton>

          {/* Fullscreen — hidden on small screens */}
          <div className="hidden sm:flex">
            <TopBarButton
              onClick={toggleFullscreen}
              title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
              active={isFullscreen}
            >
              {isFullscreen ? '✕' : '⛶'}
            </TopBarButton>
          </div>
        </div>
      </div>

      {/* ── Game Area ────────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        <div key={roundId} style={{ height: '100%' }}>
          {children(renderProps)}
        </div>

        {/* ── Pause Overlay ─────────────────────────────────────────────────── */}
        {isPaused && !isGameOver && (
          <div style={overlayBase} role="dialog" aria-modal aria-label="Game paused">
            <div style={overlayCard}>
              {/* Decorative top rule */}
              <div
                aria-hidden
                style={{
                  width: '2.5rem',
                  height: '2px',
                  borderRadius: '1px',
                  background: 'linear-gradient(90deg, transparent, #c9a84c, transparent)',
                  marginBottom: '0.25rem',
                }}
              />
              <p style={overlayTitle}>Paused</p>
              <p
                style={{
                  fontSize: '0.78rem',
                  color: '#7a7060',
                  fontFamily: 'var(--ds-font-mono, monospace)',
                  margin: 0,
                  letterSpacing: '0.04em',
                }}
              >
                press Esc to resume
              </p>
              <button
                style={{ ...primaryBtn, marginTop: '0.5rem' }}
                onClick={togglePause}
                onMouseEnter={(e) => {
                  ;(e.currentTarget as HTMLButtonElement).style.background =
                    'linear-gradient(135deg, rgba(201,168,76,0.35), rgba(201,168,76,0.18))'
                  ;(e.currentTarget as HTMLButtonElement).style.color = '#f0e8d8'
                }}
                onMouseLeave={(e) => {
                  ;(e.currentTarget as HTMLButtonElement).style.background =
                    'linear-gradient(135deg, rgba(201,168,76,0.22), rgba(201,168,76,0.1))'
                  ;(e.currentTarget as HTMLButtonElement).style.color = '#e8c96e'
                }}
              >
                Resume
              </button>
            </div>
          </div>
        )}

        {/* ── Game Over Overlay ─────────────────────────────────────────────── */}
        {isGameOver && (
          <div style={overlayBase} role="dialog" aria-modal aria-label="Game over">
            <div style={overlayCard}>
              <div
                aria-hidden
                style={{
                  width: '2.5rem',
                  height: '2px',
                  borderRadius: '1px',
                  background: 'linear-gradient(90deg, transparent, #c04a3a, transparent)',
                  marginBottom: '0.25rem',
                }}
              />
              <p
                style={{
                  ...overlayTitle,
                  color: '#ddd5c0',
                  fontSize: 'clamp(1.4rem, 4.5vw, 2rem)',
                }}
              >
                Game Over
              </p>

              {/* Scores */}
              <div
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '0.35rem',
                  padding: '0.75rem 1.5rem',
                  borderRadius: 'var(--ds-radius-sm, 0.65rem)',
                  border: '1px solid rgba(42, 37, 32, 0.95)',
                  background: 'rgba(22, 19, 13, 0.8)',
                  width: '100%',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: '#7a7060',
                      fontFamily: 'var(--ds-font-mono, monospace)',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Score
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--ds-font-mono, monospace)',
                      fontWeight: 500,
                      color: '#ddd5c0',
                    }}
                  >
                    {finalScore}
                  </span>
                </div>
                <div
                  aria-hidden
                  style={{
                    width: '100%',
                    height: '1px',
                    background: 'rgba(42, 37, 32, 0.95)',
                  }}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      color: '#7a7060',
                      fontFamily: 'var(--ds-font-mono, monospace)',
                      letterSpacing: '0.06em',
                      textTransform: 'uppercase',
                    }}
                  >
                    Best
                  </span>
                  <span
                    style={{
                      fontFamily: 'var(--ds-font-mono, monospace)',
                      fontWeight: 500,
                      color: '#c9a84c',
                    }}
                  >
                    {highScore}
                  </span>
                </div>

                {namedHighScore?.recordKey ? (
                  <>
                    <div
                      aria-hidden
                      style={{
                        width: '100%',
                        height: '1px',
                        background: 'rgba(42, 37, 32, 0.95)',
                      }}
                    />
                    <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', gap: '1rem' }}>
                      <span
                        style={{
                          fontSize: '0.75rem',
                          color: '#7a7060',
                          fontFamily: 'var(--ds-font-mono, monospace)',
                          letterSpacing: '0.06em',
                          textTransform: 'uppercase',
                        }}
                      >
                        {topScorerLabel}
                      </span>
                      <div style={{ textAlign: 'right' }}>
                        <div
                          style={{
                            fontFamily: 'var(--ds-font-mono, monospace)',
                            fontWeight: 500,
                            color: topScorer ? '#f0e8d8' : '#7a7060',
                          }}
                        >
                          {topScorer?.name ?? 'Waiting for first run'}
                        </div>
                        <div
                          style={{
                            marginTop: '0.15rem',
                            fontSize: '0.72rem',
                            color: '#7a7060',
                            fontFamily: 'var(--ds-font-mono, monospace)',
                          }}
                        >
                          {topScorer ? `${topScorer.score} pts` : 'No saved score yet'}
                        </div>
                      </div>
                    </div>
                  </>
                ) : null}
              </div>

              {/* New best badge */}
              {isNewBest && (
                <div
                  role="status"
                  aria-live="polite"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.35rem 0.85rem',
                    borderRadius: 'var(--ds-radius-pill, 999px)',
                    border: '1px solid rgba(201, 168, 76, 0.45)',
                    background: 'rgba(201, 168, 76, 0.12)',
                    color: '#c9a84c',
                    fontSize: '0.78rem',
                    fontFamily: 'var(--ds-font-mono, monospace)',
                    letterSpacing: '0.05em',
                    fontWeight: 500,
                  }}
                >
                  🏆 New Best!
                </div>
              )}

              {needsTopScorerName ? (
                <form
                  onSubmit={handleSaveTopScorer}
                  style={{
                    width: '100%',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.7rem',
                  }}
                >
                  <label
                    htmlFor="top-scorer-name"
                    style={{
                      color: '#ddd5c0',
                      fontSize: '0.82rem',
                      lineHeight: 1.6,
                      textAlign: 'left',
                      width: '100%',
                    }}
                  >
                    New record. Add a name for the saved {topScorerLabel.toLowerCase()} entry.
                    Leave it blank to save as {fallbackTopScorerName}.
                  </label>

                  <div
                    style={{
                      display: 'flex',
                      gap: '0.6rem',
                      flexWrap: 'wrap',
                      width: '100%',
                    }}
                  >
                    <input
                      id="top-scorer-name"
                      type="text"
                      value={pendingTopScorerName}
                      onChange={(event) => setPendingTopScorerName(event.target.value.slice(0, 24))}
                      maxLength={24}
                      autoFocus
                      placeholder="Enter your name"
                      style={inputStyle}
                    />
                    <button
                      type="submit"
                      style={{ ...primaryBtn, minWidth: '9.5rem' }}
                      onMouseEnter={(e) => {
                        ;(e.currentTarget as HTMLButtonElement).style.background =
                          'linear-gradient(135deg, rgba(201,168,76,0.35), rgba(201,168,76,0.18))'
                        ;(e.currentTarget as HTMLButtonElement).style.color = '#f0e8d8'
                      }}
                      onMouseLeave={(e) => {
                        ;(e.currentTarget as HTMLButtonElement).style.background =
                          'linear-gradient(135deg, rgba(201,168,76,0.22), rgba(201,168,76,0.1))'
                        ;(e.currentTarget as HTMLButtonElement).style.color = '#e8c96e'
                      }}
                    >
                      Save Record
                    </button>
                  </div>
                </form>
              ) : null}

              {/* Buttons */}
              {!needsTopScorerName ? (
                <div
                style={{
                  display: 'flex',
                  gap: '0.6rem',
                  marginTop: '0.25rem',
                  flexWrap: 'wrap',
                  justifyContent: 'center',
                }}
              >
                <button
                  style={primaryBtn}
                  onClick={handlePlayAgain}
                  onMouseEnter={(e) => {
                    ;(e.currentTarget as HTMLButtonElement).style.background =
                      'linear-gradient(135deg, rgba(201,168,76,0.35), rgba(201,168,76,0.18))'
                    ;(e.currentTarget as HTMLButtonElement).style.color = '#f0e8d8'
                  }}
                  onMouseLeave={(e) => {
                    ;(e.currentTarget as HTMLButtonElement).style.background =
                      'linear-gradient(135deg, rgba(201,168,76,0.22), rgba(201,168,76,0.1))'
                    ;(e.currentTarget as HTMLButtonElement).style.color = '#e8c96e'
                  }}
                >
                  Play Again
                </button>
                <a href="#arcade" style={{ textDecoration: 'none' }}>
                  <button
                    style={ghostBtn}
                    onMouseEnter={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.borderColor =
                        'rgba(201, 168, 76, 0.35)'
                      ;(e.currentTarget as HTMLButtonElement).style.color = '#c9a84c'
                    }}
                    onMouseLeave={(e) => {
                      ;(e.currentTarget as HTMLButtonElement).style.borderColor =
                        'rgba(42, 37, 32, 0.95)'
                      ;(e.currentTarget as HTMLButtonElement).style.color = '#a89878'
                    }}
                  >
                    ← Arcade
                  </button>
                </a>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      {/* ── Controls Modal ────────────────────────────────────────────────────── */}
      {showControls && (
        <div
          role="dialog"
          aria-modal
          aria-label="Game controls"
          style={{
            position: 'fixed',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
            backgroundColor: 'rgba(0,0,0,0.72)',
            backdropFilter: 'blur(6px)',
            WebkitBackdropFilter: 'blur(6px)',
            zIndex: 50,
          }}
          onClick={(e) => {
            if (e.target === e.currentTarget) setShowControls(false)
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              padding: '1.75rem',
              borderRadius: 'var(--ds-radius-lg, 1.35rem)',
              border: '1px solid rgba(201, 168, 76, 0.28)',
              background: 'rgba(16, 13, 8, 0.97)',
              boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
              width: '100%',
              maxWidth: '22rem',
              maxHeight: '85vh',
              overflowY: 'auto',
            }}
          >
            {/* Modal header */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1rem' }}>🎮</span>
                <span
                  style={{
                    fontFamily: 'var(--ds-font-display, serif)',
                    fontSize: '1.1rem',
                    fontWeight: 700,
                    color: '#f0e8d8',
                  }}
                >
                  How to Play
                </span>
              </div>
              <button
                onClick={() => setShowControls(false)}
                aria-label="Close controls"
                style={{
                  background: 'none',
                  border: '1px solid rgba(42, 37, 32, 0.95)',
                  borderRadius: 'var(--ds-radius-sm, 0.65rem)',
                  color: '#7a7060',
                  width: '1.75rem',
                  height: '1.75rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  fontSize: '0.85rem',
                  flexShrink: 0,
                }}
              >
                ✕
              </button>
            </div>

            {/* Divider */}
            <div
              aria-hidden
              style={{
                height: '1px',
                background:
                  'linear-gradient(90deg, transparent, rgba(201,168,76,0.25), transparent)',
              }}
            />

            {/* Controls table */}
            <table
              style={{
                width: '100%',
                borderCollapse: 'collapse',
              }}
            >
              <thead>
                <tr>
                  <th
                    style={{
                      textAlign: 'left',
                      fontSize: '0.68rem',
                      color: '#7a7060',
                      fontFamily: 'var(--ds-font-mono, monospace)',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      paddingBottom: '0.6rem',
                      borderBottom: '1px solid rgba(42, 37, 32, 0.95)',
                      fontWeight: 400,
                    }}
                  >
                    Key
                  </th>
                  <th
                    style={{
                      textAlign: 'left',
                      fontSize: '0.68rem',
                      color: '#7a7060',
                      fontFamily: 'var(--ds-font-mono, monospace)',
                      letterSpacing: '0.08em',
                      textTransform: 'uppercase',
                      paddingBottom: '0.6rem',
                      paddingLeft: '1rem',
                      borderBottom: '1px solid rgba(42, 37, 32, 0.95)',
                      fontWeight: 400,
                    }}
                  >
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {controls.map((item, i) => (
                  <tr key={i}>
                    <td
                      style={{
                        padding: '0.55rem 0',
                        borderBottom:
                          i < controls.length - 1
                            ? '1px solid rgba(42, 37, 32, 0.6)'
                            : 'none',
                        verticalAlign: 'middle',
                      }}
                    >
                      <kbd
                        style={{
                          display: 'inline-block',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '0.35rem',
                          border: '1px solid rgba(201, 168, 76, 0.3)',
                          background: 'rgba(201, 168, 76, 0.08)',
                          color: '#c9a84c',
                          fontFamily: 'var(--ds-font-mono, monospace)',
                          fontSize: '0.78rem',
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {item.key}
                      </kbd>
                    </td>
                    <td
                      style={{
                        padding: '0.55rem 0 0.55rem 1rem',
                        borderBottom:
                          i < controls.length - 1
                            ? '1px solid rgba(42, 37, 32, 0.6)'
                            : 'none',
                        fontSize: '0.85rem',
                        color: '#a89878',
                        fontFamily: 'var(--ds-font-body, sans-serif)',
                        verticalAlign: 'middle',
                      }}
                    >
                      {item.action}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Tip footer */}
            <p
              style={{
                margin: 0,
                fontSize: '0.72rem',
                color: '#7a7060',
                fontFamily: 'var(--ds-font-mono, monospace)',
                textAlign: 'center',
                letterSpacing: '0.03em',
              }}
            >
              Esc — pause · click outside to close
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
