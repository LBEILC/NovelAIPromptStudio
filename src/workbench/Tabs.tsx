import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import {
  DndContext,
  closestCenter,
  pointerWithin,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import {
  SortableContext,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Button, ContextMenu, type MenuItem } from '../ui';
import type { WorkbenchSession, WorkbenchTab } from '../state/workbench';
import { hasImageName } from '../lib/imageNaming.js';
import { mediaUrl } from '../lib/imageStage.js';
import { workbenchTabHasChanges } from '../lib/workbenchSession.js';
import './workbench.css';
import { useDragFeedback, restrictDrag } from './DragFeedback';

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
        className="wb-tab workbench-tab"
        data-workbench-tab-id={tab.id}
        data-active={tab.id === p.session.activeTabId || undefined}
        data-dragging={sortable.isDragging || undefined}
        role="tab"
        aria-selected={tab.id === p.session.activeTabId}
        aria-label={name || '没有起名'}
        data-tip={name || '没有起名'}
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
            transform: sortable.isDragging ? undefined : CSS.Translate.toString(sortable.transform),
            '--wb-thumb-ratio': (image?.metadata.width || 1) / (image?.metadata.height || 1),
          } as CSSProperties
        }
      >
        {tab.id === p.session.activeTabId && <span className="wb-current" />}
        <img
          draggable={false}
          alt=""
          src={mediaUrl(image?.thumbnail_path || image?.image_path || '')}
        />
        {name && <span className="wb-tab-name">{name}</span>}
        {workbenchTabHasChanges(tab) && <span className="wb-dirty" aria-label="提示词已修改" />}
        <Button
          variant="quiet"
          size="small"
          className="wb-tab-close"
          aria-label={`关闭 ${name || '标签'}`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation();
            void p.onCloseTab(tab.id);
          }}
        >
          <i className="ri-close-line" />
        </Button>
      </div>
    </ContextMenu>
  );
}
export function WorkbenchTabs(p: TabsProps) {
  const list = useRef<HTMLDivElement>(null);
  const bar = useRef<HTMLDivElement>(null);
  const drag = useDragFeedback(list, true);
  const [overflow, setOverflow] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
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
  }, [p.session]);
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
        modifiers={[(args) => restrictDrag(args, list.current, true)]}
        collisionDetection={(args) =>
          args.pointerCoordinates ? pointerWithin(args) : closestCenter(args)
        }
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
            {p.session.tabs.map((tab) => (
              <Tab key={tab.id} tab={tab} p={p} />
            ))}
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
      <Button variant="quiet" aria-label="打开图片" onClick={p.onChooseImage}>
        <i className="ri-add-line" />
      </Button>
    </div>
  );
}
