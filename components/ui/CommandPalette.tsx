'use client';

import { useState, useEffect, useRef } from 'react';
import { Terminal, Search, ArrowRight, Sparkles, Volume2, ShieldCheck, Activity, X } from 'lucide-react';
import { sound } from '@/lib/audio';

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
  const [query, setQuery] = useState('');
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

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
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

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
          className="fixed inset-0 z-50 grid place-items-start pt-20 sm:pt-28 px-4 bg-[#08070cd9] backdrop-blur-xl animate-fade-in-up"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              sound.playClick();
              setOpen(false);
            }
          }}
        >
          <div className="w-full max-w-xl rounded-2xl bg-[#0f0b18] border border-[#b89bd335] shadow-[0_30px_100px_rgba(0,0,0,0.9),0_0_40px_rgba(168,132,202,0.2)] overflow-hidden">
            {/* Input Header */}
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
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[#8e7b9f] hover:text-[#cbb6ea]"
              >
                <X size={16} />
              </button>
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
