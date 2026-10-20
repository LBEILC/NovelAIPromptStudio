import { MaterialPicker } from '../materials/Materials';
import { invokeUI } from '../lib/commands';
import { useTidy } from './Tidy';
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
  useNotifications,
} from '../ui';
import {
  createPromptDocument,
  promptDocumentProject,
  editPromptTag,
  editPromptParagraph,
  serializePromptSection,
  parsePromptSection,
  copyPromptDocumentScope,
  type PromptBlock,
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
import { useMarqueeSelection, MarqueeSelectionOverlay } from '../ui/MarqueeSelection.jsx';
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
import { AnimatedItems } from '../ui/AnimatedItems';

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
      className={`wb-sortable-tag ${drag.isDragging ? 'wb-tag-dragging' : ''}`}
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
  tabId?: string;
  onShowMaterials?: (kind?: string) => void;
  before?: () => Promise<void>;
  onProposalChange?: (value: boolean) => void;
  onConfirm: (options: {
    title: string;
    message: string;
    detail?: string;
    okText: string;
    danger?: boolean;
  }) => Promise<boolean>;
}
export function WorkbenchEditor(p: EditorProps) {
  const tidy = useTidy(p);
  const updateProject = p.onUpdateProject;
  p = {
    ...p,
    onUpdateProject: (next) => {
      if (tidy.active) {
        p.onNotify('先处理 AI 提案');
        return;
      }
      updateProject(next);
    },
  };
  const materialAnchor = useRef<HTMLElement | null>(null);
  const [saveMaterial, setSaveMaterial] = useState<{
    section: number;
    block: number;
    name: string;
  } | null>(null);
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
  const saveCurrentMaterial = async () => {
    if (!saveMaterial?.name.trim()) return;
    try {
      await p.before?.();
      await invokeUI('material.save', {
        tabId: p.tabId!,
        scope: doc.scopes[saveMaterial.section].scope.key,
        block: saveMaterial.block,
        name: saveMaterial.name,
      });
      setSaveMaterial(null);
      notify({
        text: '已存为常用块',
        action: { label: '查看', onClick: () => p.onShowMaterials?.() },
      });
    } catch (error) {
      p.onNotify((error as Error).message, 'error');
    }
  };
  const [selected, setSelected] = useState<string[]>([]);
  const [paragraphTranslation, setParagraphTranslation] = useState({
    section: -1,
    block: -1,
    request: 0,
  });
  const [newBlock, setNewBlock] = useState<{
    section: number;
    after: number;
    type: 'tags' | 'paragraph';
  } | null>(null);
  const notify = useNotifications(),
    projectRef = useRef(p.project);
  projectRef.current = p.project;
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
    additiveModifiers: true,
  });
  const guard = (operation: () => void) => {
    try {
      if (tidy.active) {
        p.onNotify('先处理 AI 提案');
        return;
      }
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
          viewState={tidy.active ? { ...p.viewState, viewMode: 'structure' } : p.viewState}
          proposalActive={tidy.active}
          onSaveMaterial={(section, block) => {
            if (block === undefined) return;
            const b = doc.scopes[section].blocks[block];
            materialAnchor.current =
              root.current?.querySelector(`[data-wb-block="${section}:${block}"]`) || null;
            setSaveMaterial({
              section,
              block,
              name:
                b.displayLabel ||
                b.label ||
                b.tags
                  .slice(0, 2)
                  .map((t) => t.translation || t.tag)
                  .join('、') ||
                b.content.slice(0, 12),
            });
          }}
          renderMaterialInsert={(section, before) =>
            p.tabId && (
              <MaterialPicker
                tabId={p.tabId}
                scope={doc.scopes[section].scope.key}
                before={before}
                flush={p.before}
              />
            )
          }
          tidyButton={tidy.button}
          proposalBar={tidy.bar}
          renderProposal={tidy.render}
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
                <AnimatedItems
                  as="span"
                  className="wb-tag-layout"
                  attribute="data-wb-tag"
                  ids={tags.map((tag) => tag.key)}
                  disabled={!!dragging}
                >
                  {children}
                  {sources}
                </AnimatedItems>
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
          onEditModeChange={() => setSelected([])}
          onInsertBlock={(section, after, type) => setNewBlock({ section, after, type })}
          renderNewBlock={(section, after) => {
            if (!newBlock || newBlock.section !== section || newBlock.after !== after) return null;
            const commit = (text: string, translation = '') => {
              if (text.trim()) {
                const previous = doc.scopes[section],
                  raw = serializePromptSection(previous),
                  at = after < 0 ? 0 : previous.blocks[after].range.end;
                const inserted = (at ? '\n\n' : '') + text;
                const next = reparseSection(previous, raw.slice(0, at) + inserted + raw.slice(at));
                const target = next.blocks.find((b) => b.range.start >= at);
                if (target) {
                  target.type = newBlock.type;
                  target.userType = true;
                  target.translation = translation;
                  if (newBlock.type === 'tags') target.displayLabel = '新的块';
                }
                save(replaceSection(doc, section, next));
              }
              setNewBlock(null);
            };
            const empty = {
              type: 'paragraph',
              raw: '',
              content: '',
              label: '',
              prefix: '',
              suffix: '',
              labelSpacing: '',
              range: { start: 0, end: 0 },
              contentRange: { start: 0, end: 0 },
              tags: [],
            } as PromptBlock;
            return (
              <div className="wb-new-block" data-command-scope={doc.scopes[section].scope.key}>
                {newBlock.type === 'tags' ? (
                  <>
                    <header>新的块</header>
                    <AddTags
                      autoEdit
                      section={section}
                      block={-1}
                      tags={doc.scopes[section].scope.tags}
                      onAdd={(text) => commit(text)}
                      onDismiss={() => setNewBlock(null)}
                    />
                  </>
                ) : (
                  <ParagraphEditor
                    autoEdit
                    block={empty}
                    onSave={commit}
                    onDismiss={() => setNewBlock(null)}
                  >
                    {null}
                  </ParagraphEditor>
                )}
              </div>
            );
          }}
          onRenameCharacter={(si) => {
            const scope = doc.scopes[si].scope;
            if (scope.kind !== 'character') return;
            const c = scope.character;
            setRenaming({ id: c.id, name: c.label });
          }}
          sectionTitle={(si) => {
            const scope = doc.scopes[si].scope;
            if (
              scope.kind !== 'character' ||
              !renaming ||
              renaming.id !== scope.character.id ||
              scope.polarity !== 'prompt'
            )
              return null;
            const c = scope.character;
            const finish = () => {
              if (renaming.name.trim())
                p.onUpdateProject(
                  updatePromptCharacter(p.project, c.id, { label: renaming.name.trim() }),
                );
              setRenaming(null);
            };
            return (
              <Input
                className="wb-character-name"
                autoFocus
                aria-label="角色名称"
                value={renaming.name}
                onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                onBlur={finish}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === 'Escape') finish();
                }}
              />
            );
          }}
          characterActions={
            <div className="wb-section-head">
              <strong>角色</strong>
              <span className="nps-help">
                {p.project.prompt_structure.characters.length
                  ? `${p.project.prompt_structure.characters.length} 个`
                  : '暂无角色 · 添加后可为每个角色单独编写提示词'}
              </span>
              <Button
                className="wb-add-character"
                variant="quiet"
                size="small"
                disabled={p.project.prompt_structure.characters.length >= MAX_PROMPT_CHARACTERS}
                onClick={() => p.onUpdateProject(addPromptCharacter(p.project))}
              >
                <i className="ri-add-line" />
                添加角色
              </Button>
              {p.tabId && (
                <MaterialPicker
                  tabId={p.tabId}
                  character
                  flush={p.before}
                  onManage={() => p.onShowMaterials?.('character')}
                />
              )}
            </div>
          }
          sectionActions={(si) => {
            const scope = doc.scopes[si].scope;
            if (scope.kind !== 'character' || scope.polarity !== 'prompt') return null;
            const character = scope.character;
            return (
              <Menu
                label="角色操作"
                trigger={<i className="ri-more-line" />}
                items={[
                  {
                    id: 'rename',
                    label: '重命名',
                    onSelect: () => setRenaming({ id: character.id, name: character.label }),
                  },
                  {
                    id: 'copy',
                    label: '复制这个角色',
                    onSelect: () =>
                      p.onCopyText(
                        copyPromptDocumentScope(doc, scope.key),
                        0,
                        false,
                        0,
                        character.label,
                      ),
                  },
                  {
                    id: 'save-character',
                    label: '存为角色…',
                    onSelect: async () => {
                      try {
                        await p.before?.();
                        await invokeUI('material.save', {
                          tabId: p.tabId!,
                          scope: scope.key,
                          name: character.label,
                        });
                        notify({
                          text: '已存为角色',
                          action: {
                            label: '查看',
                            onClick: () => p.onShowMaterials?.('character'),
                          },
                        });
                      } catch (e) {
                        p.onNotify((e as Error).message, 'error');
                      }
                    },
                  },
                  { id: 'separator', separator: true },
                  {
                    id: 'remove',
                    label: '删除角色',
                    danger: true,
                    onSelect: () => {
                      const index = p.project.prompt_structure.characters.findIndex(
                          (c) => c.id === character.id,
                        ),
                        saved = structuredClone(character);
                      p.onUpdateProject(removePromptCharacter(p.project, character.id));
                      notify({
                        text: `已删除${character.label}`,
                        action: {
                          label: '撤销',
                          onClick: () => {
                            const current = projectRef.current,
                              characters = [...current.prompt_structure.characters];
                            if (!characters.some((c) => c.id === saved.id)) {
                              characters.splice(index, 0, saved);
                              p.onUpdateProject({
                                ...current,
                                prompt_structure: { ...current.prompt_structure, characters },
                              });
                            }
                          },
                        },
                      });
                    },
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
          <Popover
            open={!!saveMaterial}
            anchor={materialAnchor}
            onClose={() => setSaveMaterial(null)}
            label="存为常用块"
            className="material-picker"
          >
            <b>存为常用块</b>
            <p className="nps-help">存进素材，以后可以插入任何一张图的提示词</p>
            <Input
              autoFocus
              aria-label="常用块的名字"
              value={saveMaterial?.name || ''}
              onChange={(e) => setSaveMaterial((v) => v && { ...v, name: e.target.value })}
              onKeyDown={async (e) => {
                if (e.key !== 'Enter' || !saveMaterial?.name.trim()) return;
                e.preventDefault();
                await saveCurrentMaterial();
              }}
            />
            <div className="nps-actions">
              <span className="nps-help">Enter 保存　Esc 取消</span>
              <Button size="small" variant="quiet" onClick={() => setSaveMaterial(null)}>
                取消
              </Button>
              <Button
                size="small"
                onClick={() => void saveCurrentMaterial()}
                disabled={!saveMaterial?.name.trim()}
              >
                保存
              </Button>
            </div>
          </Popover>
        </WorkbenchDocument>
        {dragFeedback.overlay}
      </DndContext>
      <Popover label="编辑 Tag" open={!!editing} anchor={anchor} onClose={() => setEditing(null)}>
        <div
          className="wb-tag-editor"
          data-command-scope={editing ? doc.scopes[editing.section].scope.key : undefined}
          data-command-block={editing?.block}
        >
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
