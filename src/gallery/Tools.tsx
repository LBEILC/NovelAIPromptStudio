// 图片库的工具栏（doc/design.md 2.13）：搜索、筛选、视图、导入；下面是生效的条件，可以逐条去掉。
// 在智能收藏集里，"筛选"打开的是它的规则；条件行是只读的规则加"编辑规则"。
import { useCallback, useMemo, useRef, useState } from 'react';
import { Pop } from '../kit/layer';
import { MenuItems, MenuPop } from '../kit/menu';
import { CheckMark, Icon, Kbd, Seg, Slider, Switch } from '../kit/controls';
import { FlipScope, useExitList, useSwap } from '../kit/motion';
import { invokeUI } from '../lib/commands';
import { dateRangeLabel } from '../lib/dateRange.js';
import { gallerySmartCollectionDefaultName } from '../lib/galleryCollections.js';
import {
  DEFAULT_GALLERY_FILTERS,
  GALLERY_UNKNOWN_MODEL_VALUE,
  galleryFilterOptions,
} from '../lib/galleryFilters.js';
import { groupModelOptions } from '../library/presentation';
import { libraryTagSuggestions, type LibraryTagOption } from '../library/tagSuggestions';
import { DateRangePop } from './DateRange';
import type { GalleryFilters } from '../shared/types';
import type { LibraryProps } from '../library/types';

const ROW = { min: 120, max: 360, step: 20 };
const SIM = { min: 70, max: 95, step: 5 };
const SORTS = [
  ['recent', '最近导入的在前'],
  ['oldest', '最早导入的在前'],
  ['name', '按名称'],
] as const;
const MERGE = [
  ['separate', '不合并'],
  ['full', '完全相同'],
  ['base', '基础相同'],
  ['similar', '相似'],
] as const;
const MERGE_HELP: Record<string, string> = {
  separate: '每张图片单独显示。',
  full: '提示词完全相同的图片合并为一组。',
  base: '基础提示词的 Tag 足够接近的图片合并为一组，不考虑角色提示词和位置。',
  similar: '提示词相似度达到下方数值的图片合并为一组。',
};
type Chip = {
  key: string;
  label: string;
  value: string;
  mono: boolean;
  tip?: string;
  clear: () => void;
};

export function filterCount(f: GalleryFilters) {
  return (
    f.includeTags.length +
    f.excludeTags.length +
    groupModelOptions(f.models.map((value) => ({ label: value, value }))).length +
    f.vibes.length +
    Number(f.datePreset !== 'all')
  );
}
function chipList(f: GalleryFilters, onChange: (patch: Partial<GalleryFilters>) => void): Chip[] {
  const out: Chip[] = [];
  const inc = f.tagMatch === 'any' && f.includeTags.length > 1 ? '包含任意' : '包含';
  for (const t of f.includeTags)
    out.push({
      key: `inc-${t}`,
      label: inc,
      value: t,
      mono: true,
      clear: () => onChange({ includeTags: f.includeTags.filter((x) => x !== t) }),
    });
  for (const t of f.excludeTags)
    out.push({
      key: `exc-${t}`,
      label: '排除',
      value: t,
      mono: true,
      clear: () => onChange({ excludeTags: f.excludeTags.filter((x) => x !== t) }),
    });
  for (const m of groupModelOptions(
    f.models.map((value) => ({
      label: value === GALLERY_UNKNOWN_MODEL_VALUE ? '未知模型' : value,
      value,
    })),
  ))
    out.push({
      key: `m-${m.label}`,
      label: '模型',
      value: m.label,
      mono: false,
      tip: m.values.length > 1 ? m.values.join('\n') : undefined,
      clear: () => onChange({ models: f.models.filter((v) => !m.values.includes(v)) }),
    });
  for (const v of f.vibes)
    out.push({
      key: `v-${v}`,
      label: 'Vibe',
      value: v === '__no_vibe__' ? '无' : v,
      mono: v !== '__no_vibe__',
      clear: () => onChange({ vibes: f.vibes.filter((x) => x !== v) }),
    });
  if (f.datePreset !== 'all')
    out.push({
      key: 'time',
      label: '时间',
      value: dateRangeLabel(f),
      mono: f.datePreset === 'custom',
      clear: () => onChange({ datePreset: 'all', dateFrom: '', dateTo: '' }),
    });
  return out;
}

export function Tools({
  p,
  rowHeight,
  onRowHeight,
  searchRef,
}: {
  p: LibraryProps;
  rowHeight: number;
  onRowHeight: (h: number) => void;
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
        {!trash && (
          <span className="lsplit">
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
      {trash && (
        <div className="ltrash-h">
          <span className="help">
            回收站中的图片不会自动清理。永久删除只删除图片库中的副本，不影响原文件。
          </span>
          <span className="sp" />
          <button
            className="btn line-danger sm"
            disabled={!(p.trashCount ?? 0)}
            data-tip={(p.trashCount ?? 0) ? undefined : '回收站为空'}
            onClick={p.onEmptyTrash}
          >
            清空回收站
          </button>
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

function ChipRow({
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

/** 包含 / 排除：输入框里放已选的 Tag（可以换行），打字出现补全，↑ ↓ 选、回车添加，空着时退格删掉最后一个。 */
function TagField({
  which,
  values,
  options,
  onChange,
}: {
  which: 'inc' | 'exc';
  values: string[];
  options: LibraryTagOption[];
  onChange: (v: string[]) => void;
}) {
  const [text, setText] = useState('');
  const [pick, setPick] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const hits = libraryTagSuggestions(options, text, values);
  const add = (t: string) => {
    if (options.some((o) => o.value === t) && !values.includes(t)) onChange([...values, t]);
    setText('');
    setPick(0);
    input.current?.focus();
  };
  return (
    <>
      <label className="field sm ltagin" data-tagin={which}>
        {values.map((t) => (
          <span className="mini-tag" key={t}>
            {t}
            <button
              className="chip-x"
              aria-label="移除"
              data-tip="移除"
              onClick={() => onChange(values.filter((x) => x !== t))}
            >
              <Icon name="close-line" />
            </button>
          </span>
        ))}
        <input
          ref={input}
          placeholder={values.length ? '' : '搜索 Tag 或译文'}
          aria-label={which === 'inc' ? '包含的 Tag' : '排除的 Tag'}
          value={text}
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => {
            setText(e.target.value);
            setPick(0);
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault();
              if (hits.length)
                setPick(
                  Math.max(0, Math.min(hits.length - 1, pick + (e.key === 'ArrowDown' ? 1 : -1))),
                );
            } else if (e.key === 'Enter' || (e.key === 'Tab' && hits.length && text)) {
              if (!text.trim()) return;
              e.preventDefault();
              add(hits[pick]?.text || text.trim().toLowerCase());
            } else if (e.key === 'Backspace' && !text && values.length)
              onChange(values.slice(0, -1));
            else if (e.key === 'Escape' && text) {
              e.stopPropagation();
              setText('');
            }
          }}
        />
      </label>
      <Pop
        open={!!text.trim() && hits.length > 0}
        onClose={() => setText('')}
        anchor={`[data-tagin="${which}"]`}
        trigger={`[data-tagin="${which}"]`}
        className="menu complete lsp"
        style={{ minWidth: 'var(--complete-min-w)' }}
        deps={[hits.length]}
      >
        {hits.map((h, i) => (
          <div
            key={h.id}
            className={`mi ${i === pick ? 'on' : ''}`}
            onPointerDown={(e) => e.preventDefault()}
            onPointerEnter={() => setPick(i)}
            onClick={() => add(h.text)}
          >
            <span className="en">{h.text}</span>
            <span className="zh">{h.translation}</span>
          </div>
        ))}
      </Pop>
    </>
  );
}

function FilterPop({
  p,
  open,
  filters,
  onClose,
  onDone,
}: {
  p: LibraryProps;
  open: boolean;
  filters: GalleryFilters;
  onClose: () => void;
  onDone: () => void;
}) {
  const [cal, setCal] = useState(false);
  const options = useMemo(() => galleryFilterOptions(p.filterProjects), [p.filterProjects]);
  const tagOptions = useMemo(
    () => galleryFilterOptions(p.filterCacheSource).tags,
    [p.filterCacheSource],
  );
  const models = groupModelOptions(options.models);
  const editing = p.editingSmartCollection;
  const n = filterCount(filters);
  const hits = p.groups.reduce((k, g) => k + g.members.length, 0);
  const collectionId = p.activeCollection?.id || editing?.id;
  const loadDays = useCallback(
    async (month: string) =>
      (
        await invokeUI('library.import-days', {
          view: p.view === 'trash' ? 'trash' : 'all',
          ...(collectionId ? { collectionId } : {}),
          month,
        })
      ).days,
    [p.view, collectionId],
  );
  const toggle = (key: 'models' | 'vibes', values: string[]) => {
    const all = values.every((v) => filters[key].includes(v));
    p.onFiltersChange({
      [key]: all
        ? filters[key].filter((v) => !values.includes(v))
        : [...new Set([...filters[key], ...values])],
    });
  };
  const state = (key: 'models' | 'vibes', values: string[]) =>
    values.every((v) => filters[key].includes(v))
      ? 'on'
      : values.some((v) => filters[key].includes(v))
        ? 'some'
        : '';
  return (
    <>
      <Pop
        open={open}
        onClose={() => {
          setCal(false);
          onClose();
        }}
        anchor='[data-trigger="lfilter"]'
        trigger='[data-trigger="lfilter"]'
        place="below-right"
        className="popover wide lsp lfilter"
        label="筛选"
        deps={[filters.includeTags.length, filters.excludeTags.length]}
      >
        {editing && (
          <div className="lrule-h">
            <Icon name="folder-settings-line" />
            <b>编辑规则</b>
            <span className="muted">·</span>
            <span className="nm">{editing.name}</span>
          </div>
        )}
        <div className="frow top">
          <span className="label">包含</span>
          <div className="lcolm">
            <TagField
              which="inc"
              values={filters.includeTags}
              options={tagOptions}
              onChange={(includeTags) => p.onFiltersChange({ includeTags })}
            />
            {filters.includeTags.length > 1 && (
              <Seg
                items={[
                  ['all', '全部都有'],
                  ['any', '有任意一个'],
                ]}
                value={filters.tagMatch}
                label="包含方式"
                onChange={(tagMatch) => p.onFiltersChange({ tagMatch })}
              />
            )}
          </div>
        </div>
        <div className="frow top">
          <span className="label">排除</span>
          <div className="lcolm">
            <TagField
              which="exc"
              values={filters.excludeTags}
              options={tagOptions}
              onChange={(excludeTags) => p.onFiltersChange({ excludeTags })}
            />
          </div>
        </div>
        <div className="frow">
          <span className="label">模型</span>
          <span className="lchecks">
            {models.map((m) => (
              <button
                key={m.label}
                className="lcheck"
                role="checkbox"
                aria-checked={
                  state('models', m.values) === 'on'
                    ? true
                    : state('models', m.values) === 'some'
                      ? 'mixed'
                      : false
                }
                data-tip={
                  m.values.length > 1
                    ? m.values
                        .map((v) => options.models.find((x) => x.value === v)?.label || v)
                        .join('\n')
                    : undefined
                }
                onClick={() => toggle('models', m.values)}
              >
                <CheckMark state={state('models', m.values)} />
                <span>{m.label}</span>
              </button>
            ))}
          </span>
        </div>
        {options.vibes.length > 0 && (
          <div className="frow top">
            <span className="label">Vibe</span>
            <span className="lchecks two">
              {options.vibes.map((v) => (
                <button
                  key={v.value}
                  className="lcheck"
                  role="checkbox"
                  aria-checked={filters.vibes.includes(v.value)}
                  onClick={() => toggle('vibes', [v.value])}
                >
                  <CheckMark state={filters.vibes.includes(v.value) ? 'on' : ''} />
                  <span>{v.label}</span>
                </button>
              ))}
            </span>
          </div>
        )}
        <div className="frow">
          <span className="label">时间</span>
          <button
            className={`field sm ldd ${cal ? 'open' : ''}`}
            data-trigger="lcal"
            onClick={() => setCal(!cal)}
          >
            <Icon name="calendar-line" />
            <span className={filters.datePreset === 'custom' ? 'mono' : ''}>
              {dateRangeLabel(filters)}
            </span>
            <Icon name="arrow-down-s-line" />
          </button>
        </div>
        <div className="foot">
          <button
            className="btn quiet sm"
            disabled={!n}
            onClick={() =>
              p.onFiltersChange({ ...DEFAULT_GALLERY_FILTERS, query: editing ? '' : p.query })
            }
          >
            清除
          </button>
          <span className="sp" />
          <span className="help">符合条件：{hits} 张</span>
          {editing ? (
            <>
              <button className="btn sm" onClick={onClose}>
                取消
              </button>
              <button
                className="btn ink sm"
                disabled={!n && !filters.query}
                data-tip={!n && !filters.query ? '至少保留一个条件' : undefined}
                onClick={async () => {
                  if (await p.onCollectionRulesSave()) onDone();
                }}
              >
                保存规则
              </button>
            </>
          ) : (
            <button
              className="btn sm"
              disabled={!n}
              data-tip={n ? undefined : '请先设置筛选条件'}
              onClick={async () => {
                const name = gallerySmartCollectionDefaultName({
                  ...filters,
                  models: groupModelOptions(
                    filters.models.map((value) => ({ value, label: value })),
                  ).map((o) => o.label),
                });
                if (await p.onCollectionCreate('smart', name)) onDone();
              }}
            >
              存为智能收藏集
            </button>
          )}
        </div>
      </Pop>
      <DateRangePop
        open={open && cal}
        onClose={() => setCal(false)}
        anchor='[data-trigger="lcal"]'
        value={filters}
        onChange={p.onFiltersChange}
        loadDays={loadDays}
      />
    </>
  );
}

function ViewPop({
  p,
  open,
  onClose,
  rowHeight,
  onRowHeight,
}: {
  p: LibraryProps;
  open: boolean;
  onClose: () => void;
  rowHeight: number;
  onRowHeight: (h: number) => void;
}) {
  const [sort, setSort] = useState(false);
  const sim = p.grouping.promptScope === 'similar';
  return (
    <>
      <Pop
        open={open}
        onClose={() => {
          setSort(false);
          onClose();
        }}
        anchor='[data-trigger="lview"]'
        trigger='[data-trigger="lview"]'
        place="below-right"
        className="popover wide lsp lview-pop"
        label="视图"
      >
        <div className="frow">
          <span className="label">大小</span>
          <span className="lsize">
            <Slider {...ROW} value={rowHeight} onChange={onRowHeight} label="大小" />
            <span className="lval mono">{rowHeight}</span>
          </span>
        </div>
        <div className="frow">
          <span className="label">排序</span>
          <button
            className={`field sm ldd ${sort ? 'open' : ''}`}
            data-trigger="lsort"
            onClick={() => setSort(!sort)}
          >
            <span>{SORTS.find(([k]) => k === p.sort)?.[1] || SORTS[0][1]}</span>
            <Icon name="arrow-down-s-line" />
          </button>
        </div>
        <div className="frow top">
          <span className="label">合并</span>
          <div className="lcolm">
            <Seg
              items={MERGE}
              value={p.grouping.promptScope as (typeof MERGE)[number][0]}
              label="合并方式"
              onChange={(promptScope) => p.onGroupingChange({ promptScope })}
            />
            <span className="help lmerge-help">{MERGE_HELP[p.grouping.promptScope]}</span>
          </div>
        </div>
        <div className={`frow ${sim ? '' : 'off'}`}>
          <span className="label">相似度</span>
          <span className="lsize" data-tip={sim ? undefined : '合并方式选"相似"时可调整'}>
            <Slider
              {...SIM}
              value={p.grouping.similarityThreshold}
              disabled={!sim}
              label="相似度"
              onChange={(similarityThreshold) => p.onGroupingChange({ similarityThreshold })}
            />
            <span className="lval mono">{p.grouping.similarityThreshold}%</span>
          </span>
        </div>
        <div className="frow">
          <span className="label">Vibe</span>
          <span className="lswrow">
            <Switch
              on={p.grouping.mergeVibes}
              label="Vibe 不同的也合并"
              onChange={(mergeVibes) => p.onGroupingChange({ mergeVibes })}
            />
            <span>不同的也合并</span>
          </span>
        </div>
      </Pop>
      <Pop
        open={open && sort}
        onClose={() => setSort(false)}
        anchor='[data-trigger="lsort"]'
        trigger='[data-trigger="lsort"]'
        className="menu lsp"
        restoreFocus
      >
        <MenuItems
          onClose={() => setSort(false)}
          items={SORTS.map(([k, t]) => ({
            label: t,
            checked: p.sort === k,
            onSelect: () => p.onSortChange(k),
          }))}
        />
      </Pop>
    </>
  );
}
