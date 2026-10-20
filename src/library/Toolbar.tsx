import { Layer as LibraryLayer, Popover as LibraryPopover } from '../ui';
import { Collapse } from '../ui/transitions';
import { SurfaceButton } from '../ui';
import { useCallback, useMemo, useRef, useState } from 'react';
import { DateRange } from '../ui/DateRange';
import { invokeUI } from '../lib/commands';
import { dateRangeLabel } from '../lib/dateRange.js';
import { gallerySmartCollectionDefaultName } from '../lib/galleryCollections.js';
import {
  Shortcut,
  Button,
  Input,
  OptionGroup,
  Select,
  Slider,
  Switch,
  MenuItems,
  Autocomplete,
} from '../ui';
import {
  DEFAULT_GALLERY_FILTERS,
  GALLERY_UNKNOWN_MODEL_VALUE,
  galleryFilterOptions,
} from '../lib/galleryFilters.js';
import type { GalleryFilters } from '../shared/types';
import type { LibraryProps } from './types';
import { groupModelOptions } from './presentation';
import { libraryTagSuggestions, type LibraryTagOption } from './tagSuggestions';

export function FilterChips({
  filters,
  onChange,
  readOnly = false,
  onEdit,
}: {
  filters: GalleryFilters;
  onChange: (patch: Partial<GalleryFilters>) => void;
  readOnly?: boolean;
  onEdit?: () => void;
}) {
  const chips: { id: string; label: string; value: string; title?: string; clear: () => void }[] =
    [];
  for (const [key, label] of [
    ['includeTags', '包含'],
    ['excludeTags', '排除'],
    ['vibes', 'Vibe'],
  ] as const) {
    filters[key].forEach((value) =>
      chips.push({
        id: key + value,
        label:
          key === 'includeTags' && filters.tagMatch === 'any' && filters.includeTags.length > 1
            ? '包含任意'
            : label,
        value,
        clear: () => onChange({ [key]: filters[key].filter((item) => item !== value) }),
      }),
    );
  }
  for (const model of groupModelOptions(
    filters.models.map((value) => ({
      label: value === GALLERY_UNKNOWN_MODEL_VALUE ? '未知模型' : value,
      value,
    })),
  )) {
    chips.push({
      id: 'model' + model.label,
      label: '模型',
      value: model.label,
      title: model.values.join('\n'),
      clear: () =>
        onChange({ models: filters.models.filter((value) => !model.values.includes(value)) }),
    });
  }
  if (filters.datePreset !== 'all')
    chips.push({
      id: 'date',
      label: '时间',
      value: dateRangeLabel(filters),
      clear: () => onChange({ datePreset: 'all', dateFrom: '', dateTo: '' }),
    });

  if (readOnly && filters.query)
    chips.unshift({ id: 'query', label: '搜索', value: filters.query, clear: () => {} });
  return (
    <Collapse open={!!chips.length || readOnly} className="library-filter-collapse">
      <div className="library-chips">
        {chips.map((chip) =>
          readOnly ? (
            <span className="library-chip" key={chip.id} data-tip={chip.title}>
              {chip.label}
              <b>{chip.value}</b>
            </span>
          ) : (
            <SurfaceButton
              kind="chip"
              className="library-chip"
              key={chip.id}
              data-tip={chip.title}
              onClick={chip.clear}
              aria-label={`移除${chip.label} ${chip.value}`}
            >
              {chip.label}
              <b>{chip.value}</b>
              <i className="ri-close-line" />
            </SurfaceButton>
          ),
        )}
        <Button
          variant="quiet"
          size="small"
          onClick={() =>
            readOnly ? onEdit?.() : onChange({ ...DEFAULT_GALLERY_FILTERS, query: filters.query })
          }
        >
          {readOnly ? '编辑规则' : '清除'}
        </Button>
      </div>
    </Collapse>
  );
}

function TagFilter({
  label,
  values,
  options,
  onChange,
  children,
}: {
  children?: React.ReactNode;
  label: string;
  values: string[];
  options: LibraryTagOption[];
  onChange: (values: string[]) => void;
}) {
  const [text, setText] = useState('');
  const add = (value: string) => {
    if (options.some((option) => option.value === value) && !values.includes(value))
      onChange([...values, value]);
    setText('');
  };
  return (
    <div className="library-filter-row library-filter-tag-row">
      <span>{label}</span>
      <div className="library-filter-column">
        <div className="library-filter-tags">
          {values.map((value) => (
            <SurfaceButton
              kind="chip"
              key={value}
              className="library-chip"
              aria-label={`移除${label} ${value}`}
              onClick={() => onChange(values.filter((item) => item !== value))}
            >
              {value}
              <i className="ri-close-line" />
            </SurfaceButton>
          ))}
          <Autocomplete
            label={`${label} Tag`}
            placeholder="搜索 Tag 或译文"
            value={text}
            onChange={setText}
            items={libraryTagSuggestions(options, text, values)}
            onSelect={(item) => add(item.text)}
            selectOnTab
            onEmptyBackspace={() => onChange(values.slice(0, -1))}
            emptyMessage={text.trim() ? '图片库里没有带这个 Tag 的图片' : undefined}
          />
        </div>
        {children}
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
  const collectionId = p.activeCollection?.id || p.editingSmartCollection?.id;
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
  const filterAnchor = useRef<HTMLButtonElement>(null);
  const viewAnchor = useRef<HTMLButtonElement>(null);
  const importAnchor = useRef<HTMLButtonElement>(null);
  const options = useMemo(() => galleryFilterOptions(p.filterProjects), [p.filterProjects]);
  const tagOptions = useMemo(
    () => galleryFilterOptions(p.filterCacheSource).tags,
    [p.filterCacheSource],
  );
  const smart = p.activeCollection?.kind === 'smart' && !p.editingSmartCollection;
  const filters = smart
    ? { ...DEFAULT_GALLERY_FILTERS, ...p.activeCollection!.filters }
    : p.filters;
  const groupedModels = groupModelOptions(options.models);
  const count =
    filters.includeTags.length +
    filters.excludeTags.length +
    groupModelOptions(filters.models.map((value) => ({ label: value, value }))).length +
    filters.vibes.length +
    Number(filters.datePreset !== 'all') +
    Number(!!smart && !!filters.query);
  return (
    <>
      <div className="library-tools">
        <div className="gallery-search library-search">
          <Input
            aria-label="搜索图片库"
            placeholder="搜索文件名、Tag、译文或段落里的词"
            prefix={<i className="ri-search-line" />}
            value={p.query}
            onChange={(event) => p.onQueryChange(event.target.value)}
            suffix={
              p.query ? (
                <Button
                  variant="quiet"
                  size="small"
                  aria-label="清除搜索"
                  onClick={() => p.onQueryChange('')}
                >
                  <i className="ri-close-line" />
                </Button>
              ) : (
                <Shortcut keys={['Mod', 'K']} />
              )
            }
          />
        </div>
        <Button
          ref={filterAnchor}
          aria-label="筛选"
          aria-expanded={open === 'filter'}
          variant="quiet"
          className={smart || count || open === 'filter' ? 'active' : ''}
          onClick={() => {
            if (smart) p.onCollectionRulesEdit(p.activeCollection!);
            if (p.editingSmartCollection) {
              p.onCollectionRulesCancel();
              setOpen('');
            } else setOpen(open === 'filter' ? '' : 'filter');
          }}
        >
          <i className="ri-filter-3-line" />
          <span>筛选</span>
          {count > 0 && <span className="library-condition-count">{count}</span>}
        </Button>
        <Button
          ref={viewAnchor}
          aria-expanded={open === 'view'}
          className={open === 'view' ? 'active' : ''}
          variant="quiet"
          onClick={() => setOpen(open === 'view' ? '' : 'view')}
        >
          <i className="ri-layout-grid-line" />
          <span>视图</span>
        </Button>
        {p.view !== 'trash' && (
          <div className="library-import-buttons nps-split-button">
            <Button variant="ink" onClick={p.onImport} disabled={p.importing}>
              <i className="ri-add-line" />
              导入
            </Button>
            <Button
              ref={importAnchor}
              variant="ink"
              aria-label="其他导入方式"
              aria-expanded={open === 'import'}
              disabled={p.importing}
              onClick={() => setOpen(open === 'import' ? '' : 'import')}
            >
              <i className="ri-arrow-down-s-line" />
            </Button>
          </div>
        )}
      </div>
      <FilterChips
        filters={filters}
        onChange={p.onFiltersChange}
        readOnly={smart}
        onEdit={() => {
          p.onCollectionRulesEdit(p.activeCollection!);
          setOpen('filter');
        }}
      />
      {p.view === 'trash' && (
        <div className="library-chips library-help">
          <span>回收站中的图片不会自动清理。永久删除只删除图片库中的副本，不影响原文件。</span>
          <Button
            className="library-row-end"
            variant="danger-outline"
            disabled={!(p.trashCount ?? 0)}
            disabledReason="回收站为空"
            size="small"
            onClick={p.onEmptyTrash}
          >
            清空回收站
          </Button>
        </div>
      )}
      <LibraryPopover
        align="end"
        open={open === 'filter' || !!p.editingSmartCollection}
        anchor={filterAnchor}
        label="筛选"
        onClose={() => {
          setOpen('');
          if (p.editingSmartCollection) p.onCollectionRulesCancel();
        }}
      >
        <div className="library-filter-panel">
          {p.editingSmartCollection && (
            <div className="library-rule-heading">
              <i className="ri-folder-settings-line" />
              <b>编辑规则</b>
              <span>·</span>
              <span>{p.editingSmartCollection.name}</span>
            </div>
          )}
          <TagFilter
            label="包含"
            values={filters.includeTags}
            options={tagOptions}
            onChange={(includeTags) => p.onFiltersChange({ includeTags })}
          >
            {filters.includeTags.length >= 2 && (
              <OptionGroup
                label="包含方式"
                options={[
                  { value: 'all', label: '全部都有' },
                  { value: 'any', label: '有任意一个' },
                ]}
                value={filters.tagMatch}
                onChange={(tagMatch) => p.onFiltersChange({ tagMatch: tagMatch as 'all' | 'any' })}
              />
            )}
          </TagFilter>
          <TagFilter
            label="排除"
            values={filters.excludeTags}
            options={tagOptions}
            onChange={(excludeTags) => p.onFiltersChange({ excludeTags })}
          />
          {(['models', 'vibes'] as const).map((key) => (
            <div
              className={`library-filter-row ${key === 'vibes' ? 'library-filter-row-top' : ''}`}
              key={key}
            >
              <span>{key === 'models' ? '模型' : 'Vibe'}</span>
              <div className={`library-filter-options ${key === 'vibes' ? 'two' : ''}`}>
                {(key === 'models'
                  ? groupedModels
                  : options.vibes.map((option) => ({ label: option.label, values: [option.value] }))
                ).map((option) => (
                  <button
                    type="button"
                    className="library-filter-check"
                    key={key === 'models' ? option.label : option.values[0]}
                    role="checkbox"
                    aria-label={option.label}
                    aria-checked={
                      option.values.every((value) => filters[key].includes(value))
                        ? true
                        : option.values.some((value) => filters[key].includes(value))
                          ? 'mixed'
                          : false
                    }
                    data-tip={
                      key === 'models'
                        ? option.values
                            .map(
                              (value) =>
                                options.models.find((model) => model.value === value)?.label ||
                                value,
                            )
                            .join('\n')
                        : undefined
                    }
                    onClick={() =>
                      p.onFiltersChange({
                        [key]: option.values.every((value) => filters[key].includes(value))
                          ? filters[key].filter((value) => !option.values.includes(value))
                          : [...new Set([...filters[key], ...option.values])],
                      })
                    }
                  >
                    <span className="library-check">
                      <i
                        className={
                          option.values.some((value) => filters[key].includes(value)) &&
                          !option.values.every((value) => filters[key].includes(value))
                            ? 'ri-subtract-line'
                            : 'ri-check-line'
                        }
                      />
                    </span>
                    <span>{option.label}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="library-filter-row">
            <span>时间</span>
            {(open === 'filter' || !!p.editingSmartCollection) && (
              <DateRange value={filters} onChange={p.onFiltersChange} loadDays={loadDays} />
            )}
          </div>
          <div className="library-popover-foot">
            <Button
              variant="quiet"
              size="small"
              disabled={!count}
              onClick={() =>
                p.onFiltersChange({
                  ...DEFAULT_GALLERY_FILTERS,
                  query: p.editingSmartCollection ? '' : p.query,
                })
              }
            >
              清除
            </Button>
            <span className="library-help">
              符合条件：{p.groups.reduce((n, group) => n + group.members.length, 0)} 张
            </span>
            {p.editingSmartCollection ? (
              <>
                <Button
                  size="small"
                  variant="quiet"
                  onClick={() => {
                    p.onCollectionRulesCancel();
                    setOpen('');
                  }}
                >
                  取消
                </Button>
                <Button
                  size="small"
                  variant="ink"
                  disabled={!count && !filters.query}
                  disabledReason="至少保留一个条件"
                  onClick={async () => {
                    if (await p.onCollectionRulesSave()) setOpen('');
                  }}
                >
                  保存规则
                </Button>
              </>
            ) : (
              <Button
                size="small"
                disabled={!count}
                disabledReason="请先设置筛选条件"
                onClick={async () => {
                  const name = gallerySmartCollectionDefaultName({
                    ...filters,
                    models: groupModelOptions(
                      filters.models.map((value) => ({ value, label: value })),
                    ).map((option) => option.label),
                  });
                  if (await p.onCollectionCreate('smart', name)) setOpen('');
                }}
              >
                存为智能收藏集
              </Button>
            )}
          </div>
        </div>
      </LibraryPopover>
      <LibraryPopover
        align="end"
        open={open === 'view'}
        anchor={viewAnchor}
        label="视图"
        onClose={() => setOpen('')}
      >
        <div className="library-filter-panel library-view-panel">
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
                { value: 'oldest', label: '最早导入的在前' },
                { value: 'name', label: '按名称' },
              ]}
            />
          </div>
          <div className="library-filter-row library-filter-row-top">
            <span>合并</span>
            <div className="library-merge-options">
              <OptionGroup
                label="合并方式"
                value={p.grouping.promptScope}
                onChange={(promptScope) => p.onGroupingChange({ promptScope })}
                options={[
                  { value: 'separate', label: '不合并' },
                  { value: 'full', label: '完全相同' },
                  { value: 'base', label: '基础相同' },
                  { value: 'similar', label: '相似' },
                ]}
              />
              <span className="library-help library-merge-help">
                {
                  {
                    separate: '每张图片单独显示。',
                    full: '提示词完全相同的图片合并为一组。',
                    base: '基础提示词的 Tag 足够接近的图片合并为一组，不考虑角色提示词和位置。',
                    similar: '提示词相似度达到下方数值的图片合并为一组。',
                  }[p.grouping.promptScope]
                }
              </span>
            </div>
          </div>
          <div
            className="library-filter-row"
            data-tip={p.grouping.promptScope !== 'similar' ? '合并方式选"相似"时可调整' : undefined}
          >
            <span>相似度</span>
            <Slider
              label="相似度"
              value={p.grouping.similarityThreshold}
              min={70}
              max={95}
              step={5}
              disabled={p.grouping.promptScope !== 'similar'}
              format={(value) => `${value}%`}
              onChange={(similarityThreshold) => p.onGroupingChange({ similarityThreshold })}
            />
          </div>
          <div className="library-filter-row">
            <span>Vibe</span>
            <span className="library-view-vibe">
              <Switch
                label="Vibe 不同的也合并"
                checked={p.grouping.mergeVibes}
                onChange={(mergeVibes) => p.onGroupingChange({ mergeVibes })}
              />
              <span>不同的也合并</span>
            </span>
          </div>
        </div>
      </LibraryPopover>
      <LibraryLayer
        align="end"
        open={open === 'import'}
        anchor={importAnchor}
        className="nps-menu"
        focus
        onClose={() => setOpen('')}
      >
        <MenuItems
          label="其他导入方式"
          closeAll={() => setOpen('')}
          closeLevel={() => setOpen('')}
          items={[
            {
              id: 'files',
              label: '选择图片或 ZIP…',
              prefix: <i className="ri-image-add-line" />,
              shortcut: ['Mod', 'I'],
              onSelect: p.onImport,
            },
            {
              id: 'clipboard',
              label: '从剪贴板导入',
              prefix: <i className="ri-clipboard-line" />,
              shortcut: ['Mod', 'V'],
              onSelect: p.onImportClipboard,
            },
          ]}
        />
      </LibraryLayer>
    </>
  );
}
