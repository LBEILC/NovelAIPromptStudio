import { createContext, useContext, useEffect, type ReactNode } from 'react';
import '../../design/tokens.css';
import './ui.css';

export type Platform = 'windows' | 'macos' | 'linux';
const PlatformContext = createContext<Platform>('windows');
export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') return 'windows';
  return /Mac/i.test(navigator.platform)
    ? 'macos'
    : /Linux/i.test(navigator.platform)
      ? 'linux'
      : 'windows';
}
export function ThemeProvider({
  children,
  theme = 'system',
  motion = 'system',
  platform = detectPlatform(),
}: {
  children: ReactNode;
  theme?: 'system' | 'light' | 'dark';
  motion?: 'full' | 'system' | 'off';
  platform?: Platform;
}) {
  useEffect(() => {
    const html = document.documentElement;
    const previous = { theme: html.dataset.theme, motion: html.dataset.motion };
    const dark = matchMedia('(prefers-color-scheme: dark)');
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      html.dataset.theme = theme === 'system' ? (dark.matches ? 'dark' : 'light') : theme;
      html.dataset.motion = motion === 'off' || reduced.matches ? 'off' : 'full';
    };
    update();
    dark.addEventListener('change', update);
    reduced.addEventListener('change', update);
    return () => {
      dark.removeEventListener('change', update);
      reduced.removeEventListener('change', update);
      for (const key of ['theme', 'motion'] as const) {
        if (previous[key] === undefined) delete html.dataset[key];
        else html.dataset[key] = previous[key];
      }
    };
  }, [theme, motion]);
  return (
    <PlatformContext.Provider value={platform}>
      <div className="nps-root">{children}</div>
    </PlatformContext.Provider>
  );
}
export function Shortcut({ keys }: { keys: string[] }) {
  const platform = useContext(PlatformContext);
  return (
    <kbd className="nps-kbd">
      {keys.map((key) => (key === 'Mod' ? (platform === 'macos' ? '⌘' : 'Ctrl') : key)).join(' ')}
    </kbd>
  );
}
