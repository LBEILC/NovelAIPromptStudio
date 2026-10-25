import { useCallback, useMemo, useRef, useState } from 'react';
import { CheckMark, Icon, Seg } from '../kit/controls';
import { Pop } from '../kit/layer';
import { invokeUI } from '../lib/commands';
import { dateRangeLabel } from '../lib/dateRange.js';
import { gallerySmartCollectionDefaultName } from '../lib/galleryCollections.js';
import { DEFAULT_GALLERY_FILTERS, galleryFilterOptions } from '../lib/galleryFilters.js';
import { groupModelOptions } from '../library/presentation';
import { libraryTagSuggestions, type LibraryTagOption } from '../library/tagSuggestions';
import type { LibraryProps } from '../library/types';
import type { GalleryFilters } from '../shared/types';
import { DateRangePop } from './DateRange';
import { filterCount } from './toolOptions';

/** 包含 / 排除：输入框里放已选的 Tag（可以换行），打字出现补全，↑ ↓ 选、回车添加，空着时退格删掉最后一个。 */
export function TagField({
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

export function FilterPop({
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
