'use client';

import { useEffect, useLayoutEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

export function NavigationScrollManager() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (typeof window !== 'undefined' && 'scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual';
    }
  }, []);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return;

    if (window.location.hash) {
      const targetId = window.location.hash.replace('#', '');
      const targetElement = document.getElementById(targetId);
      if (targetElement) {
        targetElement.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }

    const scrollToTop = () => {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    };

    scrollToTop();
    const rafId = requestAnimationFrame(scrollToTop);
    const timer = setTimeout(scrollToTop, 20);

    return () => {
      cancelAnimationFrame(rafId);
      clearTimeout(timer);
    };
  }, [pathname, searchParams]);

  return null;
}
