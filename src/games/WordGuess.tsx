'use client'

import React, { useCallback, useEffect, useRef, useState } from 'react'
import GameShell from './GameShell'
import type { GameRenderProps } from './GameShell'
import { DEV_WORDS } from '../data/devWords'
import type { DevWord } from '../data/devWords'
import {
  evaluateGuess,
  getDailyWord,
  getRandomWord,
  calcScore,
  mergeKeyStatuses,
} from '../lib/games/wordGuess'
import type { LetterResult } from '../lib/games/wordGuess'

// ─── Constants ────────────────────────────────────────────────────────────────

const MAX_ATTEMPTS  = 6
const HIGH_SCORE_KEY = 'yor:wordle:highscore'
const REVEAL_STAGGER = 150   // ms per tile
const REVEAL_FLIP    = 500   // ms flip duration
const BOUNCE_STAGGER = 80

type WordLength  = 5 | 6
type GameMode    = 'daily' | 'free'
type GameStatus  = 'playing' | 'won' | 'lost'

// ─── Result colour tokens ─────────────────────────────────────────────────────

const RESULT_STYLES = {
  correct: { bg: 'rgba(201,168,76,0.88)', border: 'rgba(201,168,76,0.88)', text: '#0a0906'    },
  present: { bg: 'rgba(201,168,76,0.12)', border: 'rgba(201,168,76,0.72)', text: '#c9a84c'    },
  absent:  { bg: 'rgba(32,28,22,0.95)',   border: 'rgba(32,28,22,0.95)',   text: '#3d3528'    },
}

// ─── CSS keyframe animations ──────────────────────────────────────────────────

const ANIMATIONS = `
  @keyframes wg-flip {
    0%  { transform: rotateX(0deg); }
    49% { transform: rotateX(-90deg); }
    50% {
      transform: rotateX(90deg);
      background-color: var(--wg-bg);
      border-color:     var(--wg-border);
      color:            var(--wg-text);
    }
    100% {
      transform: rotateX(0deg);
      background-color: var(--wg-bg);
      border-color:     var(--wg-border);
      color:            var(--wg-text);
    }
  }

  @keyframes wg-bounce {
    0%,100% { transform: translateY(0) scale(1); }
    30%      { transform: translateY(-22px) scale(1.06); }
    60%      { transform: translateY(-8px)  scale(1); }
    80%      { transform: translateY(-3px)  scale(1); }
  }

  @keyframes wg-shake {
    0%,100% { transform: translateX(0); }
    16%      { transform: translateX(-8px); }
    33%      { transform: translateX(8px); }
    50%      { transform: translateX(-5px); }
    67%      { transform: translateX(5px); }
    83%      { transform: translateX(-3px); }
  }

  @keyframes wg-pop {
    0%,100% { transform: scale(1); }
    50%      { transform: scale(1.13); }
  }

  @keyframes wg-def-up {
    from { transform: translateY(110%); opacity: 0; }
    to   { transform: translateY(0);    opacity: 1; }
  }

  @keyframes wg-def-pulse {
    0%,100% { box-shadow: 0 0 0 0 rgba(201,168,76,0); }
    50%      { box-shadow: 0 0 0 6px rgba(201,168,76,0.18); }
  }

  .wg-tile-revealing {
    animation: wg-flip var(--wg-flip-dur, 500ms) ease-in-out forwards;
    animation-delay: calc(var(--wg-col, 0) * ${REVEAL_STAGGER}ms);
  }

  .wg-tile-bouncing {
    animation: wg-bounce 650ms ease forwards;
    animation-delay: calc(var(--wg-col, 0) * ${BOUNCE_STAGGER}ms);
  }

  .wg-tile-popping {
    animation: wg-pop 100ms ease;
  }

  .wg-row-shaking {
    animation: wg-shake 500ms ease;
  }

  .wg-definition {
    animation: wg-def-up 420ms cubic-bezier(0.22,1,0.36,1) forwards,
               wg-def-pulse 2s ease 500ms 2;
  }
`

// ─── Tile component ───────────────────────────────────────────────────────────

interface TileProps {
  letter:     string
  result?:    LetterResult
  isRevealing: boolean
  isRevealed:  boolean
  isBouncing:  boolean
  isPopping:   boolean
  colIndex:    number
  wordLength:  number
}

function Tile({
  letter, result, isRevealing, isRevealed, isBouncing, isPopping, colIndex, wordLength,
}: TileProps) {
  const size   = wordLength === 5 ? 'clamp(2.8rem, 10vw, 3.8rem)' : 'clamp(2.4rem, 9vw, 3.3rem)'
  const fSize  = wordLength === 5 ? 'clamp(1.1rem, 4vw, 1.5rem)'  : 'clamp(0.95rem, 3.5vw, 1.3rem)'

  let bg     = 'transparent'
  let border = 'rgba(201,168,76,0.2)'
  let color  = 'transparent'

  if (isRevealed && result) {
    bg     = RESULT_STYLES[result].bg
    border = RESULT_STYLES[result].border
    color  = RESULT_STYLES[result].text
  } else if (letter) {
    border = 'rgba(201,168,76,0.55)'
    color  = '#f0e8d8'
  }

  const resultBg     = result ? RESULT_STYLES[result].bg     : 'transparent'
  const resultBorder = result ? RESULT_STYLES[result].border : 'rgba(201,168,76,0.2)'
  const resultText   = result ? RESULT_STYLES[result].text   : '#f0e8d8'

  const classes = [
    isRevealing ? 'wg-tile-revealing' : '',
    isBouncing  ? 'wg-tile-bouncing'  : '',
    isPopping   ? 'wg-tile-popping'   : '',
  ].filter(Boolean).join(' ')

  return (
    <div
      style={{ perspective: '280px' }}
      aria-hidden="true"
    >
      <div
        className={classes}
        style={{
          width:          size,
          height:         size,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          fontFamily:     'var(--ds-font-mono, monospace)',
          fontSize:       fSize,
          fontWeight:     700,
          letterSpacing:  '0.04em',
          border:         `2px solid ${border}`,
          borderRadius:   '0.35rem',
          backgroundColor: bg,
          color,
          userSelect:     'none',
          transition:     isRevealing || isBouncing ? 'none' : 'border-color 80ms ease',
          // CSS vars for the animation mid-flip colour switch
          ['--wg-col'    as string]: colIndex,
          ['--wg-bg'     as string]: resultBg,
          ['--wg-border' as string]: resultBorder,
          ['--wg-text'   as string]: resultText,
          ['--wg-flip-dur' as string]: `${REVEAL_FLIP}ms`,
        } as React.CSSProperties}
      >
        {letter}
      </div>
    </div>
  )
}

// ─── Tile row ─────────────────────────────────────────────────────────────────

interface TileRowProps {
  letters:     string
  results?:    LetterResult[]
  isRevealing: boolean
  isRevealed:  boolean
  isShaking:   boolean
  isBouncing:  boolean
  poppingIdx:  number | null
  wordLength:  WordLength
}

function TileRow({
  letters, results, isRevealing, isRevealed, isShaking, isBouncing, poppingIdx, wordLength,
}: TileRowProps) {
  const tiles = Array.from({ length: wordLength }, (_, i) => ({
    letter: letters[i] ?? '',
    result: results?.[i],
  }))

  return (
    <div
      className={isShaking ? 'wg-row-shaking' : ''}
      style={{
        display: 'flex',
        gap:     'clamp(0.25rem, 1.2vw, 0.4rem)',
      }}
    >
      {tiles.map(({ letter, result }, i) => (
        <Tile
          key={i}
          letter={letter}
          result={result}
          isRevealing={isRevealing}
          isRevealed={isRevealed}
          isBouncing={isBouncing}
          isPopping={poppingIdx === i}
          colIndex={i}
          wordLength={wordLength}
        />
      ))}
    </div>
  )
}

// ─── On-screen keyboard ───────────────────────────────────────────────────────

const KB_ROWS = [
  ['Q','W','E','R','T','Y','U','I','O','P'],
  ['A','S','D','F','G','H','J','K','L'],
  ['Enter','Z','X','C','V','B','N','M','⌫'],
]

interface KeyboardKeyProps {
  label:    string
  status?:  LetterResult
  onPress:  (key: string) => void
}

function KeyboardKey({ label, status, onPress }: KeyboardKeyProps) {
  const isWide = label === 'Enter' || label === '⌫'

  let bg     = 'rgba(42,37,32,0.9)'
  let border = 'rgba(60,52,42,0.9)'
  let color  = '#a89878'

  if (status === 'correct') {
    bg = RESULT_STYLES.correct.bg; border = RESULT_STYLES.correct.border; color = RESULT_STYLES.correct.text
  } else if (status === 'present') {
    bg = RESULT_STYLES.present.bg; border = RESULT_STYLES.present.border; color = RESULT_STYLES.present.text
  } else if (status === 'absent') {
    bg = RESULT_STYLES.absent.bg; border = RESULT_STYLES.absent.border; color = RESULT_STYLES.absent.text
  }

  const handleClick = useCallback(() => {
    if (label === '⌫')    onPress('Backspace')
    else if (label === 'Enter') onPress('Enter')
    else                        onPress(label)
  }, [label, onPress])

  return (
    <button
      onPointerDown={(e) => { e.preventDefault(); handleClick() }}
      style={{
        minWidth:       isWide ? 'clamp(3rem, 10vw, 4rem)' : 'clamp(1.8rem, 6vw, 2.5rem)',
        height:         'clamp(2.5rem, 8vw, 3.2rem)',
        padding:        '0 0.25rem',
        borderRadius:   '0.35rem',
        border:         `1px solid ${border}`,
        background:     bg,
        color,
        fontFamily:     'var(--ds-font-mono, monospace)',
        fontSize:       isWide ? '0.7rem' : 'clamp(0.75rem, 2.5vw, 0.9rem)',
        fontWeight:     600,
        letterSpacing:  '0.04em',
        cursor:         'pointer',
        userSelect:     'none',
        transition:     'background 150ms ease, color 150ms ease',
        touchAction:    'manipulation',
        WebkitTapHighlightColor: 'transparent',
        flexShrink:     0,
      }}
    >
      {label}
    </button>
  )
}

function OnscreenKeyboard({
  onKey, keyStatuses,
}: {
  onKey:       (key: string) => void
  keyStatuses: Record<string, LetterResult>
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem', alignItems: 'center' }}>
      {KB_ROWS.map((row, ri) => (
        <div key={ri} style={{ display: 'flex', gap: '0.3rem', justifyContent: 'center' }}>
          {row.map((key) => (
            <KeyboardKey
              key={key}
              label={key}
              status={keyStatuses[key]}
              onPress={onKey}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

// ─── Definition banner ────────────────────────────────────────────────────────

function DefinitionBanner({
  word, status, onNewGame,
}: {
  word:       DevWord
  status:     'won' | 'lost'
  onNewGame:  () => void
}) {
  return (
    <div
      className="wg-definition"
      style={{
        flexShrink:  0,
        padding:     '0.9rem 1.2rem',
        background:  'rgba(16,13,8,0.97)',
        borderTop:   status === 'won'
          ? '1px solid rgba(201,168,76,0.45)'
          : '1px solid rgba(192,74,58,0.45)',
      }}
    >
      <div
        style={{
          maxWidth: '40rem',
          margin:   '0 auto',
          display:  'flex',
          flexDirection: 'column',
          gap:      '0.5rem',
        }}
      >
        {/* Status line */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <span style={{ fontSize: '1.1rem' }}>
              {status === 'won' ? '🟨' : '💻'}
            </span>
            <span
              style={{
                fontFamily:    'var(--ds-font-mono, monospace)',
                fontSize:      'clamp(1rem, 4vw, 1.35rem)',
                fontWeight:    700,
                color:         status === 'won' ? '#c9a84c' : '#f0e8d8',
                letterSpacing: '0.08em',
              }}
            >
              {word.word}
            </span>
            {status === 'lost' && (
              <span
                style={{
                  fontSize:   '0.72rem',
                  fontFamily: 'var(--ds-font-mono, monospace)',
                  color:      '#7a7060',
                }}
              >
                — the answer
              </span>
            )}
          </div>

          <button
            onClick={onNewGame}
            style={{
              padding:       '0.35rem 1rem',
              borderRadius:  '0.45rem',
              border:        '1px solid rgba(201,168,76,0.45)',
              background:    'rgba(201,168,76,0.1)',
              color:         '#c9a84c',
              fontFamily:    'var(--ds-font-mono, monospace)',
              fontSize:      '0.78rem',
              fontWeight:    500,
              letterSpacing: '0.06em',
              cursor:        'pointer',
              whiteSpace:    'nowrap',
            }}
          >
            New Game
          </button>
        </div>

        {/* Definition */}
        <p
          style={{
            margin:     0,
            fontSize:   'clamp(0.78rem, 2.5vw, 0.9rem)',
            color:      '#a89878',
            fontFamily: 'var(--ds-font-body, sans-serif)',
            lineHeight: 1.55,
          }}
        >
          {word.definition}
        </p>
      </div>
    </div>
  )
}

// ─── Mode bar ─────────────────────────────────────────────────────────────────

function ModeBar({
  mode, wordLength, onModeChange, onLengthChange,
}: {
  mode:           GameMode
  wordLength:     WordLength
  onModeChange:   (m: GameMode)    => void
  onLengthChange: (l: WordLength)  => void
}) {
  const pill: React.CSSProperties = {
    padding:       '0.2rem 0.7rem',
    borderRadius:  '999px',
    fontFamily:    'var(--ds-font-mono, monospace)',
    fontSize:      '0.7rem',
    letterSpacing: '0.05em',
    cursor:        'pointer',
    border:        '1px solid rgba(42,37,32,0.9)',
    background:    'transparent',
    color:         '#7a7060',
    transition:    'all 0.12s ease',
    whiteSpace:    'nowrap' as const,
  }

  const pillActive: React.CSSProperties = {
    ...pill,
    borderColor: 'rgba(201,168,76,0.5)',
    background:  'rgba(201,168,76,0.1)',
    color:       '#c9a84c',
  }

  return (
    <div
      style={{
        display:        'flex',
        alignItems:     'center',
        justifyContent: 'center',
        gap:            '0.5rem',
        padding:        '0.45rem 0.75rem',
        flexShrink:     0,
        flexWrap:       'wrap',
        borderBottom:   '1px solid rgba(42,37,32,0.7)',
      }}
    >
      {/* Mode toggle */}
      {(['daily', 'free'] as GameMode[]).map((m) => (
        <button key={m} style={mode === m ? pillActive : pill} onClick={() => onModeChange(m)}>
          {m === 'daily' ? '📅 Daily' : '🎲 Free play'}
        </button>
      ))}

      <div aria-hidden style={{ width: '1px', height: '1rem', background: 'rgba(42,37,32,0.8)' }} />

      {/* Length toggle */}
      {([5, 6] as WordLength[]).map((l) => (
        <button key={l} style={wordLength === l ? pillActive : pill} onClick={() => onLengthChange(l)}>
          {l}-letter
        </button>
      ))}
    </div>
  )
}

// ─── Toast (invalid word) ─────────────────────────────────────────────────────

function Toast({ message }: { message: string }) {
  return (
    <div
      style={{
        position:  'absolute',
        top:       '0.75rem',
        left:      '50%',
        transform: 'translateX(-50%)',
        padding:   '0.4rem 1rem',
        borderRadius: '999px',
        background: 'rgba(240,232,216,0.95)',
        color:      '#0a0906',
        fontFamily: 'var(--ds-font-mono, monospace)',
        fontSize:   '0.8rem',
        fontWeight: 600,
        zIndex:     30,
        whiteSpace: 'nowrap',
        pointerEvents: 'none',
        boxShadow: '0 4px 16px rgba(0,0,0,0.4)',
      }}
    >
      {message}
    </div>
  )
}

// ─── Main game inner component ────────────────────────────────────────────────

interface WordGuessGameProps extends GameRenderProps {
  mode:           GameMode
  wordLength:     WordLength
  onModeChange:   (m: GameMode)   => void
  onLengthChange: (l: WordLength) => void
  resetKey:       number
}

function WordGuessGame({
  isPaused,
  setScore,
  mode,
  wordLength,
  onModeChange,
  onLengthChange,
  resetKey,
}: WordGuessGameProps) {

  // ── Game state ────────────────────────────────────────────────────────────
  const [answer,       setAnswer]       = useState<DevWord>(() => getDailyWord(DEV_WORDS, 5))
  const [guesses,      setGuesses]      = useState<string[]>([])
  const [evaluations,  setEvaluations]  = useState<LetterResult[][]>([])
  const [currentInput, setCurrentInput] = useState('')
  const [gameStatus,   setGameStatus]   = useState<GameStatus>('playing')
  const [keyStatuses,  setKeyStatuses]  = useState<Record<string, LetterResult>>({})

  // ── Animation state ───────────────────────────────────────────────────────
  const [revealingRow,  setRevealingRow]  = useState<number | null>(null)
  const [revealedRows,  setRevealedRows]  = useState<Set<number>>(new Set())
  const [shakingRow,    setShakingRow]    = useState<number | null>(null)
  const [bouncingRow,   setBouncingRow]   = useState<number | null>(null)
  const [poppingIdx,    setPoppingIdx]    = useState<number | null>(null)
  const [showDef,       setShowDef]       = useState(false)
  const [toastMsg,      setToastMsg]      = useState<string | null>(null)

  // Refs for keyboard handler (avoid stale closures)
  const gameStatusRef    = useRef(gameStatus)
  const revealingRowRef  = useRef(revealingRow)
  const currentInputRef  = useRef(currentInput)
  const wordLengthRef    = useRef(wordLength)
  const submitRef        = useRef<() => void>(() => {})

  useEffect(() => { gameStatusRef.current   = gameStatus   }, [gameStatus])
  useEffect(() => { revealingRowRef.current = revealingRow }, [revealingRow])
  useEffect(() => { currentInputRef.current = currentInput }, [currentInput])
  useEffect(() => { wordLengthRef.current   = wordLength   }, [wordLength])

  // ── Toast helper ──────────────────────────────────────────────────────────
  const showToast = useCallback((msg: string, ms = 1400) => {
    setToastMsg(msg)
    setTimeout(() => setToastMsg(null), ms)
  }, [])

  // ── Init / reset ──────────────────────────────────────────────────────────
  const initGame = useCallback((len: WordLength, m: GameMode) => {
    const word = m === 'daily' ? getDailyWord(DEV_WORDS, len) : getRandomWord(DEV_WORDS, len)
    setAnswer(word)
    setGuesses([])
    setEvaluations([])
    setCurrentInput('')
    setGameStatus('playing')
    setKeyStatuses({})
    setRevealingRow(null)
    setRevealedRows(new Set())
    setShakingRow(null)
    setBouncingRow(null)
    setShowDef(false)
    setToastMsg(null)
    setScore(0)
  }, [setScore])

  // Reset on settings change
  useEffect(() => {
    initGame(wordLength, mode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey, wordLength, mode])

  // ── Shake helper ──────────────────────────────────────────────────────────
  const shakeRow = useCallback((idx: number) => {
    setShakingRow(idx)
    setTimeout(() => setShakingRow(null), 520)
  }, [])

  // ── Tile pop on letter entry ──────────────────────────────────────────────
  const popTile = useCallback((idx: number) => {
    setPoppingIdx(idx)
    setTimeout(() => setPoppingIdx(null), 120)
  }, [])

  // ── High score (saved independently so GameShell overlay never fires) ─────
  const saveHighScore = useCallback((pts: number) => {
    try {
      const prev = parseInt(localStorage.getItem(HIGH_SCORE_KEY) ?? '0', 10) || 0
      if (pts > prev) localStorage.setItem(HIGH_SCORE_KEY, String(pts))
    } catch { /* private browsing */ }
  }, [])

  // ── Submit handler ────────────────────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    const input   = currentInputRef.current
    const wl      = wordLengthRef.current

    if (input.length < wl) {
      shakeRow(guesses.length)
      showToast('Not enough letters')
      return
    }

    const results    = evaluateGuess(input, answer.word)
    const rowIndex   = guesses.length
    const newGuesses = [...guesses, input]
    const newEvals   = [...evaluations, results]

    setGuesses(newGuesses)
    setEvaluations(newEvals)
    setCurrentInput('')
    setKeyStatuses((prev) => mergeKeyStatuses(prev, input, results))

    // Start reveal
    setRevealingRow(rowIndex)

    const revealDuration = wl * REVEAL_STAGGER + REVEAL_FLIP + 50

    setTimeout(() => {
      setRevealedRows((prev) => new Set(prev).add(rowIndex))
      setRevealingRow(null)

      const won  = results.every((r) => r === 'correct')
      const lost = !won && newGuesses.length >= MAX_ATTEMPTS

      if (won) {
        setBouncingRow(rowIndex)
        const bounceDone = wl * BOUNCE_STAGGER + 700
        setTimeout(() => {
          setBouncingRow(null)
          setGameStatus('won')
          setShowDef(true)
          const pts = calcScore(newGuesses.length, MAX_ATTEMPTS)
          setScore(pts)
          saveHighScore(pts)
        }, bounceDone)
      } else if (lost) {
        setGameStatus('lost')
        setShowDef(true)
      }
    }, revealDuration)
  }, [guesses, evaluations, answer, shakeRow, showToast, setScore, saveHighScore])

  submitRef.current = handleSubmit

  // ── Physical keyboard ─────────────────────────────────────────────────────
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (isPaused)                             return
      if (gameStatusRef.current !== 'playing')  return
      if (revealingRowRef.current !== null)      return
      if (e.ctrlKey || e.metaKey || e.altKey)   return
      if (e.key === 'Escape')                   return   // GameShell owns Escape

      if (e.key === 'Backspace' || e.key === 'Delete') {
        e.preventDefault()
        setCurrentInput((prev) => prev.slice(0, -1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        submitRef.current()
      } else if (/^[A-Za-z]$/.test(e.key)) {
        const upper = e.key.toUpperCase()
        setCurrentInput((prev) => {
          if (prev.length >= wordLengthRef.current) return prev
          popTile(prev.length)
          return prev + upper
        })
      }
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [isPaused, popTile])

  // ── On-screen keyboard handler ────────────────────────────────────────────
  const handleVKey = useCallback((key: string) => {
    if (isPaused || gameStatus !== 'playing' || revealingRow !== null) return

    if (key === 'Backspace') {
      setCurrentInput((prev) => prev.slice(0, -1))
    } else if (key === 'Enter') {
      submitRef.current()
    } else if (/^[A-Z]$/.test(key)) {
      setCurrentInput((prev) => {
        if (prev.length >= wordLength) return prev
        popTile(prev.length)
        return prev + key
      })
    }
  }, [isPaused, gameStatus, revealingRow, wordLength, popTile])

  // ── Render helpers ────────────────────────────────────────────────────────
  const currentRowIdx = guesses.length

  function rowLetters(rowIdx: number): string {
    if (rowIdx < guesses.length)   return guesses[rowIdx]
    if (rowIdx === currentRowIdx)  return currentInput
    return ''
  }

  // ── Layout ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', minHeight: 0 }}>
      <style>{ANIMATIONS}</style>

      {/* Mode bar */}
      <ModeBar
        mode={mode}
        wordLength={wordLength}
        onModeChange={onModeChange}
        onLengthChange={onLengthChange}
      />

      {/* Scrollable game board */}
      <div
        style={{
          flex:           1,
          minHeight:      0,
          overflowY:      'auto',
          display:        'flex',
          flexDirection:  'column',
          alignItems:     'center',
          justifyContent: 'center',
          gap:            'clamp(0.8rem, 3vw, 1.4rem)',
          padding:        'clamp(0.5rem, 2vh, 1.2rem) 0.75rem',
          position:       'relative',
        }}
      >
        {/* Toast */}
        {toastMsg && <Toast message={toastMsg} />}

        {/* Tile grid */}
        <div
          role="grid"
          aria-label="Wordle guess grid"
          style={{
            display:       'flex',
            flexDirection: 'column',
            gap:           'clamp(0.25rem, 1.2vw, 0.4rem)',
          }}
        >
          {Array.from({ length: MAX_ATTEMPTS }, (_, rowIdx) => (
            <TileRow
              key={rowIdx}
              letters={rowLetters(rowIdx)}
              results={evaluations[rowIdx]}
              isRevealing={revealingRow === rowIdx}
              isRevealed={revealedRows.has(rowIdx)}
              isShaking={shakingRow === rowIdx}
              isBouncing={bouncingRow === rowIdx}
              poppingIdx={rowIdx === currentRowIdx ? poppingIdx : null}
              wordLength={wordLength}
            />
          ))}
        </div>

        {/* On-screen keyboard */}
        <OnscreenKeyboard onKey={handleVKey} keyStatuses={keyStatuses} />
      </div>

      {/* Definition banner — slides up when game ends */}
      {showDef && (gameStatus === 'won' || gameStatus === 'lost') && (
        <DefinitionBanner
          word={answer}
          status={gameStatus}
          onNewGame={() => initGame(wordLength, mode)}
        />
      )}
    </div>
  )
}

// ─── Outer component — GameShell wrapper (default export) ────────────────────

export default function WordGuess() {
  const [mode,       setMode]       = useState<GameMode>('daily')
  const [wordLength, setWordLength] = useState<WordLength>(5)
  const [resetKey,   setResetKey]   = useState(0)

  const handleModeChange = useCallback((m: GameMode) => {
    setMode(m)
    setResetKey((k) => k + 1)
  }, [])

  const handleLengthChange = useCallback((l: WordLength) => {
    setWordLength(l)
    setResetKey((k) => k + 1)
  }, [])

  return (
    <GameShell
      title={`DevWordle ${wordLength}-letter`}
      highScoreKey={HIGH_SCORE_KEY}
      controls={[
        { key: 'A–Z',        action: 'Type a letter'              },
        { key: 'Enter',      action: 'Submit guess'               },
        { key: 'Backspace',  action: 'Delete last letter'         },
        { key: 'Esc',        action: 'Pause / resume'             },
        { key: '📅 / 🎲',   action: 'Toggle daily / free play'   },
        { key: '5 / 6',      action: 'Switch word length (resets)'},
      ]}
    >
      {(props: GameRenderProps) => (
        <WordGuessGame
          {...props}
          mode={mode}
          wordLength={wordLength}
          onModeChange={handleModeChange}
          onLengthChange={handleLengthChange}
          resetKey={resetKey}
        />
      )}
    </GameShell>
  )
}
