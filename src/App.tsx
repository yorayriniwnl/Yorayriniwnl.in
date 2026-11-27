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
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
} from "react";
import "./styles.css";
import {
  archiveLinks,
  games,
  glbAssets,
  mediaItems,
  playerStats,
  projects,
  WAR_ROOM_HOTSPOTS,
  type GameId,
  type HotspotConfig,
} from "./data/hubData";

const WarRoomCinematic = lazy(() => import("./components/WarRoomCinematic"));
const WarRoom3D = lazy(() => import("./components/WarRoom3D"));

type Route = "home" | "game";
type WarRoomMode = "cinematic" | "free-roam";

const GAME_PATH = "/game";
const GAME_PATHS = new Set(["/game", "/3d"]);
const HOME_TITLE = "YOR // Ayrin field hub";
const GAME_TITLE = "War Room // YOR Ayrin";

function routeFromPath(pathname: string): Route {
  return GAME_PATHS.has(pathname.replace(/\/+$/, "")) ? "game" : "home";
}

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

function Arrow() {
  return <span className="arrow" aria-hidden="true">↗</span>;
}

type GameErrorBoundaryProps = {
  gameName: string;
  onExit: () => void;
  exitLabel?: string;
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
        <p>Return to the hub to choose another game.</p>
        <button type="button" onClick={this.props.onExit}>{this.props.exitLabel ?? "Return to arcade"} <Arrow /></button>
      </div>
    );
  }
}

function App() {
  const [route, setRoute] = useState<Route>(() => routeFromPath(window.location.pathname));
  const viewMode = route === "game" ? "warroom" : "index";
  const [warRoomMode, setWarRoomMode] = useState<WarRoomMode>("cinematic");
  const [activeHotspot, setActiveHotspot] = useState<HotspotConfig | null>(null);
  const [activePreset, setActivePreset] = useState("overview");
  const [lanternBright, setLanternBright] = useState(true);
  const [autoOrbit, setAutoOrbit] = useState(false);

  const [activeGame, setActiveGame] = useState<GameId | null>(null);
  const [activeSection, setActiveSection] = useState("world");
  const [scrolled, setScrolled] = useState(false);
  const lastTriggerRef = useRef<HTMLButtonElement | null>(null);
  const gameRoomRef = useRef<HTMLDivElement | null>(null);

  const closeGame = useCallback(() => {
    setActiveGame(null);
    window.setTimeout(() => lastTriggerRef.current?.focus(), 0);
  }, []);

  const launchGame = useCallback((gameId: GameId, trigger?: HTMLButtonElement | null) => {
    if (trigger) lastTriggerRef.current = trigger;
    setActiveGame(gameId);
  }, []);

  const navigate = useCallback((next: Route) => {
    const path = next === "game" ? GAME_PATH : "/";
    if (window.location.pathname !== path) window.history.pushState({ route: next }, "", path);
    setActiveHotspot(null);
    setActiveGame(null);
    setActivePreset("overview");
    if (next === "game") setWarRoomMode("cinematic");
    setRoute(next);
    window.scrollTo(0, 0);
  }, []);

  const routeLink = (next: Route) => (event: ReactMouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigate(next);
  };

  useEffect(() => {
    const onPopState = () => {
      setActiveHotspot(null);
      setActiveGame(null);
      setRoute(routeFromPath(window.location.pathname));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    document.title = route === "game" ? GAME_TITLE : HOME_TITLE;
  }, [route]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (viewMode !== "index") return;
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
  }, [viewMode]);

  useEffect(() => {
    if (!activeGame && !activeHotspot) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        if (activeGame && event.shiftKey) {
          closeGame();
          return;
        }
        if (!activeGame && activeHotspot) {
          setActiveHotspot(null);
          return;
        }
      }
      if (!activeGame || event.key !== "Tab") return;
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
  }, [activeGame, activeHotspot, closeGame]);

  useEffect(() => {
    document.body.style.overflow = activeGame ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [activeGame]);

  const openSectionFromNav = (sectionId: string) => {
    if (viewMode === "index") {
      document.getElementById(sectionId)?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    const matchingHotspot = WAR_ROOM_HOTSPOTS.find((h) => h.section === sectionId);
    if (matchingHotspot) {
      setActiveHotspot(matchingHotspot);
    }
  };

  const openAssetsDrawer = () => {
    const assetsHotspot = WAR_ROOM_HOTSPOTS.find((h) => h.id === "helmet") ?? WAR_ROOM_HOTSPOTS[0];
    setActiveHotspot(assetsHotspot);
  };

  const currentGame = games.find((game) => game.id === activeGame);
  const CurrentGame = activeGame ? gameViews[activeGame] : null;

  return (
    <div className={"hub-shell " + (viewMode === "warroom" ? "hub-shell--warroom" : "")}>
      <div className="hub-noise" aria-hidden="true" />
      <div className="hub-aurora hub-aurora--red" aria-hidden="true" />
      <div className="hub-aurora hub-aurora--blue" aria-hidden="true" />

      <header className={"command-nav " + (scrolled || viewMode === "warroom" ? "is-scrolled" : "")}>
        <a
          className="hub-brand"
          href="/"
          aria-label="Yor Ayrin home"
          onClick={routeLink("home")}
        >
          <i /><span>YOR // AYRIN</span><small>{viewMode === "warroom" ? (warRoomMode === "cinematic" ? "CINEMATIC / WAR ROOM" : "FREE ROAM 3D / WAR ROOM") : "PERSONAL INTERNET"}</small>
        </a>

        <nav className="command-links" aria-label="Primary navigation">
          <a
            className={(viewMode === "index" && activeSection === "world") || activeHotspot?.section === "world" ? "is-active" : ""}
            href="#world"
            onClick={(e) => {
              if (viewMode === "warroom") {
                e.preventDefault();
                openSectionFromNav("world");
              }
            }}
          >
            Worlds
          </a>
          <a
            className={(viewMode === "index" && activeSection === "arcade") || activeHotspot?.section === "arcade" ? "is-active" : ""}
            href="#arcade"
            onClick={(e) => {
              if (viewMode === "warroom") {
                e.preventDefault();
                openSectionFromNav("arcade");
              }
            }}
          >
            Arcade
          </a>
          <a
            className={(viewMode === "index" && activeSection === "media") || activeHotspot?.section === "media" ? "is-active" : ""}
            href="#media"
            onClick={(e) => {
              if (viewMode === "warroom") {
                e.preventDefault();
                openSectionFromNav("media");
              }
            }}
          >
            Media
          </a>
          <a
            className={(viewMode === "index" && activeSection === "archive") || activeHotspot?.section === "archive" ? "is-active" : ""}
            href="#archive"
            onClick={(e) => {
              if (viewMode === "warroom") {
                e.preventDefault();
                openSectionFromNav("archive");
              }
            }}
          >
            Archive
          </a>
          <a
            className={(viewMode === "index" && activeSection === "about") || activeHotspot?.section === "about" ? "is-active" : ""}
            href="#about"
            onClick={(e) => {
              if (viewMode === "warroom") {
                e.preventDefault();
                openSectionFromNav("about");
              }
            }}
          >
            Profile
          </a>
        </nav>

        <nav className="nav-mode-switch" aria-label="Pages">
          <a
            href="/"
            className={route === "home" ? "is-active" : ""}
            aria-current={route === "home" ? "page" : undefined}
            onClick={routeLink("home")}
          >
            Home
          </a>
          <a
            href={GAME_PATH}
            className={route === "game" ? "is-active" : ""}
            aria-current={route === "game" ? "page" : undefined}
            onClick={routeLink("game")}
          >
            3D Game
          </a>
        </nav>

        <a className="portfolio-link" href="https://yorayriniwnl.vercel.app">Portfolio <Arrow /></a>
      </header>

      {viewMode === "warroom" ? (
        <main id="top" className="warroom-main">
          <div
            className={"warroom-mode-switch" + (activeHotspot ? " has-drawer" : "")}
            role="group"
            aria-label="War Room view mode"
          >
            <button
              type="button"
              className={warRoomMode === "cinematic" ? "is-active" : ""}
              aria-pressed={warRoomMode === "cinematic"}
              onClick={() => setWarRoomMode("cinematic")}
            >
              Cinematic
            </button>
            <button
              type="button"
              className={warRoomMode === "free-roam" ? "is-active" : ""}
              aria-pressed={warRoomMode === "free-roam"}
              onClick={() => setWarRoomMode("free-roam")}
            >
              Free Roam 3D
            </button>
          </div>

          {warRoomMode === "cinematic" ? (
            <GameErrorBoundary
              key="cinematic"
              gameName="Cinematic War Room"
              onExit={() => navigate("home")}
              exitLabel="Return home"
            >
              <Suspense
                fallback={
                  <div className="warroom-loader" role="status">
                    <div className="warroom-loader__ring" />
                    <span>LOADING CINEMATIC WAR ROOM</span>
                    <small>Preparing depth map and interactive hotspots</small>
                  </div>
                }
              >
                <WarRoomCinematic
                  selectedHotspot={activeHotspot?.id ?? null}
                  onSelectHotspot={setActiveHotspot}
                  lanternBright={lanternBright}
                  onToggleLantern={() => setLanternBright((v) => !v)}
                  onOpenAssets={openAssetsDrawer}
                  inputSuspended={Boolean(activeGame)}
                />
              </Suspense>
            </GameErrorBoundary>
          ) : (
            <GameErrorBoundary
              key="free-roam"
              gameName="3D War Room"
              onExit={() => setWarRoomMode("cinematic")}
              exitLabel="Return to Cinematic"
            >
              <Suspense
                fallback={
                  <div className="warroom-loader" role="status">
                    <div className="warroom-loader__ring" />
                    <span>BOOTING THREE.JS ENGINE</span>
                    <small>Preparing 360° Free Roam 3D War Room canvas</small>
                  </div>
                }
              >
                <WarRoom3D
                  selectedHotspot={activeHotspot?.id ?? null}
                  onSelectHotspot={setActiveHotspot}
                  lanternBright={lanternBright}
                  onToggleLantern={() => setLanternBright((v) => !v)}
                  activePreset={activePreset}
                  onPresetChange={setActivePreset}
                  autoOrbit={autoOrbit}
                  onToggleAutoOrbit={() => setAutoOrbit((v) => !v)}
                  onOpenAssets={openAssetsDrawer}
                  inputSuspended={Boolean(activeGame)}
                />
              </Suspense>
            </GameErrorBoundary>
          )}

          {/* Interactive Tactical Drawer opened when clicking any 3D object */}
          {activeHotspot && (
            <aside className="warroom-drawer" role="dialog" aria-label={activeHotspot.label}>
              <header className="warroom-drawer__head">
                <div>
                  <span>{activeHotspot.code}</span>
                  <h2>{activeHotspot.label}</h2>
                  <p>{activeHotspot.subtitle}</p>
                </div>
                <button
                  type="button"
                  className="warroom-drawer__close"
                  onClick={() => setActiveHotspot(null)}
                  aria-label="Close panel"
                >
                  ESC ×
                </button>
              </header>

              <div className="warroom-drawer__body">
                {activeHotspot.directGame && (
                  <div className="warroom-drawer__cta">
                    <button
                      type="button"
                      className="hub-button hub-button--primary"
                      onClick={(e) => launchGame(activeHotspot.directGame!, e.currentTarget)}
                    >
                      Launch {games.find((g) => g.id === activeHotspot.directGame)?.name} <Arrow />
                    </button>
                  </div>
                )}

                {activeHotspot.section === "world" && (
                  <div className="drawer-stack">
                    {projects.map((p) => (
                      <article className="drawer-card" key={p.number}>
                        <div className="drawer-card__meta"><span>WORLD_{p.number}</span><small>{p.signal}</small></div>
                        <h3>{p.title}</h3>
                        <p>{p.description}</p>
                        <div className="drawer-card__links">
                          {p.live && <a href={p.live} target="_blank" rel="noreferrer">Open build <Arrow /></a>}
                          <a href={p.source} target="_blank" rel="noreferrer">Source <Arrow /></a>
                        </div>
                      </article>
                    ))}
                  </div>
                )}

                {activeHotspot.section === "arcade" && (
                  <div className="drawer-grid">
                    {games.map((g) => (
                      <button
                        key={g.id}
                        type="button"
                        className="drawer-game"
                        onClick={(e) => launchGame(g.id, e.currentTarget)}
                      >
                        <span>{g.index} · {g.difficulty}</span>
                        <strong>{g.glyph} {g.name}</strong>
                        <small>{g.category}</small>
                      </button>
                    ))}
                  </div>
                )}

                {activeHotspot.section === "media" && (
                  <div className="drawer-stack">
                    <figure className="drawer-media">
                      <img src="/renders/warroom-hero-4k.png" alt="4K Blender render of YOR War Room" loading="lazy" />
                      <figcaption>
                        <span>M00 / 4K BLENDER RENDER</span>
                        <strong>War Room Master 4K (3840x2160)</strong>
                        <p>Assembled directly from room.glb, operator.glb, and husky.glb in Blender 5.2.</p>
                      </figcaption>
                    </figure>
                    {mediaItems.map((m) => (
                      <figure className="drawer-media" key={m.index}>
                        <img src={m.image} alt={m.title} loading="lazy" />
                        <figcaption>
                          <span>{m.index} / {m.type}</span>
                          <strong>{m.title}</strong>
                          <p>{m.body}</p>
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                )}

                {activeHotspot.section === "archive" && (
                  <div className="drawer-stack">
                    <div className="drawer-note">
                      <span>BOOKSHELF SPINES</span>
                      <strong>DISCIPLINE · EXECUTION · COMPOUND · FREEDOM · CS2 · C++ · TECH · FINANCE · A BETTER ME</strong>
                    </div>
                    {archiveLinks.map((item) => (
                      <a className="drawer-card drawer-card--link" href={item.href} target="_blank" rel="noreferrer" key={item.index}>
                        <div className="drawer-card__meta"><span>{item.index}</span><small>{item.label}</small></div>
                        <h3>{item.title} <Arrow /></h3>
                        <p>{item.body}</p>
                      </a>
                    ))}
                  </div>
                )}

                {activeHotspot.section === "about" && (
                  <div className="drawer-stack">
                    <figure className="drawer-media">
                      <img src="/textures/ayush-portrait.jpg" alt="Chiaroscuro oil portrait of Ayush Roy" loading="lazy" />
                      <figcaption>
                        <span>PLAYER_01 / INDIA</span>
                        <strong>Ayush Roy (Yor Ayrin - iwnl)</strong>
                        <p>Computer science student, product-minded engineer, competitive player, and builder of systems that feel considered all the way down.</p>
                      </figcaption>
                    </figure>
                    <div className="drawer-card__links">
                      <a href="mailto:ayushroy.dev@gmail.com">Start a conversation <Arrow /></a>
                      <a href="https://yorayriniwnl.vercel.app" target="_blank" rel="noreferrer">Portfolio <Arrow /></a>
                      <a href="https://github.com/yorayriniwnl" target="_blank" rel="noreferrer">GitHub <Arrow /></a>
                    </div>
                  </div>
                )}

                {activeHotspot.section === "manifest" && (
                  <div className="drawer-stack">
                    <figure className="drawer-media">
                      <img src="/textures/notebook-pages.jpg" alt="IDEAS BUILD GRIND REPEAT notebook spread" loading="lazy" />
                      <figcaption>
                        <span>MANIFEST / 001</span>
                        <strong>IDEAS. BUILD. GRIND. REPEAT.</strong>
                        <p>Complexity can live in the engine. At the surface, it should arrive as clarity, feedback, and a next move worth taking.</p>
                      </figcaption>
                    </figure>
                    <div className="badge-wall" aria-label="Interests">
                      <span>CHESS</span><span>VISION</span><span>3D</span><span>SYSTEMS</span><span>MUSIC</span><span>CS2</span>
                    </div>
                  </div>
                )}

                {activeHotspot.section === "telemetry" && (
                  <div className="drawer-stack">
                    <div className="drawer-stats">
                      {playerStats.map((s) => (
                        <div className="drawer-stat" key={s.label}>
                          <strong>{s.value}</strong>
                          <span>{s.label}</span>
                          <small>{s.note}</small>
                        </div>
                      ))}
                    </div>
                    <a className="hub-button hub-button--steam" href="https://steamcommunity.com/id/yorayriniwnl/" target="_blank" rel="noreferrer">
                      Open Steam Profile <Arrow />
                    </a>
                  </div>
                )}

                {activeHotspot.section === "assets" && (
                  <div className="drawer-stack">
                    {glbAssets.map((asset) => (
                      <div className="drawer-card" key={asset.name}>
                        <div className="drawer-card__meta"><span>BLENDER 5.2 GLB</span><small>GAME-READY PBR</small></div>
                        <h3>{asset.title}</h3>
                        <p>{asset.specs}</p>
                        <div className="drawer-card__links">
                          <a href={asset.href} download={asset.name}>Download {asset.name} <Arrow /></a>
                        </div>
                      </div>
                    ))}
                    <div className="drawer-card">
                      <div className="drawer-card__meta"><span>4K RENDER</span><small>3840x2160 PNG</small></div>
                      <h3>War Room 4K Master Render</h3>
                      <p>High-resolution Blender 5.2 render assembling all three exported GLB files.</p>
                      <div className="drawer-card__links">
                        <a href="/renders/warroom-hero-4k.png" target="_blank" rel="noreferrer">Open 4K PNG <Arrow /></a>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </aside>
          )}
        </main>
      ) : (
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
                <a className="hub-button hub-button--primary" href={GAME_PATH} onClick={routeLink("game")}>Play the 3D game <Arrow /></a>
                <a className="hub-button hub-button--ghost" href="#arcade">Enter the arcade <span aria-hidden="true">↓</span></a>
                <a className="hub-button hub-button--steam" href="https://steamcommunity.com/id/yorayriniwnl/" target="_blank" rel="noreferrer">Steam profile <Arrow /></a>
              </div>
              <div className="hero-system-line"><span>DELHI / UTC +5:30</span><i /><span>08 PLAYABLE ROOMS</span><i /><span>360° BLENDER GLB ROOM</span></div>
            </div>
          </section>

          <section className="stat-deck hub-container" aria-label="Player profile statistics">
            <div className="stat-deck__lead"><span>PROFILE TELEMETRY</span><strong>THE LONG GAME</strong><small>Public signals from the player profile</small></div>
            {playerStats.map((stat) => <div className="stat-unit" key={stat.label}><strong>{stat.value}</strong><span>{stat.label}</span><small>{stat.note}</small></div>)}
          </section>

          <section className="game3d-section hub-section hub-container" id="game3d" aria-labelledby="game3d-title">
            <div className="hub-section-heading">
              <div><p className="hub-eyebrow"><span>00</span> / 3D GAME</p><h2 id="game3d-title">Walk the<br /><em>war room.</em></h2></div>
              <p>A playable third-person world built in Blender and rendered live in the browser with three.js. Move the operator through the room, find the interactive stations, and launch arcade rooms from inside the scene.</p>
            </div>
            <a className="game3d-feature" href={GAME_PATH} onClick={routeLink("game")} aria-label="Launch the 3D War Room game">
              <span className="game3d-feature__media">
                <img src="/renders/warroom-hero-1600.jpg" alt="Blender render of the YOR 3D War Room" width={1600} height={900} loading="lazy" decoding="async" />
                <span className="game3d-feature__tag"><i /> LIVE 3D / WEBGL</span>
              </span>
              <span className="game3d-feature__copy">
                <small>SECTOR 02 / THIRD-PERSON FREE ROAM</small>
                <strong>YOR War Room</strong>
                <span className="game3d-feature__body">{WAR_ROOM_HOTSPOTS.length} interactive stations, a rigged operator, a shell-fur husky, and direct launches into Yor Chess, Type // Rush, and Strike Arena.</span>
                <span className="game3d-feature__controls">
                  <span><small>MOVE</small><b>WASD</b></span>
                  <span><small>SPRINT</small><b>Shift</b></span>
                  <span><small>INTERACT</small><b>E / Click</b></span>
                  <span><small>CAMERA</small><b>V</b></span>
                </span>
                <b className="game3d-feature__cta">Launch 3D game <Arrow /></b>
              </span>
            </a>
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
                <div className="arcade-feature__copy"><span>THE ROOM SELECTOR</span><h3>Short sessions.<br /><em>Serious feedback.</em></h3><p>Choose the mood, not just the mechanic. Calm recall, clean speed, or a stubborn board, all opening without leaving the hub.</p><a href="#game-library">Browse all rooms <Arrow /></a></div>
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
                <small>LAST UPDATED / NOV 2026</small>
              </aside>
            </div>
          </section>

          <section className="profile-section hub-section" id="about" aria-labelledby="profile-title">
            <div className="hub-container profile-panel">
              <div className="profile-panel__copy">
                <p className="hub-eyebrow"><span>05</span> / OPEN CHANNEL</p>
                <h2 id="profile-title">The person<br /><em>behind the player.</em></h2>
                <p>I am Ayush Roy, a computer science student, product-minded engineer, competitive player, and builder of systems that feel considered all the way down.</p>
                <div className="profile-actions"><a href="mailto:ayushroy.dev@gmail.com">Start a conversation <Arrow /></a><a href="https://yorayriniwnl.vercel.app">Read the portfolio <Arrow /></a></div>
              </div>
              <div className="profile-panel__signal" aria-hidden="true"><span>Y</span><i /><i /><i /><small>BUILD / PLAY / REPEAT</small></div>
            </div>
          </section>
        </main>
      )}

      {viewMode === "index" && (
        <footer className="hub-footer">
          <div><i /> YOR // AYRIN <small>WORLD_02</small></div><p>A living index of work, play, and everything between.</p><div><a href={GAME_PATH} onClick={routeLink("game")}>3D Game</a><a href="https://github.com/yorayriniwnl">GitHub</a><a href="https://steamcommunity.com/id/yorayriniwnl/">Steam</a><a href="#top">Top ↑</a></div>
        </footer>
      )}

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
