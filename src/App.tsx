import { useEffect, useRef, useState } from "react";
import { arsenal, creed, dossier, profile, projects } from "./content";
import { games, useArcade } from "./Arcade";
import { SECTION_IDS } from "./scene/shots";
import type { WarRoom } from "./scene/WarRoom";
import "./styles.css";

type Status = "loading" | "ready" | "fallback";

const NAV = [
  { id: "dossier", label: "Dossier" },
  { id: "arsenal", label: "Arsenal" },
  { id: "operations", label: "Operations" },
  { id: "offduty", label: "Off duty" },
  { id: "comms", label: "Comms" },
];

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

function Ext({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) {
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      {children}
      <span aria-hidden="true" className="ext">↗</span>
    </a>
  );
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const roomRef = useRef<WarRoom | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [loaded, setLoaded] = useState(0);
  const [active, setActive] = useState("hero");
  const [project, setProject] = useState(0);
  const { open, room } = useArcade();

  // ---------------------------------------------------------- 3D scene ----
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!webglAvailable()) {
      setStatus("fallback");
      return;
    }
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches || new URLSearchParams(window.location.search).has("rm");
    const coarse = window.matchMedia("(pointer: coarse)").matches;
    const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8;
    const params = new URLSearchParams(window.location.search);
    const capture = params.has("capture");
    const forced = params.get("q");
    const quality = forced === "low" || forced === "high" ? forced : coarse || mem <= 4 || window.innerWidth < 760 ? "low" : "high";
    const dpr = params.get("dpr") ? Number(params.get("dpr")) : undefined;
    let disposed = false;
    let instance: WarRoom | null = null;

    import("./scene/WarRoom")
      .then(async ({ WarRoom }) => {
        if (disposed) return;
        instance = new WarRoom({
          canvas,
          quality,
          reducedMotion,
          creed,
          skills: arsenal.flatMap((g) => g.items),
          onProgress: (p) => setLoaded(p),
          dpr,
        });
        if (capture) (window as unknown as { __warroom: WarRoom }).__warroom = instance;
        roomRef.current = instance;
        instance.resize(window.innerWidth, window.innerHeight);
        await instance.load();
        if (disposed) return;
        instance.setProject(projects[0]);
        if (!capture) instance.start();
        setStatus("ready");
      })
      .catch((err) => {
        console.error("3D scene failed", err);
        setStatus("fallback");
      });

    const onResize = () => instance?.resize(window.innerWidth, window.innerHeight);
    const onPointer = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      instance?.setPointer((e.clientX / window.innerWidth) * 2 - 1, -((e.clientY / window.innerHeight) * 2 - 1));
    };
    const onVisibility = () => instance?.setVisible(!document.hidden);
    window.addEventListener("resize", onResize);
    window.addEventListener("pointermove", onPointer, { passive: true });
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      disposed = true;
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointer);
      document.removeEventListener("visibilitychange", onVisibility);
      instance?.dispose();
      roomRef.current = null;
    };
  }, []);

  // -------------------------------------------- scroll -> camera shots ----
  useEffect(() => {
    let raf = 0;
    const sections = SECTION_IDS.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const update = () => {
      raf = 0;
      const mid = window.scrollY + window.innerHeight * 0.5;
      const vh = window.innerHeight;
      // each shot holds while its section fills the screen, then travels
      const holds = sections.map((s) => {
        const start = s.offsetTop + Math.min(s.offsetHeight, vh) / 2;
        return [start, Math.max(start, s.offsetTop + s.offsetHeight - vh / 2)] as const;
      });
      let p = 0;
      let current = sections[0]?.id ?? "hero";
      sections.forEach((s) => {
        if (mid >= s.offsetTop - vh * 0.2) current = s.id;
      });
      for (let i = 0; i < holds.length; i++) {
        if (mid >= holds[i][0]) p = i;
        if (i < holds.length - 1 && mid > holds[i][1]) {
          const f = (mid - holds[i][1]) / Math.max(1, holds[i + 1][0] - holds[i][1]);
          p = i + Math.min(1, Math.max(0, f));
        }
      }
      roomRef.current?.setProgress(p);
      setActive(current);
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [status]);

  // the project card in view drives the laptop screen
  useEffect(() => {
    const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-project]"));
    const io = new IntersectionObserver(
      (entries) => {
        const hit = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (hit) setProject(Number((hit.target as HTMLElement).dataset.project));
      },
      { rootMargin: "-35% 0px -35% 0px", threshold: [0, 0.5, 1] },
    );
    cards.forEach((c) => io.observe(c));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    roomRef.current?.setProject(projects[project]);
  }, [project, status]);

  return (
    <div className={`app app--${status}`} data-active={active}>
      <canvas ref={canvasRef} className="stage" aria-hidden="true" />
      <div className="stage-fallback" aria-hidden="true" />

      <div className={`loader ${status !== "loading" ? "loader--done" : ""}`} aria-live="polite">
        <div className="loader__mark" aria-hidden="true">
          <span>Y</span>
          <span>O</span>
          <span>R</span>
        </div>
        <div className="loader__bar">
          <i style={{ transform: `scaleX(${Math.max(0.04, loaded)})` }} />
        </div>
        <p>{status === "loading" ? `Entering the war room · ${Math.round(loaded * 100)}%` : "Ready"}</p>
      </div>

      <header className="hud">
        <a className="hud__mark" href="#hero" aria-label="Back to top">
          <b>YA</b>
          <span>YOR // AYUSH ROY</span>
        </a>
        <nav aria-label="Sections">
          {NAV.map((n) => (
            <a key={n.id} href={`#${n.id}`} className={active === n.id ? "is-active" : ""}>
              {n.label}
            </a>
          ))}
        </nav>
        <Ext className="hud__cta" href={profile.links.resume}>Résumé</Ext>
      </header>

      <main>
        {/* ------------------------------------------------------- hero ---- */}
        <section id="hero" className="sec sec--hero">
          <div className="hero">
            <p className="kicker">
              <i /> {profile.status} · {profile.location}
            </p>
            <h1>
              <span className="hero__first">Ayush</span>
              <span className="hero__last">Roy</span>
            </h1>
            <p className="hero__role">{profile.headline}</p>
            <p className="hero__lede">{profile.positioning}</p>
            <div className="actions">
              <a className="btn btn--primary" href="#operations">View operations</a>
              <a className="btn" href={`mailto:${profile.email}`}>Open a channel</a>
            </div>
          </div>
          <a className="scroll-cue" href="#dossier" aria-label="Scroll to dossier">
            <span>Scroll</span>
            <i />
          </a>
        </section>

        {/* ---------------------------------------------------- dossier ---- */}
        <section id="dossier" className="sec sec--right">
          <article className="panel">
            <p className="label">01 / Dossier</p>
            <h2>The operator.</h2>
            <p className="lede">
              Backend-heavy engineer who likes the parts of a product that have to hold under pressure: trust boundaries, realtime paths, data
              models, test gates, and the ML that needs an honest evaluation.
            </p>
            <ol className="timeline">
              {dossier.map((d) => (
                <li key={d.title}>
                  <span>{d.when}</span>
                  <strong>{d.title}</strong>
                  <p>{d.body}</p>
                </li>
              ))}
            </ol>
            <p className="quote">“Keep grinding, keep losing.” The losses are where the lessons compound.</p>
          </article>
        </section>

        {/* ---------------------------------------------------- arsenal ---- */}
        <section id="arsenal" className="sec sec--left">
          <article className="panel">
            <p className="label">02 / Arsenal</p>
            <h2>The shelf I reach for.</h2>
            <p className="creed" aria-label="Creed">
              {creed.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </p>
            <div className="arsenal">
              {arsenal.map((g) => (
                <div key={g.label} className="arsenal__group">
                  <h3>{g.label}</h3>
                  <ul>
                    {g.items.map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </article>
        </section>

        {/* ------------------------------------------------- operations ---- */}
        <section id="operations" className="sec sec--ops">
          <div className="ops-head panel panel--slim">
            <p className="label">03 / Operations</p>
            <h2>Six missions, with the evidence attached.</h2>
            <p className="lede">Every number below is a dated review snapshot with its scope written next to it, not a live dashboard.</p>
          </div>
          <div className="ops">
            {projects.map((p, i) => (
              <article key={p.slug} className={`op ${project === i ? "is-current" : ""}`} data-project={i}>
                <header>
                  <span className="op__index">OP-{p.index}</span>
                  <span className="op__status">{p.status}</span>
                </header>
                <h3>{p.title}</h3>
                <p className="op__kicker">{p.kicker}</p>
                <p className="op__purpose">{p.purpose}</p>
                <dl className="op__metrics">
                  {p.metrics.map((m) => (
                    <div key={m.label} title={m.context}>
                      <dt>{m.label}</dt>
                      <dd>{m.value}</dd>
                      <small>{m.context}</small>
                    </div>
                  ))}
                </dl>
                <p className="op__role">
                  {p.role} · {p.period}
                </p>
                <ul className="op__stack">
                  {p.stack.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
                <div className="op__links">
                  {p.live && <Ext href={p.live}>Live</Ext>}
                  {p.source && <Ext href={p.source}>Source</Ext>}
                  {!p.source && <span className="muted">Source private</span>}
                </div>
              </article>
            ))}
          </div>
        </section>

        {/* ---------------------------------------------------- offduty ---- */}
        <section id="offduty" className="sec sec--right">
          <article className="panel">
            <p className="label">04 / Off duty</p>
            <h2>Between deploys.</h2>
            <p className="lede">
              Thousands of hours of competitive play taught me patience, reads and recovery. These eight rooms are built from scratch and run right
              here in your browser.
            </p>
            <div className="arcade">
              {games.map((g) => (
                <button key={g.id} type="button" className="arcade__game" onClick={(e) => open(g.id, e.currentTarget)}>
                  <span className="arcade__glyph" aria-hidden="true">{g.glyph}</span>
                  <span>
                    <strong>{g.name}</strong>
                    <small>{g.category}</small>
                  </span>
                </button>
              ))}
            </div>
            <div className="actions">
              <Ext className="btn" href={profile.links.steam}>Steam profile</Ext>
              <Ext className="btn" href={profile.links.youtube}>YouTube</Ext>
            </div>
          </article>
        </section>

        {/* ------------------------------------------------------ comms ---- */}
        <section id="comms" className="sec sec--left sec--last">
          <article className="panel">
            <p className="label">05 / Comms</p>
            <h2>Open a channel.</h2>
            <p className="lede">Looking for software engineering roles where backend depth matters. The fastest route is email.</p>
            <a className="mail" href={`mailto:${profile.email}`}>{profile.email}</a>
            <div className="actions">
              <Ext className="btn btn--primary" href={profile.links.resume}>Download résumé</Ext>
              <Ext className="btn" href={profile.links.github}>GitHub</Ext>
              <Ext className="btn" href={profile.links.linkedin}>LinkedIn</Ext>
            </div>
          </article>
          <footer className="foot">
            <span>© {new Date().getFullYear()} Ayush Roy · YOR</span>
            <span>Every model in this room is generated from code. <Ext href="https://github.com/yorayriniwnl/Yorayriniwnl.in">See how</Ext></span>
          </footer>
        </section>
      </main>
      {room}
    </div>
  );
}
