import { SurfaceButton } from '../ui';
import { useRef, useState } from 'react';
import { Button, Dialog, Input, ContextMenu, useScrollArea } from '../ui';
import type { Collection } from '../shared/types';
import type { LibraryProps } from './types';

export function LibrarySidebar({ p }: { p: LibraryProps }) {
  const scroll = useRef<HTMLElement>(null);
  useScrollArea(scroll);
  const [naming, setNaming] = useState<Collection | 'new' | null>(null);
  const [name, setName] = useState('');
  return (
    <aside className="library-side" aria-label="图片库导航" ref={scroll}>
      <SurfaceButton
        kind="row"
        aria-label="全部图片"
        className={`library-side-item ${p.view === 'all' && !p.activeCollection ? 'on' : ''}`}
        onClick={() => p.onCollectionSelect('')}
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
          {p.collections
            .filter((collection) => collection.kind === kind)
            .map((collection) => (
              <ContextMenu
                key={collection.id}
                label={collection.name + '管理'}
                items={[
                  {
                    id: 'rename',
                    label: '重命名',
                    onSelect: () => {
                      setName(collection.name);
                      setNaming(collection);
                    },
                  },
                  {
                    id: 'delete',
                    label: '删除收藏集',
                    danger: true,
                    onSelect: () => {
                      void p.onCollectionDelete(collection);
                    },
                  },
                ]}
              >
                <SurfaceButton
                  kind="row"
                  aria-label={collection.name}
                  data-collection-id={collection.id}
                  className={`library-side-item ${p.activeCollection?.id === collection.id || p.editingSmartCollection?.id === collection.id ? 'on' : ''}`}
                  onClick={() => p.onCollectionSelect(collection.id)}
                >
                  <i className={kind === 'manual' ? 'ri-folder-line' : 'ri-folder-settings-line'} />
                  {collection.name}
                  <span>{collection.image_count ?? 0}</span>
                </SurfaceButton>
              </ContextMenu>
            ))}
        </div>
      ))}
      <SurfaceButton
        kind="row"
        aria-label="回收站"
        className={`library-side-item library-trash ${p.view === 'trash' ? 'on' : ''}`}
        onClick={() => p.onViewChange('trash')}
      >
        <i className="ri-delete-bin-line" />
        回收站<span>{p.trashCount ?? 0}</span>
      </SurfaceButton>
      <Dialog
        open={!!naming}
        title={naming === 'new' ? '新建收藏集' : '重命名'}
        cancelLabel="取消"
        confirmLabel={naming === 'new' ? '新建' : '重命名'}
        onCancel={() => setNaming(null)}
        onConfirm={async () => {
          if (!name.trim() || !naming) return;
          if (naming === 'new') await p.onCollectionCreate('manual', name.trim());
          else await p.onCollectionRename(naming, name.trim());
          setNaming(null);
        }}
      >
        <Input
          aria-label="收藏集名称"
          placeholder="收藏集名称"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Dialog>
    </aside>
  );
}
