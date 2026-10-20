import { SurfaceButton } from '../ui';
import { TransitionSurface, useMovingIndicator, useNavigationSelection } from '../ui/transitions';
import { useEffect, useRef, useState } from 'react';
import { Button, ContextMenu, useScrollArea } from '../ui';
import type { Collection } from '../shared/types';
import type { LibraryProps } from './types';
import { AnimatedItems } from '../ui/AnimatedItems';

export function LibrarySidebar({ p }: { p: LibraryProps }) {
  const scroll = useRef<HTMLElement>(null);
  const marker = useRef<HTMLSpanElement>(null);
  const [selected, select] = useNavigationSelection(
    p.view === 'trash'
      ? 'trash'
      : `collection:${p.editingSmartCollection?.id || p.activeCollection?.id || ''}`,
    (next) =>
      next === 'trash'
        ? p.onViewChange('trash')
        : p.onCollectionSelect(next.slice('collection:'.length)),
  );
  useMovingIndicator(scroll, marker, '.library-side-item.on', selected);
  useScrollArea(scroll);
  const [naming, setNaming] = useState<Collection | 'new' | null>(null);
  const [name, setName] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  const canceled = useRef(false);
  useEffect(() => {
    const collection = p.collections.find((item) => item.id === p.renameCollectionId);
    if (collection) {
      setName(collection.name);
      setNaming(collection);
    }
  }, [p.renameCollectionId]);
  useEffect(() => {
    if (naming) {
      canceled.current = false;
      input.current?.focus();
      input.current?.select();
    }
  }, [naming]);
  const commit = async () => {
    if (saving.current || canceled.current || !naming) return;
    if (!name.trim()) {
      setNaming(null);
      return;
    }
    saving.current = true;
    try {
      const result =
        naming === 'new'
          ? await p.onCollectionCreate('manual', name.trim())
          : await p.onCollectionRename(naming, name.trim());
      if (result !== false) {
        // Blur can arrive before React removes the committed input.
        canceled.current = true;
        setNaming(null);
      }
    } finally {
      saving.current = false;
    }
  };
  const editor = (kind: string, id?: string) => (
    <div
      className={`library-side-item library-side-edit ${id === p.activeCollection?.id ? 'on' : ''}`}
      data-collection-id={id}
    >
      <i className={kind === 'smart' ? 'ri-folder-settings-line' : 'ri-folder-line'} />
      <input
        ref={input}
        aria-label="收藏集名称"
        placeholder="收藏集名称"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            canceled.current = true;
            setNaming(null);
          }
          if (e.key === 'Enter') {
            e.preventDefault();
            void commit();
          }
        }}
      />
    </div>
  );
  return (
    <aside className="library-side" aria-label="图片库导航" ref={scroll}>
      <SurfaceButton
        kind="row"
        aria-label="全部图片"
        className={`library-side-item ${selected === 'collection:' ? 'on' : ''}`}
        onClick={() => select('collection:')}
      >
        <i className="ri-image-2-line" />
        全部图片<span>{p.allCount ?? p.filterCacheSource.length}</span>
      </SurfaceButton>
      <div className="library-side-label">
        收藏集
        <Button
          variant="quiet"
          size="small"
          aria-label="新建收藏集"
          onClick={() => {
            setName('');
            setNaming('new');
          }}
        >
          <i className="ri-add-line" />
        </Button>
      </div>
      {(['manual', 'smart'] as const).map((kind) => (
        <div key={kind}>
          {kind === 'smart' && <div className="library-side-label">智能收藏集</div>}
          <AnimatedItems
            attribute="data-collection-id"
            ids={p.collections.filter((c) => c.kind === kind).map((c) => c.id)}
            parentItem
          >
            {p.collections
              .filter((collection) => collection.kind === kind)
              .map((collection) => (
                <ContextMenu
                  key={collection.id}
                  label={collection.name + '管理'}
                  items={[
                    ...(collection.kind === 'smart'
                      ? [
                          {
                            id: 'rules',
                            label: '编辑规则…',
                            onSelect: () => p.onCollectionRulesEdit(collection),
                          },
                        ]
                      : []),
                    {
                      id: 'rename',
                      label: '重命名',
                      onSelect: () => {
                        setName(collection.name);
                        setNaming(collection);
                      },
                    },
                    { id: 'separator', separator: true },
                    {
                      id: 'delete',
                      label: '删除',
                      danger: true,
                      onSelect: () => {
                        void p.onCollectionDelete(collection);
                      },
                    },
                  ]}
                >
                  {naming !== 'new' && naming?.id === collection.id ? (
                    editor(kind, collection.id)
                  ) : (
                    <SurfaceButton
                      kind="row"
                      aria-label={collection.name}
                      data-collection-id={collection.id}
                      className={`library-side-item ${selected === `collection:${collection.id}` ? 'on' : ''}`}
                      onClick={() => select(`collection:${collection.id}`)}
                    >
                      <i
                        className={kind === 'manual' ? 'ri-folder-line' : 'ri-folder-settings-line'}
                      />
                      <TransitionSurface
                        className="library-collection-title"
                        change={collection.name}
                      >
                        {collection.name}
                      </TransitionSurface>
                      <span>{collection.image_count ?? 0}</span>
                    </SurfaceButton>
                  )}
                </ContextMenu>
              ))}
          </AnimatedItems>
          {kind === 'manual' && naming === 'new' && editor('manual')}
        </div>
      ))}
      <SurfaceButton
        kind="row"
        aria-label="回收站"
        className={`library-side-item library-trash ${selected === 'trash' ? 'on' : ''}`}
        onClick={() => select('trash')}
      >
        <i className="ri-delete-bin-line" />
        回收站<span>{p.trashCount ?? 0}</span>
      </SurfaceButton>
      <span
        ref={marker}
        className="nps-moving-indicator library-nav-indicator"
        aria-hidden="true"
      />
    </aside>
  );
}
