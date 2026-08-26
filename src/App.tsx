import {
  Component,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
  type ComponentType,
  type ErrorInfo,
  type LazyExoticComponent,
  type ReactNode,
} from "react";
import "./styles.css";

type GameId =
  | "snake"
  | "memory"
  | "typing"
  | "wordle"
  | "tic-tac-toe"
  | "road-racing"
  | "strike-arena"
  | "chess";

type Game = {
  id: GameId;
  index: string;
  name: string;
  category: string;
  description: string;
  input: string;
  glyph: string;
  color: string;
  mode: string;
  session: string;
  difficulty: string;
};

const gameViews: Record<GameId, LazyExoticComponent<ComponentType>> = {
  snake: lazy(() => import("./games/Snake")),
  memory: lazy(() => import("./games/MemoryMatch")),
  typing: lazy(() => import("./games/TypingChallenge")),
  wordle: lazy(() => import("./games/WordGuess")),
  "tic-tac-toe": lazy(() => import("./games/TicTacToe")),
  "road-racing": lazy(() => import("./games/CarGame")),
  "strike-arena": lazy(() => import("./games/ClassicShooter3D")),
  chess: lazy(() => import("./games/Chess")),
};

const projects = [
  {
    number: "01",
    title: "Yor Zenith",
    type: "Decision system / solar intelligence",
    description: "Rooftop feasibility, yield, subsidy logic, and long-term return in one inspectable planning surface.",
    tone: "solar",
    signal: "LIVE BUILD",
    stage: "SHIPPED / OPEN",
    result: "Turns a technical proposal into a confident next move.",
    media: "/media/zenith-case-screenshot.svg",
    live: "https://zenith-xi-snowy.vercel.app/",
    source: "https://github.com/yorayriniwnl/Yor-Zenith",
  },
  {
    number: "02",
    title: "Yor AI vs Real",
    type: "Computer vision / trust interface",
    description: "Classical image features and SVM inference presented as evidence a person can actually review.",
    tone: "vision",
    signal: "LIVE BUILD",
    stage: "SHIPPED / OPEN",
    result: "Makes model output legible instead of asking for blind trust.",
    media: "/media/projects-screenshot.svg",
    live: "https://yor-ai-vs-real-image.vercel.app",
    source: "https://github.com/yorayriniwnl/Yor-Ai-vs-real-image",
  },
  {
    number: "03",
    title: "Mentor / Mentee",
    type: "Matching logic / workflow",
    description: "A weighted coordination system that turns hidden spreadsheet work into a repeatable process.",
    tone: "match",
    signal: "SOURCE STUDY",
    stage: "DOCUMENTED / OFFLINE",
    result: "Maps the decision surface before the interface exists.",
    media: "/media/hero-screenshot.svg",
    source: "https://github.com/yorayriniwnl/mentor-mentee-system",
  },
  {
    number: "04",
    title: "Yor Smriti",
    type: "Narrative UI / personal software",
    description: "A cinematic memory surface built around pacing, atmosphere, chronology, and emotional intent.",
    tone: "memory",
    signal: "EXPERIENCE",
    stage: "SHIPPED / OPEN",
    result: "Uses restraint and rhythm to make personal content feel inhabitable.",
    media: "/media/hero-screenshot.svg",
    live: "https://yor-smriti.vercel.app",
    source: "https://github.com/yorayriniwnl/Yor-Smriti",
  },
];

const games: Game[] = [
  { id: "snake", index: "A1", name: "Neon Snake", category: "Arcade · reflex", description: "Thread the grid, chase risky food, and keep the luminous line alive.", input: "Arrow keys", glyph: "⌁", color: "acid", mode: "Score attack", session: "02–05 min", difficulty: "Warm-up" },
  { id: "memory", index: "A2", name: "Memory Protocol", category: "Puzzle · recall", description: "Read the board, pair the stack, and finish before the pattern fades.", input: "Pointer", glyph: "✣", color: "pink", mode: "Pattern clear", session: "03–06 min", difficulty: "Focused" },
  { id: "typing", index: "A3", name: "Type // Rush", category: "Speed · code", description: "Real code fragments measured in clean keystrokes, accuracy, and nerve.", input: "Keyboard", glyph: "⌨", color: "blue", mode: "Accuracy run", session: "01–03 min", difficulty: "Sharp" },
  { id: "wordle", index: "A4", name: "Dev Word", category: "Word · inference", description: "Decode the compact language of APIs, systems, and shipped ideas.", input: "5 / 6 letters", glyph: "W", color: "amber", mode: "Six guesses", session: "02–04 min", difficulty: "Measured" },
  { id: "tic-tac-toe", index: "A5", name: "Grid Logic", category: "Strategy · classic", description: "A tiny arena with three AI depths and no room for careless moves.", input: "Pointer", glyph: "×", color: "violet", mode: "Vs. local AI", session: "03–08 min", difficulty: "Adaptive" },
  { id: "road-racing", index: "A6", name: "Road Runner", category: "Arcade · velocity", description: "Change lanes, read the horizon, collect power, and survive the night run.", input: "A / D · swipe", glyph: "◆", color: "orange", mode: "Endless run", session: "02–07 min", difficulty: "Rising" },
  { id: "strike-arena", index: "A7", name: "Strike Arena", category: "Action · first person", description: "A compact aim-and-movement trial built around rhythm, pressure, and focus.", input: "WASD · mouse", glyph: "+", color: "red", mode: "Arena clear", session: "04–10 min", difficulty: "Intense" },
  { id: "chess", index: "A8", name: "Yor Chess", category: "Strategy · board", description: "A complete board, adaptive engine depth, clocks, hints, and a stubborn opponent.", input: "Pointer", glyph: "♞", color: "ivory", mode: "Engine match", session: "08–25 min", difficulty: "Deep" },
];

const playerStats = [
  { value: "125", label: "Steam level", note: "earned over time" },
  { value: "13.6K", label: "CS hours", note: "the long session" },
  { value: "53", label: "Games owned", note: "always one more" },
  { value: "99", label: "Screenshots", note: "memory archive" },
];

const mediaItems = [
  { index: "M01", title: "Yor Zenith / system view", type: "PRODUCT ARTIFACT", body: "A decision surface with the evidence close to the action.", image: "/media/zenith-case-screenshot.svg" },
  { index: "M02", title: "AI vs Real / review state", type: "TRUST INTERFACE", body: "A model becomes useful when a person can inspect the reasoning.", image: "/media/projects-screenshot.svg" },
  { index: "M03", title: "The profile / field note", type: "PERSONAL INTERNET", body: "A portrait of the person behind the builds, games, and experiments.", image: "/media/hero-screenshot.svg" },
];

const archiveLinks = [
  { index: "01", label: "CASE FILES", title: "Portfolio / finished work", body: "The quieter front door: selected products explained through problem, contribution, and result.", href: "https://yorayriniwnl.vercel.app" },
  { index: "02", label: "PLAYER LOG", title: "Steam / the long game", body: "Matches, screenshots, badges, and the off-hours identity that shaped this hub's language.", href: "https://steamcommunity.com/id/yorayriniwnl/" },
  { index: "03", label: "BUILD LOG", title: "GitHub / proof of motion", body: "Repositories, experiments, commit trails, and the engineering record behind the finished surfaces.", href: "https://github.com/yorayriniwnl" },
  { index: "04", label: "PROFESSIONAL", title: "LinkedIn / open channel", body: "Education, role context, and a direct route into a serious conversation about the work.", href: "https://linkedin.com/in/yorayriniwnl" },
];

function Arrow() {
  return <span className="arrow" aria-hidden="true">↗</span>;
}

type GameErrorBoundaryProps = {
  gameName: string;
  onExit: () => void;
  children: ReactNode;
};

class GameErrorBoundary extends Component<GameErrorBoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Game room failed: " + this.props.gameName, error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="game-failure" role="alert">
        <span>SESSION INTERRUPTED / 500</span>
        <h2>{this.props.gameName} could not start.</h2>
        <p>The rest of the hub is still safe. Exit this room and choose another run.</p>
        <button type="button" onClick={this.props.onExit}>Return to arcade <Arrow /></button>
      </div>
    );
  }
}

function App() {
  const [activeGame, setActiveGame] = useState<GameId | null>(null);
  const [activeSection, setActiveSection] = useState("world");
  const [scrolled, setScrolled] = useState(false);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const gameRoomRef = useRef<HTMLDivElement | null>(null);

  const closeGame = useCallback(() => {
    setActiveGame(null);
    window.setTimeout(() => lastTriggerRef.current?.focus(), 0);
  }, []);

  const launchGame = useCallback((gameId: GameId, trigger: HTMLButtonElement) => {
    lastTriggerRef.current = trigger;
    setActiveGame(gameId);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const sections = ["world", "arcade", "media", "archive", "about"]
      .map((id) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];
    const observer = new IntersectionObserver((entries) => {
      const visible = entries
        .filter((entry) => entry.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveSection(visible.target.id);
    }, { rootMargin: "-20% 0px -64% 0px", threshold: [0.12, 0.4, 0.7] });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!activeGame) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && event.shiftKey) {
        closeGame();
        return;
      }
      if (event.key !== "Tab") return;
      const room = gameRoomRef.current;
      if (!room) return;
      const focusable = Array.from(room.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.offsetParent !== null);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeGame, closeGame]);

  useEffect(() => {
    document.body.style.overflow = activeGame ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [activeGame]);

  const currentGame = games.find((game) => game.id === activeGame);
  const CurrentGame = activeGame ? gameViews[activeGame] : null;

  return (
    <div className="hub-shell">
      <div className="hub-noise" aria-hidden="true" />
      <div className="hub-aurora hub-aurora--red" aria-hidden="true" />
      <div className="hub-aurora hub-aurora--blue" aria-hidden="true" />

      <header className={"command-nav " + (scrolled ? "is-scrolled" : "")}>
        <a className="hub-brand" href="#top" aria-label="Yor Ayrin home">
          <i /><span>YOR // AYRIN</span><small>PERSONAL INTERNET</small>
        </a>
        <nav className="command-links" aria-label="Primary navigation">
          <a className={activeSection === "world" ? "is-active" : ""} href="#world">Worlds</a>
          <a className={activeSection === "arcade" ? "is-active" : ""} href="#arcade">Arcade</a>
          <a className={activeSection === "media" ? "is-active" : ""} href="#media">Media</a>
          <a className={activeSection === "archive" ? "is-active" : ""} href="#archive">Archive</a>
          <a className={activeSection === "about" ? "is-active" : ""} href="#about">Profile</a>
        </nav>
        <div className="nav-player">
          <span><i /> ONLINE</span>
          <div><strong>Yor Ayrin</strong><small>LVL 125 / INDIA</small></div>
        </div>
        <a className="portfolio-link" href="https://yorayriniwnl.vercel.app">Portfolio <Arrow /></a>
      </header>

      <main id="top">
        <section className="hub-hero hub-container" aria-labelledby="hub-title">
          <aside className="player-card" aria-label="Yor Ayrin player profile">
            <div className="player-card__banner">
              <span>YOR AYRIN / PROFILE 125</span>
              <b>✦</b><b>✧</b><b>✦</b>
            </div>
            <div className="player-card__cover">
              <img src="/ayush-avatar.png" alt="Ayush Roy" width={640} height={640} loading="eager" decoding="async" />
              <span className="player-card__status"><i /> Online</span>
              <span className="player-card__level">125</span>
            </div>
            <div className="player-card__identity">
              <small>PLAYER_01 / INDIA</small>
              <h2>♥ Yor Ayrin - iwnl ♥</h2>
              <p>Grind. Die. Repeat.</p>
            </div>
            <div className="player-card__meta">
              <span><small>Current state</small><strong>Building</strong></span>
              <span><small>Main loop</small><strong>Play → learn</strong></span>
            </div>
            <div className="player-card__badges" aria-label="Profile badges">
              <span>125<small>LVL</small></span><span>∞<small>HRS</small></span><span>★<small>BUILD</small></span><span>♞<small>PLAY</small></span>
            </div>
          </aside>

          <div className="hub-hero__copy">
            <p className="hub-eyebrow"><span>FIELD 02</span> / PERSONAL INTERNET</p>
            <h1 id="hub-title">Playable ideas.<br /><em>Shipped systems.</em><br />One living world.</h1>
            <p>A personal command center for side quests, finished builds, game rooms, screenshots, notes, and everything that does not belong in a conventional portfolio.</p>
            <div className="hub-actions">
              <a className="hub-button hub-button--primary" href="#arcade">Enter the arcade <span aria-hidden="true">↓</span></a>
              <a className="hub-button hub-button--ghost" href="#world">Browse worlds <Arrow /></a>
              <a className="hub-button hub-button--steam" href="https://steamcommunity.com/id/yorayriniwnl/" target="_blank" rel="noreferrer">Steam profile <Arrow /></a>
            </div>
            <div className="hero-system-line"><span>DELHI / UTC +5:30</span><i /><span>08 PLAYABLE ROOMS</span><i /><span>BUILD 2026.08</span></div>
          </div>
        </section>

        <section className="stat-deck hub-container" aria-label="Player profile statistics">
          <div className="stat-deck__lead"><span>PROFILE TELEMETRY</span><strong>THE LONG GAME</strong><small>Public signals from the player profile</small></div>
          {playerStats.map((stat) => <div className="stat-unit" key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span><small>{stat.note}</small></div>)}
        </section>

        <section className="world-section hub-section hub-container" id="world" aria-labelledby="world-title">
          <div className="hub-section-heading">
            <div><p className="hub-eyebrow"><span>01</span> / BUILT WORLDS</p><h2 id="world-title">Systems worth<br /><em>entering.</em></h2></div>
            <p>Installed worlds from the portfolio, shown with the artifact, the state, and the reason the system exists. Open the build or inspect the source trail.</p>
          </div>
          <div className="world-library">
            {projects.map((project) => (
              <article className={"world-tile world-tile--" + project.tone} key={project.title}>
                <div className="world-media">
                  <img src={project.media} alt={project.title + " project artifact"} loading="lazy" />
                  <span className="world-media__index">WORLD_{project.number}</span>
                  <span className="world-media__signal">{project.signal}</span>
                </div>
                <div className="world-copy">
                  <div className="world-copy__top"><span>{project.type}</span><small>{project.stage}</small></div>
                  <h3>{project.title}</h3>
                  <p>{project.description}</p>
                  <blockquote>{project.result}</blockquote>
                  <div className="world-copy__links">
                    {project.live ? <a href={project.live} target="_blank" rel="noreferrer">Open world <Arrow /></a> : <span className="world-link--offline">Offline / source study</span>}
                    <a href={project.source} target="_blank" rel="noreferrer">Source <Arrow /></a>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="arcade-section hub-section" id="arcade" aria-labelledby="arcade-title">
          <div className="hub-container">
            <div className="hub-section-heading arcade-heading">
              <div><p className="hub-eyebrow"><span>02</span> / PLAYABLE ROOMS</p><h2 id="arcade-title">Choose your<br /><em>next run.</em></h2></div>
              <p>Eight small games with distinct mechanics, feedback language, score state, and a reason to play one more round. Every room is local, playable, and built to survive a bad session.</p>
            </div>
            <div className="arcade-feature">
              <div className="arcade-feature__screen">
                <div className="arcade-feature__top"><span>NOW LOADING / ROTATION 08</span><strong>YOR ARCADE</strong><span>LOCAL ONLY</span></div>
                <div className="arcade-feature__grid" />
                <div className="arcade-feature__orb"><span>PLAY</span><b>↗</b></div>
                <div className="arcade-feature__ticker"><span>CHESS / ROAD RUNNER / STRIKE ARENA</span><span>NO ACCOUNTS / NO TRACKING</span></div>
              </div>
              <div className="arcade-feature__copy"><span>THE ROOM SELECTOR</span><h3>Short sessions.<br /><em>Serious feedback.</em></h3><p>Choose the mood, not just the mechanic. Calm recall, clean speed, or a stubborn board—all of it opens without leaving the hub.</p><a href="#game-library">Browse all rooms <Arrow /></a></div>
            </div>
            <div className="arcade-console" aria-label="Arcade system status">
              <span><i /> ARCADE ONLINE</span><span>08 INSTALLED</span><span>LOCAL HIGH SCORES</span><span>SHIFT + ESC TO EXIT</span>
            </div>
            <div className="game-library" id="game-library">
              {games.map((game) => (
                <button className={"game-library-card game-library-card--" + game.color} data-game={game.id} key={game.id} type="button" onClick={(event) => launchGame(game.id, event.currentTarget)}>
                  <span className="game-cover" aria-hidden="true"><span className="game-cover__grid" /><span className="game-cover__index">{game.index}</span><strong>{game.glyph}</strong><small>INSTALLED</small></span>
                  <span className="game-card-copy"><small>{game.category}</small><strong>{game.name}</strong><span>{game.description}</span></span>
                  <span className="game-card-data"><span><small>MODE</small><b>{game.mode}</b></span><span><small>SESSION</small><b>{game.session}</b></span><span><small>INPUT</small><b>{game.input}</b></span></span>
                  <span className="game-card-footer"><small>{game.difficulty}</small><b>Launch <Arrow /></b></span>
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="media-section hub-section hub-container" id="media" aria-labelledby="media-title">
          <div className="hub-section-heading">
            <div><p className="hub-eyebrow"><span>03</span> / MEDIA ARCHIVE</p><h2 id="media-title">Proof in<br /><em>the frame.</em></h2></div>
            <p>Selected screenshots and artifact views from the work. A visual archive gives the ideas somewhere to land before the link opens.</p>
          </div>
          <div className="media-shelf">
            {mediaItems.map((item, index) => (
              <figure className={"media-card media-card--" + (index + 1)} key={item.index}>
                <div className="media-card__image"><img src={item.image} alt={item.title} loading="lazy" /></div>
                <figcaption><span>{item.index} / {item.type}</span><strong>{item.title}</strong><p>{item.body}</p></figcaption>
              </figure>
            ))}
          </div>
        </section>

        <section className="archive-section hub-section hub-container" id="archive" aria-labelledby="archive-title">
          <div className="hub-section-heading">
            <div><p className="hub-eyebrow"><span>04</span> / EXTERNAL SIGNALS</p><h2 id="archive-title">The record<br /><em>stays open.</em></h2></div>
            <p>The hub is a map, not a dead end. These routes lead to the public traces behind the identity and the work.</p>
          </div>
          <div className="archive-deck">
            <div className="archive-list">
              {archiveLinks.map((item) => <a href={item.href} target="_blank" rel="noreferrer" key={item.index}><span>{item.index}</span><small>{item.label}</small><div><strong>{item.title}</strong><p>{item.body}</p></div><b><Arrow /></b></a>)}
            </div>
            <aside className="manifest-card" id="field-note">
              <span>MANIFEST / 001</span>
              <h3>Build the thing people can understand.</h3>
              <p>Complexity can live in the engine. At the surface, it should arrive as clarity, feedback, and a next move worth taking.</p>
              <div className="badge-wall" aria-label="Interests"><span>CHESS</span><span>VISION</span><span>3D</span><span>SYSTEMS</span><span>MUSIC</span><span>CS2</span></div>
              <small>LAST UPDATED / AUG 2026</small>
            </aside>
          </div>
        </section>

        <section className="profile-section hub-section" id="about" aria-labelledby="profile-title">
          <div className="hub-container profile-panel">
            <div className="profile-panel__copy">
              <p className="hub-eyebrow"><span>05</span> / OPEN CHANNEL</p>
              <h2 id="profile-title">The person<br /><em>behind the player.</em></h2>
              <p>I’m Ayush Roy—a computer science student, product-minded engineer, competitive player, and builder of systems that feel considered all the way down.</p>
              <div className="profile-actions"><a href="mailto:ayushroy.dev@gmail.com">Start a conversation <Arrow /></a><a href="https://yorayriniwnl.vercel.app">Read the portfolio <Arrow /></a></div>
            </div>
            <div className="profile-panel__signal" aria-hidden="true"><span>Y</span><i /><i /><i /><small>BUILD / PLAY / REPEAT</small></div>
          </div>
        </section>
      </main>

      <footer className="hub-footer">
        <div><i /> YOR // AYRIN <small>WORLD_02</small></div><p>A living index of work, play, and everything between.</p><div><a href="https://github.com/yorayriniwnl">GitHub</a><a href="https://steamcommunity.com/id/yorayriniwnl/">Steam</a><a href="#top">Top ↑</a></div>
      </footer>

      {CurrentGame && currentGame && (
        <div ref={gameRoomRef} className={"game-room game-room--" + currentGame.color} role="dialog" aria-modal="true" aria-label={currentGame.name + " game room"} onClickCapture={(event) => { const target = event.target as HTMLElement; if (target.closest('a[href="#arcade"]')) closeGame(); }}>
          <header className="game-room__header">
            <div className="game-room__identity"><span>{currentGame.index}</span><div><small>{currentGame.category}</small><strong>{currentGame.name}</strong></div></div>
            <div className="game-room__session"><i /> LIVE SESSION <span>{currentGame.input}</span></div>
            <button type="button" onClick={closeGame} autoFocus aria-label={"Close " + currentGame.name}>Exit room <kbd>Shift Esc</kbd><b>×</b></button>
          </header>
          <div className="game-room__stage">
            <GameErrorBoundary key={activeGame} gameName={currentGame.name} onExit={closeGame}>
              <Suspense fallback={<div className="game-loading"><span /><strong>Loading {currentGame.name}</strong><small>Preparing room {currentGame.index}</small></div>}>
                <CurrentGame />
              </Suspense>
            </GameErrorBoundary>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
