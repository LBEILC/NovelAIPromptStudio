import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { installClientDefaults } from './lib/clientDefaults';
import { AppearanceProvider } from './state/appearance';
import { NotificationProvider } from './kit/toast';
import { Win } from './shell/Win';
import { TrayMenu } from './shell/TrayMenu';
import '../design/tokens.css';
import './fonts.css';
import 'virtual:misans.css';
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
import './styles/11-states.css';

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
// 托盘的菜单窗口和主窗口同一个入口，地址带 #tray-menu 时只渲染托盘菜单（doc/design.md 2.28）
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppearanceProvider>
      {location.hash === '#tray-menu' ? (
        <TrayMenu />
      ) : (
        <Win>
          <NotificationProvider>
            <App />
          </NotificationProvider>
        </Win>
      )}
    </AppearanceProvider>
  </StrictMode>,
);
