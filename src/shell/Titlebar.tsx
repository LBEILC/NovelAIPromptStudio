// 标题栏（doc/design.md 2.9、2.20）：左边标志和导航（当前页文字是 --text、稍粗，不做滑块和下划线），
// 工作台时后面是标签页；右边是生成状态和设置齿轮。Windows 用自绘标题栏，系统的窗口按钮画在最右边。
import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { Icon, Logo } from '../kit/controls';
import { fadeOut, usePresence } from '../kit/motion';
import 'remixicon/fonts/remixicon.css';

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
  // 离开工作台时标签页条照原样淡出再拿掉（用户 10-25：以前直接没了）。它们是标题栏里的几个并排元素，
  // 不包一层（标签页条量宽度、收进"更多"都靠现在的布局），逐个淡出
  const kids = useRef(children);
  if (children) kids.current = children;
  const { mounted, leaving } = usePresence(!!children);
  const sep = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    if (!leaving) return;
    const els: HTMLElement[] = [];
    for (let el = sep.current as Element | null; el && !el.classList.contains('sp'); ) {
      if (el instanceof HTMLElement) els.push(el);
      el = el.nextElementSibling;
    }
    for (const el of els) {
      el.style.pointerEvents = 'none';
      fadeOut(el);
    }
    return () => {
      for (const el of els) {
        el.getAnimations().forEach((a) => a.cancel());
        el.style.pointerEvents = '';
      }
    };
  }, [leaving]);
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
      {mounted && (
        <>
          <span className="tb-sep" ref={sep} data-enter="fade" />
          {children || kids.current}
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
