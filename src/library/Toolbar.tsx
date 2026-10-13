import { Collapse } from '../ui/transitions';
import { SurfaceButton } from '../ui';
import { useMemo, useRef, useState } from 'react';
import {
  Shortcut,
  Button,
  Input,
  OptionGroup,
  Popover,
  Select,
  Slider,
  Switch,
  Checkbox,
  Dialog,
  Autocomplete,
} from '../ui';
import {
  DEFAULT_GALLERY_FILTERS,
  GALLERY_DATE_PRESETS,
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
}: {
  filters: GalleryFilters;
  onChange: (patch: Partial<GalleryFilters>) => void;
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
        label,
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
      value:
        filters.datePreset === 'custom'
          ? `${filters.dateFrom} 至 ${filters.dateTo}`
          : GALLERY_DATE_PRESETS.find((item) => item.value === filters.datePreset)?.label || '',
      clear: () => onChange({ datePreset: 'all', dateFrom: '', dateTo: '' }),
    });

  return (
    <Collapse open={!!chips.length || !!filters.query} className="library-filter-collapse">
      <div className="library-chips">
        {chips.map((chip) => (
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
        ))}
        <Button variant="quiet" size="small" onClick={() => onChange(DEFAULT_GALLERY_FILTERS)}>
          清除
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
}: {
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
  const [renaming, setRenaming] = useState(false);
  const filterAnchor = useRef<HTMLButtonElement>(null);
  const viewAnchor = useRef<HTMLButtonElement>(null);
  const importAnchor = useRef<HTMLButtonElement>(null);
  const options = useMemo(() => galleryFilterOptions(p.filterProjects), [p.filterProjects]);
  const tagOptions = useMemo(
    () => galleryFilterOptions(p.filterCacheSource).tags,
    [p.filterCacheSource],
  );
  const filters = p.filters;
  const groupedModels = groupModelOptions(options.models);
  const rules = { ...DEFAULT_GALLERY_FILTERS, ...p.activeCollection?.filters };
  const ruleParts = [
    rules.query,
    ...rules.includeTags.map((v) => '包含 ' + v),
    ...rules.excludeTags.map((v) => '排除 ' + v),
    ...groupModelOptions(
      rules.models.map((v) => ({
        label: v === GALLERY_UNKNOWN_MODEL_VALUE ? '未知模型' : v,
        value: v,
      })),
    ).map((v) => '模型 ' + v.label),
    ...rules.vibes.map(
      (v) => options.vibes.find((option) => option.value === v)?.label || 'Vibe ' + v,
    ),
    rules.datePreset === 'custom'
      ? rules.dateFrom + ' 至 ' + rules.dateTo
      : rules.datePreset !== 'all'
        ? GALLERY_DATE_PRESETS.find((v) => v.value === rules.datePreset)?.label
        : '',
  ].filter(Boolean);
  const count =
    filters.includeTags.length +
    filters.excludeTags.length +
    groupModelOptions(filters.models.map((value) => ({ label: value, value }))).length +
    filters.vibes.length +
    Number(filters.datePreset !== 'all');
  return (
    <>
      <div className="library-tools">
        <div className="gallery-search library-search">
          <Input
            aria-label="搜索图片库"
            placeholder="搜索文件名、Tag、译文或段落里的词"
            prefix={<i className="ri-search-line" />}
            value={filters.query}
            onChange={(event) => p.onQueryChange(event.target.value)}
            suffix={<Shortcut keys={['Mod', 'K']} />}
          />
        </div>
        <Button
          ref={filterAnchor}
          aria-label="筛选"
          aria-expanded={open === 'filter'}
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
          aria-expanded={open === 'view'}
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
              onClick={() => setOpen(open === 'import' ? '' : 'import')}
            >
              <i className="ri-arrow-down-s-line" />
            </Button>
          </div>
        )}
      </div>
      <FilterChips filters={filters} onChange={p.onFiltersChange} />
      {p.view === 'trash' && (
        <div className="library-chips library-help">
          <span>回收站里的图片不会自动清理。永久删除只删除图片库里保存的副本。</span>
          {(p.trashCount ?? 0) > 0 && (
            <Button
              className="library-row-end"
              variant="danger"
              size="small"
              onClick={p.onEmptyTrash}
            >
              清空回收站
            </Button>
          )}
        </div>
      )}
      {p.activeCollection && (
        <div className="library-chips library-collection-row">
          {p.activeCollection.kind === 'smart' ? (
            ruleParts.length ? (
              <>
                <span className="library-help">规则</span>
                {ruleParts.map((part, index) => (
                  <span className="library-chip" key={index}>
                    {part}
                  </span>
                ))}
              </>
            ) : (
              <span className="library-help">没有规则，包含全部图片</span>
            )
          ) : (
            <span className="library-help">手动整理，从详情栏或多选条加入图片</span>
          )}
          <span className="library-row-end" />
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
          <Button
            size="small"
            variant="quiet"
            onClick={() => {
              setName(p.activeCollection!.name);
              setRenaming(true);
            }}
          >
            重命名
          </Button>
          <Button
            size="small"
            variant="danger"
            onClick={() => p.onCollectionDelete(p.activeCollection!)}
          >
            删除收藏集
          </Button>
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
            options={tagOptions}
            onChange={(includeTags) => p.onFiltersChange({ includeTags })}
          />
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
          <TagFilter
            label="排除"
            values={filters.excludeTags}
            options={tagOptions}
            onChange={(excludeTags) => p.onFiltersChange({ excludeTags })}
          />
          {(['models', 'vibes'] as const).map((key) => (
            <div className="library-filter-row" key={key}>
              <span>{key === 'models' ? '模型' : 'Vibe'}</span>
              <div className="library-filter-options">
                {(key === 'models'
                  ? groupedModels
                  : options.vibes.map((option) => ({ label: option.label, values: [option.value] }))
                ).map((option) => (
                  <label
                    key={key === 'models' ? option.label : option.values[0]}
                    data-tip={
                      key === 'models'
                        ? option.values
                            .map(
                              (value) =>
                                options.models.find((item) => item.value === value)?.label || value,
                            )
                            .join('\n')
                        : undefined
                    }
                  >
                    <Checkbox
                      label={option.label}
                      checked={option.values.every((value) => filters[key].includes(value))}
                      mixed={
                        option.values.some((value) => filters[key].includes(value)) &&
                        !option.values.every((value) => filters[key].includes(value))
                      }
                      onChange={(checked) =>
                        p.onFiltersChange({
                          [key]: checked
                            ? [...new Set([...filters[key], ...option.values])]
                            : filters[key].filter((v) => !option.values.includes(v)),
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
                保存规则
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
                { value: 'oldest', label: '最早导入的在前' },
                { value: 'name', label: '按名称排序' },
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
                { value: 'full', label: '完全相同' },
                { value: 'base', label: '基础相同' },
                { value: 'similar', label: '相似' },
              ]}
            />
          </div>
          {p.grouping.promptScope === 'similar' && (
            <>
              <p className="library-help">
                基础提示词的 Tag 足够接近的图片叠成一摞，不看角色提示词和位置。
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
          placeholder="收藏集名称"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Dialog>
      <Dialog
        open={renaming}
        title="重命名"
        cancelLabel="取消"
        confirmLabel="重命名"
        onCancel={() => setRenaming(false)}
        onConfirm={async () => {
          if (name.trim() && p.activeCollection) {
            await p.onCollectionRename(p.activeCollection, name.trim());
            setRenaming(false);
          }
        }}
      >
        <Input
          aria-label="收藏集名称"
          placeholder="收藏集名称"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Dialog>
    </>
  );
}
