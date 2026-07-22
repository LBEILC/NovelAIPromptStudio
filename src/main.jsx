import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import LobeProvider from './LobeProvider.jsx';
import { ContextMenuHost } from '@lobehub/ui/es/ContextMenu/index';
import { ToastHost } from '@lobehub/ui/es/Toast/index';
import { colorScales } from '@lobehub/ui/es/color/index';
import './fonts.css';
import './styles.css';

const DEFAULT_APPEARANCE = { themeMode: 'dark', primaryColor: 'blue', sansFont: 'geist', monoFont: 'geist-mono', motion: 'full' };

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
    <ToastHost duration={2200} position="bottom"/>
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
