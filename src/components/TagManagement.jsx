import { useEffect, useState } from 'react';
import { Popover as LobePopover, Tooltip as LobeTooltip } from '@lobehub/ui';
import {
  Button as LobeButton,
  Input as LobeInput,
  Select as LobeSelect,
  SliderWithInput as LobeSliderWithInput,
} from '@lobehub/ui/base-ui';
import { CATEGORY_LABELS, CATEGORY_OPTIONS, formatTagLabel, inferCategory } from '../lib/prompt.js';
import { tagHoverPreviewFields } from '../lib/tagManagement.js';
import Icon from './Icon.jsx';
import SelectionMark from './SelectionMark.jsx';

const CATEGORY_SELECT_OPTIONS = CATEGORY_OPTIONS.map((value) => ({
  label: CATEGORY_LABELS[value] || value,
  value,
}));
const TAG_HOVER_PREVIEW_STYLES = {
  content: { padding: 0 },
  root: { pointerEvents: 'none' },
};
const TAG_HOVER_PREVIEW_POSITIONER_PROPS = { style: { pointerEvents: 'none' } };

function WeightEditor({ value, onCommit }) {
  const parsedValue = Number(value);
  const normalizedValue = Number.isFinite(parsedValue) ? parsedValue : 1;
  const [draft, setDraft] = useState(normalizedValue);

  useEffect(() => setDraft(normalizedValue), [normalizedValue]);

  const commit = (nextValue = draft) => {
    const numericValue = Number(nextValue);
    if (!Number.isFinite(numericValue) || numericValue === normalizedValue) return;
    onCommit(numericValue);
  };

  return <div
    className="tag-weight-editor"
    onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget)) commit();
    }}
    onKeyDown={(event) => {
      if (event.key === 'Enter') commit();
    }}
  >
    <LobeSliderWithInput
      controls={false}
      gap={8}
      max={10}
      min={-10}
      onChange={(weight) => setDraft(Number(weight))}
      onChangeComplete={(weight) => commit(weight)}
      size="small"
      step={0.05}
      styles={{ input: { flex: '0 0 68px', maxWidth: 68, minWidth: 68 }, slider: { minWidth: 0 } }}
      value={draft}
    />
  </div>;
}

export function TagQuickEditor({
  actions,
  autoFocus = true,
  metadata,
  onChange,
  onClose,
  onTranslate,
  originalReadOnly = false,
  showPromptControls = true,
  subtitle = '修改只保存在当前工作台草稿',
  tag,
  title = '编辑 Tag',
  translating = false,
}) {
  const braceDepth = Math.max(0, Math.trunc(Number(tag.brace_depth) || 0));
  return <div className="tag-quick-editor" onClick={(event) => event.stopPropagation()}>
    <div className="tag-quick-editor-heading">
      <div><strong>{title}</strong><small>{subtitle}</small></div>
      <LobeButton onClick={onClose} size="small" type="text">{actions ? '取消' : '完成'}</LobeButton>
    </div>
    <label>
      <span>{showPromptControls && braceDepth ? '括号内原文' : '原文'}</span>
      <LobeInput
        autoFocus={autoFocus && !originalReadOnly}
        disabled={originalReadOnly}
        onChange={(event) => onChange({
          tag: event.target.value,
          translation: '',
          translation_source: '',
          category: inferCategory(event.target.value),
          category_source: 'heuristic',
          raw_segment: '',
          syntax_issue: '',
        })}
        size="small"
        value={tag.tag}
      />
    </label>
    <label><span>翻译</span><LobeInput autoFocus={autoFocus && originalReadOnly} onChange={(event) => onChange({ translation: event.target.value, translation_source: 'manual' })} placeholder="添加中文翻译" size="small" value={tag.translation || ''}/></label>
    <div className={showPromptControls ? 'tag-quick-editor-row' : ''}>
      <label><span>分类</span><LobeSelect onChange={(category) => onChange({ category, category_source: 'manual' })} options={CATEGORY_SELECT_OPTIONS} size="small" value={tag.category || 'Unsorted'}/></label>
      {showPromptControls && (braceDepth
        ? <label><span>强调结构</span><LobeInput disabled size="small" value={`${braceDepth} 层花括号`}/></label>
        : <label><span>权重</span><WeightEditor onCommit={(weight) => onChange({ weight, raw_segment: '', syntax_issue: '' })} value={tag.weight}/></label>)}
    </div>
    {metadata && <div className="tag-quick-editor-metadata">{metadata}</div>}
    <div className="tag-quick-editor-footer">
      {onTranslate && <LobeButton disabled={translating} icon={<Icon name="spark" size={14}/>} onClick={onTranslate} size="small">{translating ? '翻译中…' : 'AI 翻译'}</LobeButton>}
      {actions}
    </div>
  </div>;
}

export function TagPopover({ children, content, disabled, editKey, editingKey, onEditingChange, placement = 'bottomLeft' }) {
  if (disabled) return children;
  return <LobePopover
    arrow
    className="tag-quick-popover"
    content={content}
    onOpenChange={(open) => onEditingChange(open ? editKey : '')}
    open={editingKey === editKey}
    placement={placement}
    trigger="click"
  >
    {children}
  </LobePopover>;
}

export function TagHoverPreview({ actionHint, language, scopeLabel, tag, warning }) {
  const category = tag.category || 'Unsorted';
  const translation = tag.translation?.trim();
  const weight = Number(tag.weight);
  const showWeight = Number.isFinite(weight) && Math.abs(weight - 1) >= 0.001;
  const fields = tagHoverPreviewFields(language);

  return <div className={`tag-hover-preview cat-${String(category).toLowerCase()}`}>
    <header className="tag-hover-preview-header">
      <i aria-hidden="true"/>
      <span>{CATEGORY_LABELS[category] || category}</span>
      {scopeLabel && <small>· {scopeLabel}</small>}
      {showWeight && <em>{weight.toFixed(2)}</em>}
    </header>
    {fields.original && <div className="tag-hover-preview-field">
      <span>原文</span>
      <strong>{formatTagLabel(tag)}</strong>
    </div>}
    {fields.translation && <div className={`tag-hover-preview-field ${translation ? '' : 'empty'}`}>
      <span>翻译</span>
      <p>{translation || '暂无翻译'}</p>
    </div>}
    {warning && <div className="tag-hover-preview-warning"><Icon name="warning" size={14}/><span>{warning}</span></div>}
    <footer>{actionHint}</footer>
  </div>;
}

export function TagChip({
  buttonRef,
  className = '',
  display,
  dragging = false,
  overlay = false,
  selected,
  selecting,
  showWeight = true,
  tag,
  tooltip,
  warning,
  ...rest
}) {
  const chip = <button
    aria-hidden={overlay || undefined}
    aria-pressed={selecting ? selected : undefined}
    className={`overview-tag cat-${String(tag.category || 'Unsorted').toLowerCase()} ${dragging ? 'dragging' : ''} ${overlay ? 'drag-overlay' : ''} ${selected ? 'selected' : ''} ${selecting ? 'selecting' : ''} ${display.fallback ? 'translation-fallback' : ''} ${warning ? 'syntax-warning' : ''} ${className}`.trim()}
    ref={buttonRef}
    tabIndex={overlay ? -1 : undefined}
    type="button"
    {...rest}
  >
    {selecting && <SelectionMark selected={selected}/>}
    <span className="overview-tag-copy"><span>{display.primary}</span>{display.secondary && <small>{display.secondary}</small>}</span>
    {showWeight && Math.abs(Number(tag.weight) - 1) >= 0.001 && <em>{Number(tag.weight).toFixed(2)}</em>}
    {warning && <Icon name="warning" className="overview-syntax-mark" size={15}/>}
  </button>;

  if (!tooltip || overlay) return chip;
  return <LobeTooltip
    arrow
    openDelay={320}
    placement="top"
    positionerProps={TAG_HOVER_PREVIEW_POSITIONER_PROPS}
    styles={TAG_HOVER_PREVIEW_STYLES}
    title={tooltip}
  >
    {chip}
  </LobeTooltip>;
}

export function TagCategorySection({ action, category, children, count }) {
  return <section className={`overview-category-group cat-${String(category).toLowerCase()}`}>
    <div className="overview-category-body">
      <div className="overview-category-heading">
        <div><strong>{CATEGORY_LABELS[category] || category}</strong><small>{count} 个 Tag</small></div>
        {action}
      </div>
      <div className="overview-tags" role="list" aria-label={`${CATEGORY_LABELS[category] || category} Tag`}>
        {children}
      </div>
    </div>
  </section>;
}
