'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import GameShell, { type GameRenderProps } from './GameShell'
import {
  SNIPPETS_BY_DIFF,
  pickSnippet,
  type Difficulty,
  type TypingSnippet,
} from '../data/typingSnippets'

// ─── Tokenizer ────────────────────────────────────────────────────────────────

type TokType = 'keyword' | 'builtin' | 'string' | 'comment' | 'number' | 'plain'

const TS_KEYWORDS = new Set([
  'const', 'let', 'var', 'function', 'return', 'type', 'interface', 'export',
  'import', 'from', 'as', 'async', 'await', 'extends', 'implements', 'readonly',
  'class', 'new', 'if', 'else', 'for', 'while', 'switch', 'case', 'break',
  'continue', 'default', 'try', 'catch', 'throw', 'typeof', 'keyof', 'infer',
  'in', 'of', 'true', 'false', 'null', 'undefined', 'void', 'never', 'private',
  'public', 'protected', 'static', 'abstract',
])

const TS_BUILTINS = new Set([
  'string', 'number', 'boolean', 'any', 'unknown', 'object', 'symbol',
  'Promise', 'Array', 'Record', 'Partial', 'Required', 'Pick', 'Omit',
  'Readonly', 'ReadonlyArray', 'ReturnType', 'Parameters', 'Awaited',
  'Extract', 'Exclude', 'NonNullable', 'Math', 'Date', 'Error', 'JSON',
  'console', 'parseInt', 'parseFloat', 'setTimeout', 'clearTimeout',
  'useState', 'useEffect', 'useRef', 'useCallback', 'useMemo', 'useReducer',
  'React', 'Map', 'Set', 'WeakMap', 'Object', 'PrismaClient', 'prisma',
])

const TOK_COLORS: Record<TokType, string> = {
  keyword: '#c792ea',  // purple
  builtin: '#82aaff',  // blue
  string:  '#c3e88d',  // green
  comment: '#546e7a',  // slate
  number:  '#f78c6c',  // orange
  plain:   '#cdd3de',  // near-white
}

function tokenize(code: string): TokType[] {
  const result = new Array<TokType>(code.length).fill('plain')
  let i = 0

  while (i < code.length) {
    const ch = code[i]

    // ── Line comment ─────────────────────────────────────────────────────────
    if (ch === '/' && code[i + 1] === '/') {
      const eol = code.indexOf('\n', i)
      const end = eol === -1 ? code.length : eol
      result.fill('comment', i, end)
      i = end
      continue
    }

    // ── Block comment ────────────────────────────────────────────────────────
    if (ch === '/' && code[i + 1] === '*') {
      const close = code.indexOf('*/', i + 2)
      const end = close === -1 ? code.length : close + 2
      result.fill('comment', i, end)
      i = end
      continue
    }

    // ── String / template literal ────────────────────────────────────────────
    if (ch === '"' || ch === "'" || ch === '`') {
      const q = ch
      let j = i + 1
      while (j < code.length) {
        if (code[j] === '\\') { j += 2; continue }
        if (code[j] === q)    { j++;    break    }
        j++
      }
      result.fill('string', i, j)
      i = j
      continue
    }

    // ── Number literal ───────────────────────────────────────────────────────
    if (/\d/.test(ch)) {
      let j = i
      while (j < code.length && /[\d.xXoObBa-fA-F_]/.test(code[j])) j++
      result.fill('number', i, j)
      i = j
      continue
    }

    // ── Identifier / keyword ─────────────────────────────────────────────────
    if (/[a-zA-Z_$]/.test(ch)) {
      let j = i
      while (j < code.length && /[a-zA-Z0-9_$]/.test(code[j])) j++
      const word = code.slice(i, j)
      const tok: TokType = TS_KEYWORDS.has(word)
        ? 'keyword'
        : TS_BUILTINS.has(word)
        ? 'builtin'
        : 'plain'
      result.fill(tok, i, j)
      i = j
      continue
    }

    i++
  }

  return result
}

// ─── Score helpers ────────────────────────────────────────────────────────────

function accuracyMultiplier(acc: number): number {
  if (acc < 0.7) return 0
  // 0.5 at 70%, 1.0 at 100% — linear
  return 0.5 + ((acc - 0.7) / 0.3) * 0.5
}

function computeAccuracy(input: string, code: string): number {
  if (input.length === 0) return 1
  let correct = 0
  for (let i = 0; i < input.length; i++) {
    if (input[i] === code[i]) correct++
  }
  return correct / input.length
}

function fmtTime(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  return `${Math.floor(s / 60)}m ${s % 60}s`
}

// ─── LocalStorage helpers ─────────────────────────────────────────────────────

const HS_KEYS: Record<Difficulty, string> = {
  easy:   'typing-hs-easy',
  medium: 'typing-hs-medium',
  hard:   'typing-hs-hard',
}

function loadBests(): Record<Difficulty, number> {
  const out = { easy: 0, medium: 0, hard: 0 } as Record<Difficulty, number>
  for (const d of ['easy', 'medium', 'hard'] as Difficulty[]) {
    try {
      const v = localStorage.getItem(HS_KEYS[d])
      if (v) out[d] = parseInt(v, 10) || 0
    } catch { /* SSR / private */ }
  }
  return out
}

function saveBest(diff: Difficulty, score: number): void {
  try { localStorage.setItem(HS_KEYS[diff], String(score)) } catch { /* no-op */ }
}

// ─── Design tokens (match GameShell palette) ──────────────────────────────────

const GOLD     = '#c9a84c'
const GOLD_DIM = 'rgba(201,168,76,0.18)'
const BG_DEEP  = 'rgba(16,13,8,0.98)'
const BORDER   = 'rgba(201,168,76,0.22)'
const MUTED    = '#7a7060'
const WARM     = '#a89878'
const ERROR_BG = 'rgba(255,70,70,0.22)'
const ERROR_FG = '#ff7070'

// ─── Inner game component ─────────────────────────────────────────────────────

type Phase = 'select' | 'playing' | 'done'

interface GameResult {
  wpm: number
  accuracy: number
  elapsedMs: number
  finalScore: number
  isNewBest: boolean
  snippet: TypingSnippet
}

function TypingGame({ isPaused, setScore }: GameRenderProps) {
  // ── Phase & difficulty ──────────────────────────────────────────────────────
  const [phase,      setPhase]      = useState<Phase>('select')
  const [difficulty, setDifficulty] = useState<Difficulty>('medium')

  // ── Active round ────────────────────────────────────────────────────────────
  const [snippet,  setSnippet]  = useState<TypingSnippet | null>(null)
  const [userInput, setInput]   = useState('')
  const [startMs,   setStartMs] = useState<number | null>(null)
  const [elapsedMs, setElapsed] = useState(0)
  const [pauseStartMs, setPauseStart] = useState<number | null>(null)
  const [totalPausedMs, setTotalPaused] = useState(0)

  // ── Results ─────────────────────────────────────────────────────────────────
  const [result, setResult] = useState<GameResult | null>(null)

  // ── Per-difficulty bests ────────────────────────────────────────────────────
  const [bests, setBests] = useState<Record<Difficulty, number>>({ easy: 0, medium: 0, hard: 0 })

  // ── Refs ────────────────────────────────────────────────────────────────────
  const textareaRef    = useRef<HTMLTextAreaElement>(null)
  const completedRef   = useRef(false)
  const tokensRef      = useRef<TokType[]>([])

  // ── Load bests on mount ─────────────────────────────────────────────────────
  useEffect(() => { setBests(loadBests()) }, [])

  // ── Precompute tokens when snippet changes ──────────────────────────────────
  useEffect(() => {
    if (snippet) tokensRef.current = tokenize(snippet.code)
  }, [snippet])

  // ── Live timer ──────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!startMs || phase !== 'playing' || isPaused) return
    const id = setInterval(() => {
      setElapsed(Date.now() - startMs - totalPausedMs)
    }, 250)
    return () => clearInterval(id)
  }, [startMs, phase, isPaused, totalPausedMs])

  // ── Pause tracking ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing' || !startMs) return
    if (isPaused) {
      setPauseStart(Date.now())
    } else if (pauseStartMs !== null) {
      setTotalPaused((p) => p + (Date.now() - pauseStartMs))
      setPauseStart(null)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPaused])

  // ── Live score in GameShell top bar ────────────────────────────────────────
  useEffect(() => {
    if (phase !== 'playing' || !startMs || elapsedMs < 500) return
    const wpm = Math.round((userInput.length / 5) / (elapsedMs / 60000))
    if (wpm > 0) setScore(wpm)
  }, [userInput.length, elapsedMs, phase, startMs, setScore])

  // ── Auto-focus textarea when playing ───────────────────────────────────────
  useEffect(() => {
    if (phase === 'playing') {
      setTimeout(() => textareaRef.current?.focus(), 50)
    }
  }, [phase])

  // ── Handlers ───────────────────────────────────────────────────────────────
  const startRound = useCallback((diff: Difficulty) => {
    const s = pickSnippet(diff)
    setDifficulty(diff)
    setSnippet(s)
    setInput('')
    setStartMs(null)
    setElapsed(0)
    setTotalPaused(0)
    setPauseStart(null)
    completedRef.current = false
    setPhase('playing')
  }, [])

  const handleComplete = useCallback(
    (finalInput: string, snip: TypingSnippet) => {
      if (completedRef.current) return
      completedRef.current = true

      const now = Date.now()
      const elapsed = startMs ? now - startMs - totalPausedMs : 1000
      const acc = computeAccuracy(finalInput, snip.code)
      const wpm = Math.max(
        1,
        Math.round((finalInput.length / 5) / (elapsed / 60000)),
      )
      const mult  = accuracyMultiplier(acc)
      const score = Math.round(wpm * mult)

      const prevBest = bests[snip.difficulty]
      const isNewBest = score > prevBest
      if (isNewBest) {
        saveBest(snip.difficulty, score)
        setBests((b) => ({ ...b, [snip.difficulty]: score }))
      }

      setScore(score)
      setResult({ wpm, accuracy: acc, elapsedMs: elapsed, finalScore: score, isNewBest, snippet: snip })
      setPhase('done')
    },
    [bests, startMs, totalPausedMs, setScore],
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      if (phase !== 'playing' || isPaused || !snippet) return
      const val = e.target.value
      if (!startMs && val.length > 0) setStartMs(Date.now())

      const capped = val.slice(0, snippet.code.length)
      setInput(capped)

      if (capped.length === snippet.code.length) {
        handleComplete(capped, snippet)
      }
    },
    [phase, isPaused, snippet, startMs, handleComplete],
  )

  const tryAgain = useCallback(() => {
    if (!snippet) return
    const next = pickSnippet(snippet.difficulty, snippet.id)
    setSnippet(next)
    setInput('')
    setStartMs(null)
    setElapsed(0)
    setTotalPaused(0)
    setPauseStart(null)
    completedRef.current = false
    setResult(null)
    setPhase('playing')
  }, [snippet])

  // ── Derived stats (live) ────────────────────────────────────────────────────
  const code         = snippet?.code ?? ''
  const tokens       = tokensRef.current
  const typedLen     = userInput.length
  const liveAcc      = computeAccuracy(userInput, code)
  const liveWpm      = (startMs && elapsedMs > 500)
    ? Math.round((typedLen / 5) / (elapsedMs / 60000))
    : 0
  const progress     = code.length > 0 ? typedLen / code.length : 0

  // ─────────────────────────────────────────────────────────────────────────────
  //  SELECT SCREEN
  // ─────────────────────────────────────────────────────────────────────────────
  if (phase === 'select') {
    return (
      <div className="game-scene game-scene--typing" style={{ padding: '2rem 1.5rem', maxWidth: '48rem', margin: '0 auto' }}>
        <style>{CURSOR_CSS}</style>

        <p style={{ fontFamily: 'var(--ds-font-mono,monospace)', fontSize: '0.72rem',
          letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, marginBottom: '0.5rem' }}>
          Select Difficulty
        </p>
        <h2 style={{ fontFamily: 'var(--ds-font-display,serif)', fontSize: '1.9rem',
          fontWeight: 700, color: '#f0e8d8', margin: '0 0 0.35rem' }}>
          Type real code.
        </h2>
        <p style={{ fontFamily: 'var(--ds-font-body,sans-serif)', fontSize: '0.9rem',
          color: WARM, marginBottom: '2rem', lineHeight: 1.6 }}>
          Each snippet is pulled from an actual portfolio project. Timer starts on your first keystroke.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(13rem,1fr))', gap: '1rem', marginBottom: '2.5rem' }}>
          {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
            <DifficultyCard
              key={d}
              difficulty={d}
              best={bests[d]}
              count={SNIPPETS_BY_DIFF[d].length}
              onSelect={() => startRound(d)}
            />
          ))}
        </div>

        <div style={{ borderTop: `1px solid ${BORDER}`, paddingTop: '1.25rem' }}>
          <p style={{ fontFamily: 'var(--ds-font-mono,monospace)', fontSize: '0.72rem',
            color: MUTED, letterSpacing: '0.08em' }}>
            ESC — pause · Tab is ignored · Backspace to correct
          </p>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  DONE SCREEN
  // ─────────────────────────────────────────────────────────────────────────────
  if (phase === 'done' && result) {
    const accPct = Math.round(result.accuracy * 100)
    const mult   = accuracyMultiplier(result.accuracy)
    return (
      <div className="game-scene game-scene--typing" style={{ padding: '2rem 1.5rem', maxWidth: '48rem', margin: '0 auto' }}>
        <style>{CURSOR_CSS}</style>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.5rem' }}>
          <span style={{ fontSize: '1.5rem' }}>🎯</span>
          <div>
            <p style={{ fontFamily: 'var(--ds-font-mono,monospace)', fontSize: '0.72rem',
              letterSpacing: '0.12em', textTransform: 'uppercase', color: MUTED, margin: 0 }}>
              Challenge Complete
            </p>
            <h2 style={{ fontFamily: 'var(--ds-font-display,serif)', fontSize: '1.5rem',
              fontWeight: 700, color: '#f0e8d8', margin: 0 }}>
              {result.isNewBest ? '🏆 New personal best!' : 'Round finished'}
            </h2>
          </div>
        </div>

        {/* Stats grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: '0.75rem', marginBottom: '1.25rem' }}>
          {[
            { label: 'WPM',        value: String(result.wpm)  },
            { label: 'Accuracy',   value: `${accPct}%`        },
            { label: 'Time',       value: fmtTime(result.elapsedMs) },
            { label: 'Score',      value: String(result.finalScore) },
          ].map(({ label, value }) => (
            <div key={label} style={{ padding: '1rem', borderRadius: '0.75rem',
              border: BORDER, background: GOLD_DIM, textAlign: 'center' }}>
              <div style={{ fontFamily: 'var(--ds-font-mono,monospace)', fontSize: '0.68rem',
                letterSpacing: '0.1em', textTransform: 'uppercase', color: MUTED, marginBottom: '0.25rem' }}>
                {label}
              </div>
              <div style={{ fontFamily: 'var(--ds-font-mono,monospace)', fontSize: '1.6rem',
                fontWeight: 700, color: GOLD }}>
                {value}
              </div>
            </div>
          ))}
        </div>

        {/* Multiplier info */}
        <div style={{ padding: '0.75rem 1rem', borderRadius: '0.65rem', border: `1px solid ${BORDER}`,
          background: 'rgba(16,13,8,0.6)', marginBottom: '1.25rem', display: 'flex',
          alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
          <span style={{ fontFamily: 'var(--ds-font-mono,monospace)', fontSize: '0.8rem', color: WARM }}>
            Accuracy multiplier:
            <strong style={{ color: mult > 0 ? GOLD : ERROR_FG, marginLeft: '0.4rem' }}>
              ×{mult.toFixed(2)}
            </strong>
            {mult === 0 && (
              <span style={{ color: ERROR_FG, marginLeft: '0.5rem', fontSize: '0.72rem' }}>
                (need ≥70% for a score)
              </span>
            )}
          </span>
          <span style={{ fontFamily: 'var(--ds-font-mono,monospace)', fontSize: '0.72rem', color: MUTED }}>
            {result.snippet.difficulty.toUpperCase()} · best: {bests[result.snippet.difficulty]}
          </span>
        </div>

        {/* Snippet source */}
        <div style={{ padding: '0.65rem 1rem', borderRadius: '0.65rem', border: `1px solid ${BORDER}`,
          background: 'rgba(130,170,255,0.06)', marginBottom: '1.5rem', display: 'flex',
          gap: '0.6rem', alignItems: 'flex-start' }}>
          <span style={{ fontSize: '0.9rem', flexShrink: 0, marginTop: '0.05rem' }}>📂</span>
          <div>
            <div style={{ fontFamily: 'var(--ds-font-mono,monospace)', fontSize: '0.72rem',
              color: MUTED, letterSpacing: '0.08em', marginBottom: '0.1rem' }}>
              Recruiter mode
            </div>
            <div style={{ fontFamily: 'var(--ds-font-body,sans-serif)', fontSize: '0.85rem', color: '#82aaff' }}>
              You just typed real project code — {result.snippet.sourceNote}
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button style={primaryBtnStyle} onClick={tryAgain}
            onMouseEnter={primaryHover} onMouseLeave={primaryLeave}>
            Try Again
          </button>
          <button style={ghostBtnStyle} onClick={() => { setResult(null); setPhase('select') }}
            onMouseEnter={ghostHover} onMouseLeave={ghostLeave}>
            Change Difficulty
          </button>
        </div>
      </div>
    )
  }

  // ─────────────────────────────────────────────────────────────────────────────
  //  PLAYING SCREEN
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div className="game-scene game-scene--typing" style={{ padding: '1.25rem 1.5rem', maxWidth: '52rem', margin: '0 auto' }}>
      <style>{CURSOR_CSS}</style>

      {/* ── Stats bar ──────────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap',
        marginBottom: '0.85rem', alignItems: 'center' }}>

        <StatPill label="WPM"
          value={liveWpm > 0 ? String(liveWpm) : '—'}
          highlight={liveWpm > 0} />

        <StatPill label="ACC"
          value={typedLen > 0 ? `${Math.round(liveAcc * 100)}%` : '—'}
          highlight={false}
          warn={typedLen > 3 && liveAcc < 0.7} />

        <StatPill label="TIME"
          value={startMs ? fmtTime(elapsedMs) : '—'}
          highlight={false} />

        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
          <span style={{ fontFamily: 'var(--ds-font-mono,monospace)', fontSize: '0.65rem',
            letterSpacing: '0.1em', textTransform: 'uppercase',
            color: difficulty === 'easy' ? '#c3e88d' : difficulty === 'medium' ? GOLD : '#ff7070' }}>
            {difficulty}
          </span>
          <button style={{ ...ghostBtnStyle, padding: '0.25rem 0.6rem', fontSize: '0.72rem' }}
            onClick={() => setPhase('select')}
            onMouseEnter={ghostHover} onMouseLeave={ghostLeave}>
            ✕ quit
          </button>
        </div>
      </div>

      {/* ── Progress bar ───────────────────────────────────────────────────── */}
      <div style={{ height: '3px', borderRadius: '2px', background: 'rgba(201,168,76,0.12)',
        marginBottom: '1rem', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${progress * 100}%`,
          background: `linear-gradient(90deg, ${GOLD_DIM}, ${GOLD})`,
          transition: 'width 0.12s linear', borderRadius: '2px' }} />
      </div>

      {/* ── Snippet title ───────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', gap: '0.6rem', alignItems: 'baseline', marginBottom: '0.6rem' }}>
        <span style={{ fontFamily: 'var(--ds-font-mono,monospace)', fontSize: '0.72rem',
          letterSpacing: '0.06em', color: MUTED }}>
          {snippet?.language ?? 'typescript'}
        </span>
        <span style={{ fontFamily: 'var(--ds-font-body,sans-serif)', fontSize: '0.8rem', color: WARM }}>
          {snippet?.title}
        </span>
      </div>

      {/* ── Code display + hidden textarea ─────────────────────────────────── */}
      <div
        style={{ position: 'relative', cursor: 'text' }}
        onClick={() => textareaRef.current?.focus()}
      >
        {/* Code block */}
        <div style={{ borderRadius: '0.85rem', border: `1px solid ${BORDER}`,
          background: BG_DEEP, padding: '1.5rem 1.25rem 1.25rem',
          boxShadow: '0 8px 32px rgba(0,0,0,0.45)', overflow: 'auto', maxHeight: '22rem' }}>

          {/* Window chrome dots */}
          <div style={{ display: 'flex', gap: '0.4rem', marginBottom: '1rem' }}>
            {['#ff5f57','#febc2e','#28c840'].map((c) => (
              <span key={c} style={{ width: '0.6rem', height: '0.6rem',
                borderRadius: '50%', background: c, opacity: 0.7 }} />
            ))}
          </div>

          <pre style={{ margin: 0, fontFamily: 'var(--ds-font-mono,monospace)',
            fontSize: '0.88rem', lineHeight: 1.85, whiteSpace: 'pre',
            paddingTop: '0.75rem', /* room for error indicators above line 1 */ }}>
            {code.split('').map((char, i) => (
              <CharSpan
                key={i}
                char={char}
                typed={userInput[i]}
                state={
                  i === typedLen
                    ? 'cursor'
                    : i < typedLen
                    ? userInput[i] === char ? 'correct' : 'error'
                    : 'untyped'
                }
                baseColor={TOK_COLORS[tokens[i] ?? 'plain']}
              />
            ))}
            {/* trailing cursor if at very end but not yet submitted */}
            {typedLen === code.length && code.length > 0 && (
              <span style={{ fontFamily: 'var(--ds-font-mono,monospace)', color: GOLD }}>
                {' '}✓
              </span>
            )}
          </pre>
        </div>

        {/* Hidden textarea — captures all typing */}
        <textarea
          ref={textareaRef}
          aria-label="Code typing input"
          value={userInput}
          onChange={handleInputChange}
          disabled={isPaused || phase !== 'playing'}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          rows={1}
          style={{
            position: 'absolute',
            top: 0, left: 0,
            width: '100%', height: '100%',
            opacity: 0,
            resize: 'none',
            cursor: 'text',
            fontSize: '16px', /* prevent iOS zoom */
          }}
        />
      </div>

      {/* ── Hint ───────────────────────────────────────────────────────────── */}
      {!startMs && (
        <p style={{ fontFamily: 'var(--ds-font-mono,monospace)', fontSize: '0.72rem',
          color: MUTED, marginTop: '0.75rem', textAlign: 'center', letterSpacing: '0.06em' }}>
          Click the code block, then start typing — timer starts on first keystroke
        </p>
      )}

      {/* ── Source note ────────────────────────────────────────────────────── */}
      <div style={{ marginTop: '0.85rem', display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
        <span style={{ fontSize: '0.75rem' }}>📂</span>
        <span style={{ fontFamily: 'var(--ds-font-mono,monospace)', fontSize: '0.7rem', color: MUTED }}>
          {snippet?.sourceNote}
        </span>
      </div>
    </div>
  )
}

// ─── CharSpan ─────────────────────────────────────────────────────────────────

type CharState = 'untyped' | 'correct' | 'error' | 'cursor'

function CharSpan({
  char, typed, state, baseColor,
}: {
  char: string
  typed: string | undefined
  state: CharState
  baseColor: string
}) {
  const isNewline = char === '\n'

  const style: React.CSSProperties = {
    position: 'relative',
    display: 'inline',
    color:
      state === 'correct' ? GOLD
      : state === 'error'   ? ERROR_FG
      : state === 'cursor'  ? (isNewline ? GOLD : '#1a1708')
      : baseColor,
    backgroundColor:
      state === 'error'   ? ERROR_BG
      : state === 'cursor' ? GOLD
      : 'transparent',
    opacity:   state === 'untyped' ? 0.55 : 1,
    animation: state === 'cursor'  ? 'tcBlink 0.9s step-end infinite' : 'none',
  }

  if (isNewline) {
    return (
      <>
        {state === 'cursor' && (
          <span style={{ ...style, padding: '0 2px', borderRadius: '2px' }}>↵</span>
        )}
        {'\n'}
      </>
    )
  }

  return (
    <span style={style}>
      {state === 'error' && (
        <span style={{
          position: 'absolute',
          top: '-1.15em',
          left: '50%',
          transform: 'translateX(-50%)',
          fontSize: '0.6em',
          color: ERROR_FG,
          pointerEvents: 'none',
          whiteSpace: 'nowrap',
          lineHeight: 1,
        }}>
          {char}
        </span>
      )}
      {state === 'error' ? (typed ?? char) : char}
    </span>
  )
}

// ─── DifficultyCard ───────────────────────────────────────────────────────────

const DIFF_META: Record<Difficulty, { emoji: string; desc: string; lines: string; color: string }> = {
  easy:   { emoji: '🌱', desc: 'Short declarations',    lines: '1–3 lines',   color: '#c3e88d' },
  medium: { emoji: '⚡', desc: 'Hooks & interfaces',    lines: '4–6 lines',   color: GOLD      },
  hard:   { emoji: '🔥', desc: 'Generics & queries',    lines: '8–12 lines',  color: '#ff7070' },
}

function DifficultyCard({
  difficulty, best, count, onSelect,
}: {
  difficulty: Difficulty
  best: number
  count: number
  onSelect: () => void
}) {
  const [hovered, setHovered] = useState(false)
  const m = DIFF_META[difficulty]

  return (
    <button
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        all: 'unset',
        display: 'block',
        padding: '1.25rem',
        borderRadius: '0.85rem',
        border: hovered
          ? `1px solid ${m.color}55`
          : `1px solid ${BORDER}`,
        background: hovered ? `${m.color}0f` : 'rgba(16,13,8,0.55)',
        cursor: 'pointer',
        textAlign: 'left',
        transition: 'all 0.15s ease',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.65rem' }}>
        <span style={{ fontSize: '1.1rem' }}>{m.emoji}</span>
        <span style={{ fontFamily: 'var(--ds-font-mono,monospace)', fontSize: '0.85rem',
          fontWeight: 700, color: m.color, textTransform: 'capitalize' }}>
          {difficulty}
        </span>
      </div>
      <p style={{ fontFamily: 'var(--ds-font-body,sans-serif)', fontSize: '0.82rem',
        color: WARM, margin: '0 0 0.35rem', lineHeight: 1.4 }}>
        {m.desc}
      </p>
      <p style={{ fontFamily: 'var(--ds-font-mono,monospace)', fontSize: '0.7rem',
        color: MUTED, margin: '0 0 0.75rem' }}>
        {m.lines} · {count} snippets
      </p>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: 'var(--ds-font-mono,monospace)', fontSize: '0.68rem',
          color: MUTED, letterSpacing: '0.06em' }}>
          BEST
        </span>
        <span style={{ fontFamily: 'var(--ds-font-mono,monospace)', fontSize: '0.9rem',
          fontWeight: 700, color: best > 0 ? m.color : MUTED }}>
          {best > 0 ? best : '—'}
        </span>
      </div>
    </button>
  )
}

// ─── StatPill ─────────────────────────────────────────────────────────────────

function StatPill({
  label, value, highlight, warn,
}: {
  label: string
  value: string
  highlight: boolean
  warn?: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem',
      padding: '0.3rem 0.65rem', borderRadius: '0.45rem',
      border: `1px solid ${warn ? ERROR_BG : highlight ? BORDER : 'rgba(42,37,32,0.9)'}`,
      background: warn ? ERROR_BG : highlight ? GOLD_DIM : 'rgba(16,13,8,0.5)' }}>
      <span style={{ fontFamily: 'var(--ds-font-mono,monospace)', fontSize: '0.62rem',
        letterSpacing: '0.1em', textTransform: 'uppercase',
        color: warn ? ERROR_FG : MUTED }}>
        {label}
      </span>
      <span style={{ fontFamily: 'var(--ds-font-mono,monospace)', fontSize: '0.88rem',
        fontWeight: 700, color: warn ? ERROR_FG : highlight ? GOLD : '#f0e8d8' }}>
        {value}
      </span>
    </div>
  )
}

// ─── Shared button styles ─────────────────────────────────────────────────────

const primaryBtnStyle: React.CSSProperties = {
  padding: '0.55rem 1.4rem',
  borderRadius: 'var(--ds-radius-sm,0.65rem)',
  border: `1px solid ${GOLD}80`,
  background: GOLD_DIM,
  color: '#e8c96e',
  fontFamily: 'var(--ds-font-mono,monospace)',
  fontSize: '0.85rem',
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
}
const ghostBtnStyle: React.CSSProperties = {
  padding: '0.55rem 1.4rem',
  borderRadius: 'var(--ds-radius-sm,0.65rem)',
  border: '1px solid rgba(42,37,32,0.95)',
  background: 'transparent',
  color: WARM,
  fontFamily: 'var(--ds-font-mono,monospace)',
  fontSize: '0.85rem',
  fontWeight: 500,
  cursor: 'pointer',
  transition: 'all 0.15s ease',
}

const primaryHover = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.background = 'rgba(201,168,76,0.3)'
  e.currentTarget.style.color = '#f0e8d8'
}
const primaryLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.background = GOLD_DIM
  e.currentTarget.style.color = '#e8c96e'
}
const ghostHover = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.borderColor = 'rgba(201,168,76,0.35)'
  e.currentTarget.style.color = GOLD
}
const ghostLeave = (e: React.MouseEvent<HTMLButtonElement>) => {
  e.currentTarget.style.borderColor = 'rgba(42,37,32,0.95)'
  e.currentTarget.style.color = WARM
}

// ─── Cursor blink CSS ─────────────────────────────────────────────────────────

const CURSOR_CSS = `
  @keyframes tcBlink {
    0%, 100% { opacity: 1; }
    50%       { opacity: 0; }
  }
`

// ─── Controls definition ──────────────────────────────────────────────────────

const CONTROLS = [
  { key: 'Any key',   action: 'Start timer & type the snippet'     },
  { key: 'Backspace', action: 'Correct the previous character'      },
  { key: 'Esc',       action: 'Pause / resume the timer'            },
  { key: 'Click',     action: 'Focus the code block if unfocused'   },
]

// ─── Default export ───────────────────────────────────────────────────────────

export default function TypingChallenge() {
  return (
    <GameShell
      title="Typing Challenge"
      highScoreKey="typing-challenge-best"
      controls={CONTROLS}
    >
      {(shellProps) => <TypingGame {...shellProps} />}
    </GameShell>
  )
}
