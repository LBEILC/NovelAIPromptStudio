// 图片库的侧栏（doc/design.md 2.13）：全部图片、生成记录、收藏集、智能收藏集，回收站在最底下。
// 当前项的底是一块会滑的标记；收藏集右边的 + 就地新建，右键重命名（就地改）或删除。
import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { Icon } from '../kit/controls';
import { ContextMenu, type MenuEntry } from '../kit/menu';
import { FlipScope, useExitList, useIndicator } from '../kit/motion';
import type { Collection } from '../shared/types';
import type { LibraryProps, CountedCollection } from '../library/types';

export const GENERATED = '__generated__';
export const pressKeys = (fn: () => void) => (e: KeyboardEvent) => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  fn();
};

export function Side({ p }: { p: LibraryProps }) {
  const box = useRef<HTMLDivElement>(null);
  const current =
    p.view === 'trash' ? 'trash' : p.editingSmartCollection?.id || p.activeCollection?.id || '';
  const manual = p.collections.filter((c) => c.kind === 'manual');
  const smart = p.collections.filter((c) => c.kind === 'smart');
  const [naming, setNaming] = useState<Collection | 'new' | null>(null);
  const [text, setText] = useState('');
  const [menu, setMenu] = useState<{ at: [number, number]; c: CountedCollection } | null>(null);
  const saving = useRef(false);
  useIndicator(box, [current, naming, p.collections.length]);
  useEffect(() => {
    const c = p.collections.find((x) => x.id === p.renameCollectionId);
    if (c) {
      setText(c.name);
      setNaming(c);
    }
  }, [p.renameCollectionId]);
  const commit = async () => {
    if (saving.current || !naming) return;
    const name = text.trim();
    if (!name || (naming !== 'new' && name === naming.name)) {
      setNaming(null);
      return;
    }
    saving.current = true;
    try {
      const ok =
        naming === 'new'
          ? await p.onCollectionCreate('manual', name)
          : await p.onCollectionRename(naming, name);
      if (ok !== false) setNaming(null);
    } finally {
      saving.current = false;
    }
  };
  const go = (id: string) => (id === 'trash' ? p.onViewChange('trash') : p.onCollectionSelect(id));
  const count = (id: string) =>
    id === 'trash'
      ? (p.trashCount ?? 0)
      : id === ''
        ? (p.allCount ?? p.filterCacheSource.length)
        : id === GENERATED
          ? p.filterCacheSource.filter((x) => x.generated_work_id).length
          : (p.collections.find((c) => c.id === id)?.image_count ?? 0);
  const item = (
    id: string,
    icon: string,
    name: string,
    leaving = false,
    extra?: { onContextMenu?: (e: React.MouseEvent) => void },
  ) => (
    <div
      key={`sv-${id}`}
      data-key={`sv-${id}`}
      data-flip=""
      className={`it ${current === id ? 'on' : ''} ${leaving ? 'leaving' : ''}`}
      role="button"
      tabIndex={0}
      aria-current={current === id ? 'true' : undefined}
      onClick={() => go(id)}
      onKeyDown={pressKeys(() => go(id))}
      onContextMenu={extra?.onContextMenu}
    >
      <Icon name={icon} />
      <span className="nm">{name}</span>
      <span className="n">{count(id)}</span>
    </div>
  );
  const editor = (key: string, on: boolean, icon: string) => (
    <div key={key} data-key={key} data-flip="" className={`it edit ${on ? 'on' : ''}`}>
      <Icon name={icon} />
      <input
        autoFocus
        ref={(n) => {
          if (n && !n.dataset.selected) {
            n.dataset.selected = '1';
            n.select();
          }
        }}
        aria-label="收藏集名称"
        placeholder="收藏集名称"
        value={text}
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if (e.key === 'Enter') {
            e.preventDefault();
            void commit();
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            setNaming(null);
          }
        }}
      />
    </div>
  );
  const rows = (list: CountedCollection[], icon: string) =>
    useExitList(list, (c) => c.id).map(({ item: c, leaving }) =>
      naming !== 'new' && naming?.id === c.id
        ? editor(`sv-${c.id}`, current === c.id, icon)
        : item(c.id, icon, c.name, leaving, {
            onContextMenu: (e) => {
              e.preventDefault();
              setMenu({ at: [e.clientX, e.clientY], c });
            },
          }),
    );
  const manualRows = rows(manual, 'folder-line');
  const smartRows = rows(smart, 'folder-settings-line');
  const menuItems: MenuEntry[] = menu
    ? [
        ...(menu.c.kind === 'smart'
          ? [{ label: '编辑规则…', onSelect: () => p.onCollectionRulesEdit(menu.c) }]
          : []),
        {
          label: '重命名',
          onSelect: () => {
            setText(menu.c.name);
            setNaming(menu.c);
          },
        },
        'sep',
        { label: '删除', danger: true, onSelect: () => void p.onCollectionDelete(menu.c) },
      ]
    : [];
  return (
    <FlipScope root={box}>
      <div className="side has-ind" ref={box} aria-label="图片库导航">
        <i className="ind" />
        {item('', 'image-2-line', '全部图片')}
        {item(GENERATED, 'history-line', '生成记录')}
        <div className="lb label" data-key="lb-col" data-flip="">
          收藏集
          <button
            className="btn quiet sm icon"
            aria-label="新建收藏集"
            onClick={() => {
              setText('');
              setNaming('new');
            }}
          >
            <Icon name="add-line" />
          </button>
        </div>
        {manualRows}
        {naming === 'new' && editor('sv-new', false, 'folder-line')}
        <div className="lb label" data-key="lb-smart" data-flip="">
          智能收藏集
        </div>
        {smartRows}
        <span className="sp" />
        {item('trash', 'delete-bin-line', '回收站')}
        <ContextMenu at={menu?.at || null} onClose={() => setMenu(null)} items={menuItems} />
      </div>
    </FlipScope>
  );
}
