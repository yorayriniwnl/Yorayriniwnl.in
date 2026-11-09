'use client';

import { useState, useEffect, useRef } from 'react';
import { Terminal, Search, ArrowRight, Sparkles, Volume2, ShieldCheck, Activity, X, Code, Check } from 'lucide-react';
import { sound } from '@/lib/audio';
import { applyTheme, type ThemeId, THEMES } from '@/lib/theme';

type CommandItem = {
  id: string;
  label: string;
  detail: string;
  icon: typeof Terminal;
  action: () => void;
};

export function CommandPalette({
  onSelectSystem,
  onTriggerWarp,
}: {
  onSelectSystem: (name: string) => void;
  onTriggerWarp: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<'palette' | 'terminal'>('palette');
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);

  // Terminal state
  const [termHistory, setTermHistory] = useState<string[]>([
    'YOR-OS v2.4.1 (x86_64-pc-none)',
    'Type "help" for available system commands or "exit" to close.',
  ]);
  const [termInput, setTermInput] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);
  const termInputRef = useRef<HTMLInputElement>(null);
  const termScrollRef = useRef<HTMLDivElement>(null);

  const COMMANDS: CommandItem[] = [
    {
      id: 'warp',
      label: 'Trigger Constellation Hyperdrive',
      detail: 'Accelerate Three.js particle velocity and shift quantum resonance',
      icon: Sparkles,
      action: () => {
        onTriggerWarp();
        setOpen(false);
      },
    },
    {
      id: 'terminal',
      label: 'Switch to Interactive CLI Shell',
      detail: 'Open real interactive terminal with shell commands (yor@edge:~#)',
      icon: Terminal,
      action: () => {
        setMode('terminal');
        setTimeout(() => termInputRef.current?.focus(), 50);
      },
    },
    {
      id: 'candidatex',
      label: 'Inspect System: CandidateX',
      detail: 'Open architectural dossier and AST verification receipts',
      icon: Terminal,
      action: () => {
        onSelectSystem('CandidateX');
        setOpen(false);
      },
    },
    {
      id: 'zenith',
      label: 'Inspect System: Yor Zenith',
      detail: 'Geospatial solar yield modeling & polygon clipping',
      icon: Terminal,
      action: () => {
        onSelectSystem('Yor Zenith');
        setOpen(false);
      },
    },
    {
      id: 'trading',
      label: 'Inspect System: Trading Telemetry',
      detail: 'Monotonic orderbook sequencer and WebSocket backpressure',
      icon: Activity,
      action: () => {
        onSelectSystem('Trading Telemetry & Orderbook');
        setOpen(false);
      },
    },
    {
      id: 'simulators',
      label: 'Jump to: Realtime Telemetry Simulators',
      detail: 'Explore L2 orderbook, neural threat, and solar yield labs',
      icon: Activity,
      action: () => {
        document.getElementById('simulators')?.scrollIntoView({ behavior: 'smooth' });
        setOpen(false);
      },
    },
    {
      id: 'audio',
      label: 'Toggle Procedural UI SFX',
      detail: 'Switch Web Audio API sound generator state',
      icon: Volume2,
      action: () => {
        sound.toggleMute();
        setOpen(false);
      },
    },
    {
      id: 'contact',
      label: 'Dispatch Message to Ayush Roy',
      detail: 'Open mailto channel: ayushroy.dev@gmail.com',
      icon: ArrowRight,
      action: () => {
        window.location.href = 'mailto:ayushroy.dev@gmail.com';
        setOpen(false);
      },
    },
  ];

  const filtered = COMMANDS.filter(
    (c) =>
      c.label.toLowerCase().includes(query.toLowerCase()) ||
      c.detail.toLowerCase().includes(query.toLowerCase())
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        sound.playWarp();
        setOpen((prev) => !prev);
      } else if (e.key === 'Escape' && open) {
        sound.playClick();
        setOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) {
      setActiveIdx(0);
      if (mode === 'palette') {
        setTimeout(() => inputRef.current?.focus(), 50);
      } else {
        setTimeout(() => termInputRef.current?.focus(), 50);
      }
    }
  }, [open, mode]);

  useEffect(() => {
    if (termScrollRef.current) {
      termScrollRef.current.scrollTop = termScrollRef.current.scrollHeight;
    }
  }, [termHistory]);

  function handleKeyNav(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      sound.playHover();
      setActiveIdx((prev) => (prev + 1) % filtered.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      sound.playHover();
      setActiveIdx((prev) => (prev - 1 + filtered.length) % filtered.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[activeIdx]) {
        sound.playClick();
        filtered[activeIdx].action();
      }
    }
  }

  function handleTerminalSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cmd = termInput.trim();
    if (!cmd) return;
    sound.playKeypress();

    const clean = cmd.toLowerCase();
    const newHistory = [...termHistory, `yor@edge:~# ${cmd}`];

    if (clean === 'help') {
      newHistory.push(
        'Available commands:',
        '  theme <amethyst|supernova|emerald|hyperdrive> - Shift quantum theme',
        '  inspect <candidatex|zenith|trading|nids|taskflow> - Open system dossier',
        '  warp           - Accelerate constellation hyperdrive',
        '  cat resume     - Print technical resume summary',
        '  ping           - Measure origin latency',
        '  clear          - Clear terminal display',
        '  sudo hire      - Executive hiring override',
        '  exit           - Close terminal HUD'
      );
    } else if (clean.startsWith('theme ')) {
      const target = clean.split(' ')[1] as ThemeId;
      if (THEMES[target]) {
        applyTheme(target);
        sound.playThemeSwitch(Object.keys(THEMES).indexOf(target));
        newHistory.push(`[OK] Switched theme resonance to: ${THEMES[target].name}`);
      } else {
        newHistory.push(`[ERR] Unknown theme. Choose: amethyst, supernova, emerald, hyperdrive`);
      }
    } else if (clean.startsWith('inspect ')) {
      const sys = clean.split(' ')[1];
      const match = Object.keys(THEMES).length ? sys : '';
      if (clean.includes('candidate')) onSelectSystem('CandidateX');
      else if (clean.includes('zenith')) onSelectSystem('Yor Zenith');
      else if (clean.includes('trading')) onSelectSystem('Trading Telemetry & Orderbook');
      else if (clean.includes('nids')) onSelectSystem('Hybrid Network Intrusion Detection');
      else if (clean.includes('taskflow')) onSelectSystem('Taskflow Engine');
      newHistory.push(`[OK] Dispatched holographic dossier for ${sys}`);
    } else if (clean === 'warp') {
      onTriggerWarp();
      newHistory.push('[OK] Three.js Constellation hyperdrive initiated.');
    } else if (clean === 'cat resume' || clean === 'resume') {
      newHistory.push(
        'NAME: Ayush Roy (YOR)',
        'EDUCATION: B.Tech CS & CE at KIIT (2023 - 2027)',
        'FOCUS: Backend Architecture, Realtime Systems, Applied ML',
        'CORE STACK: Python, TypeScript, FastAPI, Next.js, PostgreSQL, Redis, Three.js',
        'EMAIL: ayushroy.dev@gmail.com'
      );
    } else if (clean === 'ping') {
      newHistory.push(
        '64 bytes from bom1.vercel-edge.net: icmp_seq=1 ttl=58 time=14.2 ms',
        '64 bytes from bom1.vercel-edge.net: icmp_seq=2 ttl=58 time=16.8 ms',
        '--- ping statistics --- 0% packet loss, rtt min/avg/max = 14.2/15.5/16.8 ms'
      );
    } else if (clean === 'sudo hire') {
      sound.playWarp();
      newHistory.push(
        '*****************************************************',
        '*** ACCESS GRANTED: WELCOME TO THE FUTURE!       ***',
        '*** Thank you for recognizing high-conviction craft!***',
        '*** Dispatching direct line: ayushroy.dev@gmail.com ***',
        '*****************************************************'
      );
    } else if (clean === 'clear') {
      setTermHistory([]);
      setTermInput('');
      return;
    } else if (clean === 'exit') {
      setOpen(false);
      setTermInput('');
      return;
    } else {
      newHistory.push(`Command not recognized: "${cmd}". Type "help" for command manifest.`);
    }

    setTermHistory(newHistory);
    setTermInput('');
  }

  return (
    <>
      {/* Floating Keyboard Shortcut Trigger */}
      <button
        type="button"
        onClick={() => {
          sound.playClick();
          setOpen(true);
        }}
        title="Open Command Center (⌘K)"
        aria-label="Open Command Center"
        className="fixed bottom-6 right-6 z-40 flex items-center gap-2 px-3.5 py-2 rounded-full bg-[#120d1cdd] hover:bg-[#1a1329] border border-[#b89bd330] text-[#c9b4e6] text-xs font-mono shadow-[0_8px_32px_rgba(0,0,0,0.5),0_0_20px_rgba(168,132,202,0.15)] backdrop-blur-xl transition-all hover:scale-105"
      >
        <Terminal size={14} className="text-[#c6b1ef]" />
        <span className="hidden sm:inline">COMMAND CENTER</span>
        <kbd className="px-1.5 py-0.5 rounded bg-[#ffffff10] text-[10px] text-[#eee4f8]">⌘K</kbd>
      </button>

      {/* Palette Overlay */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 grid place-items-start pt-16 sm:pt-24 px-4 bg-[#08070ce6] backdrop-blur-2xl animate-fade-in-up"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              sound.playClick();
              setOpen(false);
            }
          }}
        >
          <div className="w-full max-w-2xl rounded-2xl bg-[#0f0b18] border border-[#b89bd335] shadow-[0_30px_100px_rgba(0,0,0,0.9),0_0_50px_rgba(168,132,202,0.25)] overflow-hidden">
            {/* Top Bar Switcher */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-[#b89bd318] bg-[#ffffff03] text-xs font-mono">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    setMode('palette');
                  }}
                  className={`px-3 py-1 rounded-lg transition-colors ${
                    mode === 'palette' ? 'bg-[#b89bd320] text-[#eee4f8]' : 'text-[#8e7b9f] hover:text-[#c4b4d6]'
                  }`}
                >
                  Quick Launcher
                </button>
                <button
                  type="button"
                  onClick={() => {
                    sound.playClick();
                    setMode('terminal');
                  }}
                  className={`px-3 py-1 rounded-lg flex items-center gap-1.5 transition-colors ${
                    mode === 'terminal' ? 'bg-[#b89bd320] text-[#eee4f8]' : 'text-[#8e7b9f] hover:text-[#c4b4d6]'
                  }`}
                >
                  <Code size={12} />
                  <span>Interactive Shell</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[#8e7b9f] hover:text-[#cbb6ea]"
              >
                <X size={16} />
              </button>
            </div>

            {mode === 'palette' ? (
              <>
                {/* Search Input */}
                <div className="flex items-center gap-3 px-5 py-4 border-b border-[#b89bd318]">
                  <Search size={16} className="text-[#9e8cb3]" />
                  <input
                    ref={inputRef}
                    type="text"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setActiveIdx(0);
                    }}
                    onKeyDown={handleKeyNav}
                    placeholder="Type a command or jump to system..."
                    className="w-full bg-transparent text-sm text-[#eee4f8] placeholder-[#79678e] outline-none font-mono"
                  />
                </div>

                {/* List */}
                <div className="p-2 max-h-[360px] overflow-y-auto">
                  {filtered.length === 0 ? (
                    <div className="p-6 text-center text-xs font-mono text-[#8e7b9f]">
                      No matching commands found.
                    </div>
                  ) : (
                    filtered.map((item, idx) => {
                      const Icon = item.icon;
                      const isSelected = idx === activeIdx;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            sound.playClick();
                            item.action();
                          }}
                          onMouseEnter={() => {
                            sound.playHover();
                            setActiveIdx(idx);
                          }}
                          className={`w-full flex items-center justify-between p-3 rounded-xl text-left transition-colors font-mono ${
                            isSelected
                              ? 'bg-[#b89bd318] text-[#f2eaf9]'
                              : 'text-[#a491b8] hover:bg-[#ffffff04]'
                          }`}
                        >
                          <div className="flex items-center gap-3">
                            <Icon size={15} className={isSelected ? 'text-[#c6b1ef]' : 'text-[#7e6d92]'} />
                            <div>
                              <div className="text-xs font-medium">{item.label}</div>
                              <div className="text-[10px] text-[#79688d]">{item.detail}</div>
                            </div>
                          </div>
                          <ArrowRight size={13} className={isSelected ? 'text-[#c6b1ef]' : 'opacity-0'} />
                        </button>
                      );
                    })
                  )}
                </div>
              </>
            ) : (
              /* INTERACTIVE TERMINAL SHELL */
              <div className="p-4 bg-[#08060e] font-mono text-xs">
                <div ref={termScrollRef} className="h-[280px] overflow-y-auto space-y-1 text-[#b5a3c9] pb-2">
                  {termHistory.map((line, i) => (
                    <div key={i} className="leading-relaxed">
                      {line.startsWith('yor@edge:~#') ? (
                        <span className="text-[#34d399]">{line}</span>
                      ) : line.startsWith('[ERR]') ? (
                        <span className="text-[#f87171]">{line}</span>
                      ) : line.startsWith('***') ? (
                        <span className="text-[#fde047] font-semibold">{line}</span>
                      ) : (
                        <span>{line}</span>
                      )}
                    </div>
                  ))}
                </div>

                <form onSubmit={handleTerminalSubmit} className="flex items-center gap-2 pt-3 border-t border-[#b89bd318]">
                  <span className="text-[#34d399]">yor@edge:~#</span>
                  <input
                    ref={termInputRef}
                    type="text"
                    value={termInput}
                    onChange={(e) => setTermInput(e.target.value)}
                    placeholder="help"
                    className="flex-1 bg-transparent text-[#eee4f8] outline-none font-mono text-xs"
                  />
                </form>
              </div>
            )}

            {/* Footer */}
            <div className="px-5 py-2.5 bg-[#ffffff03] border-t border-[#b89bd315] flex items-center justify-between text-[10px] font-mono text-[#79688d]">
              <span>Use ↑ ↓ to navigate · Enter to select</span>
              <span>ESC to dismiss</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
