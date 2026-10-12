import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AppearanceSettings } from '../shared/types';
import { ThemeProvider } from '../ui';
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
  motion: 'full',
};
const AppearanceContext = createContext<{
  appearance: AppearanceSettings;
  resolvedTheme: 'light' | 'dark';
  changeAppearance: (patch: Partial<AppearanceSettings>) => Promise<void>;
}>({ appearance: defaultAppearance, resolvedTheme: 'light', changeAppearance: async () => {} });
export const useAppearance = () => useContext(AppearanceContext);

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const [appearance, setAppearance] = useState(defaultAppearance);
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
    window.studio
      ?.getAppearanceSettings()
      .then((saved) => {
        if (active) setAppearance({ ...defaultAppearance, ...saved, primaryColor: 'blue' });
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
  }, [appearance, resolvedTheme]);
  const changeAppearance = async (patch: Partial<AppearanceSettings>) => {
    const saved = await window.studio?.saveAppearanceSettings(patch);
    setAppearance((current) => ({ ...current, ...(saved ?? patch), primaryColor: 'blue' }));
  };
  return (
    <AppearanceContext.Provider value={{ appearance, resolvedTheme, changeAppearance }}>
      <ThemeProvider
        theme={resolvedTheme}
        motion={appearance.motion === 'reduced' ? 'system' : appearance.motion}
      >
        {children}
      </ThemeProvider>
    </AppearanceContext.Provider>
  );
}
