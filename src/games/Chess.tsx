"use client"

import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as ChessJS from 'chess.js';

type ChessInstance = InstanceType<typeof ChessJS.Chess>;
type ChessMove = ChessJS.ChessMove;
const ChessCtor = (
  (ChessJS as { Chess?: unknown }).Chess
  ?? (ChessJS as { default?: { Chess?: unknown } }).default?.Chess
  ?? (ChessJS as { default?: unknown }).default
) as new (fen?: string) => ChessInstance;

type Side = 'w' | 'b';
type PieceKey = 'K' | 'Q' | 'R' | 'B' | 'N' | 'P';
type PieceGlyphKey = `${Side}${PieceKey}`;

declare global {
  interface Window {
    chess?: unknown;
  }
}

const _LEGACY_UNI: Record<string, string> = {
  wK: '♔',
  wQ: '♕',
  wR: '♖',
  wB: '♗',
  wN: '♘',
  wP: '♙',
  bK: '♚',
  bQ: '♛',
  bR: '♜',
  bB: '♝',
  bN: '♞',
  bP: '♟',
};

const UNI: Record<PieceGlyphKey, string> = {
  wK: '\u2654',
  wQ: '\u2655',
  wR: '\u2656',
  wB: '\u2657',
  wN: '\u2658',
  wP: '\u2659',
  bK: '\u265A',
  bQ: '\u265B',
  bR: '\u265C',
  bB: '\u265D',
  bN: '\u265E',
  bP: '\u265F',
};

// ─── Feature 2: Opening Library ──────────────────────────────────────────────
const OPENINGS: Record<string, string> = {
  // Sicilian Defence
  'e4 c5': 'Sicilian Defence',
  'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6': 'Sicilian Najdorf',
  'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 g6': 'Sicilian Dragon',
  'e4 c5 Nf3 e6': 'Sicilian Kan',
  'e4 c5 Nc3': 'Sicilian Defence',
  // Ruy López
  'e4 e5 Nf3 Nc6 Bb5': 'Ruy López',
  'e4 e5 Nf3 Nc6 Bb5 a6': 'Ruy López, Morphy Defence',
  'e4 e5 Nf3 Nc6 Bb5 Nf6': 'Ruy López, Berlin Defence',
  // Italian Game
  'e4 e5 Nf3 Nc6 Bc4': 'Italian Game',
  'e4 e5 Nf3 Nc6 Bc4 Bc5': 'Giuoco Piano',
  'e4 e5 Nf3 Nc6 Bc4 Nf6': 'Two Knights Defence',
  // French Defence
  'e4 e6': 'French Defence',
  'e4 e6 d4 d5': 'French Defence',
  'e4 e6 d4 d5 Nc3': 'French, Classical',
  'e4 e6 d4 d5 e5': 'French, Advance',
  'e4 e6 d4 d5 exd5': 'French, Exchange',
  // Caro-Kann Defence
  'e4 c6': 'Caro-Kann Defence',
  'e4 c6 d4 d5': 'Caro-Kann Defence',
  'e4 c6 d4 d5 Nc3': 'Caro-Kann, Classical',
  'e4 c6 d4 d5 e5': 'Caro-Kann, Advance',
  'e4 c6 d4 d5 exd5 cxd5': 'Caro-Kann, Exchange',
  // Queen's Gambit
  'd4 d5 c4': "Queen's Gambit",
  'd4 d5 c4 e6': "Queen's Gambit Declined",
  'd4 d5 c4 dxc4': "Queen's Gambit Accepted",
  'd4 d5 c4 c6': 'Slav Defence',
  'd4 d5 c4 c6 Nf3 Nf6 Nc3': 'Semi-Slav Defence',
  // King's Indian Defence
  'd4 Nf6 c4 g6': "King's Indian Defence",
  'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6': "King's Indian Defence",
  'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3': "King's Indian, Main Line",
  // Nimzo-Indian Defence
  'd4 Nf6 c4 e6 Nc3 Bb4': 'Nimzo-Indian Defence',
  'd4 Nf6 c4 e6 Nc3 Bb4 e3': 'Nimzo-Indian, Rubinstein',
  // English Opening
  'c4': 'English Opening',
  'c4 e5': 'English Opening',
  'c4 c5': 'Symmetrical English',
  'c4 Nf6': 'English, Anglo-Indian',
  'c4 e6': 'English Opening',
  // King's Gambit
  'e4 e5 f4': "King's Gambit",
  'e4 e5 f4 exf4': "King's Gambit Accepted",
  'e4 e5 f4 Bc5': "King's Gambit Declined",
  // Scotch Game
  'e4 e5 Nf3 Nc6 d4': 'Scotch Game',
  'e4 e5 Nf3 Nc6 d4 exd4': 'Scotch Game',
  // Petrov's Defence
  'e4 e5 Nf3 Nf6': "Petrov's Defence",
  // London System
  'd4 d5 Nf3 Nf6 Bf4': 'London System',
  'd4 Nf6 Nf3 d5 Bf4': 'London System',
  'd4 d5 Bf4': 'London System',
  // Pirc Defence
  'e4 d6 d4 Nf6': 'Pirc Defence',
  'e4 d6 d4 Nf6 Nc3': 'Pirc Defence',
  // Dutch Defence
  'd4 f5': 'Dutch Defence',
  'd4 f5 c4': 'Dutch Defence',
  // Grünfeld Defence
  'd4 Nf6 c4 g6 Nc3 d5': 'Grünfeld Defence',
  // Four Knights
  'e4 e5 Nf3 Nc6 Nc3 Nf6': 'Four Knights Game',
  // Vienna Game
  'e4 e5 Nc3': 'Vienna Game',
  // Alekhine's Defence
  'e4 Nf6': "Alekhine's Defence",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
function squareToGrid(sq: string, flipped: boolean): { col: number; row: number } {
  const file = sq.charCodeAt(0) - 97; // a=0 … h=7
  const rank = parseInt(sq[1]) - 1;   // 1=0 … 8=7
  return {
    col: flipped ? 7 - file : file,
    row: flipped ? rank : 7 - rank,
  };
}

function formatTime(secs: number): string {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

const PIECE_VALUES: Record<string, number> = { K: 0, Q: 9, R: 5, B: 3, N: 3, P: 1 };

function materialValue(pieces: PieceGlyphKey[]): number {
  return pieces.reduce((sum, pk) => sum + (PIECE_VALUES[pk[1]] ?? 0), 0);
}

function pieceKey(color: string, type: string): PieceGlyphKey {
  return `${color}${type.toUpperCase()}` as PieceGlyphKey;
}

function LuxuryPiece({
  pieceCode,
  variant = 'board',
}: {
  pieceCode: PieceGlyphKey;
  variant?: 'board' | 'capture' | 'promotion';
}) {
  const glyph = UNI[pieceCode];
  const toneClass = pieceCode.startsWith('w') ? 'is-white' : 'is-black';

  return (
    <span className={`lux-piece lux-piece--${variant} ${toneClass}`} aria-label={pieceCode} role="img">
      <span className="lux-piece__shadow" aria-hidden="true">{glyph}</span>
      <span className="lux-piece__outline" aria-hidden="true">{glyph}</span>
      <span className="lux-piece__metal" aria-hidden="true">{glyph}</span>
      <span className="lux-piece__shine" aria-hidden="true">{glyph}</span>
      <span className="lux-piece__core" aria-hidden="true">{glyph}</span>
    </span>
  );
}

function CapturedPieces({ pieces }: { pieces: PieceGlyphKey[] }) {
  if (!pieces.length) {
    return <span className="pc-cap-empty">No captures yet</span>;
  }

  return (
    <>
      {pieces.map((pieceCode, index) => (
        <span key={`${pieceCode}-${index}`} className="pc-cap-chip">
          <LuxuryPiece pieceCode={pieceCode} variant="capture" />
        </span>
      ))}
    </>
  );
}

function getRanks(flipped: boolean) {
  return flipped ? ['1', '2', '3', '4', '5', '6', '7', '8'] : ['8', '7', '6', '5', '4', '3', '2', '1'];
}

function getFiles(flipped: boolean) {
  return flipped ? ['h', 'g', 'f', 'e', 'd', 'c', 'b', 'a'] : ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
}

async function requestEngineBestMove(fen: string, depth: number): Promise<string | null> {
  try {
    const params = new URLSearchParams({
      fen,
      depth: String(depth),
    });

    const response = await fetch(`/api/chess-engine?${params.toString()}`, {
      cache: 'no-store',
    });

    if (!response.ok) return null;

    const payload = (await response.json()) as { bestmove?: string };
    return typeof payload.bestmove === 'string' ? payload.bestmove : null;
  } catch {
    return null;
  }
}

export default function YorChess() {
  const [game, setGame] = useState(() => new ChessCtor());
  const [sel, setSel] = useState<string | null>(null);
  const [poss, setPoss] = useState<string[]>([]);
  const [flipped, setFlipped] = useState(false);
  const [aiDepth, setAiDepth] = useState(14);
  const [lf, setLf] = useState<string | null>(null);
  const [lt, setLt] = useState<string | null>(null);
  const [oppFrom, setOppFrom] = useState<string | null>(null);
  const [oppTo, setOppTo] = useState<string | null>(null);
  const [oppSan, setOppSan] = useState<string | null>(null);
  const [gameOver, setGameOver] = useState(false);
  const [hist, setHist] = useState<string[]>([]);
  const [scores, setScores] = useState({ w: 0, l: 0, d: 0 });
  const [statusIcon, setStatusIcon] = useState('⚔');
  const [statusText, setStatusText] = useState('Your Move — White to play');
  const [statusDim, setStatusDim] = useState(false);
  const [botThinking, setBotThinking] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const [endOpen, setEndOpen] = useState(false);
  const [endGlyph, setEndGlyph] = useState('♔');
  const [endTitle, setEndTitle] = useState('Victory');
  const [endBody, setEndBody] = useState('You have emerged triumphant.');
  const [capYou, setCapYou] = useState<PieceGlyphKey[]>([]);
  const [capBot, setCapBot] = useState<PieceGlyphKey[]>([]);
  const [promotionResolve, setPromotionResolve] = useState<((p: string) => void) | null>(null);

  // Feature 1: Move animation state
  const [animPiece, setAnimPiece] = useState<{
    pieceCode: PieceGlyphKey;
    fromCol: number;
    fromRow: number;
    toCol: number;
    toRow: number;
  } | null>(null);
  const [animActive, setAnimActive] = useState(false);
  const [animHideSq, setAnimHideSq] = useState<string | null>(null);
  const isAnimatingRef = useRef(false);

  // Feature 4: Hint state
  const [hintFrom, setHintFrom] = useState<string | null>(null);
  const [hintTo, setHintTo] = useState<string | null>(null);
  const [hintLoading, setHintLoading] = useState(false);

  // Feature 5: Post-game analysis
  const [endMoveCount, setEndMoveCount] = useState(0);

  // Feature 6: Blitz timer
  const [blitzEnabled, setBlitzEnabled] = useState(false);
  const [timeW, setTimeW] = useState(300);
  const [timeB, setTimeB] = useState(300);
  const [timerActive, setTimerActive] = useState(false);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const gameRef = useRef(game);
  useEffect(() => { gameRef.current = game; }, [game]);

  const rr = useMemo(() => getRanks(flipped), [flipped]);
  const ff = useMemo(() => getFiles(flipped), [flipped]);

  // Feature 2: Identify current opening from move history
  const currentOpening = useMemo(() => {
    const moveStr = hist.join(' ');
    if (!moveStr) return null;
    let bestKey = '';
    let bestName = '';
    for (const [key, name] of Object.entries(OPENINGS)) {
      if (
        (moveStr === key || moveStr.startsWith(key + ' ')) &&
        key.length > bestKey.length
      ) {
        bestKey = key;
        bestName = name;
      }
    }
    return bestName || null;
  }, [hist]);

  // Feature 6: Timer countdown
  useEffect(() => {
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    if (!blitzEnabled || gameOver || !timerActive) return;

    timerIntervalRef.current = setInterval(() => {
      const turn = gameRef.current.turn();
      if (turn === 'w') {
        setTimeW(t => Math.max(0, t - 1));
      } else {
        setTimeB(t => Math.max(0, t - 1));
      }
    }, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [blitzEnabled, gameOver, timerActive]);

  // Feature 6: White runs out of time
  useEffect(() => {
    if (!blitzEnabled || !timerActive || gameOver || timeW > 0) return;
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setGameOver(true);
    const mc = gameRef.current.history().length;
    setEndMoveCount(mc);
    setEndGlyph('♚');
    setEndTitle('Time Out');
    setEndBody('White flagged — Black wins on time!');
    setScores(s => ({ ...s, l: s.l + 1 }));
    setTimeout(() => setEndOpen(true), 300);
  }, [timeW, blitzEnabled, timerActive, gameOver]);

  // Feature 6: Black runs out of time
  useEffect(() => {
    if (!blitzEnabled || !timerActive || gameOver || timeB > 0) return;
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    setGameOver(true);
    const mc = gameRef.current.history().length;
    setEndMoveCount(mc);
    setEndGlyph('♔');
    setEndTitle('Time Out');
    setEndBody('Black flagged — You win on time!');
    setScores(s => ({ ...s, w: s.w + 1 }));
    setTimeout(() => setEndOpen(true), 300);
  }, [timeB, blitzEnabled, timerActive, gameOver]);

  function setSt(ic: string, tx: string, dim = false) {
    setStatusIcon(ic);
    setStatusText(tx);
    setStatusDim(dim);
  }

  function kingSquare(color: Side) {
    const b = game.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const p = b[r][c];
        if (p && p.type === 'k' && p.color === color) return p.square;
      }
    }
    return null;
  }

  function updateCaptures(g: ChessInstance) {
    const h = g.history({ verbose: true });
    const cw: PieceGlyphKey[] = [];
    const cb: PieceGlyphKey[] = [];
    for (const m of h) {
      if (m.captured) {
        const k = ((m.color === 'w' ? 'b' : 'w') + String(m.captured).toUpperCase()) as PieceGlyphKey;
        (m.color === 'w' ? cw : cb).push(k);
      }
    }
    setCapYou(cw);
    setCapBot(cb);
  }

  function renderLog() {
    const rows: JSX.Element[] = [];
    for (let i = 0; i < hist.length; i += 2) {
      rows.push(
        <div className="log-row" key={i}>
          <span className="lg-n">{i / 2 + 1}.</span>
          <span className="lg-w">{hist[i] || ''}</span>
          <span className="lg-b">{hist[i + 1] || ''}</span>
        </div>,
      );
    }
    return rows;
  }

  async function askPromo(_color: Side): Promise<string> {
    setPromoOpen(true);
    return new Promise((resolve) => {
      setPromotionResolve(() => resolve);
    });
  }

  function finishPromotion(choice: string) {
    setPromoOpen(false);
    promotionResolve?.(choice);
    setPromotionResolve(null);
  }

  function checkEnd(g: ChessInstance) {
    if (!g.game_over()) {
      if (g.in_check()) setSt('⚠', g.turn() === 'w' ? 'Check! Protect your king.' : 'Bot king threatened.');
      return false;
    }

    setGameOver(true);
    const mc = g.history().length;
    setEndMoveCount(mc);

    let gsym = '♔';
    let title = 'Victory';
    let body = 'You have emerged triumphant.';

    if (g.in_checkmate()) {
      if (g.turn() === 'b') {
        gsym = '♔';
        title = 'Victory';
        body = 'Checkmate! You defeated YorAyriniwnl.';
        setScores((s) => ({ ...s, w: s.w + 1 }));
      } else {
        gsym = '♚';
        title = 'Defeated';
        body = 'YorAyriniwnl delivers checkmate. The engine prevails.';
        setScores((s) => ({ ...s, l: s.l + 1 }));
      }
    } else {
      gsym = '⚖';
      title = 'Draw';
      body = g.in_stalemate()
        ? 'Stalemate — a balanced end.'
        : g.in_threefold_repetition()
          ? 'Draw by threefold repetition.'
          : g.insufficient_material()
            ? 'Insufficient material to checkmate.'
            : 'Draw by the 50-move rule.';
      setScores((s) => ({ ...s, d: s.d + 1 }));
    }

    setSt(gsym, title);
    setEndGlyph(gsym);
    setEndTitle(title);
    setEndBody(body);
    setTimeout(() => setEndOpen(true), 700);
    return true;
  }

  function randomMove(g: ChessInstance) {
    const mvs = g.moves({ verbose: true });
    if (!mvs.length) return null;
    return g.move(mvs[Math.floor(Math.random() * mvs.length)]);
  }

  async function botMove(nextGame: ChessInstance) {
    const fen = nextGame.fen();
    const bestMove = await requestEngineBestMove(fen, aiDepth);

    if (bestMove) {
      const fm = bestMove.slice(0, 2);
      const tm = bestMove.slice(2, 4);
      const pr = (bestMove[4] || 'q') as 'q' | 'r' | 'b' | 'n';
      const mv = nextGame.move({ from: fm, to: tm, promotion: pr });
      if (mv) return mv;
    }

    return randomMove(nextGame);
  }

  // Feature 1: Animate a piece sliding from source to destination square
  async function animateMove(from: string, to: string, pk: PieceGlyphKey) {
    const fromPos = squareToGrid(from, flipped);
    const toPos = squareToGrid(to, flipped);

    isAnimatingRef.current = true;
    setAnimHideSq(from);
    setAnimPiece({
      pieceCode: pk,
      fromCol: fromPos.col,
      fromRow: fromPos.row,
      toCol: toPos.col,
      toRow: toPos.row,
    });
    setAnimActive(false);

    // Two animation frames so the browser paints at the start position first
    await new Promise<void>(r => requestAnimationFrame(() => requestAnimationFrame(() => r())));
    setAnimActive(true);

    // Wait for the 200ms CSS transition to complete
    await new Promise(r => setTimeout(r, 230));

    setAnimPiece(null);
    setAnimActive(false);
    setAnimHideSq(null);
    isAnimatingRef.current = false;
  }

  async function playerMove(from: string, to: string) {
    let pro: string | undefined;
    const p = game.get(from);
    if (p && p.type === 'p') {
      const tr = to[1];
      if ((p.color === 'w' && tr === '8') || (p.color === 'b' && tr === '1')) {
        pro = await askPromo(p.color as Side);
      }
    }

    const next = new ChessCtor(game.fen());
    const mv = next.move({ from, to, promotion: (pro || 'q') as 'q' | 'r' | 'b' | 'n' });
    if (!mv) return;

    // Feature 1: animate the player's piece
    if (p) {
      await animateMove(from, to, pieceKey(p.color, p.type));
    }

    setGame(next);
    gameRef.current = next;
    setLf(from);
    setLt(to);
    setHist((h) => [...h, mv.san]);
    setSel(null);
    setPoss([]);
    setTimerActive(true); // Feature 6: start timer on first move
    updateCaptures(next);
    if (checkEnd(next)) return;

    setSt('⏳', 'Thinking…', true);
    setBotThinking(true);

    await new Promise((r) => setTimeout(r, 320));

    const botGame = new ChessCtor(next.fen());
    const botMv = await botMove(botGame);
    setBotThinking(false);

    if (botMv) {
      // Feature 1: animate the bot's piece (from the board state in `next`)
      const botPiece = next.get(String(botMv.from));
      if (botPiece) {
        await animateMove(String(botMv.from), String(botMv.to), pieceKey(botPiece.color, botPiece.type));
      }

      const after = new ChessCtor(botGame.fen());
      setGame(after);
      gameRef.current = after;
      setLf(String(botMv.from));
      setLt(String(botMv.to));
      setOppFrom(String(botMv.from));
      setOppTo(String(botMv.to));
      setOppSan(String(botMv.san));
      setHist((h) => [...h, botMv.san]);
      updateCaptures(after);
      if (!checkEnd(after)) setSt('⚔', 'Your Move — White to play');
    } else {
      setGame(botGame);
      gameRef.current = botGame;
      updateCaptures(botGame);
      if (!checkEnd(botGame)) setSt('⚔', 'Your Move — White to play');
    }
  }

  async function onSq(sq: string) {
    if (gameOver || game.turn() !== 'w' || isAnimatingRef.current) return;

    // Feature 4: clear hint on any board interaction
    setHintFrom(null);
    setHintTo(null);

    if (sel) {
      if (poss.includes(sq)) {
        await playerMove(sel, sq);
        return;
      }
      setSel(null);
      setPoss([]);
    }

    const p = game.get(sq);
    if (p && p.color === 'w') {
      setSel(sq);
      setPoss(game.moves({ square: sq, verbose: true }).map((m: ChessMove) => m.to));
    }
  }

  function newGame() {
    const g = new ChessCtor();
    setGame(g);
    gameRef.current = g;
    setSel(null);
    setPoss([]);
    setLf(null);
    setLt(null);
    setOppFrom(null);
    setOppTo(null);
    setOppSan(null);
    setGameOver(false);
    setHist([]);
    setEndOpen(false);
    setBotThinking(false);
    setSt('⚔', 'Your Move — White to play');
    updateCaptures(g);
    // Reset new feature states
    setHintFrom(null);
    setHintTo(null);
    setAnimPiece(null);
    setAnimActive(false);
    setAnimHideSq(null);
    isAnimatingRef.current = false;
    setTimeW(300);
    setTimeB(300);
    setTimerActive(false);
    setEndMoveCount(0);
  }

  function undoMove() {
    if (gameOver || isAnimatingRef.current) return;
    const g = new ChessCtor(game.fen());
    g.undo();
    g.undo();
    setGame(g);
    gameRef.current = g;
    setHist((h) => (h.length >= 2 ? h.slice(0, -2) : []));
    setLf(null);
    setLt(null);
    setOppFrom(null);
    setOppTo(null);
    setOppSan(null);
    setSel(null);
    setPoss([]);
    setHintFrom(null);
    setHintTo(null);
    setSt('⚔', 'Your Move — White to play');
    updateCaptures(g);
  }

  function flipBoard() {
    setFlipped((f) => !f);
  }

  function setDepth(d: number) {
    setAiDepth(d);
  }

  // Feature 4: Fetch a hint from Stockfish (medium depth), highlight squares
  async function getHint() {
    if (gameOver || game.turn() !== 'w' || hintLoading || isAnimatingRef.current) return;
    setHintLoading(true);
    const bestMove = await requestEngineBestMove(game.fen(), 12);

    if (bestMove) {
      setHintFrom(bestMove.slice(0, 2));
      setHintTo(bestMove.slice(2, 4));
    } else {
      setHintFrom(null);
      setHintTo(null);
    }

    setHintLoading(false);
  }

  // Feature 6: Toggle blitz mode
  function toggleBlitz() {
    setBlitzEnabled(e => !e);
    setTimeW(300);
    setTimeB(300);
    setTimerActive(false);
  }

  const checkSq = game.in_check() ? kingSquare(game.turn() as Side) : null;
  const scoreTotal = scores.w + scores.l + scores.d;
  const fillWidth = scoreTotal > 0 ? Math.round((scores.w / scoreTotal) * 100) : 50;
  const oppMoveText = oppFrom && oppTo
    ? `Last bot move: ${oppFrom} → ${oppTo}${oppSan ? ` (${oppSan})` : ''}`
    : 'Last bot move: waiting for first response';

  // Feature 5: Material calculations for post-game analysis
  const matW = materialValue(capYou);
  const matB = materialValue(capBot);
  const matDiff = matW - matB;
  const advantageStr =
    matDiff === 0
      ? 'Equal material'
      : matDiff > 0
        ? `White +${matDiff}.0 material`
        : `Black +${-matDiff}.0 material`;

  useEffect(() => {
    updateCaptures(game);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="yor-chess-root">
      <style>{`
:root{--gold:#C9A84C;--gold-bright:#F0CF6A;--gold-dim:#8B6E2E;--gold-dark:#3E2C10;--sq-light:#EDD9A0;--sq-dark:#7A3D1C;--text:#F0E4C0;--text-mid:#A89060;--text-muted:#6A5030;}
      `}</style>
      <style>{`
.yor-chess-root {
  min-height: 100vh;
  width: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  isolation: isolate;
}

.yor-chess-root::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: 0;
  background:
    radial-gradient(ellipse 90% 55% at 50% -5%, rgba(100, 55, 8, 0.22) 0%, transparent 70%),
    radial-gradient(ellipse 100% 100% at 50% 50%, transparent 35%, rgba(0, 0, 0, 0.75) 100%),
    repeating-conic-gradient(#090604 0% 25%, #0b0805 0% 50%) 0 0 / 22px 22px;
  pointer-events: none;
}

.damask {
  position: fixed;
  inset: 0;
  z-index: 0;
  opacity: 0.04;
  pointer-events: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='90' height='90'%3E%3Cpath d='M45 8 L56 32 L82 32 L60 48 L68 72 L45 56 L22 72 L30 48 L8 32 L34 32Z' fill='%23C9A84C'/%3E%3Cpath d='M45 82 L38 65 L20 65 L33 55 L28 38 L45 48 L62 38 L57 55 L70 65 L52 65Z' fill='%23C9A84C' opacity='.45'/%3E%3C/svg%3E");
}

header {
  position: relative;
  z-index: 10;
  text-align: center;
  padding: 40px 20px 26px;
  width: 100%;
  animation: fadeUp .7s ease both;
}

.hd-crest {
  font-size: 2rem;
  line-height: 1;
  margin-bottom: 12px;
  background: linear-gradient(180deg, #f5d878 0%, #c9a84c 50%, #7a5010 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  filter: drop-shadow(0 0 16px rgba(201, 168, 76, .55));
  animation: glowPulse 3.5s ease-in-out infinite;
}

@keyframes glowPulse {
  0%, 100% { filter: drop-shadow(0 0 10px rgba(201, 168, 76, .4)); }
  50% { filter: drop-shadow(0 0 28px rgba(201, 168, 76, .85)); }
}

.hd-title {
  font-family: 'Playfair Display', serif;
  font-size: clamp(2.4rem, 7vw, 4.2rem);
  font-weight: 900;
  font-style: italic;
  letter-spacing: .06em;
  line-height: 1;
  background: linear-gradient(180deg, #f8dc80 0%, #c9a84c 40%, #ecc94a 70%, #9b720e 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.hd-rule {
  display: flex;
  align-items: center;
  gap: 18px;
  margin: 14px auto 0;
  width: min(520px, 90vw);
}

.hd-rule span {
  flex: 1;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--gold-dim), transparent);
}

.hd-sub {
  font-family: 'Cinzel', serif;
  font-size: .62rem;
  letter-spacing: .42em;
  color: var(--gold-dim);
  text-transform: uppercase;
  white-space: nowrap;
}

.game-wrap {
  position: relative;
  z-index: 10;
  display: flex;
  gap: 26px;
  align-items: flex-start;
  justify-content: center;
  flex-wrap: wrap;
  width: 100%;
  max-width: 1080px;
  padding: 0 18px 48px;
  animation: fadeUp .7s .15s ease both;
}

@keyframes fadeUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.side-panel,
.right-panel {
  display: flex;
  flex-direction: column;
  gap: 13px;
  flex: 0 0 196px;
  min-width: 158px;
}

.side-panel {
  flex-basis: 192px;
  min-width: 155px;
}

.player-card {
  background: linear-gradient(150deg, #1f1709 0%, #150f04 55%, #1b1408 100%);
  border: 1px solid rgba(201, 168, 76, .18);
  border-radius: 14px;
  padding: 18px 16px;
  position: relative;
  overflow: hidden;
  transition: border-color .4s, box-shadow .4s;
}

.player-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: linear-gradient(90deg, transparent, var(--gold), transparent);
  opacity: 0;
  transition: opacity .4s;
}

.player-card::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(ellipse at top center, rgba(201, 168, 76, .07) 0%, transparent 65%);
  opacity: 0;
  transition: opacity .4s;
}

.player-card.active {
  border-color: rgba(201, 168, 76, .5);
  box-shadow: 0 0 28px rgba(201, 168, 76, .12), inset 0 1px 0 rgba(201, 168, 76, .08);
}

.player-card.active::before,
.player-card.active::after {
  opacity: 1;
}

.pc-top {
  display: flex;
  align-items: center;
  gap: 11px;
  margin-bottom: 12px;
}

.pc-av {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1.5px solid var(--gold-dim);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.3rem;
  background: linear-gradient(135deg, #2b1d08, #160e04);
  flex-shrink: 0;
  box-shadow: 0 0 0 1px rgba(201, 168, 76, .12);
}

.pc-name {
  font-family: 'Playfair Display', serif;
  font-size: .87rem;
  font-weight: 700;
  color: var(--gold-bright);
  line-height: 1.2;
}

.pc-role {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-size: .72rem;
  color: var(--text-muted);
  margin-top: 1px;
}

.pc-sep {
  height: 1px;
  background: linear-gradient(90deg, transparent, rgba(201, 168, 76, .18), transparent);
  margin-bottom: 11px;
}

.pc-col {
  display: flex;
  align-items: center;
  gap: 7px;
  font-family: 'Cinzel', serif;
  font-size: .58rem;
  letter-spacing: .18em;
  color: var(--text-muted);
  text-transform: uppercase;
}

.col-dot {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, .15);
  flex-shrink: 0;
}

.col-dot.w {
  background: radial-gradient(circle at 35% 35%, #f8f0d8, #d0c8a0);
}

.col-dot.b {
  background: radial-gradient(circle at 35% 35%, #3a2810, #1a1006);
}

.pc-think {
  display: none;
  align-items: center;
  gap: 6px;
  margin-top: 9px;
  font-family: 'Cinzel', serif;
  font-size: .55rem;
  letter-spacing: .18em;
  color: var(--gold-dim);
}

.pc-think.on {
  display: flex;
}

.td {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--gold);
  animation: tdBounce 1.1s ease-in-out infinite;
}

.td:nth-child(2) { animation-delay: .2s; }
.td:nth-child(3) { animation-delay: .4s; }

@keyframes tdBounce {
  0%, 80%, 100% {
    transform: translateY(0);
    opacity: .25;
  }
  40% {
    transform: translateY(-5px);
    opacity: 1;
  }
}

.vs-div {
  text-align: center;
  padding: 3px 0;
  font-family: 'Playfair Display', serif;
  font-size: .75rem;
  color: var(--gold-dim);
  letter-spacing: .2em;
  position: relative;
}

.vs-div::before,
.vs-div::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 33%;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--gold-dark));
}

.vs-div::before { left: 0; }

.vs-div::after {
  right: 0;
  background: linear-gradient(270deg, transparent, var(--gold-dark));
}

.log-card,
.stat-card,
.score-card,
.dep-card,
.blitz-card {
  background: linear-gradient(150deg, #1b1508, #111007);
  border: 1px solid rgba(201, 168, 76, .18);
  border-radius: 14px;
  position: relative;
  overflow: hidden;
}

.log-card {
  padding: 14px;
  flex: 1;
}

.stat-card,
.score-card,
.dep-card {
  padding: 18px 14px;
  text-align: center;
}

.score-card {
  padding: 15px;
}

.dep-card {
  padding: 15px;
}

.stat-card::before {
  content: '';
  position: absolute;
  top: 0;
  left: -100%;
  width: 70%;
  height: 100%;
  background: linear-gradient(90deg, transparent, rgba(201, 168, 76, .04), transparent);
  animation: sheen 4.5s ease-in-out infinite;
}

@keyframes sheen {
  to { left: 200%; }
}

.log-hd,
.sc-hd,
.dep-hd {
  font-family: 'Cinzel', serif;
  font-size: .58rem;
  letter-spacing: .24em;
  color: var(--text-muted);
  text-transform: uppercase;
  margin-bottom: 11px;
  text-align: center;
}

.log-hd {
  font-size: .6rem;
  letter-spacing: .28em;
  padding-bottom: 8px;
  border-bottom: 1px solid rgba(201, 168, 76, .1);
  margin-bottom: 10px;
  text-align: left;
}

.log-body {
  max-height: 195px;
  overflow-y: auto;
}

.log-body::-webkit-scrollbar {
  width: 3px;
}

.log-body::-webkit-scrollbar-thumb {
  background: var(--gold-dark);
  border-radius: 2px;
}

.log-row {
  display: grid;
  grid-template-columns: 22px 52px 52px;
  gap: 2px;
  padding: 3px 4px;
  border-radius: 4px;
  font-size: .8rem;
  font-family: 'Cormorant Garamond', serif;
  transition: background .12s;
}

.log-row:hover {
  background: rgba(201, 168, 76, .07);
}

.lg-n { color: var(--text-muted); }
.lg-w { color: var(--text); }
.lg-b { color: var(--text-mid); }

.board-sec {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
}

.board-orn {
  position: relative;
  padding: 9px;
  background: linear-gradient(145deg, #2c1b07, #1b0e03, #2c1b07);
  border-radius: 6px;
  box-shadow:
    0 0 0 1px rgba(201, 168, 76, .12),
    0 0 0 3px #0c0803,
    0 0 0 5px rgba(201, 168, 76, .38),
    0 55px 130px rgba(0, 0, 0, .92),
    0 12px 40px rgba(0, 0, 0, .7);
}

.corn {
  position: absolute;
  width: 20px;
  height: 20px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: .82rem;
  color: var(--gold);
  text-shadow: 0 0 10px rgba(201, 168, 76, .7);
  z-index: 5;
}

.corn.tl { top: 2px; left: 2px; }
.corn.tr { top: 2px; right: 2px; }
.corn.bl { bottom: 2px; left: 2px; }
.corn.br { bottom: 2px; right: 2px; }

.board-frame {
  position: relative;
  background:
    repeating-linear-gradient(91deg, rgba(255, 255, 255, 0) 0px, rgba(255, 255, 255, .016) 1px, rgba(255, 255, 255, 0) 2px, rgba(255, 255, 255, 0) 14px),
    linear-gradient(162deg, #4c2812 0%, #7e4828 18%, #5a2e16 35%, #8c5632 52%, #5a2e16 68%, #7e4828 84%, #4c2812 100%);
  padding: 26px;
  border-radius: 3px;
  box-shadow: inset 0 2px 5px rgba(255, 200, 100, .07), inset 0 -2px 4px rgba(0, 0, 0, .45);
}

.brd-wrap {
  display: grid;
  grid-template-columns: 15px 1fr;
  grid-template-rows: 1fr 15px;
}

.rank-lbs {
  grid-column: 1;
  grid-row: 1;
  display: flex;
  flex-direction: column;
}

.file-lbs {
  grid-column: 2;
  grid-row: 2;
  display: flex;
}

.rank-lbs span,
.file-lbs span {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Cinzel', serif;
  font-size: .52rem;
  color: rgba(201, 168, 76, .42);
  user-select: none;
}

.ch-grid {
  grid-column: 2;
  grid-row: 1;
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  grid-template-rows: repeat(8, 1fr);
  width: min(464px, 80vw);
  height: min(464px, 80vw);
  border: 1px solid rgba(201, 168, 76, .22);
  box-shadow: inset 0 0 35px rgba(0, 0, 0, .28);
}

.sq {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  overflow: hidden;
  transition: filter .1s;
  user-select: none;
}

.sq.lt {
  background:
    repeating-linear-gradient(90deg, rgba(0, 0, 0, 0) 0, rgba(0, 0, 0, .013) 1px, rgba(0, 0, 0, 0) 2px, rgba(0, 0, 0, 0) 11px),
    linear-gradient(135deg, #f4e6c0 0%, #edd9a0 52%, #f2e2b5 100%);
}

.sq.dk {
  background:
    repeating-linear-gradient(90deg, rgba(255, 255, 255, 0) 0, rgba(255, 255, 255, .014) 1px, rgba(255, 255, 255, 0) 2px, rgba(255, 255, 255, 0) 10px),
    linear-gradient(135deg, #7b3e1e 0%, #8d4c26 52%, #7b3e1e 100%);
}

.sq::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  transition: background .12s;
}

.sq.lf::after { background: rgba(230, 195, 28, .22); }
.sq.lt2::after { background: rgba(230, 195, 28, .38); }
.sq.sel::after { background: rgba(255, 215, 25, .44); }

.sq.chk::after {
  background: radial-gradient(circle, rgba(220, 30, 30, .7) 0%, rgba(180, 20, 20, .4) 52%, transparent 82%);
  animation: chkPulse 1s ease-in-out infinite;
}

@keyframes chkPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: .5; }
}

.sq.poss:not(.has-pc)::before {
  content: '';
  position: absolute;
  width: 31%;
  height: 31%;
  border-radius: 50%;
  background: rgba(35, 165, 35, .52);
  z-index: 3;
  box-shadow: 0 0 8px rgba(40, 200, 40, .3);
}

.sq.poss.has-pc::before {
  content: '';
  position: absolute;
  inset: 2px;
  border-radius: 2px;
  border: 3px solid rgba(40, 185, 40, .58);
  z-index: 3;
  background: transparent;
}

.sq:hover { filter: brightness(1.13); }
.sq.sel { filter: brightness(1.09); }

.st-ic {
  font-size: 1.5rem;
  margin-bottom: 7px;
}

.st-tx {
  font-family: 'Cinzel', serif;
  font-size: .68rem;
  letter-spacing: .12em;
  color: var(--gold-bright);
  line-height: 1.55;
}

.st-tx.dim {
  color: var(--gold-dim);
}

.sc-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 7px;
  font-family: 'Cormorant Garamond', serif;
  font-size: .82rem;
  color: var(--text-mid);
}

.sc-n { flex: 1; }

.sc-v {
  font-family: 'Playfair Display', serif;
  font-weight: 700;
  color: var(--gold);
}

.sc-track {
  height: 4px;
  background: rgba(201, 168, 76, .1);
  border-radius: 2px;
  overflow: hidden;
  margin-top: 6px;
}

.sc-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--gold-dark), var(--gold));
  border-radius: 2px;
  transition: width .9s ease;
}

.ctrls {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.btn,
.mbt,
.dep-btn {
  font-family: 'Cinzel', serif;
  font-size: .65rem;
  letter-spacing: .2em;
  text-transform: uppercase;
  padding: 11px 14px;
  border-radius: 7px;
  border: 1px solid var(--gold-dark);
  background: linear-gradient(155deg, #201708, #130d05);
  color: var(--text-mid);
  cursor: pointer;
  transition: all .2s;
  width: 100%;
  text-align: left;
  display: flex;
  align-items: center;
  gap: 9px;
  position: relative;
  overflow: hidden;
}

.btn::after,
.mbt::after {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(201, 168, 76, .08), transparent);
  opacity: 0;
  transition: opacity .2s;
}

.btn:hover,
.mbt:hover {
  border-color: var(--gold-dim);
  color: var(--text);
  box-shadow: 0 0 18px rgba(201, 168, 76, .12);
}

.btn:hover::after,
.mbt:hover::after {
  opacity: 1;
}

.btn:active,
.mbt:active {
  transform: scale(.97);
}

.btn.pr,
.mbt.pr {
  border-color: rgba(201, 168, 76, .45);
  background: linear-gradient(155deg, #2c1c08, #1b0f05);
  color: var(--gold-bright);
}

.btn.pr:hover,
.mbt.pr:hover {
  border-color: var(--gold);
  box-shadow: 0 0 26px rgba(201, 168, 76, .2);
}

.btn:disabled,
.dep-btn:disabled {
  opacity: .55;
  cursor: not-allowed;
  box-shadow: none;
}

.btn:disabled::after {
  display: none;
}

.bi { font-size: 1rem; }

.dep-btns {
  display: flex;
  gap: 6px;
}

.dep-btn {
  flex: 1;
  font-size: .6rem;
  letter-spacing: .1em;
  padding: 7px 4px;
  border-radius: 6px;
  border: 1px solid rgba(201, 168, 76, .14);
  background: transparent;
  color: var(--text-muted);
  justify-content: center;
}

.dep-btn:hover {
  border-color: var(--gold-dim);
  color: var(--text-mid);
}

.dep-btn.on {
  background: linear-gradient(135deg, #2c1c08, #1a1004);
  border-color: var(--gold-dim);
  color: var(--gold-bright);
  box-shadow: 0 0 10px rgba(201, 168, 76, .1);
}

.dep-wr {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-size: .65rem;
  color: var(--text-muted);
  text-align: center;
  margin-top: 9px;
}

.overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(2, 1, 0, .87);
  backdrop-filter: blur(9px);
  opacity: 0;
  pointer-events: none;
  transition: opacity .45s;
}

.overlay.show {
  opacity: 1;
  pointer-events: all;
}

.modal {
  background: linear-gradient(158deg, #251a07, #160f04, #1d1507);
  border: 1px solid rgba(201, 168, 76, .42);
  border-radius: 18px;
  padding: 44px 50px;
  text-align: center;
  max-width: 410px;
  width: 92%;
  box-shadow:
    0 0 0 1px rgba(201, 168, 76, .1),
    0 0 80px rgba(201, 168, 76, .18),
    0 60px 100px rgba(0, 0, 0, .85);
  transform: scale(.9) translateY(22px);
  transition: transform .5s cubic-bezier(.34, 1.56, .64, 1);
  position: relative;
  overflow: hidden;
}

.modal::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--gold), transparent);
}

.overlay.show .modal {
  transform: scale(1) translateY(0);
}

.mo-gl {
  font-size: 3.8rem;
  line-height: 1;
  margin-bottom: 14px;
}

.mo-ti {
  font-family: 'Playfair Display', serif;
  font-size: 1.85rem;
  font-weight: 900;
  font-style: italic;
  background: linear-gradient(180deg, #f0cf6a, #c9a84c);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  margin-bottom: 8px;
}

.mo-bo {
  font-family: 'Cormorant Garamond', serif;
  font-style: italic;
  font-size: 1rem;
  color: var(--text-muted);
  margin-bottom: 26px;
  line-height: 1.65;
}

.mo-rule {
  height: 1px;
  background: linear-gradient(90deg, transparent, var(--gold-dark), transparent);
  margin-bottom: 24px;
}

.mo-btns {
  display: flex;
  gap: 10px;
  justify-content: center;
  flex-wrap: wrap;
}

.mbt {
  width: auto;
  text-align: center;
  padding: 11px 26px;
}

.pro-row {
  display: flex;
  gap: 13px;
  justify-content: center;
  margin: 16px 0 26px;
}

.pro-pc {
  width: 66px;
  height: 66px;
  background: linear-gradient(145deg, #2c1e08, #1a1004);
  border: 1px solid var(--gold-dark);
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all .2s;
}

.pro-pc:hover {
  border-color: var(--gold);
  box-shadow: 0 0 22px rgba(201, 168, 76, .28);
  transform: scale(1.07) translateY(-2px);
}

@media (max-width: 880px) {
  .side-panel,
  .right-panel {
    flex: 0 0 155px;
    min-width: 140px;
  }
}

@media (max-width: 680px) {
  .game-wrap {
    gap: 14px;
    padding: 0 10px 30px;
  }

  .side-panel,
  .right-panel {
    flex: 0 0 100%;
    flex-direction: row;
    flex-wrap: wrap;
  }

  .player-card {
    flex: 1;
    min-width: 142px;
  }

  .log-card {
    flex: 1 0 100%;
  }

  .log-body {
    max-height: 115px;
  }

  .right-panel {
    order: 3;
  }
}
      `}</style>
      <style>{`
.yor-chess-root {
  min-height: 100%;
  --board-size: min(576px, 82vw, 70dvh);
}

.yor-chess-root > header {
  display: none;
  padding: 4px 10px 2px;
}

.yor-chess-root .hd-crest {
  display: none;
}

.yor-chess-root .hd-title {
  font-size: clamp(1.2rem, 2.6vw, 1.7rem);
  line-height: 1;
}

.yor-chess-root .hd-rule {
  display: none;
}

.yor-chess-root .game-wrap {
  padding: 0 12px 14px;
  gap: 16px;
  align-items: stretch;
}

.yor-chess-root .ch-grid {
  width: var(--board-size);
  height: var(--board-size);
}

@media (max-width: 880px) {
  .yor-chess-root {
    --board-size: min(540px, 90vw, 66dvh);
  }

  .yor-chess-root .ch-grid {
    width: var(--board-size);
    height: var(--board-size);
  }
}

@media (max-width: 680px) {
  .yor-chess-root {
    --board-size: min(460px, 94vw, 58dvh);
  }

  .yor-chess-root > header {
    padding: 2px 8px 0;
  }

  .yor-chess-root .game-wrap {
    gap: 10px;
    padding: 0 8px 10px;
  }

  .yor-chess-root .ch-grid {
    width: var(--board-size);
    height: var(--board-size);
  }

  .yor-chess-root .log-body {
    max-height: 90px;
  }
}

@media (max-height: 760px) {
  .yor-chess-root {
    --board-size: min(430px, 80vw, 54dvh);
  }

  .yor-chess-root > header {
    padding-top: 2px;
    padding-bottom: 0;
  }

  .yor-chess-root .ch-grid {
    width: var(--board-size);
    height: var(--board-size);
  }
}
      `}</style>
      <style>{`
.pw {
  padding: 0;
}

.pw::after {
  content: '';
  position: absolute;
  left: 20%;
  right: 20%;
  bottom: 5%;
  height: 12%;
  border-radius: 999px;
  background: radial-gradient(circle, rgba(0, 0, 0, 0.2) 0%, rgba(0, 0, 0, 0) 72%);
  z-index: -1;
  pointer-events: none;
}

.lux-piece {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  line-height: 1;
  isolation: isolate;
  font-family: "Noto Sans Symbols 2", "Segoe UI Symbol", "Apple Symbols", "Arial Unicode MS", "DejaVu Sans", serif;
  transform: none;
  transition: transform 180ms cubic-bezier(.22,1,.36,1), filter 180ms cubic-bezier(.22,1,.36,1);
}

.lux-piece > span {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  font-size: min(3rem, 90%);
  line-height: .86;
}

.lux-piece--capture {
  width: 24px;
  height: 24px;
}

.lux-piece--capture > span {
  font-size: 1.3rem;
}

.lux-piece--promotion > span {
  font-size: 2.28rem;
}

.lux-piece__shadow {
  transform: translateY(8%) scale(1.04);
  color: rgba(20, 10, 4, 0.3);
  filter: blur(0.6px);
}

.is-black .lux-piece__shadow {
  color: rgba(8, 4, 1, 0.5);
}

.lux-piece__outline {
  transform: none;
  color: rgba(88, 48, 16, 0.85);
  text-shadow: 0 0 1px rgba(255, 246, 221, 0.12);
}

.is-black .lux-piece__outline {
  color: rgba(245, 210, 137, 0.72);
}

.lux-piece__metal,
.lux-piece__shine {
  color: transparent;
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
}

.is-white .lux-piece__metal {
  background-image: linear-gradient(180deg, #fffdf7 0%, #f7edd7 14%, #f6ddae 32%, #d89d39 58%, #fff7df 78%, #9b6718 100%);
}

.is-black .lux-piece__metal {
  background-image: linear-gradient(180deg, #8a7255 0%, #342114 18%, #090604 44%, #4f3821 68%, #ca9442 84%, #f3d79b 100%);
}

.is-white .lux-piece__shine {
  background-image:
    radial-gradient(circle at 30% 18%, rgba(255, 255, 255, 0.6) 0%, rgba(255, 255, 255, 0) 40%);
  mix-blend-mode: screen;
  opacity: 0.6;
}

.is-black .lux-piece__shine {
  background-image:
    radial-gradient(circle at 34% 20%, rgba(255, 240, 196, 0.4) 0%, rgba(255, 240, 196, 0) 40%);
  mix-blend-mode: screen;
  opacity: 0.5;
}

.lux-piece__core {
  color: rgba(255, 250, 241, 0.08);
}

.is-black .lux-piece__core {
  color: rgba(255, 233, 186, 0.1);
}

.sq.dk .is-black .lux-piece__outline {
  color: rgba(250, 225, 172, 0.84);
}

.sq.dk .is-black .lux-piece__shine {
  opacity: 0.92;
}

.sq:hover .lux-piece {
  transform: translateY(-3px) scale(1.04);
  filter: drop-shadow(0 6px 10px rgba(0, 0, 0, 0.5));
}

.sq.sel .lux-piece {
  transform: translateY(-4px) scale(1.07);
  filter: drop-shadow(0 8px 14px rgba(0, 0, 0, 0.6)) drop-shadow(0 0 16px rgba(240, 207, 106, 0.15));
}

.pc-cap {
  margin-top: 12px;
  min-height: 36px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  letter-spacing: 0;
}

.pc-cap-chip {
  width: 30px;
  height: 30px;
  border-radius: 10px;
  display: grid;
  place-items: center;
  background: linear-gradient(145deg, rgba(249, 229, 178, 0.12), rgba(35, 21, 7, 0.18));
  border: 1px solid rgba(201, 168, 76, 0.22);
  box-shadow: inset 0 1px 0 rgba(255, 244, 216, 0.12), 0 8px 16px rgba(0, 0, 0, 0.22);
}

.pc-cap-empty {
  font-family: 'Cinzel', serif;
  font-size: 0.54rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(240, 228, 192, 0.34);
}

.pro-pc {
  overflow: hidden;
  box-shadow: inset 0 1px 0 rgba(255, 244, 216, 0.12), 0 18px 26px rgba(0, 0, 0, 0.26);
}

.pro-pc:hover .lux-piece {
  transform: translateY(-7%) scale(1.12);
  filter: drop-shadow(0 18px 24px rgba(0, 0, 0, 0.42)) drop-shadow(0 0 24px rgba(240, 207, 106, 0.22));
}
      `}</style>

      {/* ── Feature 1, 2, 4, 5, 6: New feature styles ─────────────── */}
      <style>{`
/* Feature 1: Move animation clone */
.anim-clone-wrap {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 20;
  overflow: hidden;
}
.anim-clone {
  position: absolute;
  width: 12.5%;
  height: 12.5%;
  left: 0;
  top: 0;
  will-change: transform;
  z-index: 20;
}
.anim-clone .lux-piece {
  filter: drop-shadow(0 10px 22px rgba(0,0,0,0.55)) drop-shadow(0 0 18px rgba(201,168,76,0.18));
  transform: translateY(-4%) scale(1.1);
}

/* Feature 2: Opening badge */
.opening-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding: 5px 16px;
  border-radius: 20px;
  background: rgba(201,168,76,0.08);
  border: 1px solid rgba(201,168,76,0.28);
  max-width: min(464px, 80vw);
  animation: fadeUp 0.35s ease both;
}
.ob-icon { font-size: 0.88rem; opacity: 0.65; }
.ob-name {
  font-family: 'Cinzel', serif;
  font-size: 0.58rem;
  letter-spacing: 0.2em;
  color: var(--gold-bright);
  text-transform: uppercase;
}

/* Feature 4: Hint square highlights */
.sq.hint-from::after {
  background: rgba(218,165,32,0.32) !important;
  box-shadow: inset 0 0 0 2px rgba(218,165,32,0.7);
}
.sq.hint-to::after {
  background: rgba(218,165,32,0.52) !important;
  box-shadow: inset 0 0 0 3px rgba(255,200,50,0.85);
  animation: hintPulse 1.1s ease-in-out infinite;
}
@keyframes hintPulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}

/* Feature 5: Post-game analysis panel */
.mo-analysis {
  background: rgba(201,168,76,0.06);
  border: 1px solid rgba(201,168,76,0.16);
  border-radius: 10px;
  padding: 12px 16px;
  margin-bottom: 22px;
  text-align: left;
}
.mo-arow {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-family: 'Cormorant Garamond', serif;
  font-size: 0.85rem;
  color: var(--text-mid);
  padding: 5px 0;
  border-bottom: 1px solid rgba(201,168,76,0.08);
}
.mo-arow:last-child { border-bottom: none; }
.mo-arow .mo-val {
  font-family: 'Playfair Display', serif;
  font-weight: 700;
  color: var(--gold);
}
.mo-advantage .mo-val { color: var(--gold-bright); }

/* Feature 6: Blitz clocks */
.pc-clock {
  font-family: 'Playfair Display', serif;
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text-muted);
  text-align: center;
  padding: 7px 0 2px;
  margin-top: 4px;
  letter-spacing: 0.04em;
  transition: color 0.3s, text-shadow 0.3s;
  border-top: 1px solid rgba(201,168,76,0.1);
}
.pc-clock.tc-run {
  color: var(--gold-bright);
  text-shadow: 0 0 14px rgba(240,207,106,0.45);
}
.pc-clock.tc-low {
  color: #e05050;
  text-shadow: 0 0 14px rgba(220,60,60,0.55);
  animation: clockWarn 0.8s ease-in-out infinite;
}
@keyframes clockWarn {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.55; }
}
.blitz-card {
  background: linear-gradient(150deg,#1B1508,#111007);
  border: 1px solid rgba(201,168,76,0.18);
  border-radius: 14px;
  padding: 13px 14px;
}
.blitz-toggle-btn {
  width: 100%;
  justify-content: center;
  font-size: 0.62rem;
  gap: 7px;
}

.sq.opp-from {
  box-shadow: inset 0 0 0 3px rgba(68, 174, 255, 0.65);
}

.sq.opp-to {
  box-shadow: inset 0 0 0 3px rgba(68, 174, 255, 0.78), inset 0 0 0 999px rgba(68, 174, 255, 0.18);
}

.opp-last-move {
  margin-top: 10px;
  width: min(464px, 80vw);
  padding: 6px 10px;
  border-radius: 10px;
  border: 1px solid rgba(68, 174, 255, 0.35);
  background: linear-gradient(90deg, rgba(15, 28, 42, 0.75), rgba(13, 26, 40, 0.35));
  color: #d6ecff;
  font-family: 'Cinzel', serif;
  font-size: 0.58rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  display: flex;
  align-items: center;
  gap: 8px;
}

.olm-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #44aeff;
  box-shadow: 0 0 10px rgba(68, 174, 255, 0.7);
  flex: 0 0 auto;
}
      `}</style>

      <div className="damask" />

      <header>
        <div className="hd-crest">♛</div>
        <h1 className="hd-title">Yor Chess</h1>
        <div className="hd-rule">
          <span />
          <div className="hd-sub">Royal Dominion · House of Yor</div>
          <span />
        </div>
      </header>

      <div className="game-wrap">
        {/* ── Left: Player cards + move log ── */}
        <div className="side-panel">
          <div className={`player-card ${botThinking ? 'active' : ''}`} id="card-bot">
            <div className="pc-top">
              <div className="pc-av">🤖</div>
              <div>
                <div className="pc-name">YorAyriniwnl</div>
                <div className="pc-role">Neural Chess Engine</div>
              </div>
            </div>
            <div className="pc-sep" />
            <div className="pc-col"><div className="col-dot b" />Plays Black</div>
            <div className="pc-cap" id="cap-bot">
              <CapturedPieces pieces={capBot} />
            </div>
            {/* Feature 6: Black clock */}
            {blitzEnabled && (
              <div className={`pc-clock ${!gameOver && game.turn() === 'b' && timerActive ? 'tc-run' : ''} ${timeB <= 30 && timerActive ? 'tc-low' : ''}`}>
                {formatTime(timeB)}
              </div>
            )}
            <div className={`pc-think ${botThinking ? 'on' : ''}`} id="bot-think">
              <div className="td" />
              <div className="td" />
              <div className="td" />
              <span style={{ fontSize: '.54rem', letterSpacing: '.14em' }}>Thinking</span>
            </div>
          </div>

          <div className="vs-div">⚔</div>

          <div className="player-card active" id="card-you">
            <div className="pc-top">
              <div className="pc-av">♔</div>
              <div>
                <div className="pc-name">You</div>
                <div className="pc-role">The Challenger</div>
              </div>
            </div>
            <div className="pc-sep" />
            <div className="pc-col"><div className="col-dot w" />Plays White</div>
            <div className="pc-cap" id="cap-you">
              <CapturedPieces pieces={capYou} />
            </div>
            {/* Feature 6: White clock */}
            {blitzEnabled && (
              <div className={`pc-clock ${!gameOver && game.turn() === 'w' && timerActive ? 'tc-run' : ''} ${timeW <= 30 && timerActive ? 'tc-low' : ''}`}>
                {formatTime(timeW)}
              </div>
            )}
          </div>

          <div className="log-card">
            <div className="log-hd">Move History</div>
            <div className="log-body" id="log-body">
              {renderLog()}
            </div>
          </div>
        </div>

        {/* ── Centre: Board ── */}
        <div className="board-sec">
          <div className="board-orn">
            <div className="corn tl">✦</div>
            <div className="corn tr">✦</div>
            <div className="corn bl">✦</div>
            <div className="corn br">✦</div>
            <div className="board-frame">
              <div className="brd-wrap">
                <div className="rank-lbs">
                  {rr.map((r) => (
                    <span key={r}>{r}</span>
                  ))}
                </div>
                {/* Feature 1: Board grid wrapped for animation overlay */}
                <div className="ch-grid" id="chgrid">
                  {rr.flatMap((rank) =>
                    ff.map((file, fIdx) => {
                      const sq = `${file}${rank}`;
                      const piece = game.get(sq);
                      const isLight = ((rr.indexOf(rank) + fIdx) % 2) === 0;
                      const key = piece ? pieceKey(piece.color, piece.type) : null;
                      const hideThisPiece = animHideSq === sq;
                      return (
                        <div
                          key={sq}
                          className={[
                            'sq',
                            isLight ? 'lt' : 'dk',
                            sq === lf ? 'lf' : '',
                            sq === lt ? 'lt2' : '',
                            sq === oppFrom ? 'opp-from' : '',
                            sq === oppTo ? 'opp-to' : '',
                            sq === sel ? 'sel' : '',
                            poss.includes(sq) ? 'poss' : '',
                            poss.includes(sq) && piece ? 'has-pc' : '',
                            sq === checkSq ? 'chk' : '',
                            sq === hintFrom ? 'hint-from' : '',   // Feature 4
                            sq === hintTo ? 'hint-to' : '',        // Feature 4
                          ].filter(Boolean).join(' ')}
                          data-sq={sq}
                          onClick={() => onSq(sq)}
                        >
                          {piece && key && !hideThisPiece && (
                            <div className="pw">
                              <LuxuryPiece pieceCode={key} />
                            </div>
                          )}
                        </div>
                      );
                    }),
                  )}

                  {/* Feature 1: Animated piece clone overlay */}
                  {animPiece && (
                    <div className="anim-clone-wrap">
                      <div
                        className="anim-clone"
                        style={{
                          transform: `translate(${(animActive ? animPiece.toCol : animPiece.fromCol) * 100}%, ${(animActive ? animPiece.toRow : animPiece.fromRow) * 100}%)`,
                          transition: animActive
                            ? 'transform 200ms cubic-bezier(0.25, 0.46, 0.45, 0.94)'
                            : 'none',
                        }}
                      >
                        <div className="pw">
                          <LuxuryPiece pieceCode={animPiece.pieceCode} />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div />
                <div className="file-lbs">
                  {ff.map((f) => (
                    <span key={f}>{f}</span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Feature 2: Opening identification badge */}
          {currentOpening && (
            <div className="opening-badge">
              <span className="ob-icon">♟</span>
              <span className="ob-name">{currentOpening}</span>
            </div>
          )}

          <div className="opp-last-move" aria-live="polite">
            <span className="olm-dot" aria-hidden="true" />
            <span>{oppMoveText}</span>
          </div>
        </div>

        {/* ── Right: Controls ── */}
        <div className="right-panel">
          <div className="stat-card">
            <div className="st-ic" id="st-ic">{statusIcon}</div>
            <div className={`st-tx ${statusDim ? 'dim' : ''}`} id="st-tx">
              {statusText}
            </div>
          </div>

          <div className="score-card">
            <div className="sc-hd">Session Record</div>
            <div className="sc-row"><span className="sc-n">Wins</span><span className="sc-v" id="sw">{scores.w}</span></div>
            <div className="sc-row"><span className="sc-n">Losses</span><span className="sc-v" id="sl">{scores.l}</span></div>
            <div className="sc-row"><span className="sc-n">Draws</span><span className="sc-v" id="sd">{scores.d}</span></div>
            <div className="sc-track"><div className="sc-fill" id="sf" style={{ width: `${fillWidth}%` }} /></div>
          </div>

          <div className="ctrls">
            <button className="btn pr" onClick={newGame}><span className="bi">⚔</span>New Game</button>
            <button className="btn" onClick={undoMove}><span className="bi">↩</span>Undo Move</button>
            {/* Feature 3: Board flip (already existed, kept) */}
            <button className="btn" onClick={flipBoard}><span className="bi">↕</span>Flip Board</button>
            {/* Feature 4: Hint button */}
            <button
              className="btn"
              onClick={getHint}
              disabled={hintLoading || gameOver || game.turn() !== 'w' || isAnimatingRef.current}
            >
              <span className="bi">💡</span>{hintLoading ? 'Finding…' : 'Hint'}
            </button>
          </div>

          <div className="dep-card">
            <div className="dep-hd">Engine Depth</div>
            <div className="dep-btns">
              <button className={`dep-btn ${aiDepth === 8 ? 'on' : ''}`} onClick={() => setDepth(8)}>Easy</button>
              <button className={`dep-btn ${aiDepth === 14 ? 'on' : ''}`} onClick={() => setDepth(14)}>Hard</button>
              <button className={`dep-btn ${aiDepth === 18 ? 'on' : ''}`} onClick={() => setDepth(18)}>Max</button>
            </div>
            <div className="dep-wr" id="dep-wr">
              {aiDepth === 8 ? 'Win Rate ~50–65%' : aiDepth === 14 ? 'Win Rate ~75–80%' : 'Win Rate ~88–93%'}
            </div>
          </div>

          {/* Feature 6: Blitz timer toggle */}
          <div className="blitz-card">
            <div className="dep-hd">Timer Mode</div>
            <button
              className={`dep-btn blitz-toggle-btn ${blitzEnabled ? 'on' : ''}`}
              onClick={toggleBlitz}
            >
              ⏱ Blitz (5+0)
            </button>
          </div>
        </div>
      </div>

      {/* ── Feature 5: Post-game analysis overlay ── */}
      <div className={`overlay ${endOpen ? 'show' : ''}`} id="ov-end">
        <div className="modal">
          <div className="mo-gl" id="eg">{endGlyph}</div>
          <div className="mo-ti" id="et">{endTitle}</div>
          <div className="mo-rule" />
          <div className="mo-bo" id="eb">{endBody}</div>

          {/* Analysis stats */}
          <div className="mo-analysis">
            <div className="mo-arow">
              <span>Moves Played</span>
              <span className="mo-val">{Math.ceil(endMoveCount / 2)}</span>
            </div>
            <div className="mo-arow">
              <span>You Captured</span>
              <span className="mo-val">{matW} pts</span>
            </div>
            <div className="mo-arow">
              <span>Bot Captured</span>
              <span className="mo-val">{matB} pts</span>
            </div>
            <div className="mo-arow mo-advantage">
              <span>Advantage</span>
              <span className="mo-val">{advantageStr}</span>
            </div>
          </div>

          <div className="mo-btns">
            <button className="mbt pr" onClick={newGame}>⚔ Play Again</button>
            <button className="mbt" onClick={() => setEndOpen(false)}>Review Moves</button>
          </div>
        </div>
      </div>

      {/* ── Promotion picker overlay ── */}
      <div className={`overlay ${promoOpen ? 'show' : ''}`} id="ov-pro">
        <div className="modal">
          <div className="mo-gl">♟</div>
          <div className="mo-ti">Promotion</div>
          <div className="mo-rule" />
          <div className="mo-bo">Choose the piece to crown your pawn.</div>
          <div className="pro-row" id="pro-row">
            {(promotionResolve || promoOpen) && ['q', 'r', 'b', 'n'].map((t) => {
              const k = `w${t.toUpperCase()}` as PieceGlyphKey;
              return (
                <button key={t} className="pro-pc" type="button" onClick={() => finishPromotion(t)} aria-label={`Promote to ${t.toUpperCase()}`}>
                  <LuxuryPiece pieceCode={k} variant="promotion" />
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
