import { useMemo, useRef, useState } from 'react';
import { Button, Input, OptionGroup, Popover, Select, Slider, Switch, Dialog } from '../ui';
import {
  DEFAULT_GALLERY_FILTERS,
  GALLERY_DATE_PRESETS,
  galleryFilterOptions,
} from '../lib/galleryFilters.js';
import type { GalleryFilters } from '../shared/types';
import type { LibraryProps } from './types';

export function FilterChips({
  filters,
  onChange,
}: {
  filters: GalleryFilters;
  onChange: (patch: Partial<GalleryFilters>) => void;
}) {
  const chips: { id: string; label: string; value: string; clear: () => void }[] = [];
  for (const [key, label] of [
    ['includeTags', '包含'],
    ['excludeTags', '排除'],
    ['models', '模型'],
    ['vibes', 'Vibe'],
  ] as const) {
    filters[key].forEach((value) =>
      chips.push({
        id: key + value,
        label,
        value,
        clear: () => onChange({ [key]: filters[key].filter((item) => item !== value) }),
      }),
    );
  }
  if (filters.datePreset !== 'all')
    chips.push({
      id: 'date',
      label: '时间',
      value:
        filters.datePreset === 'custom'
          ? `${filters.dateFrom} 至 ${filters.dateTo}`
          : GALLERY_DATE_PRESETS.find((item) => item.value === filters.datePreset)?.label || '',
      clear: () => onChange({ datePreset: 'all', dateFrom: '', dateTo: '' }),
    });
  if (!chips.length && !filters.query) return null;
  return (
    <div className="library-chips">
      {chips.map((chip) => (
        <button
          className="library-chip"
          key={chip.id}
          onClick={chip.clear}
          aria-label={`移除${chip.label} ${chip.value}`}
        >
          {chip.label}
          <b>{chip.value}</b>
          <i className="ri-close-line" />
        </button>
      ))}
      <Button variant="quiet" size="small" onClick={() => onChange(DEFAULT_GALLERY_FILTERS)}>
        清除
      </Button>
    </div>
  );
}

function TagFilter({
  label,
  values,
  options,
  onChange,
}: {
  label: string;
  values: string[];
  options: { label: string; value: string }[];
  onChange: (values: string[]) => void;
}) {
  const [text, setText] = useState('');
  const add = (value: string) => {
    if (value.trim() && !values.includes(value.trim())) onChange([...values, value.trim()]);
    setText('');
  };
  return (
    <div className="library-filter-row">
      <span>{label}</span>
      <div className="library-filter-tags">
        {values.map((value) => (
          <button
            key={value}
            className="library-chip"
            onClick={() => onChange(values.filter((item) => item !== value))}
          >
            {value}
            <i className="ri-close-line" />
          </button>
        ))}
        <Input
          aria-label={`${label} Tag`}
          placeholder="输入 Tag 或译名"
          value={text}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.nativeEvent.isComposing) {
              event.preventDefault();
              add(text);
            }
          }}
        />
        {text && (
          <div className="library-suggestions">
            {options
              .filter(
                (item) =>
                  item.label.toLowerCase().includes(text.toLowerCase()) &&
                  !values.includes(item.value),
              )
              .slice(0, 8)
              .map((item) => (
                <button key={item.value} onClick={() => add(item.value)}>
                  {item.label}
                </button>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function LibraryToolbar({
  p,
  rowHeight,
  onRowHeight,
}: {
  p: LibraryProps;
  rowHeight: number;
  onRowHeight: (height: number) => void;
}) {
  const [open, setOpen] = useState('');
  const [name, setName] = useState('');
  const [naming, setNaming] = useState(false);
  const filterAnchor = useRef<HTMLButtonElement>(null);
  const viewAnchor = useRef<HTMLButtonElement>(null);
  const importAnchor = useRef<HTMLButtonElement>(null);
  const options = useMemo(() => galleryFilterOptions(p.filterProjects), [p.filterProjects]);
  const filters = p.filters;
  const count =
    filters.includeTags.length +
    filters.excludeTags.length +
    filters.models.length +
    filters.vibes.length +
    Number(filters.datePreset !== 'all');
  return (
    <>
      <div className="library-tools">
        <div className="gallery-search library-search">
          <Input
            aria-label="搜索图片库"
            placeholder="搜索文件名、Tag、译名或段落里的词"
            prefix={<i className="ri-search-line" />}
            value={filters.query}
            onChange={(event) => p.onQueryChange(event.target.value)}
            suffix={<kbd>{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'} K</kbd>}
          />
        </div>
        <Button
          ref={filterAnchor}
          aria-label="筛选"
          variant="quiet"
          className={count || open === 'filter' ? 'active' : ''}
          onClick={() => setOpen(open === 'filter' ? '' : 'filter')}
        >
          <i className="ri-filter-3-line" />
          <span>筛选</span>
          {count > 0 && <span className="library-condition-count">{count}</span>}
        </Button>
        <Button
          ref={viewAnchor}
          variant="quiet"
          onClick={() => setOpen(open === 'view' ? '' : 'view')}
        >
          <i className="ri-layout-grid-line" />
          <span>视图</span>
        </Button>
        {p.view !== 'trash' && (
          <div className="library-import-buttons">
            <Button variant="ink" onClick={p.onImport} disabled={p.importing}>
              <i className="ri-add-line" />
              导入
            </Button>
            <Button
              ref={importAnchor}
              variant="ink"
              aria-label="其他导入方式"
              onClick={() => setOpen(open === 'import' ? '' : 'import')}
            >
              <i className="ri-arrow-down-s-line" />
            </Button>
          </div>
        )}
        {p.view === 'trash' && (
          // TODO(design): Keep the existing toolbar action until its new placement is specified.
          <Button variant="danger" onClick={p.onEmptyTrash}>
            清空回收站
          </Button>
        )}
      </div>
      <FilterChips filters={filters} onChange={p.onFiltersChange} />
      {p.view === 'trash' && (
        <div className="library-chips library-help">
          回收站里的图片不会自动清理。永久删除只删除图片库里保存的副本。
        </div>
      )}
      {p.activeCollection && (
        <div className="library-chips">
          <span>{p.activeCollection.kind === 'smart' ? '规则' : p.activeCollection.name}</span>
          {p.activeCollection.kind === 'smart' && (
            <Button
              size="small"
              variant="quiet"
              onClick={() => {
                p.onCollectionRulesEdit(p.activeCollection!);
                setOpen('filter');
              }}
            >
              编辑规则
            </Button>
          )}
        </div>
      )}
      <Popover
        open={open === 'filter' || !!p.editingSmartCollection}
        anchor={filterAnchor}
        label="筛选"
        onClose={() => {
          setOpen('');
          if (p.editingSmartCollection) p.onCollectionRulesCancel();
        }}
      >
        <div className="library-filter-panel">
          <TagFilter
            label="包含"
            values={filters.includeTags}
            options={options.tags}
            onChange={(includeTags) => p.onFiltersChange({ includeTags })}
          />
          <OptionGroup
            label="包含方式"
            options={[
              { value: 'all', label: '全部都有' },
              { value: 'any', label: '有任意一个' },
            ]}
            value={filters.tagMatch}
            onChange={(tagMatch) => p.onFiltersChange({ tagMatch: tagMatch as 'all' | 'any' })}
          />
          <TagFilter
            label="排除"
            values={filters.excludeTags}
            options={options.tags}
            onChange={(excludeTags) => p.onFiltersChange({ excludeTags })}
          />
          {(['models', 'vibes'] as const).map((key) => (
            <div className="library-filter-row" key={key}>
              <span>{key === 'models' ? '模型' : 'Vibe'}</span>
              <div className="library-filter-options">
                {options[key].map((option) => (
                  <label key={option.value}>
                    <input
                      type="checkbox"
                      checked={filters[key].includes(option.value)}
                      onChange={(event) =>
                        p.onFiltersChange({
                          [key]: event.target.checked
                            ? [...filters[key], option.value]
                            : filters[key].filter((v) => v !== option.value),
                        })
                      }
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>
          ))}
          <div className="library-filter-row">
            <span>时间</span>
            <Select
              label="导入时间"
              value={filters.datePreset}
              options={GALLERY_DATE_PRESETS}
              onChange={(datePreset) =>
                p.onFiltersChange({ datePreset: datePreset as GalleryFilters['datePreset'] })
              }
            />
          </div>
          {filters.datePreset === 'custom' && (
            <div className="library-date-range">
              <Input
                type="date"
                aria-label="开始日期"
                value={filters.dateFrom}
                onChange={(event) => p.onFiltersChange({ dateFrom: event.target.value })}
              />
              <span>至</span>
              <Input
                type="date"
                aria-label="结束日期"
                value={filters.dateTo}
                onChange={(event) => p.onFiltersChange({ dateTo: event.target.value })}
              />
            </div>
          )}
          <div className="library-popover-foot">
            <Button
              variant="quiet"
              size="small"
              onClick={() => p.onFiltersChange(DEFAULT_GALLERY_FILTERS)}
            >
              清除
            </Button>
            {p.editingSmartCollection ? (
              <Button
                size="small"
                onClick={async () => {
                  await p.onCollectionRulesSave();
                  setOpen('');
                }}
              >
                {/* TODO(design): Specify the edited smart-collection rule confirmation label. */}
                【文案待定：保存规则】
              </Button>
            ) : (
              <Button
                size="small"
                disabled={!count && !filters.query}
                onClick={() => {
                  setNaming(true);
                  setOpen('');
                }}
              >
                存为智能收藏集
              </Button>
            )}
          </div>
        </div>
      </Popover>
      <Popover open={open === 'view'} anchor={viewAnchor} label="视图" onClose={() => setOpen('')}>
        <div className="library-filter-panel">
          <div className="library-filter-row">
            <span>大小</span>
            <Slider
              label="图片行高"
              min={120}
              max={360}
              step={20}
              value={rowHeight}
              onChange={onRowHeight}
            />
          </div>
          <div className="library-filter-row">
            <span>排序</span>
            <Select
              label="图片排序"
              value={p.sort}
              onChange={p.onSortChange}
              options={[
                { value: 'recent', label: '最近导入的在前' },
                { value: 'oldest', label: '【文案待定：最早导入的在前】' },
                { value: 'name', label: '【文案待定：按名称排序】' },
              ]}
            />
          </div>
          <div className="library-filter-row">
            <span>合并</span>
            <OptionGroup
              label="合并方式"
              value={p.grouping.promptScope}
              onChange={(promptScope) => p.onGroupingChange({ promptScope })}
              options={[
                { value: 'separate', label: '不合并' },
                { value: 'full', label: 'Prompt 完全相同' },
                { value: 'base', label: '基础 Prompt 相同' },
                { value: 'similar', label: 'Prompt 相似' },
              ]}
            />
          </div>
          {p.grouping.promptScope === 'similar' && (
            <>
              <p className="library-help">
                基础 Prompt 的 Tag 足够接近的图片叠成一摞，不看角色 Prompt 和位置。
              </p>
              <div className="library-filter-row">
                <span>相似度</span>
                <Slider
                  label="相似度"
                  value={p.grouping.similarityThreshold}
                  min={70}
                  max={95}
                  step={1}
                  format={(value) => `${value}%`}
                  onChange={(similarityThreshold) => p.onGroupingChange({ similarityThreshold })}
                />
              </div>
            </>
          )}
          <div className="library-view-vibe">
            <span>Vibe 不同的也合并</span>
            <Switch
              label="Vibe 不同的也合并"
              checked={p.grouping.mergeVibes}
              onChange={(mergeVibes) => p.onGroupingChange({ mergeVibes })}
            />
          </div>
        </div>
      </Popover>
      <Popover
        open={open === 'import'}
        anchor={importAnchor}
        label="其他导入方式"
        onClose={() => setOpen('')}
      >
        <Button
          variant="quiet"
          onClick={() => {
            setOpen('');
            p.onImportClipboard();
          }}
        >
          从剪贴板导入
        </Button>
      </Popover>
      <Dialog
        open={naming}
        title="存为智能收藏集"
        cancelLabel="取消"
        confirmLabel="存为智能收藏集"
        onCancel={() => setNaming(false)}
        onConfirm={async () => {
          if (name.trim()) {
            await p.onCollectionCreate('smart', name.trim());
            setNaming(false);
            setName('');
          }
        }}
      >
        <Input
          aria-label="智能收藏集名称"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Dialog>
    </>
  );
}
