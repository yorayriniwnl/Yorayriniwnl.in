/**
 * Portfolio content. Project facts mirror the evidence-scoped registry in
 * github.com/yorayriniwnl/Portfolio-Ayush-Roy (src/content). Keep claims and
 * their context together when editing: numbers here are review snapshots,
 * not live telemetry.
 */

export const profile = {
  name: "Ayush Roy",
  mark: "YOR",
  headline: "Backend / Full-Stack Software Engineer",
  role: "B.Tech CSCE 2027 · Applied ML builder",
  status: "Open to software engineering roles",
  location: "Bhubaneswar, Odisha, India",
  positioning:
    "I build backend-heavy product systems with Python, TypeScript, PostgreSQL, Redis, realtime APIs, testing, and applied machine learning.",
  email: "ayushroy.dev@gmail.com",
  links: {
    github: "https://github.com/yorayriniwnl",
    linkedin: "https://www.linkedin.com/in/yorayriniwnl",
    resume: "https://raw.githubusercontent.com/yorayriniwnl/Yorayriniwnl/output/Ayush_Roy_Resume_Public.pdf",
    steam: "https://steamcommunity.com/id/yorayriniwnl/",
    youtube: "https://www.youtube.com/@YorAyriniwnl",
  },
} as const;

export const dossier = [
  {
    when: "2027 · campus selection",
    title: "KPIT Technologies · Associate Engineer",
    body: "Selected through KIIT campus recruitment; Letter of Intent accepted. A selection, not current employment.",
  },
  {
    when: "2023 to 2027 (expected)",
    title: "B.Tech, Computer Science & Communication Engineering",
    body: "KIIT Deemed University, Bhubaneswar.",
  },
  {
    when: "June 2026 · Chennai (hybrid)",
    title: "Bharat Sanchar Nigam Limited (BSNL)",
    body: "Telecom & data network intern.",
  },
] as const;

export const creed = ["Discipline", "Execution", "Compound", "Freedom"] as const;

export type SkillGroup = { label: string; items: readonly string[] };

export const arsenal: readonly SkillGroup[] = [
  { label: "Core", items: ["Python", "TypeScript", "PostgreSQL", "Redis", "WebSockets", "Applied ML"] },
  { label: "Backend", items: ["FastAPI", "Express", "Socket.IO", "Drizzle", "SQLAlchemy", "Docker"] },
  { label: "Frontend", items: ["Next.js", "React", "Three.js", "React Three Fiber", "Recharts"] },
  { label: "ML / Security", items: ["PyTorch", "XGBoost", "TabTransformer", "SHAP", "Static analysis"] },
  { label: "Quality", items: ["Playwright", "pytest", "CI gates", "Load-shedding drills"] },
] as const;

export type Metric = { value: string; label: string; context: string };
export type Project = {
  slug: string;
  index: string;
  title: string;
  kicker: string;
  purpose: string;
  role: string;
  period: string;
  status: string;
  stack: readonly string[];
  metrics: readonly Metric[];
  live?: string;
  source?: string;
  /** map ping on the laptop screen, 0..1 */
  ping: readonly [number, number];
};

export const projects: readonly Project[] = [
  {
    slug: "candidatex",
    index: "01",
    title: "CandidateX",
    kicker: "Candidate capability intelligence",
    purpose:
      "A provenance-grounded hiring research prototype: synthetic candidate documents and public technical evidence become role-specific capability estimates, contradiction diagnostics, and interview probes. It never makes the hire or reject decision.",
    role: "Research engineer · full-stack / evaluation systems",
    period: "2026",
    status: "Research prototype · source + live",
    stack: ["Python", "FastAPI", "Next.js", "PostgreSQL", "Redis", "Static analysis"],
    metrics: [
      { value: "28,800", label: "Paper benchmark", context: "Synthetic candidate-role evaluations reported in the submitted paper, across 16 seeds and 6 roles. Not real-world hiring validity." },
      { value: "12", label: "Capability dimensions", context: "Canonical technical dimensions in the CandidateX scoring framework." },
    ],
    live: "https://candidatex-smoky.vercel.app",
    source: "https://github.com/yorayriniwnl/CandidateX",
    ping: [0.68, 0.42],
  },
  {
    slug: "avelry",
    index: "02",
    title: "Avelry",
    kicker: "Privacy-focused social platform",
    purpose:
      "Authenticated accounts, realtime messaging, audience controls, and operator safeguards, run as a closed beta. Identity, permissions, realtime, and abuse protection share one server-owned trust boundary.",
    role: "Founder · full-stack engineering",
    period: "Apr 2026 to present",
    status: "Closed beta · private source",
    stack: ["React", "TypeScript", "Express", "Socket.IO", "PostgreSQL", "Drizzle", "Redis"],
    metrics: [
      { value: "855", label: "API tests", context: "Standard API cases passing in the 4 Nov 2026 web-release review. One reviewed build, not uptime evidence." },
      { value: "345", label: "Chromium E2E", context: "End-to-end tests passing in the same review." },
      { value: "4", label: "Protection levels", context: "Normal, guarded, read-only and offline, with documented operator controls." },
    ],
    live: "https://avelry.in",
    ping: [0.7, 0.47],
  },
  {
    slug: "zenith",
    index: "03",
    title: "Zenith",
    kicker: "Solar planning · decision support",
    purpose:
      "Connects site and tariff inputs to visual solar scenarios and financial framing, in a sequence that keeps every assumption visible instead of flattening it into one confident dashboard.",
    role: "Co-founder · interface direction · product experience",
    period: "Dec 2025 to Oct 2026",
    status: "Experimental · reachable at audit time",
    stack: ["Next.js", "TypeScript", "Three.js", "Recharts", "Motion"],
    metrics: [
      { value: "Scenario", label: "Decision model", context: "Illustrative values with visible assumptions." },
      { value: "Shared", label: "Ownership", context: "Interface direction credited separately from architecture and full-stack work." },
    ],
    live: "https://zenith-xi-snowy.vercel.app",
    source: "https://github.com/yorayriniwnl/Yor-Zenith",
    ping: [0.66, 0.5],
  },
  {
    slug: "velvetclip",
    index: "04",
    title: "Velvetclip",
    kicker: "Local-first browser utilities",
    purpose:
      "27 PDF, image, document and media tools that run on the user's own device instead of uploading files. Every tool shares one safety layer: content sniffing, decompression limits, safe ZIP handling, verified redaction.",
    role: "Founder · full-stack / browser engineering",
    period: "2026",
    status: "Release candidate · public deployment",
    stack: ["Next.js", "React", "TypeScript", "PDF.js", "pdf-lib", "Tesseract.js", "Playwright"],
    metrics: [
      { value: "27", label: "Browser tools", context: "Registered and validated in Chromium in the 16 Nov 2026 completion audit." },
      { value: "218 + 49", label: "Automated tests", context: "Unit tests and Playwright browser tests passing in the same audit." },
    ],
    live: "https://velvetclip.vercel.app",
    ping: [0.26, 0.36],
  },
  {
    slug: "falsequiet",
    index: "05",
    title: "FalseQuiet",
    kicker: "Hybrid network intrusion detection",
    purpose:
      "Supervised classifiers for known attacks plus an anomaly detector for attack types never seen in training, with SHAP explanations for every verdict.",
    role: "Applied ML · security research",
    period: "2026",
    status: "Research prototype · source + live",
    stack: ["Python", "FastAPI", "XGBoost", "PyTorch", "TabTransformer", "SHAP"],
    metrics: [
      { value: "71.1%", label: "Held-out DDoS detected", context: "Hybrid engine on 1,000 flows from an attack category excluded from training (CIC-IDS2017)." },
      { value: "42.3%", label: "Missed as benign", context: "Share of the same held-out flows the supervised models alone labeled BENIGN." },
    ],
    live: "https://falsequiet.vercel.app",
    source: "https://github.com/yorayriniwnl/Hybrid-Intelligent-Network-Intrusion-Detection-System",
    ping: [0.52, 0.3],
  },
  {
    slug: "portfolio",
    index: "06",
    title: "This war room",
    kicker: "Real-time 3D portfolio",
    purpose:
      "Every model here, from the operator and the husky to the tufted sofa, is generated from code in Blender and rendered live with three.js: scroll-directed cameras, fur shells, bloom and a rain-streaked skyline.",
    role: "Design · 3D · engineering",
    period: "2026",
    status: "Live",
    stack: ["three.js", "Blender (bpy)", "GLSL", "React", "Vite"],
    metrics: [
      { value: "100%", label: "Procedural assets", context: "Models and textures are rebuilt from the scripts in /art." },
    ],
    source: "https://github.com/yorayriniwnl/Yorayriniwnl.in",
    ping: [0.72, 0.44],
  },
] as const;
