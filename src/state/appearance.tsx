import { invokeUI } from '../lib/commands';
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { AppearanceSettings } from '../shared/types';
import { quoteFontFamily } from '../lib/fonts.js';
import tokenSource from '../../design/tokens.css?raw';

const tokenFont = (role: string) =>
  tokenSource.match(new RegExp(`--font-${role}:\\s*([^;]+);`))?.[1] || '';
export const defaultProseFont = tokenFont('prose').split(',')[0].trim().replaceAll('"', '');

export const defaultAppearance: AppearanceSettings = {
  themeMode: 'auto',
  primaryColor: 'blue',
  sansFont: 'MiSans',
  monoFont: 'IBM Plex Mono',
  proseFont: defaultProseFont,
  motion: 'reduced',
};
const AppearanceContext = createContext<{
  appearance: AppearanceSettings;
  resolvedTheme: 'light' | 'dark';
  changeAppearance: (patch: Partial<AppearanceSettings>) => Promise<void>;
}>({ appearance: defaultAppearance, resolvedTheme: 'light', changeAppearance: async () => {} });
export const useAppearance = () => useContext(AppearanceContext);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState(defaultAppearance);
  const revision = useRef(0);
  const [systemDark, setSystemDark] = useState(
    () => matchMedia('(prefers-color-scheme: dark)').matches,
  );
  const resolvedTheme =
    appearance.themeMode === 'auto' ? (systemDark ? 'dark' : 'light') : appearance.themeMode;
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');
    const update = () => setSystemDark(media.matches);
    media.addEventListener('change', update);
    update();
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    let active = true;
    const request = revision.current;
    invokeUI('settings.appearance.get', {})
      .then((saved) => {
        if (active && request === revision.current)
          setAppearance({ ...defaultAppearance, ...saved, primaryColor: 'blue' });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    const html = document.documentElement;
    html.style.setProperty(
      '--font-ui',
      `${quoteFontFamily(appearance.sansFont)}, ${tokenFont('ui')}`,
    );
    html.style.setProperty(
      '--font-mono',
      `${quoteFontFamily(appearance.monoFont)}, ${tokenFont('mono')}`,
    );
    html.style.setProperty(
      '--font-prose',
      `${quoteFontFamily(appearance.proseFont)}, ${tokenFont('prose')}`,
    );
    html.dataset.themeMode = resolvedTheme;
    html.dataset.theme = resolvedTheme;
  }, [appearance, resolvedTheme]);
  // 动效：完整、跟随系统（系统要求减少动态效果时关掉）、关闭
  useEffect(() => {
    const html = document.documentElement;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => {
      html.dataset.motion =
        appearance.motion === 'off' || (appearance.motion === 'reduced' && reduced.matches)
          ? 'off'
          : 'full';
    };
    update();
    reduced.addEventListener('change', update);
    return () => reduced.removeEventListener('change', update);
  }, [appearance.motion]);
  const changeAppearance = async (patch: Partial<AppearanceSettings>) => {
    const request = ++revision.current;
    const saved = await invokeUI('settings.appearance.save', { settings: patch });
    // A reply contains the whole snapshot at that save, not the latest choice.
    if (request === revision.current)
      setAppearance((current) => ({ ...current, ...(saved ?? patch), primaryColor: 'blue' }));
  };
  return (
    <AppearanceContext.Provider value={{ appearance, resolvedTheme, changeAppearance }}>
      {children}
    </AppearanceContext.Provider>
  );
}
