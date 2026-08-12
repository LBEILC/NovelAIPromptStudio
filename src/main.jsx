import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { createPortal } from 'react-dom';
import App from './App.jsx';
import LobeProvider from './LobeProvider.jsx';
import { ContextMenuHost, ToastHost } from '@lobehub/ui/base-ui';
import { colorScales } from '@lobehub/ui/color';
import { DEFAULT_MONO_FONT, DEFAULT_SANS_FONT } from './lib/fonts.js';
import './fonts.css';
import './styles.css';

const DEFAULT_APPEARANCE = { themeMode: 'dark', primaryColor: 'blue', sansFont: DEFAULT_SANS_FONT, monoFont: DEFAULT_MONO_FONT, motion: 'full' };

function ThemedToastHost({ appearance }) {
  const [portalRoot, setPortalRoot] = useState(null);

  useEffect(() => {
    const root = document.createElement('div');
    root.className = 'studio-toast-portal';
    document.body.append(root);
    setPortalRoot(root);
    return () => root.remove();
  }, []);

  if (!portalRoot) return null;
  return createPortal(
    <LobeProvider
      monoFont={appearance.monoFont}
      primaryColor={appearance.primaryColor}
      sansFont={appearance.sansFont}
      themeMode={appearance.themeMode}
    >
      <ToastHost duration={2200} position="top"/>
    </LobeProvider>,
    portalRoot,
  );
}

function StudioRoot() {
  const [appearance, setAppearance] = useState(DEFAULT_APPEARANCE);

  useEffect(() => {
    window.studio?.getAppearanceSettings?.().then(setAppearance).catch(() => {});
  }, []);

  useEffect(() => {
    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const resolvedTheme = appearance.themeMode === 'auto'
        ? (systemTheme.matches ? 'dark' : 'light')
        : appearance.themeMode;
      const scale = colorScales[appearance.primaryColor] || colorScales.blue;
      document.documentElement.dataset.themeMode = resolvedTheme;
      document.documentElement.style.setProperty('--accent', scale[resolvedTheme][9]);
    };
    applyTheme();
    if (appearance.themeMode !== 'auto') return undefined;
    systemTheme.addEventListener('change', applyTheme);
    return () => systemTheme.removeEventListener('change', applyTheme);
  }, [appearance.primaryColor, appearance.themeMode]);

  return <LobeProvider monoFont={appearance.monoFont} primaryColor={appearance.primaryColor} sansFont={appearance.sansFont} themeMode={appearance.themeMode}>
    <App appearance={appearance} setAppearance={setAppearance}/>
    <ContextMenuHost/>
    <ThemedToastHost appearance={appearance}/>
  </LobeProvider>;
}

document.documentElement.dataset.platform = navigator.platform.startsWith('Win')
  ? 'windows'
  : navigator.platform.startsWith('Mac') ? 'macos' : 'other';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <StudioRoot/>
  </React.StrictMode>,
);
