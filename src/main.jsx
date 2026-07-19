import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import LobeProvider from './LobeProvider.jsx';
import './fonts.css';
import './styles.css';

const DEFAULT_APPEARANCE = { themeMode: 'dark', fontScale: 'large', density: 'comfortable', motion: 'full' };

function StudioRoot() {
  const [appearance, setAppearance] = useState(DEFAULT_APPEARANCE);

  useEffect(() => {
    window.studio?.getAppearanceSettings?.().then(setAppearance).catch(() => {});
  }, []);

  return <LobeProvider themeMode={appearance.themeMode}>
    <App appearance={appearance} setAppearance={setAppearance}/>
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
