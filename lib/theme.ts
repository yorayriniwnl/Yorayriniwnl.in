'use client';

export type ThemeId = 'amethyst' | 'supernova' | 'emerald' | 'hyperdrive';

export type ThemeConfig = {
  id: ThemeId;
  name: string;
  tag: string;
  accent: string;
  accentMuted: string;
  glow: string;
  borderActive: string;
  gradientText: string;
};

export const THEMES: Record<ThemeId, ThemeConfig> = {
  amethyst: {
    id: 'amethyst',
    name: 'Quantum Resonance',
    tag: 'AMETHYST // DEFAULT',
    accent: '#c6b1ef',
    accentMuted: '#9c79c5',
    glow: 'rgba(168, 132, 202, 0.25)',
    borderActive: 'rgba(186, 150, 226, 0.45)',
    gradientText: 'linear-gradient(100deg, #f1deff 0%, #bea1ee 42%, #8b7cb7 100%)',
  },
  supernova: {
    id: 'supernova',
    name: 'Solar Supernova',
    tag: 'THERMONUCLEAR // SURGE',
    accent: '#ff8a50',
    accentMuted: '#ff6b35',
    glow: 'rgba(255, 107, 53, 0.3)',
    borderActive: 'rgba(255, 138, 80, 0.5)',
    gradientText: 'linear-gradient(100deg, #fff0e6 0%, #ff8a50 45%, #ff5522 100%)',
  },
  emerald: {
    id: 'emerald',
    name: 'Cyber Matrix',
    tag: 'MATRIX // VERIFIED',
    accent: '#34d399',
    accentMuted: '#10b981',
    glow: 'rgba(16, 185, 129, 0.3)',
    borderActive: 'rgba(52, 211, 153, 0.5)',
    gradientText: 'linear-gradient(100deg, #e6fff5 0%, #34d399 45%, #059669 100%)',
  },
  hyperdrive: {
    id: 'hyperdrive',
    name: 'Nebula Hyperdrive',
    tag: 'SINGULARITY // WARP',
    accent: '#f472b6',
    accentMuted: '#f43f5e',
    glow: 'rgba(244, 63, 94, 0.3)',
    borderActive: 'rgba(244, 114, 182, 0.5)',
    gradientText: 'linear-gradient(100deg, #ffe4f0 0%, #f472b6 45%, #db2777 100%)',
  },
};

export function applyTheme(themeId: ThemeId) {
  if (typeof document === 'undefined') return;
  const theme = THEMES[themeId] || THEMES.amethyst;
  const root = document.documentElement;

  root.setAttribute('data-theme', theme.id);
  root.style.setProperty('--accent-color', theme.accent);
  root.style.setProperty('--accent-muted', theme.accentMuted);
  root.style.setProperty('--glow-theme', theme.glow);
  root.style.setProperty('--border-theme-active', theme.borderActive);
  root.style.setProperty('--gradient-theme-text', theme.gradientText);

  localStorage.setItem('yor-theme-id', theme.id);
  window.dispatchEvent(new CustomEvent('yor-theme-change', { detail: theme }));
}

export function getSavedTheme(): ThemeId {
  if (typeof window === 'undefined') return 'amethyst';
  return (localStorage.getItem('yor-theme-id') as ThemeId) || 'amethyst';
}
