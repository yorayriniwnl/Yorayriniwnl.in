'use client';

import { useEffect, useState } from 'react';
import { X, ArrowUpRight, CheckCircle2, ShieldAlert, Cpu, Terminal, Layers } from 'lucide-react';
import { sound } from '@/lib/audio';

export type SystemDossierData = {
  id: string;
  index: string;
  title: string;
  badge: string;
  subtitle: string;
  desc?: string;
  architectureClaim: string;
  failureTactic: string;
  metrics: { label: string; value: string }[];
  schematic: string;
  tags: string[];
  githubUrl: string;
};

export const DOSSIERS: Record<string, SystemDossierData> = {
  CandidateX: {
    id: 'candidatex',
    index: 'SYS // 01',
    title: 'CandidateX',
    badge: 'FLAGSHIP // LIVE',
    subtitle: 'Evidence-First Hiring Intelligence Platform',
    architectureClaim: 'Inspects public GitHub/GitLab artifacts, analyzes commits, and extracts demonstrable capabilities without ever blindly executing untrusted code.',
    failureTactic: 'Isolated ephemeral sandbox runners + AST code traversal. Zero network egress during static analysis phases.',
    metrics: [
      { label: 'Evaluation Lenses', value: '12 Dimensions' },
      { label: 'Latency P95', value: '180ms' },
      { label: 'Boundary Guarantee', value: '100% Non-executing' },
    ],
    schematic: `
   ┌────────────────────────────────────────────────────────┐
   │             CandidateX Intelligence Flow               │
   └────────────────────────────────────────────────────────┘
          │
          ▼
   [Declared Resume Claims] ──► [AST / Artifact Inspector]
                                            │
                                            ▼
   [Interview Probes] ◄─── [Capability Signal Matrix]
    `,
    tags: ['Next.js 16', 'FastAPI', 'PostgreSQL', 'Three.js', 'Playwright'],
    githubUrl: 'https://github.com/yorayriniwnl/CandidateX',
  },
  'Yor Zenith': {
    id: 'zenith',
    index: 'SYS // 02',
    title: 'Yor Zenith',
    badge: 'SHIPPED // OPEN',
    subtitle: 'Rooftop Solar Intelligence & Planning',
    architectureClaim: 'Solves complex solar irradiance geometry, shadow obstruction modeling, and subsidy payout schedules within a single client-side web worker.',
    failureTactic: 'Multi-threaded geospatial polygon clipping with progressive LOD rendering to prevent UI thread lockup on massive 3D building models.',
    metrics: [
      { label: 'Yield Accuracy', value: '98.4%' },
      { label: 'Calculation Time', value: '< 45ms' },
      { label: 'Geospatial Resolution', value: '0.25m / pixel' },
    ],
    schematic: `
   ┌────────────────────────────────────────────────────────┐
   │              Yor Zenith Solar Geometry                 │
   └────────────────────────────────────────────────────────┘
          │
          ├──► [Satellite GeoTIFF] ──► [Roof Polygon Extractor]
          │
          └──► [Solar Irradiance Matrix] ──► [Financial Yield Engine]
    `,
    tags: ['TypeScript', 'Python', 'Geospatial ML', 'PostgreSQL', 'Vite'],
    githubUrl: 'https://github.com/yorayriniwnl/Yor-Zenith',
  },
  'Trading Telemetry & Orderbook': {
    id: 'trading',
    index: 'SYS // 03',
    title: 'Trading Telemetry & Orderbook',
    badge: 'REALTIME // HIGH-THROUGHPUT',
    subtitle: 'Low-Latency Market Execution Streamer',
    architectureClaim: 'Processes non-stop WebSocket orderbook L2 increments with monotonic sequence validation and zero memory leaks under prolonged burst traffic.',
    failureTactic: 'Monotonic sequence buffering. On packet loss or gap, halts incremental application and issues async REST snapshot re-sync while buffering incoming ticks.',
    metrics: [
      { label: 'P99 Latency', value: '< 24ms' },
      { label: 'Throughput', value: '50,000 ticks/sec' },
      { label: 'State Sync Gaps', value: '0.000%' },
    ],
    schematic: `
   ┌────────────────────────────────────────────────────────┐
   │               Hyperliquid Feed Handler                 │
   └────────────────────────────────────────────────────────┘
          │
          ▼
   [Raw WS Stream] ──► [Monotonic Sequencer]
                              │
                    Gap? ─────┴───── OK?
                     │                │
                     ▼                ▼
            [Snapshot Resync]   [Ring Buffer Orderbook]
    `,
    tags: ['Python', 'AsyncIO', 'WebSockets', 'Redis', 'Telemetry'],
    githubUrl: 'https://github.com/yorayriniwnl/Hyperliquid_Analysis',
  },
  'Hybrid Network Intrusion Detection': {
    id: 'nids',
    index: 'SYS // 04',
    title: 'Hybrid Network Intrusion Detection',
    badge: 'RESEARCH // ML',
    subtitle: 'Statistical Anomaly & Neural Threat Classifier',
    desc: 'Two-stage network intrusion detection system combining flow-level statistical anomaly heuristics with deep neural threat classification.',
    architectureClaim: 'Filters 99% of normal flow traffic through lightweight statistical heuristics (CUSUM / Entropy) before passing suspect flows to deep neural classifiers.',
    failureTactic: 'Graceful degradation: If classifier inference queue saturates under DDoS, system sheds non-critical feature extractions and defaults to strict firewall drop rules.',
    metrics: [
      { label: 'Detection Rate', value: '99.2%' },
      { label: 'False Positive', value: '< 0.08%' },
      { label: 'Inspection Speed', value: '1.2 Gbps' },
    ],
    schematic: `
   [Raw Packet Capture] ──► [Stage 1: Statistical Heuristic]
                                            │ (Anomalous)
                                            ▼
                           [Stage 2: Deep Threat Neural Model] ──► [Alert / Block]
    `,
    tags: ['Python', 'PyTorch', 'Scikit-Learn', 'Packet Inspection', 'Security'],
    githubUrl: 'https://github.com/yorayriniwnl/Hybrid-Intelligent-Network-Intrusion-Detection-System',
  },
  'Taskflow Engine': {
    id: 'taskflow',
    index: 'SYS // 05',
    title: 'Taskflow Engine',
    badge: 'CORE // RUNTIME',
    subtitle: 'Distributed Job Orchestrator & Event Broker',
    architectureClaim: 'Guarantees at-least-once distributed job execution with atomic Redis Lua script locks and exponential backoff retry policies.',
    failureTactic: 'Dead-letter isolation queues with automatic snapshot of worker stack trace and payload state for post-mortem forensics.',
    metrics: [
      { label: 'Concurrency', value: '10,000 workers' },
      { label: 'Lock Contention', value: '< 0.02ms' },
      { label: 'Recovery SLA', value: '< 500ms' },
    ],
    schematic: `
   [Client Task] ──► [Redis Stream Broker] ──► [Distributed Worker Pool]
                                                       │
                                              Fail? ───┴─── OK?
                                                │            │
                                                ▼            ▼
                                          [Dead-Letter]  [Completed]
    `,
    tags: ['TypeScript', 'Node.js', 'Redis', 'Docker', 'Distributed Systems'],
    githubUrl: 'https://github.com/yorayriniwnl/Taskflow',
  },
  'Mentor-Mentee System': {
    id: 'mentor',
    index: 'SYS // 06',
    title: 'Mentor-Mentee System',
    badge: 'PLATFORM // INSTITUTION',
    subtitle: 'Academic OS & Role-Based Workflows',
    architectureClaim: 'Handles strict hierarchical RBAC, auditable grade modifications, and automated student progress milestones across multiple engineering cohorts.',
    failureTactic: 'Immutable audit logs with cryptographic hash-chaining on all student evaluations and submission timestamps.',
    metrics: [
      { label: 'Active Users', value: '2,500+ Students' },
      { label: 'Audit Trail', value: '100% Immutable' },
      { label: 'DB Query P95', value: '< 12ms' },
    ],
    schematic: `
   [Student Submission] ──► [Audit Log Hasher] ──► [Mentor Review Workflow] ──► [Grade Ledger]
    `,
    tags: ['Full-Stack', 'FastAPI', 'PostgreSQL', 'Tailwind CSS', 'Docker'],
    githubUrl: 'https://github.com/yorayriniwnl/mentor-mentee-system',
  },
};

export function SystemDossierModal({
  selectedSystem,
  onClose,
}: {
  selectedSystem: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const data = selectedSystem ? DOSSIERS[selectedSystem] : null;

  useEffect(() => {
    if (!data) return;
    sound.playWarp();
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        sound.playClick();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [data, onClose]);

  if (!data) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 grid place-items-center p-4 sm:p-6 bg-[#08070ce6] backdrop-blur-2xl animate-fade-in-up"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          sound.playClick();
          onClose();
        }
      }}
    >
      <div className="relative w-full max-w-3xl rounded-2xl bg-[#0f0b18] border border-[#b89bd330] p-6 sm:p-8 shadow-[0_30px_100px_rgba(0,0,0,0.8),0_0_40px_rgba(168,132,202,0.15)] overflow-hidden">
        {/* Top ambient highlight line */}
        <div className="absolute top-0 left-12 right-12 h-[1px] bg-gradient-to-r from-transparent via-[#c6a7e6] to-transparent opacity-60" />

        <div className="flex items-center justify-between pb-5 border-b border-[#b89bd318]">
          <div className="flex items-center gap-3 font-mono text-[11px] text-[#b29ecb]">
            <span className="w-2 h-2 rounded-full bg-[#c6b1ef] shadow-[0_0_8px_#c6b1ef]" />
            <span>{data.index}</span>
            <span className="text-[#6d5b80]">/</span>
            <span className="text-[#e2d6ef] font-semibold">{data.badge}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              sound.playClick();
              onClose();
            }}
            className="w-8 h-8 rounded-full border border-[#b89bd320] bg-[#ffffff05] hover:bg-[#ffffff10] text-[#c5b4db] grid place-items-center transition-colors"
            aria-label="Close dossier"
          >
            <X size={16} />
          </button>
        </div>

        <div className="mt-6">
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[#f1eaf8]">
            {data.title}
          </h2>
          <p className="mt-1 text-xs sm:text-sm text-[#a491b8]">{data.subtitle}</p>
        </div>

        {/* Metrics Grid */}
        <div className="grid grid-cols-3 gap-3 my-6">
          {data.metrics.map((m) => (
            <div key={m.label} className="p-3.5 rounded-xl bg-[#ffffff04] border border-[#b89bd315]">
              <span className="block text-[10px] font-mono uppercase tracking-wider text-[#8e7b9f]">
                {m.label}
              </span>
              <strong className="block mt-1 text-base sm:text-lg font-medium text-[#e8dcf5]">
                {m.value}
              </strong>
            </div>
          ))}
        </div>

        {/* Architecture & Failure Tactics */}
        <div className="space-y-4 my-6 text-xs sm:text-sm">
          <div className="p-4 rounded-xl bg-[#b89bd308] border border-[#b89bd318]">
            <div className="flex items-center gap-2 font-mono text-[11px] text-[#cbb6ea] uppercase tracking-wide">
              <Cpu size={14} />
              <strong>Architectural Thesis</strong>
            </div>
            <p className="mt-2 text-[#b0a0c2] leading-relaxed">{data.architectureClaim}</p>
          </div>

          <div className="p-4 rounded-xl bg-[#cfa76b08] border border-[#cfa76b25]">
            <div className="flex items-center gap-2 font-mono text-[11px] text-[#dac29d] uppercase tracking-wide">
              <ShieldAlert size={14} />
              <strong>Failure Mitigation & Boundaries</strong>
            </div>
            <p className="mt-2 text-[#c2b29b] leading-relaxed">{data.failureTactic}</p>
          </div>
        </div>

        {/* ASCII Schematic */}
        <div className="relative p-3 rounded-lg bg-[#07050b] border border-[#b89bd318] font-mono text-[10px] text-[#9a86b3] overflow-x-auto whitespace-pre">
          {data.schematic.trim()}
        </div>

        {/* Bottom Actions */}
        <div className="mt-6 pt-5 border-t border-[#b89bd318] flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-1.5">
            {data.tags.map((t) => (
              <span key={t} className="px-2 py-0.5 rounded bg-[#ffffff05] text-[#9f8eb2] text-[10px] font-mono">
                {t}
              </span>
            ))}
          </div>

          <a
            href={data.githubUrl}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => sound.playClick()}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#e4d7fa] hover:bg-[#f0e6ff] text-[#291d37] text-xs font-semibold shadow-[0_0_20px_rgba(180,140,236,0.2)] transition-all hover:-translate-y-0.5"
          >
            <span>Inspect GitHub Repository</span>
            <ArrowUpRight size={14} />
          </a>
        </div>
      </div>
    </div>
  );
}
