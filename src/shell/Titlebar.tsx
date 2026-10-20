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
  status,
}: {
  page: string;
  onNavigate: (page: string) => void;
  children?: ReactNode;
  status?: ReactNode;
}) {
  return (
    <header className="studio-titlebar">
      <button
        className="studio-logo"
        aria-label="NovelAI Prompt Studio · 返回工作台"
        onClick={() => onNavigate('workbench')}
      >
        <BrandMark />
      </button>
      <nav aria-label="主导航">
        {[
          ['workbench', '工作台'],
          ['gallery', '图片库'],
        ].map(([key, label]) => (
          <button
            key={key}
            aria-current={page === key ? 'page' : undefined}
            onClick={() => onNavigate(key)}
          >
            {label}
          </button>
        ))}
      </nav>
      {children && (
        <>
          <span className="studio-titlebar-separator" />
          {children}
        </>
      )}
      <span className="studio-titlebar-space" />
      <div className="studio-titlebar-end">
        {status}
        <Button
          variant="quiet"
          size="small"
          className="studio-settings-button"
          aria-label="设置"
          aria-current={page === 'settings' ? 'page' : undefined}
          onClick={() => onNavigate('settings')}
        >
          <i className="ri-settings-3-line" aria-hidden="true" />
        </Button>
      </div>
      <div className="studio-window-controls" />
    </header>
  );
}
