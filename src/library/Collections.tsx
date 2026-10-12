import { useRef, useState } from 'react';
import { Button, Checkbox, Input, Popover } from '../ui';
import type { LibraryProps } from './types';

export function CollectionPicker({ p, ids }: { p: LibraryProps; ids: string[] }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <>
      <Button
        ref={anchor}
        variant="quiet"
        size="small"
        aria-label="加入收藏集"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <i className="ri-folder-add-line" />
        加入收藏集
      </Button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} label="加入收藏集">
        <div className="library-filter-panel">
          {p.collections
            .filter((collection) => collection.kind === 'manual')
            .map((collection) => {
              const checked =
                ids.length > 0 && ids.every((id) => collection.member_ids.includes(id));
              return (
                <div className="library-collection-pick" key={collection.id}>
                  <Checkbox
                    label={collection.name}
                    checked={checked}
                    disabled={busy}
                    onChange={async (value) => {
                      setBusy(true);
                      try {
                        await p.onCollectionProjectsChange(
                          collection.id,
                          ids,
                          value ? 'add' : 'remove',
                        );
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                  <span>{collection.name}</span>
                  <small>{collection.image_count}</small>
                </div>
              );
            })}
          <div className="library-date-range">
            <Input
              aria-label="新收藏集名称"
              placeholder="收藏集名称"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Button
              size="small"
              disabled={busy || !name.trim()}
              onClick={async () => {
                setBusy(true);
                try {
                  const collection = await p.onCollectionCreate('manual', name.trim());
                  if (collection && typeof collection === 'object') {
                    await p.onCollectionProjectsChange(collection.id, ids, 'add');
                    setName('');
                  }
                } finally {
                  setBusy(false);
                }
              }}
            >
              新建并加入
            </Button>
          </div>
          <span className="library-help">
            一张图片可以放进多个收藏集。智能收藏集按规则自动收图，不能手动加入。
          </span>
        </div>
      </Popover>
    </>
  );
}
