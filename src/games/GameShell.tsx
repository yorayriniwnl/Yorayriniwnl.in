'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import './arcade.css'

export interface ControlItem {
  key: string
  action: string
}

export interface GameRenderProps {
  isPaused: boolean
  isGameOver: boolean
  roundId: number
  score: number
  setScore: (score: number) => void
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
  children: (props: GameRenderProps) => ReactNode
}

function readNumericScore(key: string) {
  try {
    return Math.max(0, Number.parseInt(localStorage.getItem(key) ?? '0', 10) || 0)
  } catch {
    return 0
  }
}

function readNamedScore(recordKey: string, fallbackName: string): NamedScoreRecord | null {
  try {
    const raw = localStorage.getItem(recordKey)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<NamedScoreRecord>
    if (typeof parsed.score !== 'number') return null
    return {
      name: typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim().slice(0, 24) : fallbackName,
      score: Math.max(0, Math.trunc(parsed.score)),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    }
  } catch {
    return null
  }
}

function writeNamedScore(recordKey: string, record: NamedScoreRecord) {
  try {
    localStorage.setItem(recordKey, JSON.stringify(record))
  } catch {
    // High scores remain session-only when storage is unavailable.
  }
}

function ActionButton({
  label,
  title,
  onClick,
  active = false,
}: {
  label: ReactNode
  title: string
  onClick: () => void
  active?: boolean
}) {
  return (
    <button
      type="button"
      className="game-shell__action"
      onClick={onClick}
      title={title}
      aria-label={title}
      aria-pressed={active}
    >
      {label}
    </button>
  )
}

export default function GameShell({
  title,
  highScoreKey,
  controls,
  onPause,
  namedHighScore,
  children,
}: GameShellProps) {
  const [isPaused, setIsPaused] = useState(false)
  const [isGameOver, setIsGameOver] = useState(false)
  const [roundId, setRoundId] = useState(0)
  const [score, setScore] = useState(0)
  const [finalScore, setFinalScore] = useState(0)
  const [highScore, setHighScore] = useState(0)
  const [isNewBest, setIsNewBest] = useState(false)
  const [topScorer, setTopScorer] = useState<NamedScoreRecord | null>(null)
  const [pendingName, setPendingName] = useState('')
  const [needsName, setNeedsName] = useState(false)
  const [showControls, setShowControls] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const arenaRef = useRef<HTMLDivElement>(null)
  const onPauseRef = useRef(onPause)
  const fallbackName = namedHighScore?.defaultName ?? 'Road Runner Ace'
  const scorerLabel = namedHighScore?.label ?? 'Top scorer'
  const gameSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

  useEffect(() => {
    onPauseRef.current = onPause
  }, [onPause])

  useEffect(() => {
    const record = namedHighScore?.recordKey ? readNamedScore(namedHighScore.recordKey, fallbackName) : null
    setTopScorer(record)
    setHighScore(Math.max(readNumericScore(highScoreKey), record?.score ?? 0))
  }, [fallbackName, highScoreKey, namedHighScore?.recordKey])

  const setPaused = useCallback((next: boolean) => {
    setIsPaused(next)
    onPauseRef.current?.(next)
  }, [])

  const togglePause = useCallback(() => {
    if (isGameOver) return
    setPaused(!isPaused)
  }, [isGameOver, isPaused, setPaused])

  const setGameOver = useCallback(
    (over: boolean, reportedScore?: number) => {
      setIsGameOver(over)
      if (!over) return

      setPaused(false)
      const result = Math.max(0, Math.trunc(reportedScore ?? score))
      const previousRecord = namedHighScore?.recordKey ? readNamedScore(namedHighScore.recordKey, fallbackName) : null
      const previousBest = Math.max(readNumericScore(highScoreKey), previousRecord?.score ?? 0)

      setFinalScore(result)
      setHighScore(Math.max(previousBest, result))
      setIsNewBest(result > previousBest)

      if (result > previousBest) {
        try {
          localStorage.setItem(highScoreKey, String(result))
        } catch {
          // High scores remain session-only when storage is unavailable.
        }
      }

      if (namedHighScore?.recordKey) {
        setTopScorer(previousRecord)
        const beatNamedRecord = result > (previousRecord?.score ?? 0)
        setNeedsName(beatNamedRecord)
        setPendingName(beatNamedRecord ? previousRecord?.name ?? '' : '')
      }
    },
    [fallbackName, highScoreKey, namedHighScore, score, setPaused],
  )

  const saveTopScorer = useCallback(
    (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault()
      if (!namedHighScore?.recordKey) return
      const record: NamedScoreRecord = {
        name: pendingName.trim().slice(0, 24) || fallbackName,
        score: finalScore,
        updatedAt: new Date().toISOString(),
      }
      writeNamedScore(namedHighScore.recordKey, record)
      setTopScorer(record)
      setHighScore((current) => Math.max(current, record.score))
      setNeedsName(false)
    },
    [fallbackName, finalScore, namedHighScore, pendingName],
  )

  const playAgain = useCallback(() => {
    setIsGameOver(false)
    setIsNewBest(false)
    setNeedsName(false)
    setPendingName('')
    setScore(0)
    setPaused(false)
    setRoundId((current) => current + 1)
  }, [setPaused])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      if (showControls) {
        setShowControls(false)
        return
      }
      togglePause()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [showControls, togglePause])

  useEffect(() => {
    const onFullscreenChange = () => setIsFullscreen(Boolean(document.fullscreenElement))
    document.addEventListener('fullscreenchange', onFullscreenChange)
    return () => document.removeEventListener('fullscreenchange', onFullscreenChange)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    if (!arenaRef.current) return
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await arenaRef.current.requestFullscreen()
    } catch {
      // Fullscreen is optional on embedded/mobile browsers.
    }
  }, [])

  const renderProps: GameRenderProps = {
    isPaused,
    isGameOver,
    roundId,
    score,
    setScore,
    setGameOver,
    highScore,
  }

  return (
    <section
      className="game-shell"
      data-game={gameSlug}
      data-status={isGameOver ? 'over' : isPaused ? 'paused' : 'live'}
      aria-label={`${title} game room`}
    >
      <header className="game-shell__topbar" role="toolbar" aria-label="Game controls">
        <a className="game-shell__back" href="#arcade" aria-label="Back to arcade">
          <span aria-hidden="true">←</span> arcade
        </a>
        <span className="game-shell__separator" aria-hidden="true" />
        <div className="game-shell__identity">
          <span className="game-shell__eyebrow">YA / ARCADE</span>
          <span className="game-shell__title">{title}</span>
        </div>
        <div className="game-shell__live-status" aria-label="Live arcade session">
          <span aria-hidden="true" />
          <span>{isPaused ? 'Paused' : isGameOver ? 'Session ended' : 'Live session'}</span>
        </div>
        <div className="game-shell__spacer" />
        <div className="game-shell__metric" aria-label={`Score ${score}`}>
          <span>Score</span>
          <strong>{score}</strong>
        </div>
        <div className="game-shell__metric" aria-label={`Best score ${highScore}`}>
          <span>Best</span>
          <strong>{highScore}</strong>
        </div>
        <div className="game-shell__actions">
          <ActionButton label="?" title="How to play" onClick={() => setShowControls(true)} />
          <ActionButton label={isPaused ? '▶' : 'Ⅱ'} title={isPaused ? 'Resume (Esc)' : 'Pause (Esc)'} onClick={togglePause} active={isPaused} />
          <ActionButton label={isFullscreen ? '×' : '⛶'} title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'} onClick={toggleFullscreen} active={isFullscreen} />
        </div>
      </header>

      <div className="game-shell__arena" ref={arenaRef}>
        <div className="game-shell__game" key={roundId}>
          {children(renderProps)}
        </div>

        {isPaused && !isGameOver ? (
          <div className="game-shell__overlay" role="dialog" aria-modal="true" aria-label="Game paused">
            <div className="game-shell__overlay-card game-shell__overlay-card--pause">
              <span className="game-shell__overlay-kicker">SESSION HOLD</span>
              <h2>Paused</h2>
              <p>Everything is frozen. Resume when you’re ready.</p>
              <button type="button" className="game-shell__primary" onClick={togglePause}>Resume run <span aria-hidden="true">↗</span></button>
            </div>
          </div>
        ) : null}

        {isGameOver ? (
          <div className="game-shell__overlay" role="dialog" aria-modal="true" aria-label="Game over">
            <div className="game-shell__overlay-card game-shell__overlay-card--result">
              <span className="game-shell__overlay-kicker">RUN COMPLETE</span>
              <h2>Game over</h2>
              <div className="game-shell__result-score"><span>Final score</span><strong>{finalScore}</strong></div>
              <div className="game-shell__result-meta">
                <span>{isNewBest ? '★ New personal best' : `Best ${highScore}`}</span>
                {topScorer ? <span>{scorerLabel}: {topScorer.name}</span> : null}
              </div>

              {needsName ? (
                <form className="game-shell__name-form" onSubmit={saveTopScorer}>
                  <label htmlFor={`${gameSlug}-scorer`}>{scorerLabel} unlocked</label>
                  <div>
                    <input id={`${gameSlug}-scorer`} value={pendingName} maxLength={24} onChange={(event) => setPendingName(event.target.value)} placeholder={fallbackName} autoFocus />
                    <button type="submit" className="game-shell__primary">Save</button>
                  </div>
                </form>
              ) : null}

              {!needsName ? (
                <div className="game-shell__result-actions">
                  <button type="button" className="game-shell__primary" onClick={playAgain}>Play again <span aria-hidden="true">↗</span></button>
                  <a className="game-shell__secondary" href="#arcade">← Arcade</a>
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {showControls ? (
        <div className="game-shell__controls-overlay" role="dialog" aria-modal="true" aria-label="Game controls" onClick={(event) => { if (event.target === event.currentTarget) setShowControls(false) }}>
          <div className="game-shell__controls-card">
            <div className="game-shell__controls-heading">
              <div><span className="game-shell__overlay-kicker">FIELD MANUAL</span><h2>How to play</h2></div>
              <button type="button" className="game-shell__close" onClick={() => setShowControls(false)} aria-label="Close controls">×</button>
            </div>
            <div className="game-shell__control-list">
              {controls.map((item) => <div className="game-shell__control-row" key={`${item.key}-${item.action}`}><kbd>{item.key}</kbd><span>{item.action}</span></div>)}
            </div>
            <p className="game-shell__controls-tip">Esc pauses the run · click outside to close</p>
          </div>
        </div>
      ) : null}
    </section>
  )
}
