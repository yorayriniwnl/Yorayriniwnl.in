'use client';

import { useEffect, useState } from 'react';
import { Activity, Globe, Palette } from 'lucide-react';
import { applyTheme, getSavedTheme, THEMES, type ThemeId } from '@/lib/theme';
import { sound } from '@/lib/audio';

export function TelemetryHUD() {
  const [fps, setFps] = useState(60);
  const [ping, setPing] = useState(16);
  const [theme, setTheme] = useState<ThemeId>('amethyst');

  useEffect(() => {
    setTheme(getSavedTheme());
    applyTheme(getSavedTheme());

    // FPS loop
    let frameCount = 0;
    let lastTime = performance.now();
    let animId: number;

    const measureFps = (now: number) => {
      frameCount++;
      if (now >= lastTime + 1000) {
        setFps(Math.min(144, Math.round((frameCount * 1000) / (now - lastTime))));
        frameCount = 0;
        lastTime = now;
      }
      animId = requestAnimationFrame(measureFps);
    };
    animId = requestAnimationFrame(measureFps);

    // Ping jitter simulation
    const pingInterval = setInterval(() => {
      setPing(Math.round(14 + Math.random() * 8));
    }, 2500);

    const onThemeChange = (e: Event) => {
      const custom = e as CustomEvent;
      if (custom.detail?.id) setTheme(custom.detail.id);
    };
    window.addEventListener('yor-theme-change', onThemeChange);

    return () => {
      cancelAnimationFrame(animId);
      clearInterval(pingInterval);
      window.removeEventListener('yor-theme-change', onThemeChange);
    };
  }, []);

  function cycleTheme() {
    const list: ThemeId[] = ['amethyst', 'supernova', 'emerald', 'hyperdrive'];
    const nextIdx = (list.indexOf(theme) + 1) % list.length;
    const next = list[nextIdx];
    sound.playThemeSwitch(nextIdx);
    setTheme(next);
    applyTheme(next);
  }

  const currentConfig = THEMES[theme];

  return (
    <div className="w-full bg-[#050409] border-b border-[#ffffff0a] py-1 px-4 sm:px-6 flex items-center justify-between text-[10px] font-mono text-[#8b7a9f] overflow-x-auto whitespace-nowrap">
      <div className="flex items-center gap-4 sm:gap-6">
        <span className="flex items-center gap-1.5 text-[#34d399]">
          <span className="w-1.5 h-1.5 rounded-full bg-[#34d399] animate-pulse" />
          EDGE: BOM1 (MUMBAI)
        </span>
        <span className="hidden sm:flex items-center gap-1">
          <Activity size={11} className="text-[#c6b1ef]" />
          CLIENT: <strong className="text-[#eee4f8]">{fps} FPS</strong>
        </span>
        <span className="hidden md:flex items-center gap-1">
          <Globe size={11} className="text-[#a491b8]" />
          RTT: <strong className="text-[#34d399]">{ping}ms</strong>
        </span>
      </div>

      <button
        type="button"
        onClick={cycleTheme}
        onMouseEnter={() => sound.playHover()}
        className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#ffffff06] hover:bg-[#ffffff12] border border-[#ffffff10] text-[#c9b8de] transition-colors"
        title="Cycle visual resonance theme"
      >
        <Palette size={11} style={{ color: currentConfig.accent }} />
        <span>THEME:</span>
        <strong style={{ color: currentConfig.accent }}>{currentConfig.name.toUpperCase()}</strong>
      </button>
    </div>
  );
}
