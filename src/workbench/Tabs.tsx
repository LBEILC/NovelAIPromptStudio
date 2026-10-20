import { invokeUI } from '../lib/commands';
import { AnimatedItems } from '../ui/AnimatedItems';
import {
  DecodedImage,
  useMovingIndicator,
  useNavigationSelection,
  animateElement,
  motionTokens,
} from '../ui/transitions';
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { Button, ContextMenu, type MenuItem } from '../ui';
import type { WorkbenchSession, WorkbenchTab } from '../state/workbench';
import { hasImageName, imageFileName } from '../lib/imageNaming.js';
import { mediaUrl } from '../lib/imageStage.js';
import { workbenchTabHasChanges } from '../lib/workbenchSession.js';
import './tabs.css';
import { useGeneration } from '../state/generation';
import { nearestTabSlot } from '../lib/tabSlots.js';
import { flushSync } from 'react-dom';
import { DndContext, KeyboardSensor, useSensor, useSensors } from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useDragFeedback } from './DragFeedback';

export interface TabsProps {
  session: WorkbenchSession;
  onActivateTab: (id: string) => void;
  onCloseTab: (id: string) => Promise<void> | void;
  onReorderTab: (id: string, target: string) => void;
  onChooseImage: () => void;
  onShowLibrary: (tab: WorkbenchTab) => void;
}
function Tab({ tab, p }: { tab: WorkbenchTab; p: TabsProps }) {
  const sortable = useSortable({ id: tab.id });
  const generation = useGeneration();
  const job = generation.jobs.find((j) => j.tabId === tab.id && j.state === 'generating');
  const running = !!job;
  const [versionCount, setVersionCount] = useState(1);
  useEffect(() => {
    let active = true;
    if (generation.settings.hasToken)
      void invokeUI('version.list', { tabId: tab.id }).then((r) => {
        if (active) setVersionCount(r.versions.length);
      });
    return () => {
      active = false;
    };
  }, [tab.id, tab.revision, generation.jobs]);
  const image = tab.project;
  const name = image && hasImageName(image) ? image.name : '';
  const index = p.session.tabs.findIndex((item) => item.id === tab.id);
  const closeMany = async (tabs: WorkbenchTab[]) => {
    for (const item of tabs) await p.onCloseTab(item.id);
  };
  const items: MenuItem[] = [
    { id: 'close', label: '关闭', onSelect: () => void p.onCloseTab(tab.id) },
    {
      id: 'others',
      label: '关闭其他标签页',
      onSelect: () => void closeMany(p.session.tabs.filter((item) => item.id !== tab.id)),
    },
    {
      id: 'right',
      label: '关闭右侧标签页',
      disabled: index === p.session.tabs.length - 1,
      onSelect: () => void closeMany(p.session.tabs.slice(index + 1)),
    },
  ];
  if (tab.source.type === 'library')
    items.push({ id: 'library', label: '在图片库里显示', onSelect: () => p.onShowLibrary(tab) });
  return (
    <ContextMenu label={name || '没有起名'} items={items}>
      <div
        ref={sortable.setNodeRef}
        {...sortable.attributes}
        {...sortable.listeners}
        className={`wb-tab workbench-tab ${name ? '' : 'bare'}`}
        data-workbench-tab-id={tab.id}
        data-active={tab.id === p.session.activeTabId || undefined}
        role="tab"
        aria-selected={tab.id === p.session.activeTabId}
        aria-label={name || '没有起名'}
        data-tip={name || (image ? imageFileName(image) : '')}
        data-tip-file={!name || undefined}
        data-tip-details={
          image ? `${image.metadata.width} × ${image.metadata.height} · ${versionCount} 版` : ''
        }
        data-tip-status={
          running
            ? `生成中 ${job!.completed + 1} / ${job!.count}`
            : workbenchTabHasChanges(tab)
              ? '有未生成的改动'
              : ''
        }
        data-tip-image={mediaUrl(image?.thumbnail_path || image?.image_path || '')}
        data-tip-date={image?.created_at || tab.updatedAt}
        onClick={() => p.onActivateTab(tab.id)}
        onMouseDown={(event) => {
          if (event.button === 1) event.preventDefault();
        }}
        onAuxClick={(event) => {
          if (event.button !== 1) return;
          event.preventDefault();
          event.stopPropagation();
          void p.onCloseTab(tab.id);
        }}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          sortable.listeners?.onKeyDown?.(event);
          if (event.defaultPrevented || sortable.isSorting) return;
          const next =
            event.key === 'ArrowRight'
              ? (index + 1) % p.session.tabs.length
              : event.key === 'ArrowLeft'
                ? (index - 1 + p.session.tabs.length) % p.session.tabs.length
                : event.key === 'Home'
                  ? 0
                  : event.key === 'End'
                    ? p.session.tabs.length - 1
                    : -1;
          if (next < 0) return;
          event.preventDefault();
          p.onActivateTab(p.session.tabs[next].id);
          event.currentTarget
            .closest('[role=tablist]')
            ?.querySelectorAll<HTMLElement>('[role=tab]')
            [next]?.focus();
        }}
        style={
          {
            transform: sortable.isSorting ? CSS.Translate.toString(sortable.transform) : undefined,
            '--wb-thumb-ratio': (image?.metadata.width || 1) / (image?.metadata.height || 1),
          } as CSSProperties
        }
      >
        {tab.id === p.session.activeTabId && <span className="wb-tab-current" aria-hidden />}
        <DecodedImage
          draggable={false}
          alt=""
          src={mediaUrl(image?.thumbnail_path || image?.image_path || '')}
        />
        {name && (
          <>
            <span className="wb-tab-name">{name}</span>
            <span className="wb-tab-count">{versionCount} 版</span>
          </>
        )}
        {running && (
          <span className="wb-tab-generating" data-tip="生成中">
            ●
          </span>
        )}
        {workbenchTabHasChanges(tab) && <span className="wb-dirty" aria-label="提示词已修改" />}
      </div>
    </ContextMenu>
  );
}
export function WorkbenchTabs(p: TabsProps) {
  const list = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const indicator = useRef<HTMLSpanElement>(null);
  const [selected, select] = useNavigationSelection(p.session.activeTabId, p.onActivateTab);
  const visualProps = {
    ...p,
    session: { ...p.session, activeTabId: selected },
    onActivateTab: select,
  };
  useMovingIndicator(list, indicator, '.wb-tab[aria-selected=true]', selected);

  const drag = useDragFeedback(list, true);
  const sensors = useSensors(
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const [overflow, setOverflow] = useState(false);
  const latest = useRef(p);
  latest.current = p;
  useEffect(() => {
    const node = list.current;
    if (!node) return;
    let press: { id: string; x: number; y: number; grab: number; active: boolean } | null = null;
    let suppressClick = false;
    const moves = new Map<string, () => void>();
    const down = (event: PointerEvent) => {
      const el = (event.target as HTMLElement).closest<HTMLElement>('[data-workbench-tab-id]');
      if (event.button !== 0 || !el || el.dataset.workbenchTabId === 'new-tab') return;
      press = {
        id: el.dataset.workbenchTabId!,
        x: event.clientX,
        y: event.clientY,
        grab: event.clientX - el.getBoundingClientRect().left,
        active: false,
      };
      event.preventDefault();
    };
    const move = (event: PointerEvent) => {
      if (!press) return;
      if (!press.active && Math.hypot(event.clientX - press.x, event.clientY - press.y) < 4) return;
      press.active = true;
      document.documentElement.classList.add('is-dragging');
      getSelection()?.removeAllRanges();
      const ids = latest.current.session.tabs.map((t) => t.id);
      const element = (id: string) =>
        node.querySelector<HTMLElement>(`[data-workbench-tab-id="${id}"]`)!;
      const el = element(press.id),
        bounds = node.getBoundingClientRect();
      const base = element(ids[0]).offsetLeft;
      const gap = parseFloat(getComputedStyle(node).columnGap) || 0;
      const want = Math.max(
        base,
        Math.min(node.clientWidth - el.offsetWidth, event.clientX - bounds.left - press.grab),
      );
      const slot = nearestTabSlot(
        base,
        ids.filter((id) => id !== press!.id).map((id) => element(id).offsetWidth),
        gap,
        want,
      );
      if (ids[slot] !== press.id) {
        const before = new Map(ids.map((id) => [id, element(id).getBoundingClientRect().left]));
        flushSync(() => latest.current.onReorderTab(press!.id, ids[slot]));
        for (const id of ids) {
          if (id === press.id) continue;
          const item = element(id);
          moves.get(id)?.();
          const dx = before.get(id)! - item.getBoundingClientRect().left;
          const timing = motionTokens(item);
          moves.set(
            id,
            animateElement(
              item,
              [{ transform: `translateX(${dx}px)` }, { transform: 'none' }],
              timing.move,
              timing.easeMove,
            ),
          );
        }
      }
      el.dataset.dragging = 'true';
      el.style.transition = 'box-shadow var(--dur-1) var(--ease-out)';
      el.style.transform = `translateX(${want - el.offsetLeft}px) scale(var(--drag-scale))`;
      if (press.id === latest.current.session.activeTabId && indicator.current) {
        indicator.current.style.transition = 'none';
        indicator.current.style.transform = `translate(${want}px, ${el.offsetTop}px) scale(var(--drag-scale))`;
      }
    };
    const up = () => {
      if (press?.active) {
        suppressClick = true;
        const el = node.querySelector<HTMLElement>(`[data-workbench-tab-id="${press.id}"]`);
        if (el) {
          delete el.dataset.dragging;
          el.style.transition = '';
          el.style.transform = '';
        }
        if (indicator.current) {
          indicator.current.style.transition = '';
          indicator.current.style.transform = `translate(${node.querySelector<HTMLElement>('[aria-selected=true]')?.offsetLeft || 0}px, 0px)`;
        }
      }
      press = null;
      document.documentElement.classList.remove('is-dragging');
    };
    const click = (event: MouseEvent) => {
      if (suppressClick) {
        event.preventDefault();
        event.stopPropagation();
        suppressClick = false;
      }
    };
    node.addEventListener('pointerdown', down);
    node.addEventListener('click', click, true);
    document.addEventListener('pointermove', move);
    document.addEventListener('pointerup', up);
    document.addEventListener('pointercancel', up);
    return () => {
      node.removeEventListener('pointerdown', down);
      node.removeEventListener('click', click, true);
      document.removeEventListener('pointermove', move);
      document.removeEventListener('pointerup', up);
      document.removeEventListener('pointercancel', up);
      for (const stop of moves.values()) stop();
      document.documentElement.classList.remove('is-dragging');
    };
  }, []);
  useLayoutEffect(() => {
    const node = bar.current;
    if (!node) return;
    const wheel = (event: WheelEvent) => {
      const viewport = list.current;
      if (
        !viewport ||
        viewport.scrollWidth <= viewport.clientWidth ||
        event.ctrlKey ||
        event.metaKey
      )
        return;
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      if (!delta) return;
      event.preventDefault();
      const unit =
        event.deltaMode === 2
          ? viewport.clientWidth
          : event.deltaMode === 1
            ? parseFloat(getComputedStyle(viewport).lineHeight) || 1
            : 1;
      viewport.scrollLeft += delta * unit;
    };
    node.addEventListener('wheel', wheel, { passive: false });
    return () => node.removeEventListener('wheel', wheel);
  }, []);
  useLayoutEffect(() => {
    const node = list.current;
    if (!node) return;
    const update = () => setOverflow(node.scrollWidth > node.clientWidth);
    const observer = new ResizeObserver(update);
    observer.observe(node);
    update();
    node
      .querySelector('[aria-selected=true]')
      ?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return () => observer.disconnect();
  }, [p.session, selected]);
  return (
    <div className="wb-tabs" ref={bar}>
      {overflow && (
        <Button
          variant="quiet"
          aria-label="向前浏览"
          onClick={() => list.current?.scrollBy({ left: -list.current.clientWidth })}
        >
          ‹
        </Button>
      )}
      <DndContext
        sensors={sensors}
        onDragStart={(event) =>
          drag.start(
            event,
            list.current?.querySelector(`[data-workbench-tab-id="${event.active.id}"]`) ?? null,
          )
        }
        onDragCancel={drag.end}
        onDragEnd={({ active, over }) => {
          if (over) p.onReorderTab(String(active.id), String(over.id));
          drag.end();
        }}
      >
        <SortableContext
          items={p.session.tabs.map((tab) => tab.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div className="wb-tabs-scroll" role="tablist" aria-label="图片标签页" ref={list}>
            <span
              ref={indicator}
              className="nps-moving-indicator wb-tab-indicator"
              aria-hidden="true"
            />
            <AnimatedItems
              ids={[...p.session.tabs.map((t) => t.id), 'new-tab']}
              attribute="data-workbench-tab-id"
              parentItem
            >
              {p.session.tabs.map((tab) => (
                <Tab key={tab.id} tab={tab} p={visualProps} />
              ))}
              <span>
                <Button
                  data-workbench-tab-id="new-tab"
                  variant="quiet"
                  aria-label="打开图片"
                  onClick={p.onChooseImage}
                >
                  <i className="ri-add-line" />
                </Button>
              </span>
            </AnimatedItems>
          </div>
        </SortableContext>
        {drag.overlay}
      </DndContext>
      {overflow && (
        <Button
          variant="quiet"
          aria-label="向后浏览"
          onClick={() => list.current?.scrollBy({ left: list.current.clientWidth })}
        >
          ›
        </Button>
      )}
    </div>
  );
}
