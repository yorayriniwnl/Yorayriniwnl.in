import React, { useState, useEffect, useRef, useCallback } from "react";

// ─── TYPES ───────────────────────────────────────────────────────────────────
interface Project {
  num: string;
  title: string;
  desc: string;
  tags: string[];
  liveUrl?: string;
  liveLabel?: string;
  ghUrl: string;
  featured?: boolean;
}
interface SkillGroup {
  category: string;
  items: string[];
}
interface ContactLink {
  label: string;
  href: string;
  icon: React.ReactNode;
}
interface RepoSummary {
  name: string;
  desc: string;
  repoUrl: string;
  liveUrl?: string;
  liveLabel?: string;
  language?: string;
  updated: string;
}
interface Vec2 { x: number; y: number }

// ─── DATA ────────────────────────────────────────────────────────────────────
const PORTFOLIO_INFO = {
  name: "Ayush Roy",
  location: "India",
  email: "yorayriniwnl@gmail.com",
  phone: "+91 8918940799",
  site: "https://yorayriniwnl.in",
  portfolio: "https://yorayriniwnl.vercel.app",
  github: "https://github.com/yorayriniwnl",
  linkedin: "https://linkedin.com/in/yorayriniwnl",
  role: "Project Gateway for Yor Ayrin",
  heroDescription:
    "This is the default landing page for the Yorayriniwnl web presence: one launchpad for live apps, source repositories, experiments, and the separate portfolio page.",
  contactDescription:
    "For the full recruiter story, open the portfolio. For source, jump straight into GitHub. For collaboration, email still works best.",
};

const PORTFOLIO_PROJECTS: Project[] = [
  {
    num: "01",
    title: "Portfolio / Yor Ayrin iwnl",
    desc: "The dedicated portfolio and recruiter-facing experience for Ayush Roy. It stays separate from this default project hub so visitors can choose between browsing projects and reading the full personal profile.",
    tags: ["Next.js", "TypeScript", "React", "Portfolio", "Vercel"],
    liveUrl: "https://yorayriniwnl.vercel.app",
    liveLabel: "Open Portfolio",
    ghUrl: "https://github.com/yorayriniwnl/Yor-Ayrin-iwnl",
    featured: true,
  },
  {
    num: "02",
    title: "Yor Zenith",
    desc: "Solar energy planning and decision-support platform for feasibility checks, subsidy guidance, energy estimates, and planning workflows.",
    tags: ["TypeScript", "React", "Solar Planning", "Decision Support"],
    liveUrl: "https://zenith-xi-snowy.vercel.app/",
    liveLabel: "Open Live",
    ghUrl: "https://github.com/yorayriniwnl/Yor-Zenith",
  },
  {
    num: "03",
    title: "Yor Smriti",
    desc: "Emotion-driven interactive web experience focused on memories, timelines, and narrative storytelling.",
    tags: ["TypeScript", "Interactive UI", "Storytelling", "Vercel"],
    liveUrl: "https://yor-smriti.vercel.app",
    liveLabel: "Open Live",
    ghUrl: "https://github.com/yorayriniwnl/Yor-Smriti",
  },
  {
    num: "04",
    title: "Yor Status",
    desc: "Public status and accountability interface with a product-led civic-tech direction and student-community framing.",
    tags: ["JavaScript", "React", "Status Tracking", "Vercel"],
    liveUrl: "https://yor-status.vercel.app",
    liveLabel: "Open Live",
    ghUrl: "https://github.com/yorayriniwnl/Yor-Status",
  },
  {
    num: "05",
    title: "Yor Feelings",
    desc: "Expressive frontend project translating human emotions into dynamic UI interactions and visual states.",
    tags: ["TypeScript", "Next.js", "React", "Realtime UX"],
    liveUrl: "https://yor-feelings.vercel.app",
    liveLabel: "Open Live",
    ghUrl: "https://github.com/yorayriniwnl/Yor-Feelings",
  },
  {
    num: "06",
    title: "Yor AI vs Real Image",
    desc: "Computer-vision project that classifies AI-generated versus real images and presents the model workflow as a usable web experience.",
    tags: ["Python", "Computer Vision", "ML", "Vercel"],
    liveUrl: "https://yor-ai-vs-real-image.vercel.app",
    liveLabel: "Open Live",
    ghUrl: "https://github.com/yorayriniwnl/Yor-Ai-vs-real-image",
  },
  {
    num: "07",
    title: "Yor Mentor Mentee System",
    desc: "Thoughtful platform for managing mentor-mentee relationships, matching workflows, and growth-oriented coordination.",
    tags: ["Python", "Flask", "Matching", "Vercel"],
    liveUrl: "https://mentor-mentee-system.vercel.app",
    liveLabel: "Open Live",
    ghUrl: "https://github.com/yorayriniwnl/mentor-mentee-system",
  },
  {
    num: "08",
    title: "Taskflow",
    desc: "Task and workflow interface for organizing work with a small, focused JavaScript app surface.",
    tags: ["JavaScript", "Productivity", "Task Management", "Vercel"],
    liveUrl: "https://taskflow-xi-ochre.vercel.app",
    liveLabel: "Open Live",
    ghUrl: "https://github.com/yorayriniwnl/Taskflow",
  },
  {
    num: "09",
    title: "CBSE Result Analyzer",
    desc: "Result-analysis utility for turning CBSE result data into clearer summaries and performance signals.",
    tags: ["Python", "Data Analysis", "Education", "Vercel"],
    liveUrl: "https://cbse-result-analyzer.vercel.app",
    liveLabel: "Open Live",
    ghUrl: "https://github.com/yorayriniwnl/CBSE-Result-Analyzer",
  },
  {
    num: "10",
    title: "Eat-a-lot",
    desc: "A smaller HTML-based web project with a live Vercel deployment outside the main Yor product line.",
    tags: ["HTML", "CSS", "Web", "Vercel"],
    liveUrl: "https://eat-a-lot-five.vercel.app",
    liveLabel: "Open Live",
    ghUrl: "https://github.com/yorayriniwnl/Eat-a-lot",
  },
  {
    num: "11",
    title: "Yor Helios",
    desc: "Python-based system exploring automation, computational logic, and intelligent backend processing.",
    tags: ["Python", "Backend", "Automation", "Systems"],
    ghUrl: "https://github.com/yorayriniwnl/Yor-Helios",
  },
  {
    num: "12",
    title: "Yor Solar Nexus",
    desc: "Earlier cloud-based solar planning and optimization build for feasibility, energy needs, cost savings, subsidy guidance, and rooftop recommendations.",
    tags: ["HTML", "Solar Planning", "Optimization", "Research"],
    ghUrl: "https://github.com/yorayriniwnl/Yor-Solar-Nexus",
  },
];

const GITHUB_IMPORTS: RepoSummary[] = [
  {
    name: "Yorayriniwnl.in",
    desc: "This default gateway repository, connected to the primary domain and used as the entry point for the wider project map.",
    repoUrl: "https://github.com/yorayriniwnl/Yorayriniwnl.in",
    liveUrl: "https://yorayriniwnlin.vercel.app",
    liveLabel: "Gateway",
    language: "TypeScript",
    updated: "Apr 23, 2026",
  },
  {
    name: "Yorayriniwnl",
    desc: "GitHub profile repository used to shape the public identity layer and account-facing presentation.",
    repoUrl: "https://github.com/yorayriniwnl/Yorayriniwnl",
    updated: "Apr 23, 2026",
  },
  {
    name: "C_PlusPlus",
    desc: "C++ learning and practice repository.",
    repoUrl: "https://github.com/yorayriniwnl/C_PlusPlus",
    language: "C++",
    updated: "Apr 26, 2026",
  },
  {
    name: "Yor-Project-Health-Tracker",
    desc: "TypeScript project-health tracker repository from the Yor project family.",
    repoUrl: "https://github.com/yorayriniwnl/Yor-Project-Health-Tracker",
    language: "TypeScript",
    updated: "Apr 26, 2026",
  },
  {
    name: "Yor_Token_Usage",
    desc: "JavaScript utility repository for tracking or exploring token usage.",
    repoUrl: "https://github.com/yorayriniwnl/Yor_Token_Usage",
    language: "JavaScript",
    updated: "Apr 25, 2026",
  },
  {
    name: "Trading_Bot",
    desc: "Python trading automation experiment repository.",
    repoUrl: "https://github.com/yorayriniwnl/Trading_Bot",
    language: "Python",
    updated: "Apr 23, 2026",
  },
  {
    name: "Hyperliquid_Analysis",
    desc: "Python analysis repository for Hyperliquid-related market or data exploration.",
    repoUrl: "https://github.com/yorayriniwnl/Hyperliquid_Analysis",
    language: "Python",
    updated: "Apr 23, 2026",
  },
  {
    name: "Yor-Talks",
    desc: "Social platform concept exploring premium interaction design and product-first storytelling.",
    repoUrl: "https://github.com/yorayriniwnl/Yor-Talks",
    language: "JavaScript",
    updated: "Apr 23, 2026",
  },
];

const CURATED_PROJECT_COUNT = String(PORTFOLIO_PROJECTS.length).padStart(2, "0");
const PUBLIC_REPO_COUNT = String(PORTFOLIO_PROJECTS.length + GITHUB_IMPORTS.length).padStart(2, "0");

const PORTFOLIO_SKILLS: SkillGroup[] = [
  { category: "Frontend", items: ["React", "Next.js", "TypeScript", "HTML / CSS", "TailwindCSS"] },
  { category: "Backend", items: ["FastAPI", "Flask", "Node.js", "WebSocket", "SQL (basic)"] },
  { category: "ML / CV", items: ["Python", "OpenCV", "Scikit-Learn", "Streamlit"] },
  { category: "3D / Visualization", items: ["Three.js", "React dashboards", "Solar planning UI"] },
  { category: "Tools / Basics", items: ["Git / GitHub", "VS Code", "Docker", "Java / C (basic)"] },
];

const PORTFOLIO_SKILL_RADAR = [
  { label: "React", value: 82 },
  { label: "Next.js", value: 84 },
  { label: "Three.js", value: 72 },
  { label: "Python", value: 84 },
  { label: "OpenCV", value: 76 },
  { label: "GitHub", value: 90 },
];

const PORTFOLIO_MARQUEE_ITEMS = [
  "Project Gateway",
  "Live Builds",
  "GitHub Repos",
  "Portfolio Link",
  "Solar Tools",
  "Computer Vision",
  "Python Systems",
  "Interactive UI",
  "Vercel Deployments",
];

// ─── SVG ICONS ───────────────────────────────────────────────────────────────
const IconArrow = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
    <path d="M5 12h14M12 5l7 7-7 7"/>
  </svg>
);
const IconExternal = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
    <polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
  </svg>
);
const IconGithub = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577v-2.165c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23A11.509 11.509 0 0 1 12 5.803c1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576C20.566 21.797 24 17.3 24 12c0-6.63-5.37-12-12-12z"/>
  </svg>
);
const IconLinkedIn = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433a2.062 2.062 0 0 1-2.063-2.065 2.064 2.064 0 1 1 2.063 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
  </svg>
);
const IconTwitter = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);
const IconGlobe = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="12" r="10"/>
    <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
  </svg>
);
const IconPhone = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.2 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.35 1.9.65 2.81a2 2 0 0 1-.45 2.11L8.04 9.91a16 16 0 0 0 6.05 6.05l1.27-1.27a2 2 0 0 1 2.11-.45c.91.3 1.85.52 2.81.65A2 2 0 0 1 22 16.92z"/>
  </svg>
);

// ─── GLOBAL STYLES ───────────────────────────────────────────────────────────
const GlobalStyles = () => (
  <style>{`
    @import url('https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;0,700;1,300;1,400;1,600&family=Syne:wght@400;500;600;700;800&family=JetBrains+Mono:wght@300;400;500&display=swap');

    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    html { scroll-behavior: smooth; }
    body {
      background: var(--bg);
      color: var(--cream);
      font-family: 'Syne', sans-serif;
      overflow-x: hidden;
      cursor: none;
    }
    :root {
      --bg:         #080706;
      --bg2:        #0f0e0c;
      --bg3:        #161410;
      --gold:       #c9a96e;
      --gold-l:     #e8d5a8;
      --gold-d:     #8a6f3e;
      --gold-dim:   #4a3c28;
      --cream:      #f0ebe2;
      --cream-dim:  #b5ab9e;
      --muted:      #5c5248;
      --muted-d:    #2e2820;
      --border:     rgba(201,169,110,0.14);
      --border-h:   rgba(201,169,110,0.38);
      --glass:      rgba(201,169,110,0.03);
      --glass-h:    rgba(201,169,110,0.06);
      --r:          14px;
      --r-sm:       8px;
    }

    /* ── CURSOR ── */
    #cur-dot, #cur-ring {
      pointer-events: none; position: fixed; z-index: 9999; border-radius: 50%;
    }
    #cur-dot {
      width: 5px; height: 5px;
      background: var(--gold);
      transform: translate(-50%,-50%);
      transition: transform .06s, background .2s;
    }
    #cur-ring {
      width: 36px; height: 36px;
      border: 1px solid rgba(201,169,110,0.4);
      transform: translate(-50%,-50%);
      transition: width .3s, height .3s, border-color .3s, background .3s;
      z-index: 9998;
    }
    body.hovering #cur-ring {
      width: 54px; height: 54px;
      border-color: var(--gold);
      background: rgba(201,169,110,0.05);
    }
    body.hovering #cur-dot {
      background: var(--gold-l);
      transform: translate(-50%,-50%) scale(1.8);
    }

    /* ── AMBIENT MESH ── */
    .mesh-orb {
      position: fixed; border-radius: 50%; filter: blur(120px);
      pointer-events: none; z-index: 0;
      animation: float 26s ease-in-out infinite alternate;
    }
    .mesh-1 {
      width: 700px; height: 700px;
      background: radial-gradient(circle, rgba(201,169,110,0.07) 0%, transparent 70%);
      top: -200px; right: -150px; animation-duration: 28s;
    }
    .mesh-2 {
      width: 500px; height: 500px;
      background: radial-gradient(circle, rgba(139,90,43,0.08) 0%, transparent 70%);
      bottom: 5%; left: -120px; animation-duration: 22s; animation-delay: -11s;
    }
    .mesh-3 {
      width: 380px; height: 380px;
      background: radial-gradient(circle, rgba(240,235,226,0.03) 0%, transparent 70%);
      top: 50%; left: 40%; animation-duration: 34s; animation-delay: -18s;
    }
    @keyframes float {
      0%   { transform: translate(0,0) scale(1); }
      33%  { transform: translate(50px,-40px) scale(1.08); }
      66%  { transform: translate(-32px,24px) scale(0.93); }
      100% { transform: translate(20px,50px) scale(1.05); }
    }

    /* ── GRAIN ── */
    .grain {
      position: fixed; inset: 0; z-index: 1; pointer-events: none; opacity: 0.032;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 512 512' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='g'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23g)'/%3E%3C/svg%3E");
    }

    /* ── MARQUEE ── */
    @keyframes marquee { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }
    .marquee-track { animation: marquee 35s linear infinite; }
    .marquee-track:hover { animation-play-state: paused; }

    /* ── SCROLL REVEAL ── */
    .reveal {
      opacity: 0; transform: translateY(28px);
      transition: opacity .9s cubic-bezier(.16,1,.3,1), transform .9s cubic-bezier(.16,1,.3,1);
    }
    .reveal.visible { opacity: 1; transform: none; }

    /* ── HERO ANIMS ── */
    @keyframes fadeUp {
      from { opacity:0; transform:translateY(26px); }
      to   { opacity:1; transform:none; }
    }
    .hero-eyebrow { animation: fadeUp .8s 1.05s cubic-bezier(.16,1,.3,1) both; }
    .hero-name    { animation: fadeUp 1s  1.2s  cubic-bezier(.16,1,.3,1) both; }
    .hero-role    { animation: fadeUp .9s 1.35s cubic-bezier(.16,1,.3,1) both; }
    .hero-desc    { animation: fadeUp .9s 1.5s  cubic-bezier(.16,1,.3,1) both; }
    .hero-btns    { animation: fadeUp .9s 1.65s cubic-bezier(.16,1,.3,1) both; }
    .scroll-hint  { animation: fadeUp 1s  2.1s  cubic-bezier(.16,1,.3,1) both; }
    .hero-visual  { animation: fadeUp 1.2s 1.0s cubic-bezier(.16,1,.3,1) both; }

    /* ── LOADER ── */
    @keyframes loaderBar { from{width:0} to{width:100%} }
    @keyframes countUp { from{opacity:0} to{opacity:1} }

    /* ── SCROLL LINE ── */
    @keyframes scrollDrop {
      0%   { transform: scaleY(0); transform-origin: top; opacity: 0; }
      40%  { transform: scaleY(1); transform-origin: top; opacity: 1; }
      60%  { transform: scaleY(1); transform-origin: bottom; opacity: 1; }
      100% { transform: scaleY(0); transform-origin: bottom; opacity: 0; }
    }
    .scroll-line-anim { animation: scrollDrop 2.4s 2.9s ease-in-out infinite; }

    /* ── TILT ── */
    .tilt-card { transform-style: preserve-3d; will-change: transform; }

    /* ── SECTION LABEL ── */
    .section-label {
      font-family: 'JetBrains Mono', monospace;
      font-size: .62rem; letter-spacing: .22em;
      text-transform: uppercase; color: var(--gold);
      display: flex; align-items: center; gap: .8rem;
      margin-bottom: .9rem;
    }
    .section-label::before {
      content: ''; width: 22px; height: 1px;
      background: var(--gold); display: block; flex-shrink: 0;
    }

    /* ── RESPONSIVE ── */
    @media (max-width: 860px) {
      .premium-gateway { grid-template-columns: 1fr !important; }
      .premium-strip   { grid-template-columns: 1fr !important; }
      .projects-grid    { grid-template-columns: 1fr !important; }
      .featured-layout  { flex-direction: column !important; }
      .about-grid       { grid-template-columns: 1fr !important; gap: 3rem !important; }
      .contact-grid     { grid-template-columns: 1fr !important; gap: 3rem !important; }
      .hero-layout      { flex-direction: column !important; }
      .hero-visual-wrap { display: none !important; }
    }
    @media (max-width: 640px) {
      .wrap { padding: 0 1.5rem !important; }
      .nav-links { display: none !important; }
    }

    /* ── SELECTION ── */
    ::selection { background: rgba(201,169,110,0.22); color: var(--cream); }

    /* ── SCROLLBAR ── */
    ::-webkit-scrollbar { width: 3px; }
    ::-webkit-scrollbar-track { background: var(--bg); }
    ::-webkit-scrollbar-thumb { background: rgba(201,169,110,0.25); border-radius: 2px; }

    /* ── GOLD GLOW PULSE ── */
    @keyframes goldPulse {
      0%,100% { box-shadow: 0 0 24px rgba(201,169,110,0.12), 0 0 60px rgba(201,169,110,0.04); }
      50%      { box-shadow: 0 0 36px rgba(201,169,110,0.22), 0 0 90px rgba(201,169,110,0.1); }
    }
    .gold-pulse { animation: goldPulse 3.5s ease-in-out infinite; }
  `}</style>
);

// ─── CURSOR ──────────────────────────────────────────────────────────────────
const Cursor: React.FC = () => {
  const dotRef  = useRef<HTMLDivElement>(null);
  const ringRef = useRef<HTMLDivElement>(null);
  const mouse   = useRef<Vec2>({ x: 0, y: 0 });
  const ring    = useRef<Vec2>({ x: 0, y: 0 });
  const raf     = useRef<number>(0);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      mouse.current = { x: e.clientX, y: e.clientY };
      if (dotRef.current) {
        dotRef.current.style.left = e.clientX + "px";
        dotRef.current.style.top  = e.clientY + "px";
      }
    };
    const animate = () => {
      ring.current.x += (mouse.current.x - ring.current.x) * 0.09;
      ring.current.y += (mouse.current.y - ring.current.y) * 0.09;
      if (ringRef.current) {
        ringRef.current.style.left = ring.current.x + "px";
        ringRef.current.style.top  = ring.current.y + "px";
      }
      raf.current = requestAnimationFrame(animate);
    };
    const onEnter = () => document.body.classList.add("hovering");
    const onLeave = () => document.body.classList.remove("hovering");
    document.addEventListener("mousemove", onMove);
    raf.current = requestAnimationFrame(animate);
    document.querySelectorAll("a, button, .tilt-card, .skill-pill").forEach(el => {
      el.addEventListener("mouseenter", onEnter);
      el.addEventListener("mouseleave", onLeave);
    });
    return () => {
      document.removeEventListener("mousemove", onMove);
      cancelAnimationFrame(raf.current);
    };
  }, []);

  return (
    <>
      <div id="cur-dot"  ref={dotRef}  />
      <div id="cur-ring" ref={ringRef} />
    </>
  );
};

// ─── LOADER ──────────────────────────────────────────────────────────────────
const Loader: React.FC<{ done: boolean }> = ({ done }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (done) return;
    const iv = setInterval(() => {
      setCount(c => {
        if (c >= 100) { clearInterval(iv); return 100; }
        return c + Math.floor(Math.random() * 8) + 2;
      });
    }, 28);
    return () => clearInterval(iv);
  }, [done]);

  return (
    <div style={{
      position: "fixed", inset: 0,
      background: "#050403",
      zIndex: 9000,
      display: "flex", alignItems: "center", justifyContent: "center",
      flexDirection: "column",
      opacity: done ? 0 : 1,
      visibility: done ? "hidden" : "visible",
      transition: "opacity .9s cubic-bezier(.16,1,.3,1), visibility .9s ease",
    }}>
      <div style={{
        fontFamily: "'Cormorant Garamond', serif",
        fontWeight: 300,
        fontSize: "clamp(2.5rem, 8vw, 5.5rem)",
        letterSpacing: "-.02em",
        color: "#f0ebe2",
        lineHeight: 1,
        marginBottom: "3rem",
      }}>
        YR<span style={{ color: "#c9a96e" }}>.</span>
      </div>
      <div style={{
        width: 180, height: 1,
        background: "rgba(201,169,110,0.12)",
        position: "relative", overflow: "hidden",
        marginBottom: "1.2rem",
      }}>
        <div style={{
          position: "absolute", top: 0, left: 0, height: "100%",
          background: "linear-gradient(90deg, var(--gold-d), var(--gold))",
          width: `${Math.min(count, 100)}%`,
          transition: "width .1s ease",
        }}/>
      </div>
      <span style={{
        fontFamily: "'JetBrains Mono', monospace",
        fontSize: ".62rem", letterSpacing: ".28em",
        color: "#4a3c28", textTransform: "uppercase",
      }}>
        {String(Math.min(count, 100)).padStart(3, "0")} / 100
      </span>
    </div>
  );
};

// ─── TILT HOOK ───────────────────────────────────────────────────────────────
const useTilt = (strength = 10) => {
  const ref = useRef<HTMLDivElement>(null);
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current; if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = (e.clientX - rect.left) / rect.width  - 0.5;
    const my = (e.clientY - rect.top)  / rect.height - 0.5;
    el.style.transform = `perspective(900px) rotateY(${mx * strength}deg) rotateX(${-my * strength}deg) scale3d(1.015,1.015,1.015)`;
    el.style.setProperty("--mx", ((e.clientX - rect.left) / rect.width * 100) + "%");
    el.style.setProperty("--my", ((e.clientY - rect.top)  / rect.height * 100) + "%");
  }, [strength]);
  const handleMouseLeave = useCallback(() => {
    const el = ref.current; if (!el) return;
    el.style.transform = "perspective(900px) rotateY(0deg) rotateX(0deg) scale3d(1,1,1)";
    el.style.transition = "transform .6s cubic-bezier(.16,1,.3,1)";
    setTimeout(() => { if (el) el.style.transition = ""; }, 600);
  }, []);
  return { ref, handleMouseMove, handleMouseLeave };
};

// ─── SCROLL REVEAL HOOK ──────────────────────────────────────────────────────
const useScrollReveal = () => {
  useEffect(() => {
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => {
        if (e.isIntersecting) {
          const idx = Array.from(e.target.parentElement?.children ?? []).indexOf(e.target as Element);
          (e.target as HTMLElement).style.transitionDelay = `${(idx % 5) * 90}ms`;
          e.target.classList.add("visible");
          obs.unobserve(e.target);
        }
      }),
      { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
    );
    document.querySelectorAll(".reveal").forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);
};

// ═══════════════════════════════════════════════════════════════════════════════
// VISUAL 1 — HERO CONSTELLATION CANVAS
// ═══════════════════════════════════════════════════════════════════════════════
const HeroConstellation: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;

    let W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width  = W * devicePixelRatio;
    canvas.height = H * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    const NUM_NODES = 28;
    type Node = { x: number; y: number; vx: number; vy: number; r: number; opacity: number };
    const nodes: Node[] = Array.from({ length: NUM_NODES }, () => ({
      x: Math.random() * W, y: Math.random() * H,
      vx: (Math.random() - .5) * .35,
      vy: (Math.random() - .5) * .35,
      r: Math.random() * 1.8 + .6,
      opacity: Math.random() * .5 + .25,
    }));

    let raf: number;
    let t = 0;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      t += 0.004;

      // Draw connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x;
          const dy = nodes[i].y - nodes[j].y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 130) {
            const alpha = (1 - dist / 130) * 0.18;
            ctx.beginPath();
            ctx.moveTo(nodes[i].x, nodes[i].y);
            ctx.lineTo(nodes[j].x, nodes[j].y);
            ctx.strokeStyle = `rgba(201,169,110,${alpha})`;
            ctx.lineWidth = .6;
            ctx.stroke();
          }
        }
      }

      // Draw nodes
      nodes.forEach((n, i) => {
        const pulse = Math.sin(t * 1.5 + i * .8) * .3 + .7;
        ctx.beginPath();
        ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(201,169,110,${n.opacity * pulse})`;
        ctx.fill();

        // Gold halo on larger nodes
        if (n.r > 1.8) {
          ctx.beginPath();
          ctx.arc(n.x, n.y, n.r * 3, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(201,169,110,${0.04 * pulse})`;
          ctx.fill();
        }

        n.x += n.vx; n.y += n.vy;
        if (n.x < 0 || n.x > W) n.vx *= -1;
        if (n.y < 0 || n.y > H) n.vy *= -1;
      });

      // Rotating ring
      const cx = W * .5, cy = H * .5;
      const ringR = Math.min(W, H) * .38;
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(201,169,110,0.06)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Orbiting dot
      const ox = cx + Math.cos(t) * ringR;
      const oy = cy + Math.sin(t) * ringR;
      ctx.beginPath();
      ctx.arc(ox, oy, 3, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(201,169,110,0.7)";
      ctx.fill();

      // Inner ring
      ctx.beginPath();
      ctx.arc(cx, cy, ringR * .55, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(201,169,110,0.04)";
      ctx.lineWidth = 1;
      ctx.stroke();

      // Counter-orbit
      const ox2 = cx + Math.cos(-t * 1.4) * ringR * .55;
      const oy2 = cy + Math.sin(-t * 1.4) * ringR * .55;
      ctx.beginPath();
      ctx.arc(ox2, oy2, 2, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(232,213,168,0.5)";
      ctx.fill();

      // Crosshair at center
      const ch = 14;
      ctx.strokeStyle = "rgba(201,169,110,0.15)";
      ctx.lineWidth = .8;
      ctx.beginPath(); ctx.moveTo(cx - ch, cy); ctx.lineTo(cx + ch, cy); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx, cy - ch); ctx.lineTo(cx, cy + ch); ctx.stroke();

      raf = requestAnimationFrame(draw);
    };
    draw();

    const handleResize = () => {
      W = canvas.offsetWidth; H = canvas.offsetHeight;
      canvas.width  = W * devicePixelRatio;
      canvas.height = H * devicePixelRatio;
      ctx.scale(devicePixelRatio, devicePixelRatio);
    };
    window.addEventListener("resize", handleResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", handleResize); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block", opacity: .9 }}
    />
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// VISUAL 2 — SKILL RADAR CHART
// ═══════════════════════════════════════════════════════════════════════════════
const SkillRadar: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const SIZE = 260;
    canvas.width = SIZE * devicePixelRatio;
    canvas.height = SIZE * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);

    const cx = SIZE / 2, cy = SIZE / 2, R = SIZE * .38;
    const N = PORTFOLIO_SKILL_RADAR.length;
    let raf: number;
    let t = 0;

    const getPoint = (i: number, val: number) => {
      const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
      const r = (val / 100) * R;
      return { x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r };
    };

    const draw = () => {
      ctx.clearRect(0, 0, SIZE, SIZE);
      t += 0.012;
      progressRef.current = Math.min(progressRef.current + 0.018, 1);
      const p = progressRef.current;

      // Web rings
      for (let ring = 1; ring <= 4; ring++) {
        const ringR = (ring / 4) * R;
        ctx.beginPath();
        for (let i = 0; i < N; i++) {
          const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
          const x = cx + Math.cos(angle) * ringR;
          const y = cy + Math.sin(angle) * ringR;
          i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.strokeStyle = `rgba(201,169,110,${0.06 + ring * 0.02})`;
        ctx.lineWidth = .8;
        ctx.stroke();
      }

      // Axis lines
      for (let i = 0; i < N; i++) {
        const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(angle) * R, cy + Math.sin(angle) * R);
        ctx.strokeStyle = "rgba(201,169,110,0.1)";
        ctx.lineWidth = .8;
        ctx.stroke();
      }

      // Data polygon
      ctx.beginPath();
      for (let i = 0; i < N; i++) {
        const val = PORTFOLIO_SKILL_RADAR[i].value * p;
        const pt = getPoint(i, val);
        i === 0 ? ctx.moveTo(pt.x, pt.y) : ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();
      const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
      grad.addColorStop(0, "rgba(201,169,110,0.22)");
      grad.addColorStop(1, "rgba(201,169,110,0.04)");
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = `rgba(201,169,110,${0.5 + Math.sin(t) * 0.15})`;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Data points
      for (let i = 0; i < N; i++) {
        const val = PORTFOLIO_SKILL_RADAR[i].value * p;
        const pt = getPoint(i, val);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 3.5, 0, Math.PI * 2);
        ctx.fillStyle = "var(--gold)";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 6, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(201,169,110,0.12)";
        ctx.fill();
      }

      // Labels
      ctx.font = `400 9.5px 'JetBrains Mono', monospace`;
      ctx.fillStyle = "rgba(176,163,140,0.8)";
      ctx.textAlign = "center";
      for (let i = 0; i < N; i++) {
        const angle = (i / N) * Math.PI * 2 - Math.PI / 2;
        const labelR = R + 22;
        const x = cx + Math.cos(angle) * labelR;
        const y = cy + Math.sin(angle) * labelR;
        ctx.fillText(PORTFOLIO_SKILL_RADAR[i].label, x, y + 3.5);
      }

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: 260, height: 260, display: "block" }}
    />
  );
};

// ═══════════════════════════════════════════════════════════════════════════════
// VISUAL 3 — ANIMATED GRADIENT MESH (featured project)
// ═══════════════════════════════════════════════════════════════════════════════
const GradientMesh: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext("2d"); if (!ctx) return;
    const W = canvas.offsetWidth, H = canvas.offsetHeight;
    canvas.width  = W * devicePixelRatio;
    canvas.height = H * devicePixelRatio;
    ctx.scale(devicePixelRatio, devicePixelRatio);
    let t = 0, raf: number;

    const draw = () => {
      ctx.clearRect(0, 0, W, H);
      t += 0.007;

      // Moving gradient blobs
      const blobs = [
        { x: W * (.3 + Math.sin(t)        * .22), y: H * (.4 + Math.cos(t * .8)    * .3), r: W * .55, c: [201,169,110] },
        { x: W * (.7 + Math.cos(t * 1.2)  * .2),  y: H * (.5 + Math.sin(t * 1.1)   * .3), r: W * .45, c: [139,90,43] },
        { x: W * (.5 + Math.sin(t * .6)   * .35), y: H * (.6 + Math.cos(t * 1.4)   * .25),r: W * .4,  c: [240,235,226] },
      ];

      blobs.forEach(({ x, y, r, c }) => {
        const g = ctx.createRadialGradient(x, y, 0, x, y, r);
        g.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},0.10)`);
        g.addColorStop(1, `rgba(${c[0]},${c[1]},${c[2]},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
      });

      // Grid lines
      const GRID = 7;
      for (let i = 0; i <= GRID; i++) {
        const x = (i / GRID) * W;
        const wobble = Math.sin(t * 1.3 + i * .7) * 4;
        ctx.beginPath();
        ctx.moveTo(x + wobble, 0);
        ctx.lineTo(x - wobble, H);
        ctx.strokeStyle = "rgba(201,169,110,0.05)";
        ctx.lineWidth = .6;
        ctx.stroke();
      }
      for (let j = 0; j <= 5; j++) {
        const y = (j / 5) * H;
        const wobble = Math.sin(t + j * .9) * 3;
        ctx.beginPath();
        ctx.moveTo(0, y + wobble);
        ctx.lineTo(W, y - wobble);
        ctx.strokeStyle = "rgba(201,169,110,0.04)";
        ctx.lineWidth = .6;
        ctx.stroke();
      }

      // Corner accent dots
      [[12,12],[W-12,12],[12,H-12],[W-12,H-12]].forEach(([x,y]) => {
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, Math.PI*2);
        ctx.fillStyle = `rgba(201,169,110,${0.3 + Math.sin(t*2)*0.15})`;
        ctx.fill();
      });

      raf = requestAnimationFrame(draw);
    };
    draw();
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: "100%", display: "block", borderRadius: "inherit" }}
    />
  );
};

// ─── NAV ─────────────────────────────────────────────────────────────────────
const Nav: React.FC = () => {
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 60);
      const docH = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(docH > 0 ? (y / docH) * 100 : 0);
    };
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <nav style={{
      position: "fixed", top: 0, left: 0, right: 0, zIndex: 100,
      padding: "1.4rem 0",
      backdropFilter: "blur(32px)",
      WebkitBackdropFilter: "blur(32px)",
      borderBottom: scrolled ? "1px solid rgba(201,169,110,0.1)" : "1px solid transparent",
      background: scrolled ? "rgba(8,7,6,0.85)" : "transparent",
      transition: "background .45s, border-color .45s",
    }}>
      {/* Progress bar */}
      <div style={{
        position: "absolute", bottom: 0, left: 0, height: 1,
        width: `${progress}%`,
        background: "linear-gradient(90deg, var(--gold-d), var(--gold))",
        transition: "width .1s linear",
      }}/>
      <div className="wrap" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 2.5rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <a href="#" style={{
          fontFamily: "'Cormorant Garamond', serif",
          fontWeight: 600, fontSize: "1.55rem",
          color: "#f0ebe2", textDecoration: "none",
          letterSpacing: "-.01em",
          transition: "color .2s",
        }}>
          YR<span style={{ color: "var(--gold)" }}>.</span>
        </a>
        <ul className="nav-links" style={{ display: "flex", gap: "2.8rem", listStyle: "none", alignItems: "center" }}>
          {[["#projects","Projects"],["#about","Purpose"]].map(([href, label]) => (
            <li key={href}>
              <a href={href} style={{
                fontFamily: "'JetBrains Mono', monospace", fontSize: ".65rem",
                color: "var(--muted)", textDecoration: "none",
                letterSpacing: ".14em", textTransform: "uppercase",
                transition: "color .2s",
              }}
              onMouseEnter={e => (e.currentTarget.style.color = "var(--cream-dim)")}
              onMouseLeave={e => (e.currentTarget.style.color = "var(--muted)")}>
                {label}
              </a>
            </li>
          ))}
          <li>
            <a href="#contact" style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: ".65rem",
              color: "var(--gold)", textDecoration: "none",
              letterSpacing: ".1em", textTransform: "uppercase",
              padding: ".52rem 1.3rem",
              border: "1px solid rgba(201,169,110,0.28)",
              borderRadius: 5,
              transition: "all .25s",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = "rgba(201,169,110,0.08)";
              e.currentTarget.style.borderColor = "rgba(201,169,110,0.6)";
              e.currentTarget.style.boxShadow = "0 0 24px rgba(201,169,110,0.12)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "rgba(201,169,110,0.28)";
              e.currentTarget.style.boxShadow = "none";
            }}>
              Contact
            </a>
          </li>
        </ul>
      </div>
    </nav>
  );
};

// ─── HERO ────────────────────────────────────────────────────────────────────
const PremiumTopLinks: React.FC = () => {
  const premiumLinks = [
    {
      eyebrow: "Watch our flagship product",
      title: "Yor Zenith",
      desc: "The product signal first-time visitors should see first: solar planning, feasibility checks, subsidy guidance, and decision support in one focused build.",
      href: "https://zenith-xi-snowy.vercel.app/",
      action: "Watch Yor Zenith",
      icon: <IconExternal />,
      featured: true,
      meta: "Live product",
    },
    {
      eyebrow: "My portfolio link",
      title: "Portfolio / Yor Ayrin iwnl",
      desc: "The human and recruiter-facing layer: background, work narrative, credibility, and direct contact.",
      href: PORTFOLIO_INFO.portfolio,
      action: "Open Portfolio",
      icon: <IconArrow />,
      featured: false,
      meta: "Personal profile",
    },
  ];

  return (
    <div className="premium-gateway" style={{
      display: "grid",
      gridTemplateColumns: "0.86fr 1.36fr",
      gap: "1rem",
      alignItems: "stretch",
      marginBottom: "3.6rem",
    }}>
      <div style={{
        border: "1px solid rgba(201,169,110,0.12)",
        borderRadius: "var(--r-sm)",
        background: "rgba(255,255,255,0.018)",
        padding: "1.3rem",
        minHeight: 196,
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}>
        <div>
          <div style={{
            fontFamily: "'JetBrains Mono', monospace",
            fontSize: ".58rem",
            letterSpacing: ".18em",
            textTransform: "uppercase",
            color: "var(--gold)",
            opacity: .76,
            marginBottom: ".9rem",
          }}>
            Primary gateway
          </div>
          <h2 style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontSize: "clamp(1.9rem, 3vw, 2.65rem)",
            lineHeight: .96,
            fontWeight: 700,
            letterSpacing: "-.02em",
            color: "var(--cream)",
            marginBottom: ".85rem",
          }}>
            Start with the two signals that matter.
          </h2>
          <p style={{ color: "var(--muted)", fontSize: ".84rem", lineHeight: 1.72 }}>
            Zenith proves the product direction. The portfolio proves the person behind the build. Everything else stays available below.
          </p>
        </div>
        <div style={{
          display: "flex",
          gap: ".45rem",
          flexWrap: "wrap",
          marginTop: "1.15rem",
        }}>
          {["Product", "Portfolio", "Repository hub"].map(label => (
            <span key={label} style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: ".58rem",
              letterSpacing: ".08em",
              textTransform: "uppercase",
              color: "var(--gold-d)",
              border: "1px solid rgba(201,169,110,0.14)",
              borderRadius: 4,
              padding: ".28rem .55rem",
              background: "rgba(201,169,110,0.025)",
            }}>
              {label}
            </span>
          ))}
        </div>
      </div>

      <div className="premium-strip" style={{
        display: "grid",
        gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
        gap: ".9rem",
      }}>
        {premiumLinks.map(({ eyebrow, title, desc, href, action, icon, featured, meta }) => (
          <a
            key={title}
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              position: "relative",
              overflow: "hidden",
              minHeight: 196,
              padding: "1.35rem",
              borderRadius: "var(--r-sm)",
              border: featured ? "1px solid rgba(201,169,110,0.52)" : "1px solid rgba(201,169,110,0.18)",
              background: featured
                ? "linear-gradient(135deg, rgba(201,169,110,0.2), rgba(255,255,255,0.04))"
                : "rgba(201,169,110,0.035)",
              color: "var(--cream)",
              textDecoration: "none",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
              gap: "1.1rem",
              boxShadow: featured ? "0 18px 70px rgba(201,169,110,0.15)" : "none",
              transition: "transform .25s, border-color .25s, background .25s, box-shadow .25s",
            }}
            onMouseEnter={e => {
              e.currentTarget.style.transform = "translateY(-3px)";
              e.currentTarget.style.borderColor = "rgba(201,169,110,0.66)";
              e.currentTarget.style.background = featured
                ? "linear-gradient(135deg, rgba(201,169,110,0.26), rgba(255,255,255,0.06))"
                : "rgba(201,169,110,0.06)";
              e.currentTarget.style.boxShadow = "0 18px 72px rgba(201,169,110,0.16)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.transform = "";
              e.currentTarget.style.borderColor = featured ? "rgba(201,169,110,0.52)" : "rgba(201,169,110,0.18)";
              e.currentTarget.style.background = featured
                ? "linear-gradient(135deg, rgba(201,169,110,0.2), rgba(255,255,255,0.04))"
                : "rgba(201,169,110,0.035)";
              e.currentTarget.style.boxShadow = featured ? "0 18px 70px rgba(201,169,110,0.15)" : "none";
            }}
          >
            <div style={{
              position: "absolute",
              inset: 0,
              background: featured
                ? "radial-gradient(460px circle at 18% 0%, rgba(232,213,168,0.16), transparent 58%)"
                : "radial-gradient(360px circle at 12% 8%, rgba(232,213,168,0.08), transparent 58%)",
              pointerEvents: "none",
            }}/>
            <div style={{ position: "relative" }}>
              <div style={{
                display: "flex",
                justifyContent: "space-between",
                gap: ".8rem",
                alignItems: "center",
                marginBottom: ".85rem",
              }}>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: ".56rem",
                  letterSpacing: ".16em",
                  textTransform: "uppercase",
                  color: "var(--gold)",
                  opacity: .82,
                }}>
                  {eyebrow}
                </div>
                <span style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: ".52rem",
                  letterSpacing: ".1em",
                  textTransform: "uppercase",
                  color: featured ? "var(--gold-l)" : "var(--gold-d)",
                  border: "1px solid rgba(201,169,110,0.16)",
                  borderRadius: 4,
                  padding: ".24rem .42rem",
                  whiteSpace: "nowrap",
                }}>
                  {meta}
                </span>
              </div>
              <h3 style={{
                fontFamily: "'Cormorant Garamond', serif",
                fontSize: featured ? "2.35rem" : "2.05rem",
                lineHeight: .96,
                fontWeight: 700,
                letterSpacing: "-.02em",
                color: "var(--cream)",
                marginBottom: ".75rem",
              }}>
                {title}
              </h3>
              <p style={{ color: "var(--muted)", fontSize: ".82rem", lineHeight: 1.65 }}>
                {desc}
              </p>
            </div>
            <span style={{
              position: "relative",
              display: "inline-flex",
              alignItems: "center",
              gap: ".45rem",
              width: "fit-content",
              color: featured ? "var(--gold-l)" : "var(--cream-dim)",
              fontFamily: "'Syne', sans-serif",
              fontSize: ".72rem",
              fontWeight: 600,
              letterSpacing: ".07em",
              textTransform: "uppercase",
            }}>
              {icon} {action}
            </span>
          </a>
        ))}
      </div>
    </div>
  );
};

const Hero: React.FC = () => (
  <section className="hero-section" style={{
    minHeight: "100vh",
    display: "flex", alignItems: "center",
    padding: "10rem 0 6rem", position: "relative",
  }}>
    <div className="wrap" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 2.5rem", width: "100%" }}>
      <PremiumTopLinks />
      <div className="hero-layout" style={{ display: "flex", alignItems: "center", gap: "4rem" }}>
        {/* Text */}
        <div style={{ flex: "1 1 auto" }}>
          {/* Eyebrow */}
          <div className="hero-eyebrow" style={{ display: "inline-flex", alignItems: "center", gap: ".75rem", marginBottom: "2.5rem" }}>
            <span style={{
              width: 7, height: 7, borderRadius: "50%",
              background: "#4ade80", boxShadow: "0 0 8px #4ade80",
              flexShrink: 0,
              animation: "pulse 2.2s ease-in-out infinite",
            }}/>
            <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:.35}}`}</style>
            <span style={{
              fontFamily: "'JetBrains Mono', monospace",
              fontSize: ".63rem", color: "var(--muted)",
              letterSpacing: ".2em", textTransform: "uppercase",
            }}>Default Project Landing</span>
          </div>

          {/* Name */}
          <h1 className="hero-name" style={{
            fontFamily: "'Cormorant Garamond', serif",
            fontWeight: 700,
            fontSize: "clamp(4.5rem, 10vw, 9.5rem)",
            lineHeight: .88,
            letterSpacing: "-.03em",
            color: "var(--cream)",
            marginBottom: ".12em",
          }}>
            Yor<br/>
            <span style={{
              background: "linear-gradient(135deg, #c9a96e 0%, #e8d5a8 40%, #a87d45 100%)",
              WebkitBackgroundClip: "text",
              WebkitTextFillColor: "transparent",
              backgroundClip: "text",
              fontStyle: "italic",
            }}>
              Project Hub.
            </span>
          </h1>

          {/* Role */}
          <p className="hero-role" style={{
            fontFamily: "'Syne', sans-serif", fontWeight: 400,
            fontSize: "clamp(1.1rem, 2.5vw, 1.75rem)",
            color: "var(--muted)", letterSpacing: ".04em",
            marginBottom: "2.5rem",
          }}>
            {PORTFOLIO_INFO.role}
          </p>

          {/* Description */}
          <p className="hero-desc" style={{
            fontSize: ".92rem", color: "var(--muted)",
            maxWidth: 420, lineHeight: 1.9,
            marginBottom: "3.2rem",
            borderLeft: "2px solid rgba(201,169,110,0.25)",
            paddingLeft: "1.2rem",
          }}>
            {PORTFOLIO_INFO.heroDescription}
          </p>

          {/* Buttons */}
          <div className="hero-btns" style={{ display: "flex", gap: ".9rem", flexWrap: "wrap" }}>
            <a href="#projects" style={{
              display: "inline-flex", alignItems: "center", gap: ".55rem",
              fontFamily: "'Syne', sans-serif", fontWeight: 600,
              fontSize: ".78rem", letterSpacing: ".08em",
              textDecoration: "none",
              padding: ".9rem 2.2rem", borderRadius: 6,
              background: "linear-gradient(135deg, #8a6f3e, #c9a96e)",
              color: "#080706", transition: "all .3s",
              boxShadow: "0 4px 28px rgba(201,169,110,0.25)",
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 40px rgba(201,169,110,0.4)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 4px 28px rgba(201,169,110,0.25)"; }}>
              <IconArrow /> Browse Projects
            </a>
            <a href={PORTFOLIO_INFO.portfolio} target="_blank" rel="noopener noreferrer" style={{
              display: "inline-flex", alignItems: "center", gap: ".55rem",
              fontFamily: "'Syne', sans-serif", fontWeight: 500,
              fontSize: ".78rem", letterSpacing: ".08em",
              textDecoration: "none",
              padding: ".9rem 2.2rem", borderRadius: 6,
              border: "1px solid rgba(201,169,110,0.28)",
              color: "var(--cream-dim)", transition: "all .3s",
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(201,169,110,0.55)"; e.currentTarget.style.color = "var(--gold-l)"; e.currentTarget.style.background = "rgba(201,169,110,0.06)"; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(201,169,110,0.28)"; e.currentTarget.style.color = "var(--cream-dim)"; e.currentTarget.style.background = "transparent"; }}>
              Open Portfolio
            </a>
          </div>
        </div>

        {/* VISUAL 1 — Constellation */}
        <div className="hero-visual hero-visual-wrap" style={{
          flexShrink: 0, width: "min(420px, 40vw)", height: "min(420px, 40vw)",
          position: "relative",
        }}>
          <div style={{
            position: "absolute", inset: 0,
            border: "1px solid rgba(201,169,110,0.1)",
            borderRadius: "50%",
          }}/>
          <HeroConstellation />
        </div>
      </div>
    </div>

    {/* Scroll hint */}
    <div className="scroll-hint" style={{
      position: "absolute", bottom: "2.8rem", left: "50%",
      transform: "translateX(-50%)",
      display: "flex", flexDirection: "column", alignItems: "center", gap: ".6rem",
    }}>
      <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: ".58rem", letterSpacing: ".22em", textTransform: "uppercase", color: "var(--muted-d)" }}>Scroll</span>
      <div className="scroll-line-anim" style={{ width: 1, height: 48, background: "linear-gradient(to bottom, var(--gold), transparent)" }}/>
    </div>
  </section>
);

// ─── MARQUEE ─────────────────────────────────────────────────────────────────
const Marquee: React.FC = () => {
  const items = [...PORTFOLIO_MARQUEE_ITEMS, ...PORTFOLIO_MARQUEE_ITEMS];
  return (
    <div style={{
      borderTop: "1px solid rgba(201,169,110,0.08)",
      borderBottom: "1px solid rgba(201,169,110,0.08)",
      padding: "1.1rem 0", overflow: "hidden",
      background: "rgba(201,169,110,0.015)",
      position: "relative", zIndex: 2,
    }}>
      <div className="marquee-track" style={{ display: "flex", whiteSpace: "nowrap" }}>
        {items.map((text, i) => (
          <span key={i} style={{
            display: "inline-flex", alignItems: "center", gap: "1.6rem",
            padding: "0 2.8rem",
            fontFamily: "'Cormorant Garamond', serif",
            fontStyle: "italic", fontWeight: 300, fontSize: "1.1rem",
            color: "var(--muted-d)", letterSpacing: ".04em",
          }}>
            <span style={{ width: 4, height: 4, borderRadius: "50%", background: "var(--gold-dim)", flexShrink: 0, display: "block" }}/>
            {text}
          </span>
        ))}
      </div>
    </div>
  );
};

// ─── PROJECT CARD ─────────────────────────────────────────────────────────────
const ProjectCard: React.FC<{ project: Project }> = ({ project }) => {
  const { ref, handleMouseMove, handleMouseLeave } = useTilt(project.featured ? 5 : 9);
  const projectHref = project.liveUrl ?? project.ghUrl;
  const projectActions = [
    ...(project.liveUrl
      ? [{ href: project.liveUrl, label: project.liveLabel ?? "Open Live", icon: <IconExternal />, primary: true }]
      : []),
    { href: project.ghUrl, label: "GitHub", icon: <IconGithub />, primary: false },
  ];

  return (
    <div
      ref={ref}
      className="tilt-card"
      style={{
        background: "var(--glass)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r)",
        padding: project.featured ? "3rem 3.2rem" : "2.4rem",
        display: "flex",
        flexDirection: project.featured ? "row" as const : "column" as const,
        gap: project.featured ? "3.5rem" : "1.2rem",
        alignItems: project.featured ? "center" : undefined,
        position: "relative",
        overflow: "hidden",
        transition: "border-color .35s, background .35s",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        cursor: "default",
      }}
      onMouseMove={handleMouseMove}
      onMouseLeave={e => {
        handleMouseLeave();
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.background  = "var(--glass)";
        e.currentTarget.style.boxShadow   = "none";
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = "rgba(201,169,110,0.3)";
        e.currentTarget.style.background  = "var(--glass-h)";
        e.currentTarget.style.boxShadow   = "0 12px 50px rgba(201,169,110,0.08)";
      }}
    >
      {/* Radial spotlight */}
      <div style={{
        position: "absolute", inset: 0,
        background: "radial-gradient(480px circle at var(--mx,50%) var(--my,50%), rgba(201,169,110,0.05), transparent 55%)",
        pointerEvents: "none", borderRadius: "inherit",
      }}/>

      {/* Large number watermark */}
      <div style={{
        position: "absolute", top: "-.6rem", right: "1.5rem",
        fontFamily: "'Cormorant Garamond', serif", fontWeight: 700,
        fontSize: "7rem", lineHeight: 1,
        color: "rgba(201,169,110,0.04)", letterSpacing: "-.04em",
        pointerEvents: "none", userSelect: "none",
      }}>
        {project.num}
      </div>

      {/* Content */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "1.1rem", position: "relative" }}>
        <span style={{
          fontFamily: "'JetBrains Mono', monospace", fontSize: ".6rem",
          letterSpacing: ".18em", color: "var(--gold)", opacity: .7,
          textTransform: "uppercase",
        }}>
          {project.featured ? "Featured Work" : `Project ${project.num}`}
        </span>
        <h3 style={{
          fontFamily: "'Cormorant Garamond', serif", fontWeight: 600,
          fontSize: project.featured ? "2.4rem" : "1.9rem",
          letterSpacing: "-.02em", color: "var(--cream)", lineHeight: 1.05,
        }}>
          <a href={projectHref} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
            {project.title}
          </a>
        </h3>
        <p style={{ fontSize: ".87rem", color: "var(--muted)", lineHeight: 1.85, flex: 1 }}>
          {project.desc}
        </p>
        <div style={{ display: "flex", flexWrap: "wrap", gap: ".4rem" }}>
          {project.tags.map(tag => (
            <span key={tag} style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: ".62rem",
              letterSpacing: ".06em", color: "var(--gold-d)", opacity: .9,
              padding: ".25rem .75rem",
              border: "1px solid rgba(201,169,110,0.16)",
              borderRadius: 4, background: "rgba(201,169,110,0.04)",
            }}>{tag}</span>
          ))}
        </div>
        <div style={{ display: "flex", gap: ".55rem", marginTop: ".2rem" }}>
          {projectActions.map(({ href, label, icon, primary }) => (
            <a key={label} href={href} target="_blank" rel="noopener noreferrer" style={{
              display: "inline-flex", alignItems: "center", gap: ".4rem",
              fontFamily: "'Syne', sans-serif", fontWeight: 500,
              fontSize: ".72rem", letterSpacing: ".06em",
              textDecoration: "none", padding: ".58rem 1.1rem",
              borderRadius: 5, flex: 1, justifyContent: "center",
              background: primary ? "rgba(201,169,110,0.09)" : "transparent",
              color: primary ? "var(--gold-l)" : "var(--muted)",
              border: primary ? "1px solid rgba(201,169,110,0.22)" : "1px solid rgba(255,255,255,0.07)",
              transition: "all .22s",
            }}
            onMouseEnter={e => {
              if (primary) {
                e.currentTarget.style.background = "var(--gold)";
                e.currentTarget.style.color = "#080706";
                e.currentTarget.style.borderColor = "var(--gold)";
                e.currentTarget.style.boxShadow = "0 0 22px rgba(201,169,110,0.3)";
              } else {
                e.currentTarget.style.background = "rgba(255,255,255,0.04)";
                e.currentTarget.style.color = "var(--cream-dim)";
              }
            }}
            onMouseLeave={e => {
              if (primary) {
                e.currentTarget.style.background = "rgba(201,169,110,0.09)";
                e.currentTarget.style.color = "var(--gold-l)";
                e.currentTarget.style.borderColor = "rgba(201,169,110,0.22)";
                e.currentTarget.style.boxShadow = "none";
              } else {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.color = "var(--muted)";
              }
            }}>
              {icon} {label}
            </a>
          ))}
        </div>
      </div>

      {/* VISUAL 3 — Gradient Mesh for featured */}
      {project.featured && (
        <div className="featured-preview" style={{
          width: 320, height: 200, flexShrink: 0,
          borderRadius: 10,
          border: "1px solid rgba(201,169,110,0.14)",
          overflow: "hidden", position: "relative",
        }}>
          <GradientMesh />
          <div style={{
            position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            pointerEvents: "none",
          }}>
            <span style={{
              fontFamily: "'Cormorant Garamond', serif", fontStyle: "italic",
              fontWeight: 300, fontSize: "1rem", letterSpacing: ".2em",
              color: "rgba(201,169,110,0.5)", textTransform: "uppercase",
            }}>
              Featured
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

// ─── PROJECTS ────────────────────────────────────────────────────────────────
const Projects: React.FC = () => (
  <section id="projects" style={{ padding: "8rem 0", position: "relative", zIndex: 2 }}>
    <div className="wrap" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 2.5rem" }}>
      <div className="reveal" style={{ marginBottom: "4rem" }}>
        <div className="section-label">Project Gateway</div>
        <h2 style={{
          fontFamily: "'Cormorant Garamond', serif", fontWeight: 700,
          fontSize: "clamp(2.6rem, 5.5vw, 4.8rem)",
          letterSpacing: "-.03em", lineHeight: .9, color: "var(--cream)",
        }}>
          All Projects &amp;<br/>
          <span style={{
            background: "linear-gradient(135deg, #c9a96e, #e8d5a8, #8a6f3e)",
            WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
            fontStyle: "italic",
          }}>Links</span>
        </h2>
        <p style={{ maxWidth: 620, fontSize: ".9rem", lineHeight: 1.85, color: "var(--muted)", marginTop: "1.5rem" }}>
          This root page is a directory, not the portfolio. Use it to jump into live builds, GitHub repositories, and the dedicated portfolio page from one place.
        </p>
      </div>
      <div className="projects-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.2rem" }}>
        {PORTFOLIO_PROJECTS.map((p, i) => (
          <div key={i} className="reveal featured-layout" style={{ gridColumn: p.featured ? "1 / -1" : undefined }}>
            <ProjectCard project={p} />
          </div>
        ))}
      </div>

      <div className="reveal" style={{ marginTop: "4.5rem", marginBottom: "1.4rem" }}>
        <div className="section-label">Repository Index</div>
        <p style={{ maxWidth: 620, fontSize: ".88rem", lineHeight: 1.85, color: "var(--muted)" }}>
          These additional public repositories were checked from GitHub on April 27, 2026 and are linked here even when they do not have a live deployment.
        </p>
      </div>
      <div className="projects-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1.2rem" }}>
        {GITHUB_IMPORTS.map((repo) => (
          <div
            key={repo.name}
            className="reveal tilt-card"
            style={{
              position: "relative",
              padding: "1.5rem",
              border: "1px solid rgba(201,169,110,0.12)",
              borderRadius: "var(--r)",
              background: "var(--glass)",
              backdropFilter: "blur(10px)",
              display: "flex",
              flexDirection: "column",
              gap: ".95rem",
              minHeight: 250,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", gap: "1rem", alignItems: "flex-start" }}>
              <div>
                <div
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: ".58rem",
                    letterSpacing: ".18em",
                    textTransform: "uppercase",
                    color: "var(--gold)",
                    opacity: .7,
                    marginBottom: ".6rem",
                  }}
                >
                  Repository Link
                </div>
                <h3
                  style={{
                    fontFamily: "'Cormorant Garamond', serif",
                    fontWeight: 600,
                    fontSize: "1.8rem",
                    lineHeight: 1.02,
                    letterSpacing: "-.02em",
                    color: "var(--cream)",
                  }}
                >
                  <a href={repo.liveUrl ?? repo.repoUrl} target="_blank" rel="noopener noreferrer" style={{ color: "inherit", textDecoration: "none" }}>
                    {repo.name}
                  </a>
                </h3>
              </div>
              <span
                style={{
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: ".56rem",
                  letterSpacing: ".12em",
                  textTransform: "uppercase",
                  color: "var(--gold-d)",
                  border: "1px solid rgba(201,169,110,0.16)",
                  borderRadius: 999,
                  padding: ".34rem .55rem",
                  whiteSpace: "nowrap",
                }}
              >
                {repo.updated}
              </span>
            </div>

            <p style={{ fontSize: ".84rem", color: "var(--muted)", lineHeight: 1.82, flex: 1 }}>
              {repo.desc}
            </p>

            <div style={{ display: "flex", flexWrap: "wrap", gap: ".45rem" }}>
              {repo.language ? (
                <span
                  style={{
                    fontFamily: "'JetBrains Mono', monospace",
                    fontSize: ".62rem",
                    letterSpacing: ".06em",
                    color: "var(--gold-d)",
                    padding: ".25rem .75rem",
                    border: "1px solid rgba(201,169,110,0.16)",
                    borderRadius: 4,
                    background: "rgba(201,169,110,0.04)",
                  }}
                >
                  {repo.language}
                </span>
              ) : null}
            </div>

            <div style={{ display: "flex", gap: ".55rem", marginTop: ".25rem" }}>
              {repo.liveUrl ? (
                <a
                  href={repo.liveUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: ".4rem",
                    fontFamily: "'Syne', sans-serif",
                    fontWeight: 500,
                    fontSize: ".72rem",
                    letterSpacing: ".06em",
                    textDecoration: "none",
                    padding: ".58rem 1.1rem",
                    borderRadius: 5,
                    flex: 1,
                    justifyContent: "center",
                    background: "rgba(201,169,110,0.09)",
                    color: "var(--gold-l)",
                    border: "1px solid rgba(201,169,110,0.22)",
                  }}
                >
                  <IconExternal /> {repo.liveLabel ?? "Live"}
                </a>
              ) : null}
              <a
                href={repo.repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: ".4rem",
                  fontFamily: "'Syne', sans-serif",
                  fontWeight: 500,
                  fontSize: ".72rem",
                  letterSpacing: ".06em",
                  textDecoration: "none",
                  padding: ".58rem 1.1rem",
                  borderRadius: 5,
                  flex: 1,
                  justifyContent: "center",
                  border: "1px solid rgba(255,255,255,0.07)",
                  color: "var(--muted)",
                }}
              >
                <IconGithub /> Repo
              </a>
            </div>
          </div>
        ))}
      </div>
    </div>
  </section>
);

// ─── ABOUT ───────────────────────────────────────────────────────────────────
const About: React.FC = () => (
  <section id="about" style={{ padding: "8rem 0", position: "relative", zIndex: 2 }}>
    <div className="wrap" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 2.5rem" }}>
      <div className="about-grid" style={{ display: "grid", gridTemplateColumns: "5fr 4fr", gap: "5rem", alignItems: "start" }}>
        <div>
          <div className="reveal">
            <div className="section-label">Purpose</div>
            <h2 style={{
              fontFamily: "'Cormorant Garamond', serif", fontWeight: 700,
              fontSize: "clamp(2.4rem, 5vw, 4.2rem)",
              letterSpacing: "-.03em", lineHeight: .92, color: "var(--cream)",
            }}>
              One Landing Page<br/>For Every{" "}
              <span style={{
                background: "linear-gradient(135deg, #c9a96e, #e8d5a8)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                fontStyle: "italic",
              }}>Project</span>
            </h2>
          </div>

          <div className="reveal" style={{ marginTop: "2.2rem" }}>
            {[
              <>This page is the front door for <strong style={{ color: "var(--cream)", fontWeight: 600 }}>Yor Ayrin</strong> projects. It keeps the default domain focused on navigation instead of making visitors guess which app, repo, or profile they need.</>,
              <>The dedicated portfolio still exists as its own destination. It is linked as the first featured project, while the rest of this page maps the live builds and public GitHub repositories.</>,
              <>Every project card has a direct hyperlink: live deployments open the app, and repo links open the source. Repository-only experiments are still listed so the GitHub surface stays complete.</>,
            ].map((text, i) => (
              <p key={i} style={{ fontSize: ".9rem", color: "var(--muted)", lineHeight: 1.92, fontWeight: 400, marginBottom: "1.2rem" }}>{text}</p>
            ))}
          </div>

          {/* Stats */}
          <div className="reveal" style={{ display: "flex", gap: "3rem", marginTop: "2.8rem", paddingTop: "2rem", borderTop: "1px solid rgba(201,169,110,0.1)" }}>
            {[[CURATED_PROJECT_COUNT,"Featured Links"],[PUBLIC_REPO_COUNT,"GitHub Repos"],["01","Portfolio Page"]].map(([num, label]) => (
              <div key={label}>
                <div style={{
                  fontFamily: "'Cormorant Garamond', serif", fontWeight: 700,
                  fontSize: "3.2rem", letterSpacing: "-.04em", lineHeight: 1,
                  background: "linear-gradient(135deg, #c9a96e, #e8d5a8)",
                  WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                }}>{num}</div>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: ".6rem",
                  letterSpacing: ".16em", textTransform: "uppercase",
                  color: "var(--muted-d)", marginTop: ".4rem",
                }}>{label}</div>
              </div>
            ))}
          </div>

          {/* Skills pills */}
          <div className="reveal" style={{ marginTop: "2.5rem" }}>
            {PORTFOLIO_SKILLS.map(({ category, items }) => (
              <div key={category} style={{ marginBottom: "1.6rem" }}>
                <div style={{
                  fontFamily: "'JetBrains Mono', monospace", fontSize: ".6rem",
                  letterSpacing: ".18em", textTransform: "uppercase",
                  color: "var(--gold)", opacity: .65, marginBottom: ".8rem",
                }}>{category}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: ".45rem" }}>
                  {items.map(item => (
                    <span key={item} className="skill-pill" style={{
                      fontFamily: "'JetBrains Mono', monospace", fontSize: ".68rem",
                      color: "var(--muted)", padding: ".35rem .9rem",
                      border: "1px solid rgba(255,255,255,0.07)",
                      borderRadius: 5, background: "rgba(255,255,255,0.02)",
                      letterSpacing: ".03em", transition: "all .2s", cursor: "default",
                    }}
                    onMouseEnter={e => {
                      e.currentTarget.style.borderColor = "rgba(201,169,110,0.32)";
                      e.currentTarget.style.color = "var(--gold-l)";
                      e.currentTarget.style.background = "rgba(201,169,110,0.05)";
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.borderColor = "rgba(255,255,255,0.07)";
                      e.currentTarget.style.color = "var(--muted)";
                      e.currentTarget.style.background = "rgba(255,255,255,0.02)";
                    }}>
                      {item}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* VISUAL 2 — Skill Radar */}
        <div className="reveal" style={{ display: "flex", flexDirection: "column", alignItems: "center", marginTop: "3rem", gap: "1.5rem" }}>
          <div style={{
            padding: "2.5rem",
            border: "1px solid var(--border)",
            borderRadius: "var(--r)",
            background: "var(--glass)",
            backdropFilter: "blur(12px)",
            display: "flex", flexDirection: "column", alignItems: "center", gap: "1.4rem",
          }}>
            <div style={{
              fontFamily: "'JetBrains Mono', monospace", fontSize: ".6rem",
              letterSpacing: ".2em", textTransform: "uppercase",
              color: "var(--gold)", opacity: .7,
            }}>Project Mix</div>
            <SkillRadar />
            <div style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", justifyContent: "center" }}>
              {PORTFOLIO_SKILL_RADAR.map(({ label, value }) => (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: ".4rem" }}>
                  <div style={{ width: 5, height: 5, borderRadius: "50%", background: "var(--gold)", opacity: .7 }}/>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: ".6rem", color: "var(--muted)", letterSpacing: ".04em" }}>
                    {label} <span style={{ color: "var(--gold-dim)" }}>{value}%</span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  </section>
);

// ─── CONTACT ─────────────────────────────────────────────────────────────────
const Contact: React.FC = () => {
  const contactLinks: ContactLink[] = [
    { label: "GitHub / yorayriniwnl", href: PORTFOLIO_INFO.github, icon: <IconGithub /> },
    { label: "LinkedIn / yorayriniwnl", href: PORTFOLIO_INFO.linkedin, icon: <IconLinkedIn /> },
    { label: `Phone / ${PORTFOLIO_INFO.phone}`, href: "tel:+918918940799", icon: <IconPhone /> },
    { label: "Portfolio / recruiter mode", href: PORTFOLIO_INFO.portfolio, icon: <IconExternal /> },
    { label: "Project hub / yorayriniwnl.in", href: PORTFOLIO_INFO.site, icon: <IconGlobe /> },
  ];
  return (
    <section id="contact" style={{ padding: "8rem 0 6rem", position: "relative", zIndex: 2 }}>
      <div className="wrap" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 2.5rem" }}>
        <div className="contact-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6rem", alignItems: "start" }}>
          <div className="reveal">
            <div className="section-label">Contact</div>
            <h2 style={{
              fontFamily: "'Cormorant Garamond', serif", fontWeight: 700,
              fontSize: "clamp(2.6rem, 5.5vw, 4.8rem)",
              letterSpacing: "-.03em", lineHeight: .9, color: "var(--cream)",
              marginBottom: "1.6rem",
            }}>
              Let's build<br/>
              <span style={{
                background: "linear-gradient(135deg, #c9a96e, #e8d5a8, #8a6f3e)",
                WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent", backgroundClip: "text",
                fontStyle: "italic",
              }}>something real.</span>
            </h2>
            <p style={{ fontSize: ".88rem", color: "var(--muted)", lineHeight: 1.9, marginBottom: "2.6rem", maxWidth: 380 }}>
              {PORTFOLIO_INFO.contactDescription}
            </p>
            <a href={`mailto:${PORTFOLIO_INFO.email}`} style={{
              fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontStyle: "italic",
              fontSize: "clamp(1.4rem, 3vw, 2.1rem)",
              color: "var(--cream-dim)", textDecoration: "none",
              display: "block", paddingBottom: ".5rem",
              borderBottom: "1px solid rgba(201,169,110,0.18)",
              transition: "color .2s, border-color .2s",
              marginBottom: "2.2rem",
              letterSpacing: "-.01em",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--gold-l)"; e.currentTarget.style.borderColor = "rgba(201,169,110,0.5)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--cream-dim)"; e.currentTarget.style.borderColor = "rgba(201,169,110,0.18)"; }}>
              {PORTFOLIO_INFO.email}
            </a>
            <a href="tel:+918918940799" style={{
              fontFamily: "'Cormorant Garamond', serif", fontWeight: 300, fontStyle: "italic",
              fontSize: "clamp(1.25rem, 2.6vw, 1.9rem)",
              color: "var(--cream-dim)", textDecoration: "none",
              display: "block", paddingBottom: ".5rem",
              borderBottom: "1px solid rgba(201,169,110,0.18)",
              transition: "color .2s, border-color .2s",
              marginBottom: "2.2rem",
              letterSpacing: "-.01em",
            }}
            onMouseEnter={e => { e.currentTarget.style.color = "var(--gold-l)"; e.currentTarget.style.borderColor = "rgba(201,169,110,0.5)"; }}
            onMouseLeave={e => { e.currentTarget.style.color = "var(--cream-dim)"; e.currentTarget.style.borderColor = "rgba(201,169,110,0.18)"; }}>
              {PORTFOLIO_INFO.phone}
            </a>
            <a href={`mailto:${PORTFOLIO_INFO.email}`} style={{
              display: "inline-flex", alignItems: "center", gap: ".55rem",
              fontFamily: "'Syne', sans-serif", fontWeight: 600,
              fontSize: ".78rem", letterSpacing: ".08em",
              textDecoration: "none", padding: ".9rem 2.2rem", borderRadius: 6,
              background: "linear-gradient(135deg, #8a6f3e, #c9a96e)",
              color: "#080706", transition: "all .3s",
              boxShadow: "0 4px 28px rgba(201,169,110,0.25)",
            }}
            onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-2px)"; e.currentTarget.style.boxShadow = "0 8px 40px rgba(201,169,110,0.4)"; }}
            onMouseLeave={e => { e.currentTarget.style.transform = ""; e.currentTarget.style.boxShadow = "0 4px 28px rgba(201,169,110,0.25)"; }}>
              Send a Message
            </a>
          </div>

          <div className="reveal" style={{ display: "flex", flexDirection: "column", gap: ".6rem" }}>
            {contactLinks.map(({ label, href, icon }) => (
              <a key={label} href={href} target="_blank" rel="noopener noreferrer" style={{
                display: "flex", alignItems: "center", gap: "1rem",
                fontFamily: "'JetBrains Mono', monospace", fontSize: ".73rem",
                letterSpacing: ".06em", color: "var(--muted)",
                textDecoration: "none", padding: "1rem 1.3rem",
                border: "1px solid rgba(255,255,255,0.05)",
                borderRadius: 10, background: "var(--glass)",
                backdropFilter: "blur(8px)",
                transition: "all .25s",
              }}
              onMouseEnter={e => {
                e.currentTarget.style.borderColor = "rgba(201,169,110,0.28)";
                e.currentTarget.style.color = "var(--gold-l)";
                e.currentTarget.style.background = "rgba(201,169,110,0.05)";
                e.currentTarget.style.transform = "translateX(5px)";
                e.currentTarget.style.boxShadow = "0 4px 24px rgba(201,169,110,0.07)";
              }}
              onMouseLeave={e => {
                e.currentTarget.style.borderColor = "rgba(255,255,255,0.05)";
                e.currentTarget.style.color = "var(--muted)";
                e.currentTarget.style.background = "var(--glass)";
                e.currentTarget.style.transform = "";
                e.currentTarget.style.boxShadow = "none";
              }}>
                <span style={{ color: "var(--gold)", flexShrink: 0, display: "flex" }}>{icon}</span>
                <span style={{ flex: 1 }}>{label}</span>
                <span style={{ opacity: .35, fontSize: ".9rem" }}>→</span>
              </a>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

// ─── FOOTER ──────────────────────────────────────────────────────────────────
const Footer: React.FC = () => (
  <footer style={{
    position: "relative", zIndex: 2,
    borderTop: "1px solid rgba(201,169,110,0.08)",
    padding: "2rem 0",
    background: "rgba(8,7,6,0.9)",
  }}>
    <div className="wrap" style={{ maxWidth: 1200, margin: "0 auto", padding: "0 2.5rem", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "1rem" }}>
      {[
        <span>© 2026 {PORTFOLIO_INFO.name}</span>,
        <span style={{ color: "rgba(201,169,110,0.3)" }}>✦</span>,
        <span>Designed &amp; built with intention</span>,
        <a href={PORTFOLIO_INFO.site} style={{ color: "var(--muted-d)", textDecoration: "none", transition: "color .2s" }}
          onMouseEnter={e => (e.currentTarget.style.color = "var(--gold)")}
          onMouseLeave={e => (e.currentTarget.style.color = "var(--muted-d)")}>
          yorayriniwnl.in
        </a>,
      ].map((el, i) => (
        <div key={i} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: ".64rem", letterSpacing: ".1em", color: "var(--muted-d)" }}>
          {el}
        </div>
      ))}
    </div>
  </footer>
);

// ─── DIVIDER ─────────────────────────────────────────────────────────────────
const Divider: React.FC = () => (
  <div style={{
    position: "relative", zIndex: 2, height: 1,
    background: "linear-gradient(90deg, transparent, rgba(201,169,110,0.1), transparent)",
    margin: "0 2.5rem",
  }}/>
);

// ─── APP ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [loaded, setLoaded] = useState(false);
  useScrollReveal();

  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 980);
    return () => clearTimeout(t);
  }, []);

  return (
    <>
      <GlobalStyles />
      <Loader done={loaded} />
      <Cursor />

      {/* Ambient */}
      <div className="mesh-orb mesh-1"/>
      <div className="mesh-orb mesh-2"/>
      <div className="mesh-orb mesh-3"/>
      <div className="grain"/>

      <Nav />
      <Hero />
      <Marquee />
      <Projects />
      <Divider />
      <About />
      <Divider />
      <Contact />
      <Footer />
    </>
  );
}
