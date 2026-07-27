import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
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

  useEffect(() => {
    if (!portalRoot) return;
    const source = document.querySelector('.lobe-root');
    if (!source) return;
    const computed = window.getComputedStyle(source);
    for (let index = 0; index < computed.length; index += 1) {
      const property = computed[index];
      if (property.startsWith('--')) portalRoot.style.setProperty(property, computed.getPropertyValue(property));
    }
    portalRoot.style.color = computed.color;
    portalRoot.style.fontFamily = computed.fontFamily;
  }, [appearance, portalRoot]);

  return portalRoot ? <ToastHost duration={2200} position="top" root={portalRoot}/> : null;
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
