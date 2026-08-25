import {
  lazy,
  Suspense,
  useEffect,
  useState,
  type ComponentType,
  type LazyExoticComponent,
  type PointerEvent as ReactPointerEvent,
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
    type: "Solar intelligence / product system",
    description:
      "A decision layer for rooftop solar: scan, estimate, explain, and move from curiosity to a credible next step.",
    tone: "amber",
    live: "https://zenith-xi-snowy.vercel.app/",
    repo: "https://github.com/yorayriniwnl/Yor-Zenith",
  },
  {
    number: "02",
    title: "Yor AI vs Real",
    type: "Computer vision / trust interface",
    description:
      "An image classification experience designed around uncertainty, evidence, and clear human-readable reasoning.",
    tone: "violet",
    live: "https://yor-ai-vs-real-image.vercel.app",
    repo: "https://github.com/yorayriniwnl/Yor-Ai-vs-real-image",
  },
  {
    number: "03",
    title: "Yor Smriti",
    type: "Memory / personal software",
    description:
      "A quiet digital space for holding moments with enough structure to find them again and enough softness to keep them human.",
    tone: "rose",
    live: "https://yor-smriti.vercel.app",
    repo: "https://github.com/yorayriniwnl/Yor-Smriti",
  },
  {
    number: "04",
    title: "Mentor / Mentee",
    type: "Matching system / workflow design",
    description:
      "A focused matching product that makes the hidden work of mentorship visible, navigable, and easier to act on.",
    tone: "cyan",
    live: "https://mentor-mentee-system.vercel.app",
    repo: "https://github.com/yorayriniwnl/mentor-mentee-system",
  },
];

const games: Array<{
  id: GameId;
  index: string;
  name: string;
  category: string;
  description: string;
  key: string;
  color: string;
}> = [
  {
    id: "snake",
    index: "A1",
    name: "Neon Snake",
    category: "arcade / reflex",
    description: "A luminous loop with momentum, risk, and just enough chaos.",
    key: "ARROW KEYS",
    color: "lime",
  },
  {
    id: "memory",
    index: "A2",
    name: "Memory Match",
    category: "puzzle / recall",
    description: "Pair the stack. Keep your eyes open. The board remembers.",
    key: "MOUSE",
    color: "pink",
  },
  {
    id: "typing",
    index: "A3",
    name: "Typing Challenge",
    category: "speed / code",
    description: "Actual fragments from the workbench, measured in clean keystrokes.",
    key: "KEYBOARD",
    color: "blue",
  },
  {
    id: "wordle",
    index: "A4",
    name: "Dev Word",
    category: "word / inference",
    description: "Decode a compact language of APIs, systems, and shipped ideas.",
    key: "6 LETTERS",
    color: "gold",
  },
  {
    id: "tic-tac-toe",
    index: "A5",
    name: "Grid Logic",
    category: "strategy / classic",
    description: "A small board with a surprising amount of room to think.",
    key: "MOUSE",
    color: "violet",
  },
  {
    id: "road-racing",
    index: "A6",
    name: "Night Drive",
    category: "3D / arcade",
    description: "Find the line, keep the pace, and let the road render itself.",
    key: "WASD",
    color: "orange",
  },
  {
    id: "strike-arena",
    index: "A7",
    name: "Strike Arena",
    category: "3D / action",
    description: "A compact first-person arena for testing motion, timing, and focus.",
    key: "WASD + MOUSE",
    color: "red",
  },
  {
    id: "chess",
    index: "A8",
    name: "Yor Chess",
    category: "strategy / board",
    description: "A full board, a stubborn opponent, and time to see the pattern.",
    key: "MOUSE",
    color: "white",
  },
];

const archive = [
  {
    index: "01",
    label: "FIELD NOTES",
    title: "Devlog / observations",
    body: "Small essays on building, debugging, attention, and the strange distance between an idea and a useful interface.",
    link: "#notes",
  },
  {
    index: "02",
    label: "SIGNALS",
    title: "Activity / proof of motion",
    body: "GitHub work, experiments, metrics, and the traces that show what is being learned in public.",
    link: "https://github.com/yorayriniwnl",
  },
  {
    index: "03",
    label: "MEDIA SHELF",
    title: "Screens, clips, fragments",
    body: "A visual archive for project captures, game sessions, design studies, and anything worth revisiting.",
    link: "#media",
  },
  {
    index: "04",
    label: "THE PERSON",
    title: "Profile / beyond the build",
    body: "Computer science student, product-minded maker, and an enthusiast for systems that feel more considered than they need to.",
    link: "#about",
  },
];

const playerStats = [
  { value: "13,633", label: "CS hours", note: "the long game" },
  { value: "125", label: "Steam level", note: "earned, not assigned" },
  { value: "53", label: "games", note: "worlds entered" },
  { value: "99", label: "screenshots", note: "proof of play" },
];

function Arrow() {
  return <span aria-hidden="true">↗</span>;
}

function GrainMark() {
  return (
    <div className="grain-mark" aria-hidden="true">
      <span />
      <span />
      <span />
      <span />
      <i />
    </div>
  );
}

function tiltCard(event: ReactPointerEvent<HTMLElement>) {
  const card = event.currentTarget;
  const bounds = card.getBoundingClientRect();
  const x = (event.clientX - bounds.left) / bounds.width - 0.5;
  const y = (event.clientY - bounds.top) / bounds.height - 0.5;
  card.style.setProperty("--tilt-x", `${y * -4}deg`);
  card.style.setProperty("--tilt-y", `${x * 4}deg`);
  card.style.setProperty("--glow-x", `${(x + 0.5) * 100}%`);
  card.style.setProperty("--glow-y", `${(y + 0.5) * 100}%`);
}

function resetTilt(event: ReactPointerEvent<HTMLElement>) {
  const card = event.currentTarget;
  card.style.setProperty("--tilt-x", "0deg");
  card.style.setProperty("--tilt-y", "0deg");
}

function App() {
  const [activeGame, setActiveGame] = useState<GameId | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState("world");

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 28);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const sections = ["world", "arcade", "archive"].map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (visible) setActiveSection(visible.target.id);
    }, { rootMargin: "-22% 0px -62% 0px", threshold: [0.15, 0.4, 0.7] });
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!activeGame) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveGame(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [activeGame]);

  useEffect(() => {
    document.body.style.overflow = activeGame ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [activeGame]);

  const currentGame = games.find((game) => game.id === activeGame);
  const CurrentGame = activeGame ? gameViews[activeGame] : null;

  return (
    <div className="hub-shell">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <div className="ambient ambient-three" aria-hidden="true" />

      <header className={`site-nav ${scrolled ? "is-scrolled" : ""}`}>
        <a className="wordmark" href="#top" aria-label="Yor Ayrin home">
          <span className="wordmark-dot" />
          <span>YOR / AYRIN</span>
          <small>FIELD 02</small>
        </a>
        <nav className="nav-links" aria-label="Primary navigation">
          <a className={activeSection === "world" ? "is-active" : ""} href="#world">World</a>
          <a className={activeSection === "arcade" ? "is-active" : ""} href="#arcade">Arcade</a>
          <a className={activeSection === "archive" ? "is-active" : ""} href="#archive">Archive</a>
        </nav>
        <span className="nav-field-readout" aria-live="polite">{activeSection} / 05</span>
        <a className="nav-portfolio" href="https://yorayriniwnl.vercel.app">
          Portfolio <Arrow />
        </a>
      </header>

      <main id="top">
        <section className="hub-hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow"><span>01</span> ♥ Yor Ayrin - iwnl ♥ / player profile</p>
            <h1 id="hero-title">
              The world
              <em>around</em>
              the work.
            </h1>
            <p className="hero-lede">
              A living index of experiments, playable things, quiet notes, and the systems built between one match, one idea, and the next.
            </p>
            <div className="hero-actions">
              <a className="button button-primary" href="#world">Enter the field <Arrow /></a>
              <a className="button button-quiet" href="https://yorayriniwnl.vercel.app">Meet the maker <Arrow /></a>
              <a className="button button-steam" href="https://steamcommunity.com/id/yorayriniwnl/">Open player profile <Arrow /></a>
            </div>
            <div className="hero-aside"><span>LAT 28.61° N</span><span>LONG 77.20° E</span><span>STATUS: EXPLORING</span></div>
          </div>
          <div className="hero-orbit" aria-hidden="true">
            <div className="orbit orbit-a"><i /></div>
            <div className="orbit orbit-b"><i /></div>
            <div className="orbit orbit-c"><i /></div>
            <div className="hero-planet"><img src="/ayush-avatar.png" alt="" /><GrainMark /><b>Y</b></div>
            <span className="orbit-label label-one">curiosity / 24</span>
            <span className="orbit-label label-two">build → play</span>
            <span className="orbit-label label-three">∞</span>
          </div>
        </section>

        <div className="ticker" aria-label="Site index">
          <span>PERSONAL SYSTEMS</span><i />
          <span>GAMES &amp; PLAY</span><i />
          <span>FIELD NOTES</span><i />
          <span>OPEN EXPERIMENTS</span><i />
          <span>PERSONAL SYSTEMS</span>
        </div>

        <section className="profile-stat-rack" aria-label="Player profile telemetry">
          <div className="profile-stat-rack__identity"><span>PLAYER PROFILE / 01</span><strong>YOR AYRIN</strong><small>GRIND. DIE. REPEAT.</small></div>
          {playerStats.map((stat) => <div className="profile-stat" key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span><small>{stat.note}</small></div>)}
        </section>

        <section className="world-section section-shell" id="world" aria-labelledby="world-title">
          <div className="section-heading">
            <div><p className="eyebrow"><span>02</span> Selected coordinates</p><h2 id="world-title">Worlds <em>built</em><br />to be entered.</h2></div>
            <p className="section-intro">The portfolio is the polished front door. This is the house behind it: the prototypes, side quests, and systems that keep the lights on.</p>
          </div>
          <div className="project-grid">
            {projects.map((project) => (
              <article className={`world-card card-${project.tone}`} key={project.title} onPointerMove={tiltCard} onPointerLeave={resetTilt}>
                <div className="card-topline"><span>{project.number} / {project.type}</span><span className="card-signal">● live</span></div>
                <div className="card-glow" aria-hidden="true" />
                <h3>{project.title}</h3>
                <p>{project.description}</p>
                <div className="card-links"><a href={project.live}>Open world <Arrow /></a><a href={project.repo}>Source <Arrow /></a></div>
              </article>
            ))}
          </div>
          <div className="world-footer"><span>11+ shipped / explored projects</span><a href="https://github.com/yorayriniwnl">Browse the full archive <Arrow /></a></div>
        </section>

        <section className="arcade-section section-shell" id="arcade" aria-labelledby="arcade-title">
          <div className="section-heading arcade-heading">
            <div><p className="eyebrow"><span>03</span> Playable systems</p><h2 id="arcade-title">The <em>arcade</em><br />is open.</h2></div>
            <p className="section-intro">Small games are honest laboratories. They reveal how motion feels, how feedback lands, and whether the details survive contact with a real person.</p>
          </div>
          <div className="arcade-grid">
            {games.map((game) => (
              <button className={`game-card game-${game.color}`} key={game.id} onClick={() => setActiveGame(game.id)} onPointerMove={tiltCard} onPointerLeave={resetTilt}>
                <span className="game-index">{game.index}</span>
                <span className="game-icon" aria-hidden="true">{game.id === "chess" ? "♞" : game.id === "snake" ? "≈" : game.id === "road-racing" ? "⌁" : game.id === "strike-arena" ? "+" : "✦"}</span>
                <span className="game-name">{game.name}</span>
                <span className="game-category">{game.category}</span>
                <span className="game-description">{game.description}</span>
                <span className="game-footer"><small>{game.key}</small><b>PLAY <Arrow /></b></span>
              </button>
            ))}
          </div>
        </section>

        <section className="archive-section section-shell" id="archive" aria-labelledby="archive-title">
          <div className="section-heading">
            <div><p className="eyebrow"><span>04</span> Everything between</p><h2 id="archive-title">The <em>archive</em><br />keeps growing.</h2></div>
            <p className="section-intro">Not every useful thing needs to become a case study. Some of it is a note, a screenshot, a half-finished thought, or a trail worth following.</p>
          </div>
          <div className="archive-list">
            {archive.map((item) => (
              <a className="archive-row" href={item.link} key={item.index}>
                <span className="archive-index">{item.index}</span><span className="archive-label">{item.label}</span><span className="archive-copy"><strong>{item.title}</strong><span>{item.body}</span></span><span className="archive-arrow"><Arrow /></span>
              </a>
            ))}
          </div>
          <div className="archive-supplement">
            <article id="notes"><span className="archive-supplement__label">NOTEBOOK / 001</span><strong>Build the thing people can understand.</strong><p>A working principle for the projects here: complexity is allowed in the engine, but it should arrive as clarity at the surface.</p></article>
            <article id="media"><span className="archive-supplement__label">MEDIA SHELF / 002</span><strong>Fragments are part of the record.</strong><p>Game sessions, interface studies, and small visual experiments live here as evidence of the making—not decoration after the fact.</p></article>
          </div>
        </section>

        <section className="contact-section section-shell" id="about" aria-labelledby="contact-title">
          <div className="contact-panel">
            <div className="contact-stamp"><GrainMark /><span>YOR / 02</span></div>
            <p className="eyebrow"><span>05</span> Open channel</p>
            <h2 id="contact-title">Have a good<br /><em>problem?</em></h2>
            <p>For collaborations, unusual builds, or a conversation about making software feel more alive:</p>
            <a className="contact-email" href="mailto:ayushroy.dev@gmail.com">ayushroy.dev@gmail.com <Arrow /></a>
          </div>
        </section>
      </main>

      <footer className="site-footer">
        <div><span className="wordmark-dot" /> YOR / AYRIN <small>© 2026</small></div>
        <div className="footer-links"><a href="https://github.com/yorayriniwnl">GitHub</a><a href="https://linkedin.com/in/yorayriniwnl">LinkedIn</a><a href="https://yorayriniwnl.vercel.app">Portfolio</a></div>
        <span>MADE WITH CURIOSITY / DELHI</span>
      </footer>

      {CurrentGame && currentGame && (
        <div className="game-modal" role="dialog" aria-modal="true" aria-label={`${currentGame.name} game`}>
          <div className="game-modal-bar"><span>{currentGame.index} / {currentGame.name}</span><button autoFocus onClick={() => setActiveGame(null)} aria-label="Close game">Close ×</button></div>
          <div className="game-stage"><Suspense fallback={<div className="game-loading"><span>Loading field…</span></div>}><CurrentGame /></Suspense></div>
        </div>
      )}
    </div>
  );
}

export default App;
