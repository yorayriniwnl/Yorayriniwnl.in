import { Component, lazy, Suspense, useCallback, useEffect, useRef, useState, type ComponentType, type ErrorInfo, type LazyExoticComponent, type ReactNode } from "react";
import "./games/room.css";

export type GameId = "snake" | "memory" | "typing" | "wordle" | "tic-tac-toe" | "road-racing" | "strike-arena" | "chess";

type Game = { id: GameId; index: string; name: string; category: string; input: string; glyph: string; color: string };

const views: Record<GameId, LazyExoticComponent<ComponentType>> = {
  snake: lazy(() => import("./games/Snake")),
  memory: lazy(() => import("./games/MemoryMatch")),
  typing: lazy(() => import("./games/TypingChallenge")),
  wordle: lazy(() => import("./games/WordGuess")),
  "tic-tac-toe": lazy(() => import("./games/TicTacToe")),
  "road-racing": lazy(() => import("./games/CarGame")),
  "strike-arena": lazy(() => import("./games/ClassicShooter3D")),
  chess: lazy(() => import("./games/Chess")),
};

export const games: Game[] = [
  { id: "chess", index: "A1", name: "Yor Chess", category: "Strategy · board", input: "Pointer", glyph: "♞", color: "ivory" },
  { id: "strike-arena", index: "A2", name: "Strike Arena", category: "Action · first person", input: "WASD · mouse", glyph: "+", color: "red" },
  { id: "typing", index: "A3", name: "Type // Rush", category: "Speed · code", input: "Keyboard", glyph: "⌨", color: "blue" },
  { id: "snake", index: "A4", name: "Neon Snake", category: "Arcade · reflex", input: "Arrow keys", glyph: "⌁", color: "acid" },
  { id: "road-racing", index: "A5", name: "Road Runner", category: "Arcade · velocity", input: "A / D · swipe", glyph: "◆", color: "orange" },
  { id: "wordle", index: "A6", name: "Dev Word", category: "Word · inference", input: "Letters", glyph: "W", color: "amber" },
  { id: "memory", index: "A7", name: "Memory Protocol", category: "Puzzle · recall", input: "Pointer", glyph: "✣", color: "pink" },
  { id: "tic-tac-toe", index: "A8", name: "Grid Logic", category: "Strategy · classic", input: "Pointer", glyph: "×", color: "violet" },
];

class Boundary extends Component<{ name: string; onExit: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Game failed: " + this.props.name, error, info);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="game-failure" role="alert">
        <span>SESSION INTERRUPTED</span>
        <h2>{this.props.name} could not start.</h2>
        <p>The rest of the site is fine. Exit and pick another game.</p>
        <button type="button" onClick={this.props.onExit}>Back to the war room</button>
      </div>
    );
  }
}

/** Full-screen game room. Focus is trapped inside; Shift+Esc exits. */
export function useArcade() {
  const [active, setActive] = useState<GameId | null>(null);
  const trigger = useRef<HTMLElement | null>(null);
  const roomRef = useRef<HTMLDivElement | null>(null);

  const close = useCallback(() => {
    setActive(null);
    window.setTimeout(() => trigger.current?.focus(), 0);
  }, []);
  const open = useCallback((id: GameId, el: HTMLElement) => {
    trigger.current = el;
    setActive(id);
  }, []);

  useEffect(() => {
    if (!active) return;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && e.shiftKey) return close();
      if (e.key !== "Tab" || !roomRef.current) return;
      const f = Array.from(roomRef.current.querySelectorAll<HTMLElement>('a[href],button:not([disabled]),input,textarea,select,[tabindex]:not([tabindex="-1"])')).filter((x) => x.offsetParent !== null);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) {
        e.preventDefault();
        f[f.length - 1].focus();
      } else if (!e.shiftKey && document.activeElement === f[f.length - 1]) {
        e.preventDefault();
        f[0].focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = "";
      window.removeEventListener("keydown", onKey);
    };
  }, [active, close]);

  const game = games.find((g) => g.id === active);
  const View = active ? views[active] : null;
  const room =
    game && View ? (
      <div ref={roomRef} className={"game-room game-room--" + game.color} role="dialog" aria-modal="true" aria-label={game.name} onClickCapture={(event) => {
        if (!(event.target instanceof Element) || !event.target.closest('a[href="#arcade"]')) return;
        event.preventDefault();
        close();
      }}>
        <header className="game-room__header">
          <div className="game-room__identity">
            <span>{game.index}</span>
            <div>
              <small>{game.category}</small>
              <strong>{game.name}</strong>
            </div>
          </div>
          <div className="game-room__session">
            <i /> LIVE SESSION <span>{game.input}</span>
          </div>
          <button type="button" onClick={close} autoFocus aria-label={"Close " + game.name}>
            Exit <kbd>Shift Esc</kbd>
            <b>×</b>
          </button>
        </header>
        <div className="game-room__stage">
          <Boundary key={active} name={game.name} onExit={close}>
            <Suspense fallback={<div className="game-loading"><span /><strong>Loading {game.name}</strong></div>}>
              <View />
            </Suspense>
          </Boundary>
        </div>
      </div>
    ) : null;

  return { open, room };
}
