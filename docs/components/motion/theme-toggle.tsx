'use client';

// Adapted from beui.dev/components/motion/theme-toggle (MIT).
import { useTheme } from 'next-themes';
import { useReducedMotion } from 'motion/react';
import { flushSync } from 'react-dom';
import { useRef } from 'react';
import { Sun } from 'reicon-react/icons/Sun';
import { Moon } from 'reicon-react/icons/Moon';
import { cn } from '@/lib/utils';

export function ThemeToggle({ className }: { className?: string }) {
  const { resolvedTheme, setTheme } = useTheme();
  const reduce = useReducedMotion();
  const active = useRef<ViewTransition | null>(null);

  return <button type="button" className={cn('icon-button theme-toggle', className)} aria-label="Toggle color theme" onClick={(event) => {
    const next = resolvedTheme === 'dark' ? 'light' : 'dark';
    active.current?.skipTransition();
    if (reduce || !document.startViewTransition) { setTheme(next); return; }
    const root = document.documentElement;
    const rect = event.currentTarget.getBoundingClientRect();
    root.style.setProperty('--theme-origin', (rect.left + rect.width / 2) + 'px ' + (rect.top + rect.height / 2) + 'px');
    root.dataset.beuiTheme = 'circle';
    const transition = document.startViewTransition(() => { flushSync(() => setTheme(next)); });
    active.current = transition;
    const cleanup = () => { if (active.current === transition) { delete root.dataset.beuiTheme; active.current = null; } };
    transition.finished.then(cleanup, cleanup);
  }}>
    <Sun className="theme-moon" size={19} aria-hidden="true" />
    <Moon className="theme-sun" size={19} aria-hidden="true" />
  </button>;
}
