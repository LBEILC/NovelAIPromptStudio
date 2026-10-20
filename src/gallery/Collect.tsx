// 加入收藏集（doc/design.md 2.13）：一列可以勾选的收藏集，也可以就地新建；多选时对选中的全部生效。
// 从详情栏打开时向下弹，从底部的多选条打开时向上弹。
import { useRef, useState } from 'react';
import { Pop } from '../kit/layer';
import { CheckMark } from '../kit/controls';
import type { LibraryProps } from '../library/types';

export function CollectPop({
  p,
  open,
  onClose,
  ids,
  from,
}: {
  p: LibraryProps;
  open: boolean;
  onClose: () => void;
  ids: string[];
  from: 'detail' | 'dock';
}) {
  const [name, setName] = useState('');
  const busy = useRef(false);
  const manual = p.collections.filter((c) => c.kind === 'manual');
  const run = async (fn: () => Promise<unknown>) => {
    if (busy.current) return;
    busy.current = true;
    try {
      await fn();
    } finally {
      busy.current = false;
    }
  };
  const create = () =>
    run(async () => {
      const n = name.trim();
      if (!n) return;
      const c = await p.onCollectionCreate('manual', n, { select: false });
      if (c && typeof c === 'object') {
        await p.onCollectionProjectsChange(c.id, ids, 'add');
        setName('');
      }
    });
  const anchor =
    from === 'dock' ? '[data-trigger="lcollect-dock"]' : '[data-trigger="lcollect-detail"]';
  return (
    <Pop
      open={open}
      onClose={onClose}
      anchor={anchor}
      trigger={anchor}
      place={from === 'dock' ? 'above-left' : 'below-left'}
      enter={from === 'dock' ? 'pop-up' : 'pop'}
      className="popover lsp lcollect"
      label="加入收藏集"
      deps={[manual.length]}
    >
      <h6>{ids.length > 1 ? `把 ${ids.length} 张加入收藏集` : '加入收藏集'}</h6>
      <div className="lpicklist">
        {manual.map((c) => {
          const k = ids.filter((id) => c.member_ids.includes(id)).length;
          const st = !k ? '' : k === ids.length ? 'on' : 'some';
          return (
            <div
              key={c.id}
              className="pickrow"
              role="checkbox"
              aria-checked={st === 'on' ? true : st === 'some' ? 'mixed' : false}
              tabIndex={0}
              onClick={() =>
                run(() => p.onCollectionProjectsChange(c.id, ids, st === 'on' ? 'remove' : 'add'))
              }
              onKeyDown={(e) => {
                if (e.key !== ' ' && e.key !== 'Enter') return;
                e.preventDefault();
                void run(() =>
                  p.onCollectionProjectsChange(c.id, ids, st === 'on' ? 'remove' : 'add'),
                );
              }}
            >
              <CheckMark state={st} />
              <span className="nm">{c.name}</span>
              <span className="n">{c.image_count ?? 0}</span>
            </div>
          );
        })}
      </div>
      <span className="row lc-new">
        <label className="field sm grow">
          <input
            value={name}
            placeholder="新收藏集名称"
            aria-label="新收藏集名称"
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'Enter') {
                e.preventDefault();
                void create();
              }
            }}
          />
        </label>
        <button className="btn sm" disabled={!name.trim()} onClick={() => void create()}>
          新建并加入
        </button>
      </span>
      <span className="help">
        一张图片可以加入多个收藏集。智能收藏集按规则自动收录，无法手动加入。
      </span>
    </Pop>
  );
}
