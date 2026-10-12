import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import {
  DndContext,
  closestCenter,
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
      label: '关闭其他标签',
      onSelect: () => void closeMany(p.session.tabs.filter((item) => item.id !== tab.id)),
    },
    {
      id: 'right',
      label: '关闭右边的标签',
      disabled: index === p.session.tabs.length - 1,
      onSelect: () => void closeMany(p.session.tabs.slice(index + 1)),
    },
  ];
  if (tab.source.type === 'library')
    items.push({ id: 'library', label: '在图片库里显示', onSelect: () => p.onShowLibrary(tab) });
  return (
    <ContextMenu label={name || '没有起名'} items={items}>
      <button
        ref={sortable.setNodeRef}
        {...sortable.attributes}
        {...sortable.listeners}
        className="wb-tab"
        role="tab"
        aria-selected={tab.id === p.session.activeTabId}
        aria-label={name || '没有起名'}
        title={`${name || '没有起名'} · ${image?.created_at || tab.updatedAt}`}
        onClick={() => p.onActivateTab(tab.id)}
        style={
          {
            transform: CSS.Transform.toString(sortable.transform),
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
        {workbenchTabHasChanges(tab) && <span className="wb-dirty" aria-label="Prompt 已修改" />}
      </button>
    </ContextMenu>
  );
}
export function WorkbenchTabs(p: TabsProps) {
  const list = useRef<HTMLDivElement>(null);
  const [overflow, setOverflow] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
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
    <div className="wb-tabs">
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
        collisionDetection={closestCenter}
        onDragEnd={({ active, over }) => {
          if (over) p.onReorderTab(String(active.id), String(over.id));
        }}
      >
        <SortableContext
          items={p.session.tabs.map((tab) => tab.id)}
          strategy={horizontalListSortingStrategy}
        >
          <div className="wb-tabs-scroll" role="tablist" aria-label="图片标签" ref={list}>
            {p.session.tabs.map((tab) => (
              <Tab key={tab.id} tab={tab} p={p} />
            ))}
          </div>
        </SortableContext>
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
