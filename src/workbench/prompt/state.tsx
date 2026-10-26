import { useEffect, useMemo, useRef, useState } from 'react';
import { isMod } from '../../kit/controls';
import { type MenuEntry } from '../../kit/menu';
import { dur } from '../../kit/motion';
import { useNotifications } from '../../kit/toast';
import { invokeUI } from '../../lib/commands';
import { CATEGORY_OPTIONS, formatTag } from '../../lib/prompt.js';
import {
  copyPromptDocument,
  copyPromptDocumentScope,
  copyVisiblePromptDocument,
  createPromptDocument,
  editPromptTag,
  promptDocumentProject,
  serializePromptSection,
  setPromptBlockType,
  type PromptDocument,
} from '../../lib/promptDocument';
import {
  MAX_PROMPT_CHARACTERS,
  removePromptCharacter,
  updatePromptScopeAnnotations,
} from '../../lib/promptStructure.js';
import {
  controlConflicts,
  isV5Model,
  matchControl,
  type ControlGroup,
  type ControlTag,
} from '../../lib/v5Controls';
import type { ImageProject, TagCategory } from '../../shared/types';
import { closeWeightBefore, deleteTags, insertTags } from '../edits';
import {
  categoryLabel,
  documentTags,
  reparseSection,
  replaceSection,
  type DocumentTag,
} from '../model';
import { useTidy } from '../Tidy';
import { LANG_VIEW, blockKey, catVar, type EditorProps } from './shared';

export function usePromptState(p: EditorProps) {
  const notify = useNotifications();
  const tidy = useTidy(p);
  const doc = useMemo(() => createPromptDocument(p.project), [p.project]);
  const entries = useMemo(() => documentTags(doc), [doc]);
  // V5 控制词：同一节里同一个互斥组（复杂度、年代感）写了两档时画黄框
  const ctlClash = useMemo(
    () =>
      new Map(
        doc.scopes.flatMap((_, si) => [
          ...controlConflicts(entries.filter((e) => e.section === si && !e.automatic)),
        ]),
      ),
    [doc, entries],
  );
  const v5 = isV5Model(p.project.params?.model);
  const projectRef = useRef(p.project);
  projectRef.current = p.project;
  const update = (project: ImageProject) => {
    if (tidy.active) {
      notify({ text: '先接受或放弃 AI 提案' });
      return false;
    }
    p.onUpdateProject(project);
    return true;
  };
  const save = (next: PromptDocument) =>
    update({ ...p.project, ...promptDocumentProject(next) } as ImageProject);
  const guard = (fn: () => void) => {
    try {
      fn();
    } catch (e) {
      notify({
        text:
          e instanceof RangeError
            ? e.message.includes('混合')
              ? e.message
              : '这个 Tag 的写法不规范，请切换为文本编辑修改。'
            : String(e),
        tone: 'error',
      });
    }
  };
  // 删掉的先淡出 --dur-1 再拿掉，通知里可以撤销（放回原来的样子）
  const [fading, setFading] = useState<string[]>([]);
  const removeWithUndo = (keys: string[], next: () => PromptDocument, text: string) => {
    const before = projectRef.current;
    setFading(keys);
    setTimeout(
      () =>
        guard(() => {
          setFading([]);
          if (save(next()))
            notify({ text, action: { label: '撤销', onClick: () => p.onUpdateProject(before) } });
        }),
      dur(1),
    );
  };

  // ---------- 顶部：编辑方式、搜索、显示、翻译、整理、复制 ----------
  const [mode, setModeState] = useState<'blocks' | 'text'>(() => {
    try {
      return localStorage.getItem('nps.prompt-edit-mode') === 'text' ? 'text' : 'blocks';
    } catch {
      return 'blocks';
    }
  });
  const textMode = mode === 'text' && !tidy.active;
  const setMode = (m: 'blocks' | 'text') => {
    window.dispatchEvent(new Event('nps:flush-text'));
    setModeState(m);
    setSelected([]);
    try {
      localStorage.setItem('nps.prompt-edit-mode', m);
    } catch {
      /* 记不住也照常能用 */
    }
  };
  const [query, setQuery] = useState('');
  const [polarity, setPolarity] = useState<'all' | 'prompt' | 'undesired'>('all');
  const [pop, setPop] = useState<'' | 'view' | 'copy'>('');
  const [translating, setTranslating] = useState(false);
  const col = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!col.current?.checkVisibility?.() || !isMod(e)) return;
      const k = e.key.toLowerCase();
      if (k === 'e') {
        e.preventDefault();
        setMode(mode === 'text' ? 'blocks' : 'text');
      }
      if (k === 'k') {
        e.preventDefault();
        search.current?.focus();
      }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });
  useEffect(() => {
    if (tidy.active) {
      setQuery('');
      setPolarity('all');
    }
  }, [tidy.active]);
  const view = p.viewState;
  const lang = LANG_VIEW[view.language] ?? '';
  const matches = (e: DocumentTag) =>
    !query || `${e.tag.tag}\n${e.tag.translation}`.toLowerCase().includes(query.toLowerCase());
  const filtered = !!query || polarity !== 'all';
  const translate = async (list: DocumentTag[]) => {
    if (!list.length) return;
    setTranslating(true);
    try {
      await p.onTranslateTags(
        list.map((e) => ({ scopeKey: doc.scopes[e.section].scope.key, tag: e.tag })),
      );
    } finally {
      setTranslating(false);
    }
  };

  // ---------- 多选 ----------
  const [selected, setSelected] = useState<string[]>([]);
  const chosen = entries.filter((e) => selected.includes(e.key));
  const lastClicked = useRef('');
  useEffect(() => setSelected((s) => s.filter((k) => entries.some((e) => e.key === k))), [entries]);
  const copyContext = copyVisiblePromptDocument(doc, {
    filters: { query, polarity, category: 'All', domain: 'all' },
    expandedScopeKeys: [],
    selectedKeys: selected,
  });
  const negativeOnly =
    copyContext.entries.length > 0 &&
    copyContext.entries.every((x: { scopePolarity: string }) => x.scopePolarity === 'undesired');
  const copyLabel = negativeOnly
    ? `复制负面 · ${copyContext.count}`
    : selected.length
      ? `复制所选 · ${copyContext.count}`
      : filtered
        ? `复制可见的 · ${copyContext.count}`
        : '复制提示词';
  const copy = (text: string, label = '') => p.onCopyText(text, 0, false, 0, label);
  const copyMain = () =>
    p.onCopyText(
      !filtered && !selected.length ? copyPromptDocument(doc) : copyContext.text,
      copyContext.count,
      !!selected.length,
      copyContext.ignored,
      negativeOnly ? '负面 Tag' : '',
      copyContext.automaticIgnored,
    );
  const automaticCount = doc.scopes
    .filter((s) => s.scope.polarity === 'prompt')
    .reduce((n, s) => n + (s.scope.automation?.tagCount || 0), 0);
  const negativeText = doc.scopes
    .filter((s) => s.scope.polarity === 'undesired')
    .map((s) => copyPromptDocumentScope(doc, s.scope.key))
    .filter(Boolean)
    .join('\n');
  const negativeCount = entries.filter(
    (e) => doc.scopes[e.section].scope.polarity === 'undesired' && !e.automatic,
  ).length;
  const mixedSelection =
    chosen.some((e) => doc.scopes[e.section].scope.polarity === 'prompt') &&
    chosen.some((e) => doc.scopes[e.section].scope.polarity === 'undesired');
  const copyItems: MenuEntry[] = [
    { label: '复制全部提示词', onSelect: () => copy(copyPromptDocument(doc), '全部提示词') },
    ...(automaticCount
      ? [
          {
            label: `复制全部提示词（含 NovelAI 自动添加的 ${automaticCount} 个）`,
            onSelect: () => copy(copyPromptDocument(doc, { includeAutomatic: true }), '全部提示词'),
          },
        ]
      : []),
    ...(mixedSelection
      ? [
          {
            label: `复制其中的负面 · ${copyContext.ignored}`,
            onSelect: () =>
              copy(
                copyVisiblePromptDocument(doc, {
                  selectedKeys: chosen
                    .filter((e) => doc.scopes[e.section].scope.polarity === 'undesired')
                    .map((e) => e.key),
                }).text,
                '负面提示词',
              ),
          },
        ]
      : []),
    {
      label: '复制负面提示词',
      hint: `${negativeCount} 个 Tag`,
      onSelect: () => copy(negativeText, '负面提示词'),
    },
    'sep',
    {
      label: '只复制基础提示词',
      onSelect: () => copy(copyPromptDocumentScope(doc, doc.scopes[0].scope.key), '基础提示词'),
    },
  ];

  // ---------- Tag 的编辑浮层 ----------
  const [editing, setEditing] = useState<DocumentTag | null>(null);
  // 关上浮层的淡出期间还要知道是哪个 Tag 打开的（定位和还焦点）
  const lastEditKey = useRef('');
  if (editing) lastEditKey.current = editing.key;
  const [draft, setDraft] = useState({ tag: '', translation: '', category: 'Unsorted', weight: 1 });
  const [catMenu, setCatMenu] = useState(false);
  const openEditor = (e: DocumentTag) => {
    if (editing?.key === e.key) {
      commitEditor();
      return;
    }
    setEditing(e);
    setDraft({
      tag: e.tag.tag,
      translation: e.tag.translation || '',
      category: e.tag.category || 'Unsorted',
      weight: Number(e.tag.weight) || 1,
    });
  };
  const commitEditor = () => {
    const e = editing;
    setEditing(null);
    setCatMenu(false);
    if (!e) return;
    const same =
      draft.tag.trim() === e.tag.tag &&
      draft.translation === (e.tag.translation || '') &&
      draft.category === (e.tag.category || 'Unsorted') &&
      Number(draft.weight) === Number(e.tag.weight || 1);
    if (same || !draft.tag.trim()) return;
    guard(() => {
      let section = doc.scopes[e.section];
      section = {
        ...section,
        ...editPromptTag(section, e.block, e.index, { tag: draft.tag.trim() }),
      };
      section = {
        ...section,
        ...editPromptTag(section, e.block, e.index, { weight: Number(draft.weight) }),
      };
      const next = replaceSection(doc, e.section, section);
      let project = { ...p.project, ...promptDocumentProject(next) } as ImageProject;
      const reparsed = createPromptDocument(project);
      const target = documentTags(reparsed).find(
        (x) => x.section === e.section && x.block === e.block && x.index === e.index,
      );
      if (!target) throw new RangeError('Invalid tag');
      project = updatePromptScopeAnnotations(
        project,
        section.scope.key,
        reparsed.scopes[e.section].scope.tags.map((t) =>
          t.id === target.tag.id
            ? {
                ...t,
                translation: draft.translation,
                category: draft.category as TagCategory,
                translation_source: 'manual',
                category_source: 'manual',
              }
            : t,
        ),
      );
      update(project);
    });
  };
  const setCategory = (targets: DocumentTag[], category: string) => {
    let project = p.project;
    for (const section of doc.scopes) {
      const ids = new Set(
        targets.filter((t) => doc.scopes[t.section] === section).map((t) => t.tag.id),
      );
      if (ids.size)
        project = updatePromptScopeAnnotations(
          project,
          section.scope.key,
          section.scope.tags.map((t) =>
            ids.has(t.id)
              ? { ...t, category: category as TagCategory, category_source: 'manual' }
              : t,
          ),
        );
    }
    update(project);
  };

  // ---------- 右键菜单 ----------
  const [menu, setMenu] = useState<{ at: [number, number]; items: MenuEntry[] } | null>(null);
  // 前一个权重块没写结束的 ::（doc/design.md 2.38）：补上以后 V5 和 V4.5 读法一样
  const closeWeight = (e: DocumentTag) => guard(() => save(closeWeightBefore(doc, e)));
  const tagMenu = (e: DocumentTag): MenuEntry[] => {
    const targets = selected.includes(e.key) && chosen.length > 1 ? chosen : [e];
    const n = targets.length > 1 ? `${targets.length} 个` : undefined;
    return [
      {
        label: '复制',
        hint: n,
        onSelect: () =>
          p.onCopyText(
            targets.map((t) => t.tag.tag).join(', '),
            targets.length,
            targets.length > 1,
          ),
      },
      ...(n || e.tag.weight !== 1
        ? [
            {
              label: '复制（含权重）',
              hint: n,
              onSelect: () =>
                p.onCopyText(
                  targets.map((t) => formatTag(t.tag)).join(', '),
                  targets.length,
                  targets.length > 1,
                ),
            },
          ]
        : []),
      ...(n
        ? []
        : [
            {
              label: '复制译文',
              disabled: e.tag.translation ? false : '没有译文',
              onSelect: () => p.onCopyText(e.tag.translation, 1, false),
            },
          ]),
      'sep',
      { label: '翻译并分类', hint: n, onSelect: () => void translate(targets) },
      {
        label: '设置分类',
        sub: CATEGORY_OPTIONS.map((c: string) => ({
          label: categoryLabel(c),
          dot: `var(--cat-${catVar(c)})`,
          checked: !n && e.tag.category === c,
          onSelect: () => setCategory(targets, c),
        })),
      },
      ...(e.tag.syntax_issue === 'unclosed_weight' && targets.length === 1
        ? [{ label: '补上结束的 ::', onSelect: () => closeWeight(e) }]
        : []),
      'sep',
      {
        label: '删除',
        hint: n,
        danger: true,
        onSelect: () =>
          removeWithUndo(
            targets.map((t) => t.key),
            () => deleteTags(doc, targets),
            targets.length > 1 ? `已删除 ${targets.length} 个 Tag` : '已删除',
          ),
      },
    ];
  };

  // ---------- 块：菜单、加一块、存为常用块 ----------
  const [fadingBlock, setFadingBlock] = useState('');
  const [newBlock, setNewBlock] = useState<{
    si: number;
    after: number;
    type: 'tags' | 'paragraph';
  } | null>(null);
  const [insert, setInsert] = useState<{ si: number; before: number; anchor: string } | null>(null);
  // V5 控制词面板开在哪一节
  const [ctlFor, setCtlFor] = useState<number | null>(null);
  /** 面板里选了一项：多选组加上或去掉；互斥组原地换档（多写的几个删掉），选"无"全删；新加的放在这一节最后一个 Tag 块末尾 */
  const pickControl = (si: number, group: ControlGroup, item: ControlTag | null) =>
    guard(() => {
      const inGroup = entries.filter(
        (e) => e.section === si && !e.automatic && matchControl(e.tag.tag)?.group === group,
      );
      const append = (tag: string) => {
        const blocks = doc.scopes[si].blocks;
        const last = blocks.map((b) => b.type).lastIndexOf('tags');
        return insertTags(doc, si, last, tag);
      };
      if (!group.exclusive) {
        const same = inGroup.filter((e) => matchControl(e.tag.tag)?.item === item);
        save(same.length ? deleteTags(doc, same) : append(item!.tag));
        return;
      }
      if (!item) return void save(deleteTags(doc, inGroup));
      if (!inGroup.length) return void save(append(item.tag));
      const [first, ...rest] = inGroup;
      const next = deleteTags(doc, rest);
      save(
        replaceSection(
          next,
          first.section,
          editPromptTag(next.scopes[first.section], first.block, first.index, { tag: item.tag }),
        ),
      );
    });
  const [saveBlock, setSaveBlock] = useState<{ si: number; bi: number; name: string } | null>(null);
  const [paraTranslate, setParaTranslate] = useState({ key: '', n: 0 });
  const [paraEditing, setParaEditing] = useState<string[]>([]);
  const replaceRaw = (si: number, raw: string) =>
    save(replaceSection(doc, si, reparseSection(doc.scopes[si], raw)));
  const blockMenu = (si: number, bi: number): MenuEntry[] => {
    const section = doc.scopes[si],
      b = section.blocks[bi];
    const move = (d: number) => {
      const t = bi + d;
      if (t < 0 || t >= section.blocks.length) return;
      const blocks = [...section.blocks];
      [blocks[bi], blocks[t]] = [blocks[t], blocks[bi]];
      replaceRaw(
        si,
        section.separators[0] + blocks.map((x, i) => x.raw + section.separators[i + 1]).join(''),
      );
    };
    return [
      {
        label: b.type === 'tags' ? '转为段落' : '转为 Tag 块',
        onSelect: () => {
          if (
            save(
              replaceSection(
                doc,
                si,
                setPromptBlockType(section, bi, b.type === 'tags' ? 'paragraph' : 'tags'),
              ),
            )
          )
            notify({
              text: b.type === 'tags' ? '已转为段落，内容未改变' : '已转为 Tag 块，内容未改变',
            });
        },
      },
      {
        label: '翻译并分类',
        onSelect: () => {
          if (b.type === 'paragraph')
            setParaTranslate((v) => ({ key: blockKey(si, bi), n: v.n + 1 }));
          else void translate(entries.filter((e) => e.section === si && e.block === bi));
        },
      },
      { label: '复制', onSelect: () => copy(b.raw) },
      {
        label: '存为常用块…',
        onSelect: () =>
          setSaveBlock({
            si,
            bi,
            name:
              b.displayLabel ||
              b.label ||
              b.tags
                .slice(0, 2)
                .map((t) => t.translation || t.tag)
                .join('、') ||
              b.content.slice(0, 12),
          }),
      },
      'sep',
      { label: '上移', hint: 'Alt ↑', disabled: bi === 0, onSelect: () => move(-1) },
      {
        label: '下移',
        hint: 'Alt ↓',
        disabled: bi === section.blocks.length - 1,
        onSelect: () => move(1),
      },
      'sep',
      {
        label: '删除',
        danger: true,
        onSelect: () => {
          const before = projectRef.current;
          setFadingBlock(blockKey(si, bi));
          setTimeout(() => {
            setFadingBlock('');
            const raw = serializePromptSection(section);
            if (
              save(
                replaceSection(
                  doc,
                  si,
                  reparseSection(section, raw.slice(0, b.range.start) + raw.slice(b.range.end)),
                ),
              )
            )
              notify({
                text: '已删除',
                action: { label: '撤销', onClick: () => p.onUpdateProject(before) },
              });
          }, dur(1));
        },
      },
    ];
  };
  const commitNewBlock = (text: string, translation = '') => {
    const nb = newBlock;
    setNewBlock(null);
    if (!nb || !text.trim()) return;
    guard(() => {
      const prev = doc.scopes[nb.si],
        raw = serializePromptSection(prev),
        at = nb.after < 0 ? raw.length : prev.blocks[nb.after].range.end;
      const inserted = (at ? '\n\n' : '') + text;
      const next = reparseSection(prev, raw.slice(0, at) + inserted + raw.slice(at));
      const target = next.blocks.find((b) => b.range.start >= at);
      if (target) {
        target.type = nb.type;
        target.userType = true;
        target.translation = translation;
        if (nb.type === 'tags') target.displayLabel = '新的块';
      }
      save(replaceSection(doc, nb.si, next));
    });
  };
  const saveMaterial = async () => {
    if (!saveBlock?.name.trim() || !p.tabId) return;
    try {
      await p.before?.();
      const { item } = await invokeUI('material.save', {
        tabId: p.tabId,
        scope: doc.scopes[saveBlock.si].scope.key,
        block: saveBlock.bi,
        name: saveBlock.name.trim(),
      });
      setSaveBlock(null);
      notify({
        text: '已存为常用块',
        action: { label: '查看', onClick: () => p.onShowMaterials?.('block', item.id) },
      });
    } catch (e) {
      notify({ text: (e as Error).message, tone: 'error' });
    }
  };

  // ---------- 角色 ----------
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [charPick, setCharPick] = useState(false);
  const chars = p.project.prompt_structure.characters;
  const full = chars.length >= MAX_PROMPT_CHARACTERS ? `最多 ${MAX_PROMPT_CHARACTERS} 个角色` : '';
  const charMenu = (si: number): MenuEntry[] => {
    const scope = doc.scopes[si].scope;
    if (scope.kind !== 'character') return [];
    const c = scope.character;
    return [
      { label: '重命名', onSelect: () => setRenaming({ id: c.id, name: c.label }) },
      {
        label: '复制这个角色',
        onSelect: () => p.onCopyText(copyPromptDocumentScope(doc, scope.key), 0, false, 0, c.label),
      },
      {
        label: '存为角色…',
        onSelect: async () => {
          try {
            await p.before?.();
            const { item } = await invokeUI('material.save', {
              tabId: p.tabId!,
              scope: scope.key,
              name: c.label,
            });
            notify({
              text: '已存为角色',
              action: { label: '查看', onClick: () => p.onShowMaterials?.('character', item.id) },
            });
          } catch (e) {
            notify({ text: (e as Error).message, tone: 'error' });
          }
        },
      },
      'sep',
      {
        label: '删除角色',
        danger: true,
        onSelect: () => {
          const before = projectRef.current;
          if (update(removePromptCharacter(p.project, c.id)))
            notify({
              text: `已删除“${c.label}”`,
              action: { label: '撤销', onClick: () => p.onUpdateProject(before) },
            });
        },
      },
    ];
  };
  return {
    textMode,
    tidy,
    view,
    entries,
    doc,
    selected,
    chosen,
    setEditing,
    guard,
    save,
    setSelected,
    lastClicked,
    openEditor,
    ctlClash,
    query,
    matches,
    editing,
    fading,
    v5,
    setMenu,
    tagMenu,
    lang,
    chars,
    renaming,
    setRenaming,
    update,
    charMenu,
    fadingBlock,
    paraEditing,
    blockMenu,
    paraTranslate,
    setParaEditing,
    setNewBlock,
    insert,
    setInsert,
    newBlock,
    commitNewBlock,
    ctlFor,
    setCtlFor,
    copy,
    full,
    charPick,
    setCharPick,
    polarity,
    setMode,
    translate,
    col,
    mode,
    search,
    setQuery,
    pop,
    setPop,
    translating,
    copyLabel,
    copyMain,
    removeWithUndo,
    closeWeight,
    copyItems,
    setPolarity,
    commitEditor,
    lastEditKey,
    draft,
    setDraft,
    catMenu,
    setCatMenu,
    menu,
    pickControl,
    saveBlock,
    setSaveBlock,
    saveMaterial,
  };
}
