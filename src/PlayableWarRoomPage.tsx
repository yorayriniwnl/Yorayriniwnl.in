import { Component, lazy, Suspense, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { publicAsset } from "./lib/publicAsset";
import { useArcade } from "./Arcade";
import { archiveLinks, games, glbAssets, mediaItems, playerStats, projects, WAR_ROOM_HOTSPOTS, type HotspotConfig } from "./data/hubData";
import "./playable-war-room.css";

const WarRoom3D = lazy(() => import("./components/WarRoom3D"));

const panels = [
  { id: "world", label: "Worlds" },
  { id: "arcade", label: "Arcade" },
  { id: "media", label: "Media" },
  { id: "archive", label: "Archive" },
  { id: "about", label: "Profile" },
] as const;

function Arrow() {
  return <span className="arrow" aria-hidden="true">↗</span>;
}

class WarRoomErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Could not start the 3D War Room", error, info);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="game-failure" role="alert">
        <h2>3D War Room could not start.</h2>
        <p>The room requires a browser with WebGL 2.</p>
        <button type="button" onClick={() => window.location.assign("/")}>Return home <Arrow /></button>
      </div>
    );
  }
}

export default function PlayableWarRoomPage() {
  const [activeHotspot, setActiveHotspot] = useState<HotspotConfig | null>(null);
  const [activePreset, setActivePreset] = useState("overview");
  const [lanternBright, setLanternBright] = useState(true);
  const { open: launchGame, room } = useArcade();

  useEffect(() => {
    document.title = "3D War Room // YOR Ayrin";
  }, []);

  useEffect(() => {
    if (!activeHotspot || room) return;
    const closePanel = (event: KeyboardEvent) => {
      if (event.key === "Escape") setActiveHotspot(null);
    };
    window.addEventListener("keydown", closePanel);
    return () => window.removeEventListener("keydown", closePanel);
  }, [activeHotspot, room]);

  const openAssetsDrawer = () => {
    setActiveHotspot(WAR_ROOM_HOTSPOTS.find((hotspot) => hotspot.section === "assets") ?? null);
  };

  return (
    <>
      <div className="hub-shell hub-shell--warroom">
        <div className="hub-noise" aria-hidden="true" />
        <header className="command-nav is-scrolled">
          <a className="hub-brand" href="/" aria-label="Yor Ayrin home">
            <i /><span>YOR // AYRIN</span><small>3D GAME / WAR ROOM</small>
          </a>
          <nav className="command-links" aria-label="Primary navigation">
            {panels.map((panel) => (
              <button
                key={panel.id}
                type="button"
                className={activeHotspot?.section === panel.id ? "is-active" : undefined}
                onClick={() => setActiveHotspot(WAR_ROOM_HOTSPOTS.find((hotspot) => hotspot.section === panel.id) ?? null)}
              >
                {panel.label}
              </button>
            ))}
          </nav>
          <nav className="nav-mode-switch" aria-label="Pages">
            <a href="/">Home</a>
            <a href="/3d" className="is-active" aria-current="page">3D Game</a>
          </nav>
        </header>

        <main id="top" className="warroom-main" aria-label="3D War Room">
          <WarRoomErrorBoundary>
            <Suspense
              fallback={
                <div className="warroom-loader" role="status">
                  <div className="warroom-loader__ring" />
                  <span>BOOTING THREE.JS ENGINE</span>
                  <small>Preparing 360° War Room canvas</small>
                </div>
              }
            >
              <WarRoom3D
                onSelectHotspot={setActiveHotspot}
                lanternBright={lanternBright}
                onToggleLantern={() => setLanternBright((v) => !v)}
                activePreset={activePreset}
                onPresetChange={setActivePreset}
                onOpenAssets={openAssetsDrawer}
                inputSuspended={Boolean(room)}
              />
            </Suspense>
          </WarRoomErrorBoundary>

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
                      <img src={publicAsset("renders/warroom-hero-1600.jpg")} alt="4K Blender render of YOR War Room" loading="lazy" />
                      <figcaption>
                        <span>M00 / 4K BLENDER RENDER</span>
                        <strong>War Room master render</strong>
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
                      <img src={publicAsset("textures/ayush-portrait.jpg")} alt="Chiaroscuro oil portrait of Ayush Roy" loading="lazy" />
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
                      <img src={publicAsset("textures/notebook-pages.jpg")} alt="IDEAS BUILD GRIND REPEAT notebook spread" loading="lazy" />
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
                        <a href={publicAsset("renders/warroom-hero-4k.png")} target="_blank" rel="noreferrer">Open 4K PNG <Arrow /></a>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </aside>
          )}
        </main>
      </div>
      {room}
    </>
  );
}
