// 标题栏（doc/design.md 2.9、2.20）：左边标志和导航（当前页文字是 --text、稍粗，不做滑块和下划线），
// 工作台时后面是标签页；右边是生成状态和设置齿轮。Windows 用自绘标题栏，系统的窗口按钮画在最右边。
import type { ReactNode } from 'react';
import { Icon, Logo } from '../kit/controls';
import 'remixicon/fonts/remixicon.css';
import './shell.css';

/** 旧设置页的关于页还在用；设置页重写后删掉 */
export function BrandMark() {
  return (
    <span className="studio-brand-mark" aria-hidden="true">
      <Logo />
    </span>
  );
}

export type Page = 'workbench' | 'gallery' | 'materials' | 'settings';
const NAV: [Page, string][] = [
  ['workbench', '工作台'],
  ['gallery', '图片库'],
  ['materials', '素材'],
];
export function Titlebar({
  page,
  onNavigate,
  children,
  status,
}: {
  page: Page;
  onNavigate: (page: Page) => void;
  children?: ReactNode;
  status?: ReactNode;
}) {
  return (
    <header className="tb">
      <span className="logo">
        <Logo />
      </span>
      <nav className="nav" aria-label="主导航">
        {NAV.map(([key, label]) => (
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
          <span className="tb-sep" />
          {children}
        </>
      )}
      <span className="sp" />
      <div className="tb-end">
        {status}
        <button
          className={`btn quiet sm icon tb-set ${page === 'settings' ? 'on' : ''}`}
          aria-label="设置"
          aria-current={page === 'settings' ? 'page' : undefined}
          onClick={() => onNavigate('settings')}
        >
          <Icon name="settings-3-line" />
        </button>
      </div>
      <div className="wc" />
    </header>
  );
}
