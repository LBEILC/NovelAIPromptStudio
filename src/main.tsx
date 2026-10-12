import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { AppearanceProvider } from './state/appearance';
import { NotificationProvider } from './ui';
import './fonts.css';
import 'virtual:misans.css';
import './styles.css';

if (window.studioScreenshot) {
  window.addEventListener('error', (event) => window.studioScreenshot?.reportError(event.message));
  window.addEventListener('unhandledrejection', (event) =>
    window.studioScreenshot?.reportError(String(event.reason)),
  );
}
document.documentElement.dataset.platform = navigator.platform.startsWith('Win')
  ? 'windows'
  : navigator.platform.startsWith('Mac')
    ? 'macos'
    : 'other';
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppearanceProvider>
      <NotificationProvider>
        <App />
      </NotificationProvider>
    </AppearanceProvider>
  </StrictMode>,
);
