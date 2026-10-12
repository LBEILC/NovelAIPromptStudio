import { useMemo, useRef, useState, type ReactNode, type MouseEvent } from 'react';
import {
  DndContext,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  pointerWithin,
} from '@dnd-kit/core';
import { Button, Input, Menu, Popover, Select, SelectionBar, type MenuItem } from '../ui';
import {
  createPromptDocument,
  promptDocumentProject,
  editPromptTag,
  copyVisiblePromptDocument,
  type PromptDocument,
} from '../lib/promptDocument';
import { updatePromptScopeAnnotations } from '../lib/promptStructure.js';
import { CATEGORY_OPTIONS } from '../lib/prompt.js';
import { encodeMarqueeKey } from '../lib/marqueeSelection.js';
import { useMarqueeSelection, MarqueeSelectionOverlay } from '../components/MarqueeSelection.jsx';
import { WorkbenchDocument, type DocumentProps } from './Document';
import { documentTags, replaceSection, scopeLabel, categoryLabel, type DocumentTag } from './model';
import { deleteTags, insertTags, moveTags } from './edits';
import { AddTags } from './AddTags';
import type { ImageProject, TagCategory } from '../shared/types';

function EditableTag({
  entry,
  children,
  disabled,
  onClick,
  onMove,
}: {
  entry: DocumentTag;
  children: ReactNode;
  disabled: boolean;
  onClick: (event: MouseEvent<HTMLSpanElement>) => void;
  onMove: (delta: number) => void;
}) {
  const drag = useDraggable({ id: entry.key, disabled, data: { entry } });
  const drop = useDroppable({
    id: entry.key,
    disabled,
    data: { target: { section: entry.section, block: entry.block, index: entry.index } },
  });
  return (
    <span
      ref={(node) => {
        drag.setNodeRef(node);
        drop.setNodeRef(node);
      }}
      {...drag.listeners}
      data-marquee-key={encodeMarqueeKey(entry.key)}
      className={drag.isDragging ? 'wb-tag-dragging' : ''}
      onClick={onClick}
      onKeyDown={(event) => {
        if (
          event.altKey &&
          ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown'].includes(event.key)
        ) {
          event.preventDefault();
          if (!disabled) onMove(['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1);
        }
      }}
    >
      {children}
    </span>
  );
}
export function WorkbenchEditor(p: DocumentProps) {
  const doc = useMemo(() => createPromptDocument(p.project), [p.project]);
  const entries = useMemo(() => documentTags(doc), [doc]);
  const [selected, setSelected] = useState<string[]>([]);
  const [editing, setEditing] = useState<DocumentTag | null>(null);
  const [draft, setDraft] = useState({
    tag: '',
    translation: '',
    category: 'Unsorted',
    weight: '1',
  });
  const anchor = useRef<HTMLElement>(null);
  const root = useRef<HTMLDivElement>(null);
  const last = useRef('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const marquee = useMarqueeSelection({
    containerRef: root,
    selectedKeys: selected,
    onSelectionChange: setSelected,
    startOnItems: false,
  });
  const guard = (operation: () => void) => {
    try {
      operation();
    } catch (error) {
      p.onNotify(
        error instanceof RangeError
          ? '这个 Tag 的写法不规范，请用“编辑原始文本”修改。'
          : String(error),
        'error',
      );
    }
  };
  const save = (next: PromptDocument) =>
    p.onUpdateProject({ ...p.project, ...promptDocumentProject(next) } as ImageProject);
  const chosen = entries.filter((entry) => selected.includes(entry.key));
  const translate = (items: DocumentTag[]) =>
    p.onTranslateTags(
      items.map((entry) => ({ scopeKey: doc.scopes[entry.section].scope.key, tag: entry.tag })),
    );
  const clickTag = (entry: DocumentTag, event: MouseEvent<HTMLSpanElement>) => {
    if (event.ctrlKey || event.metaKey)
      setSelected(
        selected.includes(entry.key)
          ? selected.filter((key) => key !== entry.key)
          : [...selected, entry.key],
      );
    else if (event.shiftKey) {
      const a = entries.findIndex((item) => item.key === last.current);
      const b = entries.indexOf(entry);
      setSelected([
        ...new Set([
          ...selected,
          ...entries.slice(Math.max(0, Math.min(a, b)), Math.max(a, b) + 1).map((item) => item.key),
        ]),
      ]);
    } else {
      anchor.current = event.currentTarget;
      setEditing(entry);
      setDraft({
        tag: entry.tag.tag,
        translation: entry.tag.translation,
        category: entry.tag.category,
        weight: String(entry.tag.weight),
      });
    }
    last.current = entry.key;
  };
  const saveTag = () =>
    guard(() => {
      if (!editing) return;
      let section = doc.scopes[editing.section];
      section = {
        ...section,
        ...editPromptTag(section, editing.block, editing.index, { tag: draft.tag }),
      };
      section = {
        ...section,
        ...editPromptTag(section, editing.block, editing.index, { weight: Number(draft.weight) }),
      };
      const next = replaceSection(doc, editing.section, section);
      let project = { ...p.project, ...promptDocumentProject(next) } as ImageProject;
      const reparsed = createPromptDocument(project);
      const target = documentTags(reparsed).find(
        (entry) =>
          entry.section === editing.section &&
          entry.block === editing.block &&
          entry.index === editing.index,
      );
      if (!target) throw new RangeError('Invalid tag');
      project = updatePromptScopeAnnotations(
        project,
        section.scope.key,
        reparsed.scopes[editing.section].scope.tags.map((tag) =>
          tag.id === target.tag.id
            ? {
                ...tag,
                translation: draft.translation,
                category: draft.category as TagCategory,
                translation_source: 'manual',
                category_source: 'manual',
              }
            : tag,
        ),
      );
      p.onUpdateProject(project);
      setEditing(null);
    });
  const moveItems: MenuItem[] = doc.scopes.flatMap((section, si) => {
    if (
      !chosen.length ||
      chosen.some((entry) => doc.scopes[entry.section].scope.polarity !== section.scope.polarity)
    )
      return [];
    const block = section.blocks.findIndex((item) => item.type === 'tags');
    return [
      {
        id: section.scope.key,
        label: scopeLabel(section),
        disabled: block < 0,
        onSelect: () =>
          guard(() => {
            save(moveTags(doc, chosen, { section: si, block }));
            setSelected([]);
          }),
      },
    ];
  });
  return (
    <div className="wb-editor" ref={root} {...marquee.handlers}>
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragEnd={({ active, over }) =>
          guard(() => {
            const entry = active.data.current?.entry as DocumentTag | undefined;
            const target = over?.data.current?.target as
              | { section: number; block: number; index?: number }
              | undefined;
            if (entry && target)
              save(moveTags(doc, selected.includes(entry.key) ? chosen : [entry], target));
          })
        }
      >
        <WorkbenchDocument
          {...p}
          selectedKeys={selected}
          renderTag={(entry, content) => (
            <EditableTag
              entry={entry}
              disabled={p.viewState.viewMode === 'category'}
              onClick={(event) => clickTag(entry, event)}
              onMove={(delta) =>
                guard(() => {
                  const siblings = entries.filter(
                    (item) => item.section === entry.section && item.block === entry.block,
                  );
                  const target = entry.index + delta;
                  if (target >= 0 && target < siblings.length)
                    save(
                      moveTags(doc, [entry], {
                        section: entry.section,
                        block: entry.block,
                        index: delta > 0 ? target + 1 : target,
                      }),
                    );
                })
              }
            >
              {content}
            </EditableTag>
          )}
          renderAdd={(section, block) => (
            <AddTags
              section={section}
              block={block}
              tags={doc.scopes[section].scope.tags}
              onAdd={(text) => guard(() => save(insertTags(doc, section, block, text)))}
            />
          )}
        >
          <SelectionBar visible={!!chosen.length} label={`已选 ${chosen.length} 个 Tag`}>
            <Button
              variant="quiet"
              size="small"
              onClick={() => {
                const result = copyVisiblePromptDocument(doc, { selectedKeys: selected });
                p.onCopyText(
                  result.text,
                  result.count,
                  true,
                  result.ignored,
                  result.entries.every(
                    (entry: { scopePolarity: string }) => entry.scopePolarity === 'undesired',
                  )
                    ? '排除 Tag'
                    : '',
                );
              }}
            >
              复制
            </Button>
            <Menu label="移动到" items={moveItems} />
            <Button variant="quiet" size="small" onClick={() => translate(chosen)}>
              翻译与分类
            </Button>
            <Button
              variant="quiet"
              size="small"
              onClick={() =>
                guard(() => {
                  save(deleteTags(doc, chosen));
                  setSelected([]);
                })
              }
            >
              删除
            </Button>
            <Button variant="quiet" size="small" onClick={() => setSelected([])}>
              取消
            </Button>
          </SelectionBar>
          {p.children}
        </WorkbenchDocument>
      </DndContext>
      <Popover label="编辑 Tag" open={!!editing} anchor={anchor} onClose={() => setEditing(null)}>
        <div className="wb-tag-editor">
          <label>
            Tag
            <Input
              aria-label="Tag"
              value={draft.tag}
              onChange={(event) => setDraft({ ...draft, tag: event.target.value })}
            />
          </label>
          <label>
            译文
            <Input
              aria-label="译文"
              value={draft.translation}
              onChange={(event) => setDraft({ ...draft, translation: event.target.value })}
            />
          </label>
          <label>
            分类
            <Select
              label="Tag 分类"
              value={draft.category}
              onChange={(category) => setDraft({ ...draft, category })}
              options={CATEGORY_OPTIONS.map((value) => ({ value, label: categoryLabel(value) }))}
            />
          </label>
          <label>
            权重
            <Input
              aria-label="权重"
              type="number"
              step="0.1"
              value={draft.weight}
              onChange={(event) => setDraft({ ...draft, weight: event.target.value })}
            />
          </label>
          <div className="wb-editor-actions">
            <Button
              variant="danger"
              onClick={() =>
                guard(() => {
                  if (editing) save(deleteTags(doc, [editing]));
                  setEditing(null);
                })
              }
            >
              删除
            </Button>
            <Button
              variant="quiet"
              onClick={() => {
                if (editing) translate([editing]);
              }}
            >
              翻译与分类
            </Button>
            <Button variant="ink" onClick={saveTag}>
              完成
            </Button>
          </div>
        </div>
      </Popover>
      <MarqueeSelectionOverlay rect={marquee.rect} />
    </div>
  );
}
