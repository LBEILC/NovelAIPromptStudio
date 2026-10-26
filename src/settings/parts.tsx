// 设置页的版式（doc/design.md 2.11）：页头停在顶部，内容滚到它下面之后才出现底线；AI 服务的页脚停在底部。
// 一行设置 .setrow（左边标题和说明，右边控件），一列设置 .setcol（标题、控件、说明上下排）。
import { useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon } from '../kit/controls';
import { MenuPop, type MenuEntry } from '../kit/menu';
import { useSwap } from '../kit/motion';
import type { Place } from '../kit/layer';

export function SetPage({
  title,
  desc,
  foot,
  children,
}: {
  title: string;
  desc?: ReactNode;
  foot?: ReactNode;
  children: ReactNode;
}) {
  const head = useRef<HTMLDivElement>(null);
  return (
    <div
      className="scroll set-scroll"
      data-sb-top=".set-head"
      data-sb-bottom=".set-foot"
      onScroll={(e) => head.current?.classList.toggle('stuck', e.currentTarget.scrollTop > 0)}
    >
      <div className="set-head" ref={head}>
        <div>
          <h1>{title}</h1>
          {desc && <p>{desc}</p>}
        </div>
      </div>
      <div className="set-main">
        <div className="set">{children}</div>
      </div>
      {foot && (
        <div className="set-foot">
          <div>{foot}</div>
        </div>
      )}
    </div>
  );
}

const lines = (help?: ReactNode | ReactNode[]) =>
  help === undefined || help === null || help === false
    ? null
    : (Array.isArray(help) ? help : [help]).map((line, i) =>
        line ? <small key={i}>{line}</small> : null,
      );

export function Row({
  title,
  help,
  children,
  className = '',
  style,
  feature,
}: {
  title: ReactNode;
  help?: ReactNode | ReactNode[];
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** 功能一览指出控件用的 data-feature（2.40） */
  feature?: string;
}) {
  return (
    <div className={`setrow ${className}`} style={style} data-feature={feature}>
      <div>
        {title}
        {lines(help)}
      </div>
      {children}
    </div>
  );
}

export function Col({
  title,
  help,
  children,
  after,
  className = '',
  feature,
}: {
  title: ReactNode;
  help?: ReactNode | ReactNode[];
  children?: ReactNode;
  /** 放在说明下面的按钮 */
  after?: ReactNode;
  className?: string;
  feature?: string;
}) {
  return (
    <div className={`setcol ${className}`} data-feature={feature}>
      <div>{title}</div>
      {children}
      {lines(help)}
      {after}
    </div>
  );
}

/** 展开收起：高度 --dur-3，内容同时淡入淡出 */
export function Expand({ open, children }: { open: boolean; children: ReactNode }) {
  return (
    <div className={`expand ${open ? 'open' : ''}`}>
      <div>{children}</div>
    </div>
  );
}

/** 换内容：k 变了时旧的淡出、新的淡入，叠在同一个格子里 */
export function Swap({
  k,
  children,
  className = '',
}: {
  k: string;
  children: ReactNode;
  className?: string;
}) {
  const items = useSwap({ k, node: children }, (v) => v.k);
  return (
    <div className={`swap ${className}`}>
      {items.map((it) => (
        <div key={it.key} className={it.leaving ? 'leaving' : ''} data-enter="fade">
          {it.value.node}
        </div>
      ))}
    </div>
  );
}

/** 设置里的下拉框：看起来是输入框，点开是菜单 */
export function Dropdown({
  label,
  value,
  items,
  style,
  place = 'below-left',
  menuClass = '',
  className = '',
  disabled,
}: {
  label: string;
  className?: string;
  value: ReactNode;
  items: MenuEntry[];
  style?: CSSProperties;
  place?: Place;
  menuClass?: string;
  disabled?: boolean;
}) {
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  return (
    <>
      <button
        ref={btn}
        className={`field sm sdd ${className} ${open ? 'open' : ''}`}
        style={style}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        <span className="sdd-v">{value}</span>
        <Icon name="arrow-down-s-line" />
      </button>
      <MenuPop
        open={open}
        onClose={close}
        anchor={btn}
        place={place}
        className={`lsp ${menuClass}`}
        items={items}
      />
    </>
  );
}

export const bytes = (value: number) =>
  value < 1024
    ? `${value} B`
    : value < 1048576
      ? `${(value / 1024).toFixed(1)} KB`
      : value < 1073741824
        ? `${(value / 1048576).toFixed(1)} MB`
        : `${(value / 1073741824).toFixed(2)} GB`;

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
