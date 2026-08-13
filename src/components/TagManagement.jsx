import { useEffect, useState } from 'react';
import { Popover as LobePopover } from '@lobehub/ui';
import {
  Button as LobeButton,
  Input as LobeInput,
  Select as LobeSelect,
  SliderWithInput as LobeSliderWithInput,
} from '@lobehub/ui/base-ui';
import { CATEGORY_LABELS, CATEGORY_OPTIONS, inferCategory } from '../lib/prompt.js';
import Icon from './Icon.jsx';
import SelectionMark from './SelectionMark.jsx';

const CATEGORY_SELECT_OPTIONS = CATEGORY_OPTIONS.map((value) => ({
  label: CATEGORY_LABELS[value] || value,
  value,
}));

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
  warning,
  ...rest
}) {
  return <button
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
