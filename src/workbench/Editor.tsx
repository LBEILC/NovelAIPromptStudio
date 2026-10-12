import {
  cloneElement,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type MouseEvent,
} from 'react';
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  pointerWithin,
  MeasuringStrategy,
} from '@dnd-kit/core';
import { SortableContext, useSortable } from '@dnd-kit/sortable';
import {
  Button,
  Input,
  Stepper,
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
import { useTagDragLayout, TagInsertionSlot, useDragFeedback, restrictDrag } from './DragFeedback';
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
  const drag = useSortable({
    id: entry.key,
    disabled,
    data: { entry, target: { section: entry.section, block: entry.block, index: entry.index } },
    transition: null,
  });
  return (
    <span
      ref={drag.setNodeRef}
      {...drag.listeners}
      data-marquee-key={encodeMarqueeKey(entry.key)}
      className={`wb-sortable-tag ${drag.isDragging ? 'wb-tag-dragging' : drag.isOver ? 'wb-tag-target' : ''}`}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          event.currentTarget.click();
        }
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
  const scroll = useRef<HTMLDivElement>(null);
  const dragFeedback = useDragFeedback(scroll);
  const [dragging, setDragging] = useState<{
    entry: DocumentTag;
    width: number;
    height: number;
    items: { key: string; width: number; height: number }[];
  } | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    section: number;
    block: number;
    index?: number;
  } | null>(null);
  const doc = useMemo(() => createPromptDocument(p.project), [p.project]);
  const entries = useMemo(() => documentTags(doc), [doc]);
  const [selected, setSelected] = useState<string[]>([]);
  const [paragraphTranslation, setParagraphTranslation] = useState({
    section: -1,
    block: -1,
    request: 0,
  });
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
  useTagDragLayout(root, !!dragging);
  const last = useRef('');
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const marquee = useMarqueeSelection({
    containerRef: scroll,
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
      anchor.current = event.currentTarget.querySelector('.nps-tag') ?? event.currentTarget;
      setEditing(editing?.key === entry.key ? null : entry);
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
        modifiers={[(args) => restrictDrag(args, scroll.current)]}
        measuring={{ droppable: { strategy: MeasuringStrategy.Always } }}
        collisionDetection={(args) =>
          pointerWithin(args).filter((hit) => {
            const from = args.active.data.current?.entry as DocumentTag | undefined;
            const to = args.droppableContainers.find((container) => container.id === hit.id)?.data
              .current?.target;
            return (
              from &&
              to &&
              doc.scopes[from.section].scope.polarity === doc.scopes[to.section].scope.polarity
            );
          })
        }
        onDragStart={(event) => {
          const node =
            root.current?.querySelector<HTMLElement>(
              `[data-marquee-key="${encodeMarqueeKey(String(event.active.id))}"]`,
            ) ?? null;
          dragFeedback.start(event, node);
          const rect = event.active.rect.current.initial ?? node?.getBoundingClientRect();
          if (rect)
            setDragging({
              entry: event.active.data.current!.entry,
              width: rect.width,
              height: rect.height,
              items: (selected.includes(String(event.active.id))
                ? chosen
                : [event.active.data.current!.entry as DocumentTag]
              ).map((item) => {
                const box = root
                  .current!.querySelector<HTMLElement>(
                    `[data-marquee-key="${encodeMarqueeKey(item.key)}"]`,
                  )!
                  .getBoundingClientRect();
                return { key: item.key, width: box.width, height: box.height };
              }),
            });
          setDropTarget(event.active.data.current!.target);
        }}
        onDragOver={({ over }) => {
          if (over?.data.current?.target) setDropTarget(over.data.current.target);
        }}
        onDragCancel={() => {
          dragFeedback.end();
          setDragging(null);
          setDropTarget(null);
        }}
        onDragEnd={({ active, over }) =>
          guard(() => {
            setDragging(null);
            setDropTarget(null);
            const entry = active.data.current?.entry as DocumentTag | undefined;
            const target = over?.data.current?.target as
              | { section: number; block: number; index?: number }
              | undefined;
            if (entry && target && over) {
              const adjusted =
                target.index != null &&
                entry.section === target.section &&
                entry.block === target.block &&
                entry.index < target.index
                  ? { ...target, index: target.index + 1 }
                  : target;
              const next = moveTags(doc, selected.includes(entry.key) ? chosen : [entry], adjusted);
              dragFeedback.finish(
                () => save(next),
                () =>
                  root.current?.querySelector('.wb-insertion-slot')?.getBoundingClientRect() ??
                  over.rect,
              );
            } else dragFeedback.end();
          })
        }
      >
        <WorkbenchDocument
          {...p}
          renderTagList={(tags, content, section, block) => {
            const moving = new Set(dragging?.items.map((item) => item.key));
            const children = content.filter((_, index) => !moving.has(tags[index].key));
            if (dragging && dropTarget?.section === section && dropTarget.block === block) {
              const after =
                dragging.entry.section === section &&
                dragging.entry.block === block &&
                dropTarget.index != null &&
                dragging.entry.index < dropTarget.index;
              const at =
                dropTarget.index == null ? tags.length : dropTarget.index + (after ? 1 : 0);
              const insertion = tags.filter((tag) => tag.index < at && !moving.has(tag.key)).length;
              children.splice(
                insertion,
                0,
                ...dragging.items.map((item, index) => (
                  <TagInsertionSlot
                    key={`insertion-${item.key}`}
                    id={`tag-insertion-${index}`}
                    target={dropTarget}
                    width={item.width}
                    height={item.height}
                  />
                )),
              );
            }
            // Keep the active sensor mounted, but take its invisible source out of flow.
            const sources = content.flatMap((child, index) => {
              const item = dragging?.items.find((item) => item.key === tags[index].key);
              return item
                ? [
                    cloneElement(child as ReactElement<{ style: React.CSSProperties }>, {
                      style: {
                        position: 'absolute',
                        visibility: 'hidden',
                        pointerEvents: 'none',
                        width: item.width,
                        height: item.height,
                      },
                    }),
                  ]
                : [];
            });
            return (
              <SortableContext items={tags.map((tag) => tag.key)} strategy={() => null}>
                <span className="wb-tag-layout">
                  {children}
                  {sources}
                </span>
              </SortableContext>
            );
          }}
          scrollRef={scroll}
          selectedKeys={selected}
          onTranslateParagraph={(section, block) =>
            setParagraphTranslation((previous) => ({
              section,
              block,
              request: previous.request + 1,
            }))
          }
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
                            message: '这个角色的提示词、负面提示词和整理过的 Tag 会一起移除。',
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
              translateRequest={
                paragraphTranslation.section === section && paragraphTranslation.block === block
                  ? paragraphTranslation.request
                  : 0
              }
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
                  label: '翻译并分类',
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
                    ? '负面 Tag'
                    : '',
                );
              }}
            >
              <span className="wb-responsive-label">复制</span>
            </Button>
            <Menu
              label="移动到"
              buttonVariant="quiet"
              items={moveItems}
              trigger={
                <>
                  <span className="wb-responsive-label">移动到</span>
                  <i className="ri-arrow-down-s-line" />
                </>
              }
            />
            <Button
              aria-label="翻译并分类"
              variant="quiet"
              size="small"
              onClick={() => translate(chosen)}
            >
              <span className="wb-responsive-label">翻译并分类</span>
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
              <span className="wb-responsive-label">删除</span>
            </Button>
            <Button aria-label="取消" variant="quiet" size="small" onClick={() => setSelected([])}>
              <span className="wb-responsive-label">取消</span>
            </Button>
          </SelectionBar>
          {p.children}
        </WorkbenchDocument>
        {dragFeedback.overlay}
      </DndContext>
      <Popover label="编辑 Tag" open={!!editing} anchor={anchor} onClose={() => setEditing(null)}>
        <div className="wb-tag-editor">
          <label>
            Tag
            <Input
              className="nps-mono"
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
            <span className="wb-weight">
              <Stepper
                label="权重"
                value={Number(draft.weight)}
                onChange={(weight) => setDraft({ ...draft, weight: String(weight) })}
                step={0.1}
                snapToStep={false}
                decreaseLabel="减小权重"
                increaseLabel="增加权重"
              />
              <span className="nps-help">1 是普通权重</span>
            </span>
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
              翻译并分类
            </Button>
            <Button className="wb-editor-cancel" variant="quiet" onClick={() => setEditing(null)}>
              取消
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
