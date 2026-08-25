// data/memoryCards.ts
// 18 pairs = 36 cards for Hard (6×6) mode.
// Easy mode (4×4 = 8 pairs) uses the first 8 entries.
// Cards are ordered so the Easy subset is the most recognisable tech.

export type MemoryCardCategory = 'language' | 'framework' | 'tool' | 'project'

export type MemoryCard = {
  id:       string
  label:    string            // displayed on the card face
  emoji:    string            // large visual icon
  category: MemoryCardCategory
}

// ─── Easy tier (indices 0-7) ─────────────────────────────────────────────────
// ─── Hard tier (indices 8-17) ────────────────────────────────────────────────

export const MEMORY_CARDS: MemoryCard[] = [
  // ── Languages ──────────────────────────────────────────────────────────────
  { id: 'typescript',    label: 'TypeScript',    emoji: '📘', category: 'language'  },
  { id: 'python',        label: 'Python',        emoji: '🐍', category: 'language'  },
  { id: 'rust',          label: 'Rust',          emoji: '🦀', category: 'language'  },
  { id: 'go',            label: 'Go',            emoji: '🐹', category: 'language'  },

  // ── Core frameworks ────────────────────────────────────────────────────────
  { id: 'nextjs',        label: 'Next.js',       emoji: '▲',  category: 'framework' },
  { id: 'react',         label: 'React',         emoji: '⚛️', category: 'framework' },
  { id: 'tailwind',      label: 'Tailwind',      emoji: '🌊', category: 'framework' },
  { id: 'threejs',       label: 'Three.js',      emoji: '🎲', category: 'framework' },

  // ── Data / infra ───────────────────────────────────────────────────────────
  { id: 'postgresql',    label: 'PostgreSQL',    emoji: '🐘', category: 'tool'      },
  { id: 'redis',         label: 'Redis',         emoji: '🔴', category: 'tool'      },
  { id: 'docker',        label: 'Docker',        emoji: '🐳', category: 'tool'      },
  { id: 'prisma',        label: 'Prisma',        emoji: '💎', category: 'tool'      },

  // ── Cloud / delivery ──────────────────────────────────────────────────────
  { id: 'vercel',        label: 'Vercel',        emoji: '🚀', category: 'tool'      },
  { id: 'aws',           label: 'AWS',           emoji: '☁️', category: 'tool'      },

  // ── Specialist tools ──────────────────────────────────────────────────────
  { id: 'postgis',       label: 'PostGIS',       emoji: '🗺️', category: 'tool'      },
  { id: 'graphql',       label: 'GraphQL',       emoji: '🔷', category: 'tool'      },
  { id: 'framer-motion', label: 'Framer Motion', emoji: '🎬', category: 'framework' },
  { id: 'figma',         label: 'Figma',         emoji: '🎨', category: 'tool'      },
]
