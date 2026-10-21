// 工作台的标签页（doc/design.md 2.14、2.17）：一个标签页是一个作品。没起名的只显示缩略图（按比例），起过名的后面写名称和版数。
// 当前标签页的底和外框是一块会滑的标记；有改动的带小圆点，生成中的带墨色小圆点。悬停 400ms 弹出预览卡片。
// 拖动换位置（只能横着拖）：按被拖的标签页自己的位置判断，过了到相邻空位的一半就换；其他的让位。中键关闭。
// 右键：关闭、关闭其他标签页、关闭右侧标签页、在图片库中显示。最右边的"+"点击新建空白作品（2.26a；没填令牌时是打开图片），
// 右键是菜单：新建空白作品和几种打开方式。还没有图的空白作品按尺寸比例显示一个虚线框。
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { invokeUI } from '../lib/commands';
import { hasImageName, imageFileName } from '../lib/imageNaming.js';
import { mediaUrl } from '../lib/imageStage.js';
import { workbenchTabHasChanges } from '../lib/workbenchSession.js';
import { nearestTabSlot } from '../lib/tabSlots.js';
import { useGeneration } from '../state/generation';
import { Icon } from '../kit/controls';
import { ContextMenu, type MenuEntry } from '../kit/menu';
import { Pop } from '../kit/layer';
import { FlipScope, dur, useExitList, useIndicator } from '../kit/motion';
import { blockTips } from '../kit/tip';
import type { WorkbenchSession, WorkbenchTab } from '../state/workbench';

export interface TabsProps {
  session: WorkbenchSession;
  onActivateTab: (id: string) => void;
  onCloseTab: (id: string) => Promise<void> | void;
  onReorderTab: (id: string, target: string) => void;
  onChooseImage: () => void;
  onNewBlank: () => void;
  onOpenClipboard: () => void;
  onBrowseLibrary: () => void;
  onShowLibrary: (tab: WorkbenchTab) => void;
}
let dragging = false;
blockTips(() => dragging);
const shapeOf = (w = 1, h = 1) => (w > h ? 'wide' : w === h ? 'square' : '');
const when = (iso = '') => {
  const t = new Date(iso);
  if (Number.isNaN(t.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(t.getMonth() + 1)}-${p(t.getDate())} ${p(t.getHours())}:${p(t.getMinutes())}`;
};
const midEll = (s: string, max: number) =>
  s.length <= max
    ? s
    : `${s.slice(0, Math.ceil((max - 1) * 0.6))}…${s.slice(-Math.floor((max - 1) * 0.4))}`;

export function WorkbenchTabs(p: TabsProps) {
  const generation = useGeneration();
  const list = useRef<HTMLDivElement>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [menu, setMenu] = useState<{ at: [number, number]; tab: WorkbenchTab | null } | null>(null);
  const [peek, setPeek] = useState('');
  const [lifted, setLifted] = useState('');
  const [overflow, setOverflow] = useState(false);
  const peekTimer = useRef(0);
  const tabs = useExitList(p.session.tabs, (t) => t.id);
  // 关掉的那一个淡出、真正拿掉以后其他的补位，当前标记跟着重新对位
  useIndicator(list, [
    p.session.activeTabId,
    tabs.map((t) => t.key).join('|'),
    p.session.tabs.map((t) => t.id).join('|'),
    counts,
  ]);
  // 拖动中：被拖的那一个停在指针的位置（换位以后它在 DOM 里的位置变了，要按新的位置重算）
  const drag = useRef<{ id: string; want: number } | null>(null);
  useLayoutEffect(() => {
    const d = drag.current,
      me = d && list.current?.querySelector<HTMLElement>(`[data-tab="${d.id}"]`);
    if (d && me)
      me.style.transform = `translateX(${d.want - me.offsetLeft}px) scale(var(--drag-scale))`;
  });
  // 版数（有账号时才有版本）；删除版本、撤销、从回收站恢复不改标签页的 revision，跟着 libraryChanged 再数一遍
  const revisions = p.session.tabs.map((t) => `${t.id}:${t.revision}`).join('|');
  const [changed, setChanged] = useState(0);
  useEffect(
    () =>
      window.studio?.onCommandEvent((e) => {
        if (e.type === 'workbench' && e.libraryChanged) setChanged((n) => n + 1);
      }),
    [],
  );
  useEffect(() => {
    if (!generation.settings.hasToken) return;
    let live = true;
    for (const t of p.session.tabs)
      void invokeUI('version.list', { tabId: t.id })
        .then((r) => {
          // 空白作品的起点不算一版
          const n = r.versions.filter((v) => !v.isStart).length;
          if (live) setCounts((c) => (c[t.id] === n ? c : { ...c, [t.id]: n }));
        })
        .catch(() => {});
    return () => {
      live = false;
    };
  }, [revisions, changed, generation.jobs.length, generation.settings.hasToken]);
  // 放不下时两头出现翻页按钮
  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    // 按第一个和最后一个标签页的位置量内容宽度：不算会滑的标记（它是绝对定位的），也不算正在退出的。
    // 用布局位置（offset*），不用 getBoundingClientRect：后者带着让位动画的位移，新开、关闭标签页的那一刻
    // 会量大，判成"放不下"，动画结束后尺寸没变也不会再量，箭头就一直留着（用户 10-21）。
    // 翻页按钮出现以后它们占的宽度算回可用宽度里，免得按钮自己把判断撑成"放不下"
    const update = () => {
      const tabs = [...el.querySelectorAll<HTMLElement>('.tab:not(.leaving)')];
      if (!tabs.length) return setOverflow(false);
      const last = tabs[tabs.length - 1];
      const content = last.offsetLeft + last.offsetWidth - tabs[0].offsetLeft;
      const pages = [
        ...(el.parentElement?.querySelectorAll<HTMLElement>(':scope > .tabs-page') || []),
      ];
      const room = el.clientWidth + pages.reduce((w, b) => w + b.offsetWidth + 2, 0);
      setOverflow(content > room + 2);
    };
    const ro = new ResizeObserver(update);
    ro.observe(el);
    // 退出的标签页真正拿掉、标签页内容变了（名字、版数）时也再量一次
    const mo = new MutationObserver(update);
    mo.observe(el, { childList: true, subtree: true, characterData: true });
    update();
    el.querySelector('.tab.on')?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return () => {
      ro.disconnect();
      mo.disconnect();
    };
  }, [p.session.tabs.length, p.session.activeTabId]);
  useEffect(() => {
    const el = list.current;
    if (!el) return;
    const wheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth || e.ctrlKey || e.metaKey) return;
      const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (!d) return;
      e.preventDefault();
      el.scrollLeft += d;
    };
    el.addEventListener('wheel', wheel, { passive: false });
    return () => el.removeEventListener('wheel', wheel);
  }, []);
  // 拖动换位置：被拖的那一个跟着指针（只横着走），放大到 --drag-scale；其他的排到放下之后会在的位置
  const latest = useRef(p);
  latest.current = p;
  useEffect(() => {
    const box = list.current!;
    let press: { id: string; x: number; y: number; grab: number; on: boolean } | null = null,
      swallow = false;
    const el = (id: string) => box.querySelector<HTMLElement>(`[data-tab="${id}"]`);
    const down = (e: PointerEvent) => {
      const t = (e.target as Element).closest<HTMLElement>('[data-tab]');
      if (e.button !== 0 || !t) return;
      press = {
        id: t.dataset.tab!,
        x: e.clientX,
        y: e.clientY,
        grab: e.clientX - t.getBoundingClientRect().left,
        on: false,
      };
    };
    const move = (e: PointerEvent) => {
      if (!press) return;
      if (!press.on && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 4) return;
      if (!press.on) {
        press.on = true;
        dragging = true;
        setLifted(press.id);
        setPeek('');
        document.documentElement.classList.add('is-dragging');
        getSelection()?.removeAllRanges();
      }
      const ids = latest.current.session.tabs.map((t) => t.id);
      const me = el(press.id);
      if (!me) return;
      const r = box.getBoundingClientRect(),
        first = el(ids[0])!,
        base = first.offsetLeft,
        gap = parseFloat(getComputedStyle(box).columnGap) || 2;
      const want = Math.max(
        base,
        Math.min(
          box.scrollWidth - me.offsetWidth,
          e.clientX - r.left + box.scrollLeft - press.grab,
        ),
      );
      const slot = nearestTabSlot(
        base,
        ids.filter((id) => id !== press!.id).map((id) => el(id)!.offsetWidth),
        gap,
        want,
      );
      drag.current = { id: press.id, want };
      // 换位：其他标签页由 FlipScope 让位（被拖的那一个不参与）
      if (ids[slot] !== press.id) latest.current.onReorderTab(press.id, ids[slot]);
      me.style.transition = 'box-shadow var(--dur-1) var(--ease-out)';
      me.style.transform = `translateX(${want - me.offsetLeft}px) scale(var(--drag-scale))`;
      const ind = box.querySelector<HTMLElement>(':scope > .ind');
      if (ind && press.id === latest.current.session.activeTabId) {
        ind.classList.add('jump');
        ind.style.transform = `translate(${want}px, ${me.offsetTop}px)`;
      }
    };
    const up = () => {
      drag.current = null;
      if (press?.on) {
        swallow = true;
        const me = el(press.id);
        if (me) {
          me.style.transition =
            'transform var(--dur-3) var(--ease-move), box-shadow var(--dur-1) var(--ease-out)';
          me.style.transform = '';
          setTimeout(
            () => {
              me.style.transition = '';
            },
            dur(3) + 30,
          );
        }
        const ind = box.querySelector<HTMLElement>(':scope > .ind'),
          on = box.querySelector<HTMLElement>(':scope > .on');
        if (ind && on) {
          ind.classList.remove('jump');
          ind.style.transform = `translate(${on.offsetLeft}px, ${on.offsetTop}px)`;
        }
        setTimeout(() => setLifted(''), dur(3));
      }
      press = null;
      dragging = false;
      document.documentElement.classList.remove('is-dragging');
    };
    const click = (e: MouseEvent) => {
      if (!swallow) return;
      swallow = false;
      e.preventDefault();
      e.stopPropagation();
    };
    box.addEventListener('pointerdown', down);
    box.addEventListener('click', click, true);
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('pointercancel', up);
    return () => {
      box.removeEventListener('pointerdown', down);
      box.removeEventListener('click', click, true);
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('pointercancel', up);
    };
  }, []);
  const closeMany = async (ts: WorkbenchTab[]) => {
    for (const t of ts) await p.onCloseTab(t.id);
  };
  const menuItems: MenuEntry[] = !menu
    ? []
    : menu.tab
      ? (() => {
          const t = menu.tab,
            i = p.session.tabs.findIndex((x) => x.id === t.id);
          return [
            { label: '关闭', hint: 'Ctrl W', onSelect: () => void p.onCloseTab(t.id) },
            {
              label: '关闭其他标签页',
              disabled: p.session.tabs.length < 2,
              onSelect: () => void closeMany(p.session.tabs.filter((x) => x.id !== t.id)),
            },
            {
              label: '关闭右侧标签页',
              disabled: i === p.session.tabs.length - 1,
              onSelect: () => void closeMany(p.session.tabs.slice(i + 1)),
            },
            ...(t.source.type === 'library'
              ? ['sep' as const, { label: '在图片库中显示', onSelect: () => p.onShowLibrary(t) }]
              : []),
          ];
        })()
      : [
          {
            label: '新建空白作品',
            icon: 'file-add-line',
            disabled: generation.settings.hasToken ? false : '填了 NovelAI 令牌才能生成',
            onSelect: p.onNewBlank,
          },
          'sep' as const,
          {
            label: '打开图片…',
            icon: 'folder-open-line',
            hint: 'Ctrl I',
            onSelect: p.onChooseImage,
          },
          {
            label: '从剪贴板打开',
            icon: 'clipboard-line',
            hint: 'Ctrl V',
            onSelect: p.onOpenClipboard,
          },
          { label: '从图片库打开', icon: 'gallery-line', onSelect: p.onBrowseLibrary },
        ];
  const peekTab = p.session.tabs.find((t) => t.id === peek);
  const peekState = (t: WorkbenchTab) => {
    const job = generation.jobs.find((j) => j.tabId === t.id && j.state === 'generating');
    return job
      ? `生成中 · ${job.continuous ? `第 ${job.index} 张` : `${job.index} / ${job.count}`}`
      : workbenchTabHasChanges(t)
        ? '有未生成的改动'
        : '';
  };
  const scrollBy = (d: number) =>
    list.current?.scrollBy({
      left: d * (list.current.clientWidth * 0.8),
      behavior: dur(3) ? 'smooth' : 'auto',
    });
  return (
    <>
      {overflow && (
        <button
          className="btn quiet sm icon tabs-page"
          aria-label="向前翻"
          onClick={() => scrollBy(-1)}
        >
          <Icon name="arrow-left-s-line" />
        </button>
      )}
      <div
        className={`tabs has-ind ${overflow ? 'clip' : ''}`}
        ref={list}
        role="tablist"
        aria-label="作品"
        onKeyDown={(e) => {
          const i = p.session.tabs.findIndex((t) => t.id === p.session.activeTabId),
            n = p.session.tabs.length;
          // 键盘换位置：空格拿起有焦点的标签页，← → 移动，空格或 Enter 放下，Esc 也是放下
          if (e.key === ' ' && !lifted) {
            e.preventDefault();
            const id = (e.target as Element).closest<HTMLElement>('[data-tab]')?.dataset.tab;
            if (id) {
              setLifted(id);
              setPeek('');
            }
            return;
          }
          if (lifted) {
            if ([' ', 'Enter', 'Escape', 'Tab'].includes(e.key)) {
              if (e.key !== 'Tab') e.preventDefault();
              setLifted('');
              return;
            }
            const j = p.session.tabs.findIndex((t) => t.id === lifted);
            const to = e.key === 'ArrowRight' ? j + 1 : e.key === 'ArrowLeft' ? j - 1 : -1;
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') e.preventDefault();
            if (j >= 0 && to >= 0 && to < n) {
              p.onReorderTab(lifted, p.session.tabs[to].id);
              const id = lifted;
              requestAnimationFrame(() =>
                list.current?.querySelector<HTMLElement>(`[data-tab="${id}"]`)?.focus(),
              );
            }
            return;
          }
          const next =
            e.key === 'ArrowRight'
              ? (i + 1) % n
              : e.key === 'ArrowLeft'
                ? (i - 1 + n) % n
                : e.key === 'Home'
                  ? 0
                  : e.key === 'End'
                    ? n - 1
                    : -1;
          if (next < 0 || !n) return;
          e.preventDefault();
          p.onActivateTab(p.session.tabs[next].id);
          requestAnimationFrame(() =>
            list.current?.querySelectorAll<HTMLElement>('[data-tab]')[next]?.focus(),
          );
        }}
      >
        <i className="ind" />
        <FlipScope root={list}>
          {tabs.map(({ item: t, leaving }) => {
            const img = t.project;
            const name = img && hasImageName(img) ? img.name : '';
            const on = t.id === p.session.activeTabId;
            const busy = generation.jobs.some((j) => j.tabId === t.id && j.state === 'generating');
            const dirty = workbenchTabHasChanges(t);
            return (
              <button
                key={t.id}
                data-tab={t.id}
                data-key={`tab-${t.id}`}
                data-flip={lifted === t.id ? undefined : ''}
                className={`tab ${name ? '' : 'bare'} ${on ? 'on' : ''} ${lifted === t.id ? 'lifted' : ''} ${leaving ? 'leaving' : ''}`}
                role="tab"
                aria-selected={on}
                aria-label={name || (img ? imageFileName(img) : '没有起名')}
                tabIndex={on ? 0 : -1}
                data-enter="fade"
                data-no-tip=""
                onClick={() => p.onActivateTab(t.id)}
                onMouseDown={(e) => e.button === 1 && e.preventDefault()}
                onAuxClick={(e) => {
                  if (e.button !== 1) return;
                  e.preventDefault();
                  void p.onCloseTab(t.id);
                }}
                onContextMenu={(e) => {
                  e.preventDefault();
                  setPeek('');
                  setMenu({ at: [e.clientX, e.clientY], tab: t });
                }}
                onPointerEnter={() => {
                  clearTimeout(peekTimer.current);
                  if (dragging) return;
                  if (peek) setPeek(t.id);
                  else peekTimer.current = window.setTimeout(() => setPeek(t.id), 400);
                }}
                onPointerLeave={() => {
                  clearTimeout(peekTimer.current);
                  peekTimer.current = window.setTimeout(() => setPeek(''), 80);
                }}
                onPointerDown={() => {
                  clearTimeout(peekTimer.current);
                  setPeek('');
                }}
              >
                {on && <span className="cur" />}
                {img && !img.image_path ? (
                  <span
                    className={`tab-blank ${shapeOf(img.metadata.width, img.metadata.height)}`}
                  />
                ) : (
                  <img
                    className={shapeOf(img?.metadata.width, img?.metadata.height)}
                    src={mediaUrl(img?.thumbnail_path || img?.image_path || '')}
                    alt=""
                    draggable={false}
                  />
                )}
                {name && (
                  <>
                    <span className="nm">{name}</span>
                    {!!counts[t.id] && <span className="n mono">{counts[t.id]} 版</span>}
                  </>
                )}
                {busy ? (
                  <span className="dirty busy" aria-label="生成中" />
                ) : dirty ? (
                  <span className="dirty" aria-label="有未生成的改动" />
                ) : null}
              </button>
            );
          })}
        </FlipScope>
      </div>
      {overflow && (
        <button
          className="btn quiet sm icon tabs-page"
          aria-label="向后翻"
          onClick={() => scrollBy(1)}
        >
          <Icon name="arrow-right-s-line" />
        </button>
      )}
      <button
        className="tab add"
        aria-label={generation.settings.hasToken ? '新建空白作品' : '打开图片'}
        data-tip={
          generation.settings.hasToken
            ? '新建空白作品 · 右键可以打开图片'
            : '打开图片 · 右键选择打开方式'
        }
        onClick={generation.settings.hasToken ? p.onNewBlank : p.onChooseImage}
        onContextMenu={(e) => {
          e.preventDefault();
          setMenu({ at: [e.clientX, e.clientY], tab: null });
        }}
      >
        <Icon name="add-line" />
      </button>
      <ContextMenu at={menu?.at || null} onClose={() => setMenu(null)} items={menuItems} />
      <Pop
        open={!!peekTab && !lifted && !menu}
        onClose={() => setPeek('')}
        anchor={`[data-tab="${peek}"]`}
        className="popover tab-peek"
        passive
        deps={[peek]}
      >
        {peekTab?.project && !peekTab.project.image_path && (
          <>
            <div className="tp-img tp-blank">
              <span
                style={{
                  aspectRatio: `${peekTab.project.metadata.width} / ${peekTab.project.metadata.height}`,
                }}
              />
            </div>
            <b className="tp-name">
              {hasImageName(peekTab.project) ? peekTab.project.name : '空白作品'}
            </b>
            <span className="help mono">
              {peekTab.project.metadata.width} × {peekTab.project.metadata.height}
            </span>
            <span className="help">{peekState(peekTab) || '还没有生成'}</span>
          </>
        )}
        {peekTab?.project?.image_path && (
          <>
            <div className="tp-img">
              <img
                src={mediaUrl(peekTab.project.thumbnail_path || peekTab.project.image_path)}
                alt=""
              />
            </div>
            {hasImageName(peekTab.project) ? (
              <b className="tp-name">{peekTab.project.name}</b>
            ) : (
              <span className="tp-file mono">{midEll(imageFileName(peekTab.project), 44)}</span>
            )}
            <span className="help mono">
              {peekTab.project.metadata.width} × {peekTab.project.metadata.height}
              {counts[peekTab.id] != null ? ` · ${counts[peekTab.id]} 版` : ''}
            </span>
            <span className="help">
              {when(peekTab.project.created_at || peekTab.updatedAt)} 导入
              {peekState(peekTab) && (
                <>
                  {' · '}
                  <span className="tp-state">{peekState(peekTab)}</span>
                </>
              )}
            </span>
          </>
        )}
      </Pop>
    </>
  );
}
