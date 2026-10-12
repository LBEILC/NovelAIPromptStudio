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
import {
  Button,
  Input,
  Menu,
  ContextMenu,
  Popover,
  Select,
  SelectionBar,
  TextArea,
  type MenuItem,
} from '../ui';
import {
  createPromptDocument,
  promptDocumentProject,
  editPromptTag,
  editPromptParagraph,
  serializePromptSection,
  copyVisiblePromptDocument,
  type PromptDocument,
} from '../lib/promptDocument';
import {
  updatePromptScopeAnnotations,
  addPromptCharacter,
  updatePromptCharacter,
  removePromptCharacter,
  MAX_PROMPT_CHARACTERS,
} from '../lib/promptStructure.js';
import { CATEGORY_OPTIONS, formatTag } from '../lib/prompt.js';
import { encodeMarqueeKey } from '../lib/marqueeSelection.js';
import { useMarqueeSelection, MarqueeSelectionOverlay } from '../components/MarqueeSelection.jsx';
import { WorkbenchDocument, type DocumentProps } from './Document';
import {
  documentTags,
  replaceSection,
  reparseSection,
  scopeLabel,
  categoryLabel,
  type DocumentTag,
} from './model';
import { deleteTags, insertTags, moveTags } from './edits';
import { AddTags } from './AddTags';
import { ParagraphEditor } from './Paragraph';
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
export interface EditorProps extends DocumentProps {
  onConfirm: (options: {
    title: string;
    message: string;
    detail?: string;
    okText: string;
    danger?: boolean;
  }) => Promise<boolean>;
}
export function WorkbenchEditor(p: EditorProps) {
  const doc = useMemo(() => createPromptDocument(p.project), [p.project]);
  const entries = useMemo(() => documentTags(doc), [doc]);
  const [selected, setSelected] = useState<string[]>([]);
  const [raw, setRaw] = useState<{ section: number; value: string } | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
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
      const b = entries.findIndex((item) => item.key === entry.key);
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
          onRawEdit={(section, initial) =>
            setRaw({ section, value: initial ?? serializePromptSection(doc.scopes[section]) })
          }
          sectionEditor={
            raw
              ? {
                  section: raw.section,
                  content: (
                    <div className="wb-raw-editor">
                      <TextArea
                        aria-label="原始文本"
                        value={raw.value}
                        onChange={(event) => setRaw({ ...raw, value: event.target.value })}
                      />
                      <p className="nps-help">
                        空一行就是新的一块。保存后重新分块，译文和分类会保留。
                      </p>
                      <div className="wb-editor-actions">
                        <Button variant="quiet" onClick={() => setRaw(null)}>
                          取消
                        </Button>
                        <Button
                          variant="ink"
                          onClick={() =>
                            guard(() => {
                              save(
                                replaceSection(
                                  doc,
                                  raw.section,
                                  reparseSection(doc.scopes[raw.section], raw.value),
                                ),
                              );
                              setRaw(null);
                            })
                          }
                        >
                          保存
                        </Button>
                      </div>
                    </div>
                  ),
                }
              : undefined
          }
          characterActions={
            <div className="wb-section-head">
              <strong>角色</strong>
              <span className="nps-help">
                {p.project.prompt_structure.characters.length || '暂无'}
              </span>
              <Button
                variant="quiet"
                size="small"
                disabled={p.project.prompt_structure.characters.length >= MAX_PROMPT_CHARACTERS}
                onClick={() => p.onUpdateProject(addPromptCharacter(p.project))}
              >
                添加角色
              </Button>
            </div>
          }
          sectionActions={(si) => {
            const scope = doc.scopes[si].scope;
            if (scope.kind !== 'character' || scope.polarity !== 'prompt') return null;
            const character = scope.character;
            if (renaming?.id === character.id)
              return (
                <Input
                  aria-label="角色名称"
                  value={renaming.name}
                  onChange={(event) => setRenaming({ ...renaming, name: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') setRenaming(null);
                    if (event.key === 'Enter' && renaming.name.trim()) {
                      p.onUpdateProject(
                        updatePromptCharacter(p.project, character.id, {
                          label: renaming.name.trim(),
                        }),
                      );
                      setRenaming(null);
                    }
                  }}
                />
              );
            return (
              <Menu
                label="角色操作"
                trigger={<i className="ri-edit-line" />}
                items={[
                  {
                    id: 'rename',
                    label: '重命名',
                    onSelect: () => setRenaming({ id: character.id, name: character.label }),
                  },
                  {
                    id: 'remove',
                    label: '移除角色',
                    danger: true,
                    onSelect: () =>
                      void (async () => {
                        if (
                          await p.onConfirm({
                            title: `移除“${character.label}”？`,
                            message:
                              '该角色的 Prompt、Undesired Content 和已整理的 Tag 将一并移除。',
                            detail: `共包含 ${character.prompt_tags.length + character.undesired_tags.length} 个 Tag。`,
                            okText: '移除角色',
                            danger: true,
                          })
                        )
                          p.onUpdateProject(removePromptCharacter(p.project, character.id));
                      })(),
                  },
                ]}
              />
            );
          }}
          renderParagraph={(section, block, content) => (
            <ParagraphEditor
              block={doc.scopes[section].blocks[block]}
              onSave={(text, translation) =>
                guard(() => {
                  const next = editPromptParagraph(doc.scopes[section], block, text);
                  next.blocks[block] = { ...next.blocks[block], translation };
                  save(replaceSection(doc, section, next));
                })
              }
            >
              {content}
            </ParagraphEditor>
          )}
          renderTag={(entry, content) => (
            <ContextMenu
              label="Tag 操作"
              items={[
                {
                  id: 'copy',
                  label: '复制 Tag',
                  onSelect: () => p.onCopyText(entry.tag.tag, 1, false),
                },
                {
                  id: 'weight',
                  label: '复制带权重的 Tag',
                  onSelect: () => p.onCopyText(formatTag(entry.tag), 1, false),
                },
                {
                  id: 'translation',
                  label: '复制译文',
                  disabled: !entry.tag.translation,
                  onSelect: () => p.onCopyText(entry.tag.translation, 1, false),
                },
                {
                  id: 'translate',
                  label: '翻译与分类',
                  onSelect: () => translate(selected.includes(entry.key) ? chosen : [entry]),
                },
                {
                  id: 'category',
                  label: '设置分类',
                  children: CATEGORY_OPTIONS.map((category) => ({
                    id: category,
                    label: categoryLabel(category),
                    onSelect: () => {
                      const targets = selected.includes(entry.key) ? chosen : [entry];
                      let project = p.project;
                      for (const section of doc.scopes) {
                        const ids = new Set(
                          targets
                            .filter((item) => doc.scopes[item.section] === section)
                            .map((item) => item.tag.id),
                        );
                        if (ids.size)
                          project = updatePromptScopeAnnotations(
                            project,
                            section.scope.key,
                            section.scope.tags.map((tag) =>
                              ids.has(tag.id)
                                ? { ...tag, category, category_source: 'manual' }
                                : tag,
                            ),
                          );
                      }
                      p.onUpdateProject(project);
                    },
                  })),
                },
                {
                  id: 'delete',
                  label: '删除',
                  danger: true,
                  onSelect: () =>
                    guard(() => {
                      save(deleteTags(doc, selected.includes(entry.key) ? chosen : [entry]));
                      setSelected([]);
                    }),
                },
              ]}
            >
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
            </ContextMenu>
          )}
          renderAdd={(section, block) => (
            <AddTags
              section={section}
              block={block}
              tags={doc.scopes[section].scope.tags}
              onAdd={(text) =>
                guard(() =>
                  save(
                    block < 0
                      ? replaceSection(doc, section, reparseSection(doc.scopes[section], text))
                      : insertTags(doc, section, block, text),
                  ),
                )
              }
            />
          )}
        >
          <SelectionBar visible={!!chosen.length} label={`已选 ${chosen.length} 个 Tag`}>
            <Button
              aria-label="复制"
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
              <i className="ri-file-copy-line" aria-hidden="true" />
              <span className="wb-responsive-label">复制</span>
            </Button>
            <Menu
              label="移动到"
              items={moveItems}
              trigger={
                <>
                  <i className="ri-drag-move-line" aria-hidden="true" />
                  <span className="wb-responsive-label">移动到</span>
                </>
              }
            />
            <Button
              aria-label="翻译与分类"
              variant="quiet"
              size="small"
              onClick={() => translate(chosen)}
            >
              <i className="ri-translate-2" aria-hidden="true" />
              <span className="wb-responsive-label">翻译与分类</span>
            </Button>
            <Button
              aria-label="删除"
              variant="quiet"
              size="small"
              onClick={() =>
                guard(() => {
                  save(deleteTags(doc, chosen));
                  setSelected([]);
                })
              }
            >
              <i className="ri-delete-bin-line" aria-hidden="true" />
              <span className="wb-responsive-label">删除</span>
            </Button>
            <Button aria-label="取消" variant="quiet" size="small" onClick={() => setSelected([])}>
              <i className="ri-close-line" aria-hidden="true" />
              <span className="wb-responsive-label">取消</span>
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
