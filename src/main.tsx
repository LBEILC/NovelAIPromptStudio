import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { installClientDefaults } from './lib/clientDefaults';
import { AppearanceProvider } from './state/appearance';
import { NotificationProvider } from './kit/toast';
import { Win } from './shell/Win';
import './fonts.css';
import 'virtual:misans.css';
import './styles.css';
import 'remixicon/fonts/remixicon.css';
// 界面的样式（035 起以产品为准）：顺序和原来的交互原型一样，后面的覆盖前面的
import './styles/01-base.css';
import './styles/02-components.css';
import './styles/03-settings.css';
import './styles/04-library.css';
import './styles/05-workbench.css';
import './styles/06-generation.css';
import './styles/07-core.css';
import './styles/08-wb.css';
import './styles/09-libset.css';
import './styles/10-product.css';

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
installClientDefaults();
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppearanceProvider>
      <Win>
        <NotificationProvider>
          <App />
        </NotificationProvider>
      </Win>
    </AppearanceProvider>
  </StrictMode>,
);
