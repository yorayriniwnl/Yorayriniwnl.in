export type GameId =
  | "snake"
  | "memory"
  | "typing"
  | "wordle"
  | "tic-tac-toe"
  | "road-racing"
  | "strike-arena"
  | "chess";

export type Game = {
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

export type ProjectItem = {
  number: string;
  title: string;
  type: string;
  description: string;
  tone: string;
  signal: string;
  stage: string;
  result: string;
  media: string;
  live?: string;
  source: string;
};

export type HotspotId =
  | "laptop"
  | "bookshelf"
  | "notebook"
  | "chess"
  | "lantern"
  | "portrait"
  | "ayush"
  | "poster"
  | "helmet"
  | "sofa"
  | "window"
  | "operator"
  | "husky";

export type HotspotConfig = {
  id: HotspotId;
  nodeName: string;
  label: string;
  code: string;
  subtitle: string;
  section: "world" | "arcade" | "media" | "archive" | "about" | "manifest" | "telemetry" | "assets";
  directGame?: GameId;
  cameraPos: [number, number, number];
  cameraTarget: [number, number, number];
  markerPos: [number, number, number];
};

export const projects: ProjectItem[] = [
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

export const games: Game[] = [
  { id: "snake", index: "A1", name: "Neon Snake", category: "Arcade · reflex", description: "Thread the grid, chase risky food, and keep the luminous line alive.", input: "Arrow keys", glyph: "⌁", color: "acid", mode: "Score attack", session: "02-05 min", difficulty: "Warm-up" },
  { id: "memory", index: "A2", name: "Memory Protocol", category: "Puzzle · recall", description: "Read the board, pair the stack, and finish before the pattern fades.", input: "Pointer", glyph: "✣", color: "pink", mode: "Pattern clear", session: "03-06 min", difficulty: "Focused" },
  { id: "typing", index: "A3", name: "Type // Rush", category: "Speed · code", description: "Real code fragments measured in clean keystrokes, accuracy, and nerve.", input: "Keyboard", glyph: "⌨", color: "blue", mode: "Accuracy run", session: "01-03 min", difficulty: "Sharp" },
  { id: "wordle", index: "A4", name: "Dev Word", category: "Word · inference", description: "Decode the compact language of APIs, systems, and shipped ideas.", input: "5 / 6 letters", glyph: "W", color: "amber", mode: "Six guesses", session: "02-04 min", difficulty: "Measured" },
  { id: "tic-tac-toe", index: "A5", name: "Grid Logic", category: "Strategy · classic", description: "A tiny arena with three AI depths and no room for careless moves.", input: "Pointer", glyph: "×", color: "violet", mode: "Vs. local AI", session: "03-08 min", difficulty: "Adaptive" },
  { id: "road-racing", index: "A6", name: "Road Runner", category: "Arcade · velocity", description: "Change lanes, read the horizon, collect power, and survive the night run.", input: "A / D · swipe", glyph: "◆", color: "orange", mode: "Endless run", session: "02-07 min", difficulty: "Rising" },
  { id: "strike-arena", index: "A7", name: "Strike Arena", category: "Action · first person", description: "A compact aim-and-movement trial built around rhythm, pressure, and focus.", input: "WASD · mouse", glyph: "+", color: "red", mode: "Arena clear", session: "04-10 min", difficulty: "Intense" },
  { id: "chess", index: "A8", name: "Yor Chess", category: "Strategy · board", description: "A complete board, adaptive engine depth, clocks, hints, and a stubborn opponent.", input: "Pointer", glyph: "♞", color: "ivory", mode: "Engine match", session: "08-25 min", difficulty: "Deep" },
];

export const playerStats = [
  { value: "125", label: "Steam level", note: "earned over time" },
  { value: "13.6K", label: "CS hours", note: "the long session" },
  { value: "53", label: "Games owned", note: "always one more" },
  { value: "99", label: "Screenshots", note: "memory archive" },
];

export const mediaItems = [
  { index: "M01", title: "Yor Zenith / system view", type: "PRODUCT ARTIFACT", body: "A decision surface with the evidence close to the action.", image: "/media/zenith-case-screenshot.svg" },
  { index: "M02", title: "AI vs Real / review state", type: "TRUST INTERFACE", body: "A model becomes useful when a person can inspect the reasoning.", image: "/media/projects-screenshot.svg" },
  { index: "M03", title: "The profile / field note", type: "PERSONAL INTERNET", body: "A portrait of the person behind the builds, games, and experiments.", image: "/media/hero-screenshot.svg" },
];

export const archiveLinks = [
  { index: "01", label: "CASE FILES", title: "Portfolio / finished work", body: "The quieter front door: selected products explained through problem, contribution, and result.", href: "https://yorayriniwnl.vercel.app" },
  { index: "02", label: "PLAYER LOG", title: "Steam / the long game", body: "Matches, screenshots, badges, and the off-hours identity that shaped this hub's language.", href: "https://steamcommunity.com/id/yorayriniwnl/" },
  { index: "03", label: "BUILD LOG", title: "GitHub / proof of motion", body: "Repositories, experiments, commit trails, and the engineering record behind the finished surfaces.", href: "https://github.com/yorayriniwnl" },
  { index: "04", label: "PROFESSIONAL", title: "LinkedIn / open channel", body: "Education, role context, and a direct route into a serious conversation about the work.", href: "https://linkedin.com/in/yorayriniwnl" },
];

export const glbAssets = [
  {
    name: "room.glb",
    title: "360 AAA War Room Interior",
    href: "/models/playable-war-room/room.glb",
    specs: "Closed 4-wall study built with Poly Haven CC0 studio assets & scanned PBRs: leather sofa, dark walnut war desk, sculpted chess knight, hurricane lantern, twin bookshelves, ornate frames, gothic doors, eclipse window",
  },
  {
    name: "operator.glb",
    title: "Playable 3rd-Person YA Operator",
    href: "/models/playable-war-room/operator.glb",
    specs: "Mixamo-rigged tactical operator with real Idle/Walk/Run skeletal animations, crimson stealth visor, YA headphones, chest dog-tag, and 24K baroque gold-engraved AK-47 (064532) slung across back",
  },
  {
    name: "husky.glb",
    title: "Tactical Siberian Husky",
    href: "/models/playable-war-room/husky.glb",
    specs: "Rigged quadruped with real-time 10-layer GPU shell-fur coat, crimson wolf eyes, YA tactical K9 helmet, flipped-up NVG scope, compact canine respirator, and flush K9 harness",
  },
];

// Three.js Y-up coordinates converted from Blender Z-up: (X, Z, -Y)
export const WAR_ROOM_HOTSPOTS: HotspotConfig[] = [
  {
    id: "laptop",
    nodeName: "Interactive_Laptop",
    label: "Tactical Map Laptop",
    code: "OBJ_01 / WORLDS",
    subtitle: "Inspect shipped systems and live builds",
    section: "world",
    cameraPos: [0.35, 1.48, 1.35],
    cameraTarget: [0.82, 0.96, 0.34],
    markerPos: [0.82, 0.96, 0.34],
  },
  {
    id: "notebook",
    nodeName: "Interactive_Notebook",
    label: "IDEAS BUILD GRIND REPEAT",
    code: "OBJ_02 / MANIFEST",
    subtitle: "Field notebook, principles, and Type // Rush",
    section: "manifest",
    directGame: "typing",
    cameraPos: [-0.20, 1.45, 1.45],
    cameraTarget: [-0.22, 0.84, 0.46],
    markerPos: [-0.22, 0.84, 0.46],
  },
  {
    id: "chess",
    nodeName: "Interactive_ChessKnight",
    label: "24K Gold Chess Knight",
    code: "OBJ_03 / YOR CHESS",
    subtitle: "Launch local chess engine match",
    section: "arcade",
    directGame: "chess",
    cameraPos: [-0.88, 1.36, 1.48],
    cameraTarget: [-0.82, 0.96, 0.52],
    markerPos: [-0.82, 0.96, 0.52],
  },
  {
    id: "lantern",
    nodeName: "Interactive_Lantern",
    label: "Crimson Cage Lantern & MMXXVII Globe",
    code: "OBJ_04 / ARCADE",
    subtitle: "Enter all 8 playable local arcade rooms",
    section: "arcade",
    cameraPos: [1.45, 1.48, -0.95],
    cameraTarget: [2.38, 1.02, -2.15],
    markerPos: [2.38, 1.02, -2.15],
  },
  {
    id: "bookshelf",
    nodeName: "Interactive_Bookshelf",
    label: "DISCIPLINE, EXECUTION Library",
    code: "OBJ_05 / ARCHIVE",
    subtitle: "Books, external signals, and GitHub trail",
    section: "archive",
    cameraPos: [1.15, 1.72, 0.35],
    cameraTarget: [4.22, 1.65, 0.15],
    markerPos: [4.05, 1.65, 0.15],
  },
  {
    id: "portrait",
    nodeName: "Interactive_OperatorPainting",
    label: "KEEP GRINDING, KEEP LOSING.",
    code: "OBJ_06 / PROFILE",
    subtitle: "Ornate framed Operator & Husky painting",
    section: "about",
    cameraPos: [-2.25, 2.05, -1.65],
    cameraTarget: [-2.95, 2.38, -4.30],
    markerPos: [-2.95, 2.20, -4.10],
  },
  {
    id: "ayush",
    nodeName: "Interactive_Portrait",
    label: "Chiaroscuro Oil Portrait",
    code: "OBJ_07 / AYUSH ROY",
    subtitle: "The engineer behind YOR // Ayrin",
    section: "about",
    cameraPos: [-1.85, 1.85, -0.15],
    cameraTarget: [-4.42, 2.08, -0.15],
    markerPos: [-4.10, 1.95, -0.15],
  },
  {
    id: "poster",
    nodeName: "Interactive_WarPoster",
    label: "Eclipse Rider YA War Poster",
    code: "OBJ_08 / MEDIA",
    subtitle: "Visual archive and 4K product frames",
    section: "media",
    cameraPos: [1.85, 2.00, -1.55],
    cameraTarget: [2.68, 2.18, -4.30],
    markerPos: [2.68, 2.05, -4.10],
  },
  {
    id: "helmet",
    nodeName: "Interactive_NVGCase",
    label: "Quad-NVG Helmet & YA Case",
    code: "OBJ_09 / GLB ASSETS",
    subtitle: "Download room.glb, operator.glb, husky.glb & 4K render",
    section: "assets",
    cameraPos: [-1.25, 1.38, -0.92],
    cameraTarget: [-2.35, 0.88, -2.15],
    markerPos: [-2.35, 0.92, -2.15],
  },
  {
    id: "sofa",
    nodeName: "Interactive_Sofa",
    label: "Crimson Leather Sofa & South Exit",
    code: "OBJ_10 / 3D ASSETS",
    subtitle: "Inspect Blender 5.2 AAA GLB models",
    section: "assets",
    cameraPos: [0.15, 1.48, -0.35],
    cameraTarget: [0.0, 0.65, -2.18],
    markerPos: [0.0, 0.65, -2.18],
  },
  {
    id: "window",
    nodeName: "Interactive_EclipseWindow",
    label: "Blood-Moon Eclipse Skyline",
    code: "OBJ_11 / SYSTEM",
    subtitle: "Animated rain glass, red eclipse & helicopters",
    section: "assets",
    cameraPos: [-0.15, 1.82, -1.25],
    cameraTarget: [-0.15, 1.95, -4.40],
    markerPos: [-0.15, 1.95, -4.25],
  },
  {
    id: "operator",
    nodeName: "Interactive_DeskArsenal",
    label: "24K Gold-Engraved AK-47 & Operator",
    code: "OBJ_12 / STRIKE ARENA",
    subtitle: "Launch Strike Arena 3D or inspect arsenal",
    section: "arcade",
    directGame: "strike-arena",
    cameraPos: [0.25, 1.38, 1.15],
    cameraTarget: [0.24, 0.88, 0.14],
    markerPos: [0.24, 0.92, 0.14],
  },
  {
    id: "husky",
    nodeName: "Interactive_Husky",
    label: "Tactical K9 Siberian Husky",
    code: "OBJ_13 / TELEMETRY",
    subtitle: "GPU shell-fur companion & player stats",
    section: "telemetry",
    cameraPos: [1.15, 1.34, -0.75],
    cameraTarget: [0.76, 0.92, -2.12],
    markerPos: [0.76, 0.92, -2.12],
  },
];

export const CAMERA_PRESETS: Array<{
  id: string;
  label: string;
  pos: [number, number, number];
  target: [number, number, number];
}> = [
  { id: "overview", label: "Hero View", pos: [0.35, 1.56, 3.15], target: [-0.05, 1.24, -2.15] },
  { id: "desk", label: "War Desk", pos: [0.05, 1.46, 1.55], target: [0.0, 0.88, 0.25] },
  { id: "bookshelf", label: "Bookshelf", pos: [1.10, 1.65, 0.35], target: [4.25, 1.60, 0.15] },
  { id: "husky", label: "Sofa & Husky", pos: [0.55, 1.42, -0.55], target: [0.45, 0.90, -2.15] },
  { id: "west", label: "Portrait & NVG", pos: [-1.45, 1.75, 0.15], target: [-4.20, 1.90, -0.15] },
  { id: "entry", label: "South Doors", pos: [0.0, 1.65, 0.45], target: [0.0, 1.65, 4.05] },
];
