import { Button } from '../ui';
import type { ReactNode } from 'react';
import logo from '../../design/identity/logo/master-symbol.svg?raw';
import 'remixicon/fonts/remixicon.css';
import './shell.css';
export function BrandMark() {
  return (
    <span
      className="studio-brand-mark"
      aria-hidden="true"
      dangerouslySetInnerHTML={{ __html: logo }}
    />
  );
}
export function Titlebar({
  page,
  onNavigate,
  children,
}: {
  page: string;
  onNavigate: (page: string) => void;
  children?: ReactNode;
}) {
  return (
    <header className="studio-titlebar">
      <Button
        variant="quiet"
        aria-label="NovelAI Prompt Studio · 返回工作台"
        onClick={() => onNavigate('workbench')}
      >
        <BrandMark />
      </Button>
      <nav aria-label="主导航">
        {[
          ['workbench', '工作台'],
          ['gallery', '图片库'],
        ].map(([key, label]) => (
          <Button
            variant="quiet"
            key={key}
            aria-current={page === key ? 'page' : undefined}
            onClick={() => onNavigate(key)}
          >
            {label}
          </Button>
        ))}
      </nav>
      {children}
      <div className="studio-titlebar-space" />
      <Button
        variant="quiet"
        aria-label="设置"
        aria-current={page === 'settings' ? 'page' : undefined}
        onClick={() => onNavigate('settings')}
      >
        <i className="ri-settings-3-line" aria-hidden="true" />
      </Button>
      <div className="studio-window-controls" />
    </header>
  );
}
