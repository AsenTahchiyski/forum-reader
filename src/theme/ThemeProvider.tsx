import { useEffect } from 'react';
import { contrastInk, hexToRgb } from '../lib/color';
import type { ThemeMode } from '../db/types';

export function applyAccent(hex: string): void {
  const rgb = hexToRgb(hex);
  const ink = contrastInk(rgb);
  const root = document.documentElement;
  root.style.setProperty('--accent', `${rgb.r} ${rgb.g} ${rgb.b}`);
  root.style.setProperty('--accent-contrast', `${ink.r} ${ink.g} ${ink.b}`);

  const themeColor = document.querySelector<HTMLMetaElement>(
    'meta[name="theme-color"]'
  );
  if (themeColor) {
    const isDark =
      document.documentElement.dataset.theme === 'dark' ||
      (!document.documentElement.dataset.theme &&
        window.matchMedia('(prefers-color-scheme: dark)').matches);
    themeColor.content = isDark ? '#0b0f17' : '#f7f8fb';
  }
}

export function applyThemeMode(mode: ThemeMode): void {
  const root = document.documentElement;
  if (mode === 'system') {
    root.removeAttribute('data-theme');
  } else {
    root.dataset.theme = mode;
  }
}

interface Props {
  accent: string;
  mode: ThemeMode;
  readingScale: number;
  children: React.ReactNode;
}

export function ThemeProvider({ accent, mode, readingScale, children }: Props) {
  useEffect(() => {
    applyAccent(accent);
  }, [accent]);

  useEffect(() => {
    document.documentElement.style.setProperty(
      '--reading-scale',
      String(readingScale)
    );
  }, [readingScale]);

  useEffect(() => {
    applyThemeMode(mode);
    applyAccent(accent); // re-evaluate theme-color meta when mode changes
  }, [mode, accent]);

  useEffect(() => {
    if (mode !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => applyAccent(accent);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [mode, accent]);

  return <>{children}</>;
}
