import { useRef, useState } from 'react';
import { Button, Checkbox, Input, Popover } from '../ui';
import { AnimatedItems } from '../ui/AnimatedItems';
import type { LibraryProps } from './types';

export function CollectionPicker({ p, ids }: { p: LibraryProps; ids: string[] }) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const manual = p.collections.filter((collection) => collection.kind === 'manual');
  const update = async (id: string, value: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      await p.onCollectionProjectsChange(id, ids, value ? 'add' : 'remove');
    } finally {
      setBusy(false);
    }
  };
  const create = async () => {
    if (busy || !name.trim()) return;
    setBusy(true);
    try {
      const collection = await p.onCollectionCreate('manual', name.trim(), { select: false });
      if (collection && typeof collection === 'object') {
        await p.onCollectionProjectsChange(collection.id, ids, 'add');
        setName('');
      }
    } finally {
      setBusy(false);
    }
  };
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
          <b>{ids.length > 1 ? `把 ${ids.length} 张加入收藏集` : '加入收藏集'}</b>
          <AnimatedItems
            ids={manual.map((collection) => collection.id)}
            attribute="data-collection-id"
          >
            {manual.map((collection) => {
              const count = ids.filter((id) => collection.member_ids.includes(id)).length;
              const checked = ids.length > 0 && count === ids.length;
              return (
                <div
                  className="library-collection-pick"
                  key={collection.id}
                  data-collection-id={collection.id}
                  onClick={(event) => {
                    if (!(event.target as HTMLElement).closest('button'))
                      void update(collection.id, !checked);
                  }}
                >
                  <Checkbox
                    label={collection.name}
                    checked={checked}
                    mixed={count > 0 && !checked}
                    disabled={busy}
                    onChange={(value) => void update(collection.id, value)}
                  />
                  <span>{collection.name}</span>
                  <small>{collection.image_count}</small>
                </div>
              );
            })}
          </AnimatedItems>
          <div className="library-date-range">
            <Input
              aria-label="新收藏集名称"
              placeholder="新收藏集名称"
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  void create();
                }
              }}
            />
            <Button size="small" disabled={busy || !name.trim()} onClick={() => void create()}>
              新建并加入
            </Button>
          </div>
          <span className="library-help">
            一张图片可以加入多个收藏集。智能收藏集按规则自动收录，无法手动加入。
          </span>
        </div>
      </Popover>
    </>
  );
}
