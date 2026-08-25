// ─── Types ────────────────────────────────────────────────────────────────────

export type Difficulty = 'easy' | 'medium' | 'hard'

export type TypingSnippet = {
  id: string
  title: string
  code: string
  language: string
  difficulty: Difficulty
  sourceNote: string
}

// ─── Snippets ─────────────────────────────────────────────────────────────────

export const TYPING_SNIPPETS: TypingSnippet[] = [

  // ── Easy (1–3 lines, ~50 chars) ────────────────────────────────────────────

  {
    id: 'api-base-const',
    title: 'API Base URL Constant',
    language: 'typescript',
    difficulty: 'easy',
    sourceNote: 'from Zenith project — lib/api.ts',
    code: `const API_BASE = 'https://api.yorzenith.dev/v1'`,
  },

  {
    id: 'difficulty-union-type',
    title: 'Difficulty Union Type',
    language: 'typescript',
    difficulty: 'easy',
    sourceNote: 'from Typing Challenge — data/typingSnippets.ts',
    code: `type Difficulty = 'easy' | 'medium' | 'hard'`,
  },

  {
    id: 'use-state-loading',
    title: 'useState Loading Flag',
    language: 'typescript',
    difficulty: 'easy',
    sourceNote: 'from Zenith — components/FeasibilityForm.tsx',
    code: `const [isLoading, setIsLoading] = useState(false)`,
  },

  {
    id: 'format-wpm-fn',
    title: 'WPM Formatter Arrow Function',
    language: 'typescript',
    difficulty: 'easy',
    sourceNote: 'from Typing Challenge — utils/score.ts',
    code: `const formatWpm = (chars: number, ms: number): number =>
  Math.round((chars / 5) / (ms / 60000))`,
  },

  {
    id: 'destructure-result',
    title: 'Destructured Fetch Result',
    language: 'typescript',
    difficulty: 'easy',
    sourceNote: 'from Yor AI vs Real Image — lib/classify.ts',
    code: `const { label, confidence } = await classifyImage(file)`,
  },

  // ── Medium (4–6 lines, ~120 chars) ─────────────────────────────────────────

  {
    id: 'panel-config-interface',
    title: 'PanelConfig Interface',
    language: 'typescript',
    difficulty: 'medium',
    sourceNote: 'from Zenith — types/solar.ts',
    code: `interface PanelConfig {
  id: string
  tiltAngle: number
  azimuth: number
  efficiency: number
  installedAt: Date
}`,
  },

  {
    id: 'use-effect-fetch',
    title: 'useEffect Data Fetch',
    language: 'typescript',
    difficulty: 'medium',
    sourceNote: 'from Zenith — components/RooftopPanel.tsx',
    code: `useEffect(() => {
  if (!rooftopId) return
  setLoading(true)
  fetchFeasibility(rooftopId)
    .then(setResult)
    .finally(() => setLoading(false))
}, [rooftopId])`,
  },

  {
    id: 'get-subsidy-rate',
    title: 'Async Subsidy Rate Lookup',
    language: 'typescript',
    difficulty: 'medium',
    sourceNote: 'from Zenith — lib/subsidies.ts',
    code: `async function getSubsidyRate(postcode: string): Promise<number> {
  const res = await fetch(\`/api/subsidies/\${postcode}\`)
  if (!res.ok) throw new Error('Subsidy lookup failed')
  const { rate } = await res.json()
  return rate
}`,
  },

  {
    id: 'handle-file-upload',
    title: 'File Upload Change Handler',
    language: 'typescript',
    difficulty: 'medium',
    sourceNote: 'from Yor AI vs Real Image — components/UploadZone.tsx',
    code: `const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0]
  if (!file) return
  setStatus('processing')
  classifyImage(file).then(setDetectionResult)
}`,
  },

  {
    id: 'use-rooftop-scan',
    title: 'Custom useRooftopScan Hook',
    language: 'typescript',
    difficulty: 'medium',
    sourceNote: 'from Zenith — hooks/useRooftopScan.ts',
    code: `function useRooftopScan(lat: number, lng: number) {
  const [area, setArea] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  return { area, loading, error }
}`,
  },

  // ── Hard (8–12 lines, ~250 chars) ──────────────────────────────────────────

  {
    id: 'deep-readonly-generic',
    title: 'DeepReadonly Conditional Generic',
    language: 'typescript',
    difficulty: 'hard',
    sourceNote: 'from portfolio lib — types/utils.ts',
    code: `type DeepReadonly<T> = T extends (infer U)[]
  ? ReadonlyArray<DeepReadonly<U>>
  : T extends object
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T

type ImmutableConfig = DeepReadonly<PanelConfig>
type ImmutableResult = DeepReadonly<FeasibilityResult>`,
  },

  {
    id: 'scan-reducer',
    title: 'Discriminated Union Reducer',
    language: 'typescript',
    difficulty: 'hard',
    sourceNote: 'from Zenith — reducers/scanReducer.ts',
    code: `type ScanAction =
  | { type: 'START'; payload: { rooftopId: string } }
  | { type: 'SUCCESS'; payload: FeasibilityResult }
  | { type: 'ERROR'; payload: string }

function scanReducer(state: ScanState, action: ScanAction): ScanState {
  switch (action.type) {
    case 'START':   return { ...state, loading: true, error: null }
    case 'SUCCESS': return { loading: false, error: null, result: action.payload }
    case 'ERROR':   return { ...state, loading: false, error: action.payload }
  }
}`,
  },

  {
    id: 'prisma-transaction',
    title: 'Prisma $transaction with Nested Reads',
    language: 'typescript',
    difficulty: 'hard',
    sourceNote: 'from Mentor System — lib/db/matches.ts',
    code: `const result = await prisma.$transaction(async (tx) => {
  const mentor = await tx.user.findUniqueOrThrow({
    where: { id: mentorId },
    include: { skills: true },
  })
  const match = await tx.match.create({
    data: {
      mentorId,
      menteeId,
      skill: mentor.skills[0].name,
      status: 'pending',
    },
  })
  return { mentor, match }
})`,
  },

  {
    id: 'repository-interface',
    title: 'Generic Repository Interface + Impl',
    language: 'typescript',
    difficulty: 'hard',
    sourceNote: 'from portfolio lib — patterns/repository.ts',
    code: `interface Repository<T, ID> {
  findById(id: ID): Promise<T | null>
  findAll(filter?: Partial<T>): Promise<T[]>
  save(entity: Omit<T, 'id' | 'createdAt'>): Promise<T>
  delete(id: ID): Promise<void>
}

class RooftopRepository implements Repository<Rooftop, string> {
  constructor(private readonly db: PrismaClient) {}

  async findById(id: string) {
    return this.db.rooftop.findUnique({ where: { id } })
  }
}`,
  },

  {
    id: 'tree-node-recursive',
    title: 'Recursive TreeNode Type + Traversal',
    language: 'typescript',
    difficulty: 'hard',
    sourceNote: 'from Knowledge Graph — lib/graph/tree.ts',
    code: `type TreeNode<T> = {
  value: T
  children: TreeNode<T>[]
  parent: TreeNode<T> | null
}

function findLeaves<T>(node: TreeNode<T>): T[] {
  if (node.children.length === 0) return [node.value]
  return node.children.flatMap(findLeaves)
}

function treeDepth<T>(node: TreeNode<T>): number {
  if (node.children.length === 0) return 0
  return 1 + Math.max(...node.children.map(treeDepth))
}`,
  },
]

// ─── Grouped by difficulty ────────────────────────────────────────────────────

export const SNIPPETS_BY_DIFF: Record<Difficulty, TypingSnippet[]> = {
  easy:   TYPING_SNIPPETS.filter((s) => s.difficulty === 'easy'),
  medium: TYPING_SNIPPETS.filter((s) => s.difficulty === 'medium'),
  hard:   TYPING_SNIPPETS.filter((s) => s.difficulty === 'hard'),
}

export function pickSnippet(
  difficulty: Difficulty,
  excludeId?: string,
): TypingSnippet {
  const pool = SNIPPETS_BY_DIFF[difficulty]
  const filtered = excludeId ? pool.filter((s) => s.id !== excludeId) : pool
  const source = filtered.length > 0 ? filtered : pool
  return source[Math.floor(Math.random() * source.length)]
}
