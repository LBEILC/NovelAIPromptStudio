import { useState } from 'react';
import { Button, Dialog, Input } from '../ui';
import type { Collection } from '../shared/types';
import type { LibraryProps } from './types';

export function LibrarySidebar({ p }: { p: LibraryProps }) {
  const [naming, setNaming] = useState<Collection | 'new' | null>(null);
  const [name, setName] = useState('');
  const [menu, setMenu] = useState('');
  return (
    <aside className="library-side" aria-label="图片库导航">
      <button
        aria-label="全部图片"
        className={`library-side-item ${p.view === 'all' && !p.activeCollection ? 'on' : ''}`}
        onClick={() => p.onCollectionSelect('')}
      >
        <i className="ri-image-2-line" />
        全部图片<span>{p.allCount ?? p.filterCacheSource.length}</span>
      </button>
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
              <div key={collection.id}>
                <button
                  aria-label={collection.name}
                  data-collection-id={collection.id}
                  className={`library-side-item ${p.activeCollection?.id === collection.id || p.editingSmartCollection?.id === collection.id ? 'on' : ''}`}
                  onClick={() => p.onCollectionSelect(collection.id)}
                  onContextMenu={(event) => {
                    event.preventDefault();
                    setMenu(menu === collection.id ? '' : collection.id);
                  }}
                >
                  <i className={kind === 'manual' ? 'ri-folder-line' : 'ri-folder-settings-line'} />
                  {collection.name}
                  <span>{collection.image_count ?? 0}</span>
                </button>
                {(menu === collection.id || p.activeCollection?.id === collection.id) && (
                  <div className="library-collection-actions">
                    <Button
                      size="small"
                      variant="quiet"
                      onClick={() => {
                        setName(collection.name);
                        setNaming(collection);
                      }}
                    >
                      重命名
                    </Button>
                    <Button
                      size="small"
                      variant="danger"
                      onClick={() => p.onCollectionDelete(collection)}
                    >
                      删除收藏集
                    </Button>
                  </div>
                )}
              </div>
            ))}
        </div>
      ))}
      <button
        aria-label="回收站"
        className={`library-side-item library-trash ${p.view === 'trash' ? 'on' : ''}`}
        onClick={() => p.onViewChange('trash')}
      >
        <i className="ri-delete-bin-line" />
        回收站<span>{p.trashCount ?? 0}</span>
      </button>
      <Dialog
        open={!!naming}
        title={naming === 'new' ? '【文案待定：新建收藏集】' : '重命名'}
        cancelLabel="取消"
        confirmLabel={naming === 'new' ? '【文案待定：新建】' : '重命名'}
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
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Dialog>
    </aside>
  );
}
