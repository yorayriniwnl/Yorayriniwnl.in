'use client';

import Link from 'next/link';
import { ArrowUpRight, Menu, Sparkles, X } from 'lucide-react';
import { useEffect, useState, useRef } from 'react';
import { SurfaceBadge } from './SurfaceBadge';

const NAVIGATION_ITEMS = [
  { label: 'Systems', href: '#projects' },
  { label: 'Craft & Method', href: '#craft' },
  { label: 'Interactive Engine', href: '#signals' },
  { label: 'About', href: '#about' },
  { label: 'Contact', href: '#contact' },
];

export function PlatformHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        menuToggleRef.current?.focus();
      }
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [menuOpen]);

  return (
    <header className="sticky top-0 z-50 w-full bg-[#08070cd9] border-b border-[#b89bd318] backdrop-blur-xl">
      <div className="w-[min(1440px,calc(100%-96px))] max-sm:w-[calc(100%-40px)] mx-auto min-h-[76px] flex items-center justify-between gap-5">
        <Link href="/" className="inline-flex items-center gap-2.5 text-[#ede5f5] no-underline group" aria-label="Ayush Roy Home">
          <span className="w-8 h-8 rounded-lg grid place-items-center bg-[#b59ad715] border border-[#baa1e335] text-[#d5beed] group-hover:border-[#c4a6ed] transition-colors" aria-hidden="true">
            <Sparkles size={16} />
          </span>
          <span className="text-sm font-semibold tracking-tight font-mono">
            YOR <span className="text-[#a491b8] font-normal font-sans">/ AYUSH ROY</span>
          </span>
        </Link>

        <nav
          className={`flex items-center gap-1 max-md:hidden`}
          aria-label="Primary navigation"
        >
          {NAVIGATION_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              className="text-[#a391b2] hover:text-[#ead9fb] hover:bg-[#bba0d510] rounded-md px-3 py-1.5 text-xs font-medium transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-4">
          <div className="hidden lg:block">
            <SurfaceBadge label="VERIFIED / LIVE" detail="Production deployment active" />
          </div>

          <Link
            href="mailto:ayushroy.dev@gmail.com"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-[#e4d7fa] hover:bg-[#f0e6ff] text-[#291d37] text-xs font-semibold shadow-[0_0_20px_rgba(180,140,236,0.18)] transition-all hover:-translate-y-0.5"
          >
            <span>Start a conversation</span>
            <ArrowUpRight size={14} aria-hidden="true" />
          </Link>

          <button
            ref={menuToggleRef}
            type="button"
            className="md:hidden inline-flex items-center justify-center w-9 h-9 rounded-lg border border-[#b89bd328] bg-[#b399cc08] text-[#c1a8d4]"
            aria-label="Toggle navigation"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((open) => !open)}
          >
            {menuOpen ? <X size={18} /> : <Menu size={18} />}
          </button>
        </div>
      </div>

      {menuOpen && (
        <div className="md:hidden px-6 pb-6 pt-2 bg-[#0d0916] border-b border-[#b89bd320] flex flex-col gap-2">
          {NAVIGATION_ITEMS.map((item) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className="text-[#a391b2] hover:text-[#ead9fb] hover:bg-[#bba0d510] rounded-lg px-4 py-2.5 text-sm font-medium transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
