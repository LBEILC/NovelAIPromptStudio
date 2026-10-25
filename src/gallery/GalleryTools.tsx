import { useEffect, useRef, useState } from 'react';
import { Icon, Kbd } from '../kit/controls';
import { MenuPop } from '../kit/menu';
import { FlipScope, dur, useExitList, usePresence, useSwap } from '../kit/motion';
import { DEFAULT_GALLERY_FILTERS } from '../lib/galleryFilters.js';
import type { LibraryProps } from '../library/types';
import type { GalleryFilters } from '../shared/types';
import { FilterPop } from './GalleryFilters';
import { ViewPop } from './GalleryView';
import type { GalleryDisplay } from './Grid';
import { Chip, chipList, filterCount } from './toolOptions';

export function Tools({
  p,
  rowHeight,
  onRowHeight,
  display,
  onDisplay,
  searchRef,
}: {
  p: LibraryProps;
  rowHeight: number;
  onRowHeight: (h: number) => void;
  display: GalleryDisplay;
  onDisplay: (patch: Partial<GalleryDisplay>) => void;
  searchRef: React.RefObject<HTMLInputElement | null>;
}) {
  const [pop, setPop] = useState<'' | 'filter' | 'view' | 'import'>('');
  const smart =
    p.activeCollection?.kind === 'smart' && !p.editingSmartCollection ? p.activeCollection : null;
  const filters: GalleryFilters = smart
    ? { ...DEFAULT_GALLERY_FILTERS, ...smart.filters }
    : p.filters;
  const n = filterCount(filters);
  const trash = p.view === 'trash';
  // 进出回收站（用户 10-25：以前说明条和"导入"直接冒出来、直接没）：
  // "导入"淡入淡出；说明条像条件行一样展开收起，收起完才拿掉（不留一个藏着的"清空回收站"）
  const importBtn = usePresence(!trash);
  const [trashOpen, setTrashOpen] = useState(trash);
  const [trashKept, setTrashKept] = useState(trash);
  useEffect(() => {
    if (trash) {
      setTrashKept(true);
      // 先以收起的样子挂上，过两帧再展开，高度才有过渡
      let f = requestAnimationFrame(() => (f = requestAnimationFrame(() => setTrashOpen(true))));
      return () => cancelAnimationFrame(f);
    }
    setTrashOpen(false);
    const t = setTimeout(() => setTrashKept(false), dur(3) + 30);
    return () => clearTimeout(t);
  }, [trash]);
  const filterOpen = pop === 'filter' || !!p.editingSmartCollection;
  const openFilter = () => {
    if (p.editingSmartCollection) {
      p.onCollectionRulesCancel();
      setPop('');
      return;
    }
    if (pop === 'filter') {
      setPop('');
      return;
    }
    if (smart) p.onCollectionRulesEdit(smart);
    setPop('filter');
  };
  const closeFilter = () => {
    setPop((x) => (x === 'filter' ? '' : x));
    if (p.editingSmartCollection) p.onCollectionRulesCancel();
  };
  // 条件行：平时可以逐条去掉；看智能收藏集时是它的规则，只读，最后是"编辑规则"
  const chips = chipList(filters, p.onFiltersChange);
  const chipKey = smart ? smart.id : p.editingSmartCollection ? 'edit' : 'user';
  // 智能收藏集即使没有条件也显示这一行（可以"编辑规则"）；收起时淡出的是收起前的那一行
  const showChips = chips.length > 0 || !!smart;
  const lastChips = useRef({ list: chips, ro: !!smart, key: chipKey });
  if (showChips) lastChips.current = { list: chips, ro: !!smart, key: chipKey };
  const C = showChips ? { list: chips, ro: !!smart, key: chipKey } : lastChips.current;
  const swaps = useSwap(C, (c) => c.key);
  return (
    <>
      <div className="col-h ltools">
        <label className="field grow lsearch gallery-search">
          <Icon name="search-line" />
          <input
            ref={searchRef}
            placeholder="搜索文件名、Tag、译文或段落里的词"
            aria-label="搜索图片库"
            value={p.query}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => p.onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && p.query) {
                e.stopPropagation();
                p.onQueryChange('');
              }
            }}
          />
          {p.query ? (
            <button
              className="btn quiet sm icon lq-x"
              aria-label="清除搜索"
              onClick={() => {
                p.onQueryChange('');
                searchRef.current?.focus();
              }}
            >
              <Icon name="close-line" />
            </button>
          ) : (
            <Kbd keys="Mod K" />
          )}
        </label>
        <button
          className={`btn quiet ${filterOpen || n ? 'on' : ''}`}
          data-trigger="lfilter"
          aria-expanded={filterOpen}
          data-tip={smart ? `编辑"${smart.name}"的规则` : undefined}
          onClick={openFilter}
        >
          <Icon name="filter-3-line" />
          筛选
          {n > 0 && <span className="cnt">{n}</span>}
        </button>
        <button
          className={`btn quiet ${pop === 'view' ? 'on' : ''}`}
          data-trigger="lview"
          aria-expanded={pop === 'view'}
          onClick={() => setPop(pop === 'view' ? '' : 'view')}
        >
          <Icon name="layout-grid-line" />
          视图
        </button>
        {importBtn.mounted && (
          <span className={`lsplit ${importBtn.leaving ? 'leaving' : ''}`} data-enter="fade">
            <button
              className="btn ink"
              disabled={p.importing}
              data-tip={p.importing ? '正在导入' : '选择图片或 ZIP（Ctrl I）'}
              onClick={p.onImport}
            >
              <Icon name="add-line" />
              导入
            </button>
            <button
              className={`btn ink lsplit-more ${pop === 'import' ? 'open' : ''}`}
              data-trigger="limport"
              aria-label="更多导入方式"
              disabled={p.importing}
              onClick={() => setPop(pop === 'import' ? '' : 'import')}
            >
              <Icon name="arrow-down-s-line" />
            </button>
          </span>
        )}
      </div>
      {(trash || trashKept) && (
        <div className={`expand ${trash && trashOpen ? 'open' : ''}`}>
          <div>
            <div className="ltrash-h">
              <span className="help">
                回收站中的图片不会自动清理。永久删除只删除图片库中的副本，不影响原文件。
              </span>
              <span className="sp" />
              <button
                className="btn line-danger sm"
                disabled={!trash || !(p.trashCount ?? 0)}
                data-tip={(p.trashCount ?? 0) ? undefined : '回收站为空'}
                onClick={p.onEmptyTrash}
              >
                清空回收站
              </button>
            </div>
          </div>
        </div>
      )}
      <div className={`expand lchips ${showChips ? 'open' : ''}`}>
        <div>
          <div className="swap">
            {swaps.map(({ key, value, leaving }) => (
              <ChipRow
                key={key}
                list={value.list}
                ro={value.ro}
                leaving={leaving}
                onEdit={() => {
                  if (smart) p.onCollectionRulesEdit(smart);
                  setPop('filter');
                }}
                onClear={() => p.onFiltersChange({ ...DEFAULT_GALLERY_FILTERS, query: p.query })}
              />
            ))}
          </div>
        </div>
      </div>
      <FilterPop
        p={p}
        open={filterOpen}
        filters={filters}
        onClose={closeFilter}
        onDone={() => setPop('')}
      />
      <ViewPop
        p={p}
        open={pop === 'view'}
        onClose={() => setPop('')}
        rowHeight={rowHeight}
        onRowHeight={onRowHeight}
        display={display}
        onDisplay={onDisplay}
      />
      <MenuPop
        open={pop === 'import'}
        onClose={() => setPop('')}
        anchor='[data-trigger="limport"]'
        place="below-right"
        className="lsp limport"
        items={[
          {
            label: '选择图片或 ZIP…',
            icon: 'image-add-line',
            hint: 'Ctrl I',
            onSelect: p.onImport,
          },
          {
            label: '从剪贴板导入',
            icon: 'clipboard-line',
            hint: 'Ctrl V',
            onSelect: p.onImportClipboard,
          },
        ]}
      />
    </>
  );
}

export function ChipRow({
  list,
  ro,
  leaving,
  onEdit,
  onClear,
}: {
  list: Chip[];
  ro: boolean;
  leaving: boolean;
  onEdit: () => void;
  onClear: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const items = useExitList(list, (c) => c.key);
  return (
    <FlipScope root={box}>
      <div className={`chips ${leaving ? 'leaving' : ''}`} ref={box} data-enter="fade">
        {items.map(({ item: c, leaving: gone }) => (
          <span
            key={c.key}
            data-key={`chip-${c.key}`}
            data-flip=""
            className={`chip ${ro ? 'ro' : ''} ${gone ? 'leaving' : ''}`}
            data-enter="fade"
            data-tip={c.tip}
          >
            {c.label}
            <b className={c.mono ? 'mono' : ''}>{c.value}</b>
            {!ro && (
              <button
                className="chip-x"
                aria-label="移除此条件"
                data-tip="移除此条件"
                onClick={c.clear}
              >
                <Icon name="close-line" />
              </button>
            )}
          </span>
        ))}
        {ro ? (
          <button className="btn quiet sm" data-key="chip-rules" data-flip="" onClick={onEdit}>
            <Icon name="edit-line" />
            编辑规则
          </button>
        ) : (
          <button className="btn quiet sm" data-key="chip-clear" data-flip="" onClick={onClear}>
            清除
          </button>
        )}
      </div>
    </FlipScope>
  );
}
