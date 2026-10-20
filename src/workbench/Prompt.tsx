// 提示词栏（doc/design.md 2.4a、2.14、2.24、2.25）：顶部是编辑方式、搜索、显示、翻译、整理、复制；中间是提示词（按块或按文本）；
// 底部固定一条底栏。节：基础提示词、每个角色（和它的负面提示词）、负面提示词。块：Tag 块或段落；两块之间可以加一块。
// Tag：点一下打开编辑浮层，右键菜单；拖动换位置（按被拖的那一个自己的位置判断落点）；Ctrl / Shift 点击、框选是多选，底部出现操作条。
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { invokeUI } from '../lib/commands';
import { CATEGORY_OPTIONS, formatTag } from '../lib/prompt.js';
import {
  copyPromptDocument,
  copyPromptDocumentScope,
  copyVisiblePromptDocument,
  createPromptDocument,
  editPromptParagraph,
  editPromptTag,
  promptDocumentProject,
  serializePromptSection,
  setPromptBlockType,
  type PromptBlock,
  type PromptDocument,
} from '../lib/promptDocument';
import {
  addPromptCharacter,
  MAX_PROMPT_CHARACTERS,
  removePromptCharacter,
  updatePromptCharacter,
  updatePromptScopeAnnotations,
} from '../lib/promptStructure.js';
import {
  categoryLabel,
  documentTags,
  replaceSection,
  reparseSection,
  scopeLabel,
  type DocumentTag,
} from './model';
import { deleteTags, insertTags, moveTags } from './edits';
import { CAT_VAR } from '../kit/categories';
import { AddTags } from './AddTags';
import { ParagraphEditor } from './Paragraph';
import { TextSection } from './TextSection';
import { InsertPop, CharacterPick } from './Insert';
import { useTidy } from './Tidy';
import { Icon, Kbd, Seg, isMod } from '../kit/controls';
import { Pop } from '../kit/layer';
import { ContextMenu, MenuPop, type MenuEntry } from '../kit/menu';
import { useNotifications } from '../kit/toast';
import { FlipScope, dur, useExitList, useSwap } from '../kit/motion';
import { blockTips } from '../kit/tip';
import type { ImageProject, TagCategory } from '../shared/types';
import type { WorkbenchTab } from '../state/workbench';

export interface EditorProps {
  tabId?: string;
  project: ImageProject;
  viewState: WorkbenchTab['viewState'];
  onViewStateChange: (value: WorkbenchTab['viewState']) => void;
  onUpdateProject: (project: ImageProject) => void;
  onCopyText: (
    text: string,
    count: number,
    selected: boolean,
    ignored?: number,
    label?: string,
    automaticIgnored?: number,
  ) => void;
  onTranslateTags: (
    entries: { scopeKey: string; tag: ImageProject['tags'][number] }[],
  ) => void | Promise<unknown>;
  onNotify: (text: string, tone?: string) => void;
  onShowMaterials?: (kind?: string, id?: string) => void;
  before?: () => Promise<void>;
  onProposalChange?: (value: boolean) => void;
  onConfirm: (options: {
    title: string;
    message: string;
    detail?: string;
    okText: string;
    danger?: boolean;
  }) => Promise<boolean>;
  /** 底栏（有账号时是 GenerationBar，没有时是 GenerationSetup） */
  footer?: ReactNode;
}
let dragging = false;
blockTips(() => dragging);
const LANG_VIEW: Record<string, string> = {
  original: 'tags-view-en',
  translated: 'tags-view-zh',
  bilingual: '',
};
const catVar = (c?: string) => CAT_VAR[(c as TagCategory) || 'Unsorted'] || 'unsorted';
const syntaxNote = (t: DocumentTag['tag']) =>
  t.syntax_issue === 'control_only'
    ? '单独的 :: 是结束控制符，不是 Tag，建议删除'
    : t.syntax_issue === 'emphasis_closer'
      ? '多余的 :: 结束符；前面没有强调时相当于权重 1'
      : '';
const blockKey = (si: number, bi: number) => `${si}:${bi}`;

export function WorkbenchEditor(p: EditorProps) {
  const notify = useNotifications();
  const tidy = useTidy(p);
  const doc = useMemo(() => createPromptDocument(p.project), [p.project]);
  const entries = useMemo(() => documentTags(doc), [doc]);
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
              text: `已删除${c.label}`,
              action: { label: '撤销', onClick: () => p.onUpdateProject(before) },
            });
        },
      },
    ];
  };

  // ---------- 拖动 Tag ----------
  const scroll = useRef<HTMLDivElement>(null);
  const docRoot = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{
    keys: string[];
    from: string;
    to: string;
    index: number;
    w: number;
    h: number;
    inner: string;
  } | null>(null);
  const float = useRef<HTMLSpanElement>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  // 按下的信息放在 ref 里：拖动开始会重画，effect 每次重画都会重新执行，局部变量会被清掉
  const pressRef = useRef<{
    e: DocumentTag;
    el: HTMLElement;
    x: number;
    y: number;
    offX: number;
    offY: number;
  } | null>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const swallowRef = useRef(false);
  useEffect(() => {
    const down = (ev: PointerEvent) => {
      const el = (ev.target as Element).closest<HTMLElement>('[data-tag-key]');
      if (
        ev.button !== 0 ||
        !el ||
        ev.ctrlKey ||
        ev.metaKey ||
        ev.shiftKey ||
        textMode ||
        tidy.active ||
        view.viewMode === 'category'
      )
        return;
      if (!scroll.current?.contains(el) || el.closest('.tag.ro')) return;
      const e = entries.find((x) => x.key === el.dataset.tagKey);
      if (!e) return;
      const r = el.getBoundingClientRect();
      pressRef.current = {
        e,
        el,
        x: ev.clientX,
        y: ev.clientY,
        offX: ev.clientX - r.left,
        offY: ev.clientY - r.top,
      };
      ev.preventDefault();
    };
    const place = () => {
      const d = dragRef.current,
        sc = scroll.current,
        fl = float.current;
      if (!d || !sc || !fl || !pressRef.current) return;
      const cr = sc.getBoundingClientRect();
      const x = Math.max(
          cr.left,
          Math.min(cr.right - d.w, posRef.current.x - pressRef.current.offX),
        ),
        y = Math.max(cr.top, Math.min(cr.bottom - d.h, posRef.current.y - pressRef.current.offY));
      fl.style.left = `${x}px`;
      fl.style.top = `${y}px`;
      // 落点按被拖的那一个自己的位置（中心）判断，不按指针
      const cx = x + d.w / 2,
        cy = y + d.h / 2;
      const pol = doc.scopes[pressRef.current.e.section].scope.polarity;
      let best: { box: HTMLElement; dist: number } | null = null;
      for (const box of sc.querySelectorAll<HTMLElement>('[data-drop]')) {
        const [si] = box.dataset.drop!.split(':').map(Number);
        if (doc.scopes[si]?.scope.polarity !== pol) continue;
        const br = box.getBoundingClientRect();
        const dist = cy < br.top ? br.top - cy : cy > br.bottom ? cy - br.bottom : 0;
        if (!best || dist < best.dist) best = { box, dist };
      }
      if (best) {
        const to = best.box.dataset.drop!;
        const items = [...best.box.querySelectorAll<HTMLElement>(':scope > [data-tag-key]')].filter(
          (n) => !d.keys.includes(n.dataset.tagKey!),
        );
        let index = items.length;
        for (let i = 0; i < items.length; i++) {
          const r = items[i].getBoundingClientRect();
          if (cy < r.top) {
            index = i;
            break;
          }
          if (cy <= r.bottom && cx < r.left + r.width / 2) {
            index = i;
            break;
          }
        }
        if (to !== d.to || index !== d.index) setDrag({ ...d, to, index });
      }
      const edge = 32;
      if (posRef.current.y < cr.top + edge) sc.scrollTop -= 8;
      else if (posRef.current.y > cr.bottom - edge) sc.scrollTop += 8;
    };
    const move = (ev: PointerEvent) => {
      if (!pressRef.current) return;
      posRef.current = { x: ev.clientX, y: ev.clientY };
      if (!dragRef.current) {
        if (Math.hypot(ev.clientX - pressRef.current.x, ev.clientY - pressRef.current.y) < 4)
          return;
        const r = pressRef.current.el.getBoundingClientRect();
        const keys =
          selected.includes(pressRef.current.e.key) && chosen.length > 1
            ? chosen.map((c) => c.key)
            : [pressRef.current.e.key];
        dragging = true;
        document.documentElement.classList.add('is-dragging');
        getSelection()?.removeAllRanges();
        setEditing(null);
        const from = blockKey(pressRef.current.e.section, pressRef.current.e.block);
        const list = entries.filter(
          (x) =>
            x.section === pressRef.current!.e.section &&
            x.block === pressRef.current!.e.block &&
            !keys.includes(x.key),
        );
        const idx = list.findIndex((x) => x.index > pressRef.current!.e.index);
        setDrag({
          keys,
          from,
          to: from,
          index: idx < 0 ? list.length : idx,
          w: r.width,
          h: r.height,
          inner: pressRef.current.el.innerHTML,
        });
        return;
      }
      place();
    };
    const finish = (cancel: boolean) => {
      const d = dragRef.current,
        pr = pressRef.current;
      pressRef.current = null;
      dragging = false;
      document.documentElement.classList.remove('is-dragging');
      if (!d || !pr) return;
      // 只吞掉松手那一下紧跟着的点击
      swallowRef.current = true;
      setTimeout(() => (swallowRef.current = false), 0);
      const commit = () => {
        setDrag(null);
        if (cancel) return;
        const [si, bi] = d.to.split(':').map(Number);
        const moving = entries.filter((x) => d.keys.includes(x.key));
        const remaining = entries.filter(
          (x) => x.section === si && x.block === bi && !d.keys.includes(x.key),
        );
        const index =
          d.index < remaining.length
            ? remaining[d.index].index
            : entries.filter((x) => x.section === si && x.block === bi).length;
        guard(() => save(moveTags(doc, moving, { section: si, block: bi, index })));
      };
      const slot = scroll.current?.querySelector<HTMLElement>('.tag.slot'),
        fl = float.current;
      if (!slot || !fl || !dur(3)) return commit();
      const sr = slot.getBoundingClientRect();
      fl.style.transition =
        'left var(--dur-3) var(--ease-move), top var(--dur-3) var(--ease-move), transform var(--dur-3) var(--ease-move), box-shadow var(--dur-3) var(--ease-move)';
      fl.classList.add('landing');
      fl.style.left = `${sr.left}px`;
      fl.style.top = `${sr.top}px`;
      setTimeout(commit, dur(3));
    };
    const up = () => {
      if (pressRef.current && !dragRef.current) pressRef.current = null;
      else finish(false);
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && dragRef.current) {
        ev.stopPropagation();
        setDrag((d) => (d ? { ...d, to: d.from, index: 0 } : d));
        finish(true);
      }
    };
    const click = (ev: MouseEvent) => {
      if (!swallowRef.current) return;
      swallowRef.current = false;
      ev.stopPropagation();
      ev.preventDefault();
    };
    const sc = scroll.current;
    sc?.addEventListener('pointerdown', down);
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('keydown', key, true);
    addEventListener('click', click, true);
    return () => {
      sc?.removeEventListener('pointerdown', down);
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('keydown', key, true);
      removeEventListener('click', click, true);
    };
  });
  useLayoutEffect(() => {
    if (!drag || !float.current) return;
    const el = float.current;
    if (!el.style.left) {
      const src = scroll.current?.querySelector<HTMLElement>(
        `[data-tag-key="${CSS.escape(drag.keys[0])}"]`,
      );
      const r = src?.getBoundingClientRect();
      if (r) {
        el.style.left = `${r.left}px`;
        el.style.top = `${r.top}px`;
      }
    }
  }, [!!drag]);

  // ---------- 框选：从空白处拖动；按住 Ctrl / Cmd / Shift 是加选；只点一下空白处取消 ----------
  const [marq, setMarq] = useState<{ l: number; t: number; w: number; h: number } | null>(null);
  const marqRef = useRef<{
    sx: number;
    sy: number;
    st: number;
    base: string[];
    on: boolean;
    px: number;
    py: number;
  } | null>(null);
  useEffect(() => {
    const sc = scroll.current;
    if (!sc) return;
    const update = () => {
      if (!marqRef.current?.on) return;
      const top = marqRef.current.sy - (sc.scrollTop - marqRef.current.st);
      const l = Math.min(marqRef.current.sx, marqRef.current.px),
        t = Math.min(top, marqRef.current.py),
        r = Math.max(marqRef.current.sx, marqRef.current.px),
        b = Math.max(top, marqRef.current.py);
      setMarq({ l, t, w: r - l, h: b - t });
      const hits = [...sc.querySelectorAll<HTMLElement>('[data-tag-key]')]
        .filter((n) => {
          const q = n.getBoundingClientRect();
          return q.right > l && q.left < r && q.bottom > t && q.top < b;
        })
        .map((n) => n.dataset.tagKey!);
      setSelected([...new Set([...marqRef.current.base, ...hits])]);
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || textMode || tidy.active) return;
      const t = e.target as Element;
      if (
        !t.closest('.doc') ||
        t.closest(
          '.tag, input, textarea, button, .para-view, .editor, [role="button"], .sec-h span, .auto-row, .blk-gap',
        )
      )
        return;
      e.preventDefault();
      marqRef.current = {
        sx: e.clientX,
        sy: e.clientY,
        st: sc.scrollTop,
        base: e.ctrlKey || e.metaKey || e.shiftKey ? [...selected] : [],
        on: false,
        px: e.clientX,
        py: e.clientY,
      };
    };
    const move = (e: PointerEvent) => {
      if (!marqRef.current) return;
      if (
        !marqRef.current.on &&
        Math.hypot(e.clientX - marqRef.current.sx, e.clientY - marqRef.current.sy) < 4
      )
        return;
      marqRef.current.on = true;
      marqRef.current.px = e.clientX;
      marqRef.current.py = e.clientY;
      document.documentElement.classList.add('is-dragging');
      const cr = sc.getBoundingClientRect();
      if (e.clientY < cr.top + 24) sc.scrollTop -= 8;
      else if (e.clientY > cr.bottom - 24) sc.scrollTop += 8;
      update();
    };
    const up = () => {
      if (!marqRef.current) return;
      if (!marqRef.current.on && selected.length && !marqRef.current.base.length) setSelected([]);
      if (marqRef.current.on) {
        const swallow = (ev: MouseEvent) => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => removeEventListener('click', swallow, { capture: true }), 0);
      }
      marqRef.current = null;
      setMarq(null);
      document.documentElement.classList.remove('is-dragging');
    };
    const onScroll = () => update();
    sc.addEventListener('pointerdown', down);
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    sc.addEventListener('scroll', onScroll);
    return () => {
      sc.removeEventListener('pointerdown', down);
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      sc.removeEventListener('scroll', onScroll);
    };
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' &&
        selected.length &&
        !(e.target as Element)?.closest?.('input, textarea')
      )
        setSelected([]);
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });

  // ---------- 画 Tag ----------
  const clickTag = (e: DocumentTag, ev: React.MouseEvent) => {
    if (isMod(ev)) {
      setSelected(
        selected.includes(e.key) ? selected.filter((k) => k !== e.key) : [...selected, e.key],
      );
    } else if (ev.shiftKey) {
      const a = entries.findIndex((x) => x.key === lastClicked.current),
        b = entries.findIndex((x) => x.key === e.key);
      setSelected([
        ...new Set([
          ...selected,
          ...entries.slice(Math.max(0, Math.min(a, b)), Math.max(a, b) + 1).map((x) => x.key),
        ]),
      ]);
    } else openEditor(e);
    lastClicked.current = e.key;
  };
  const tagEl = (e: DocumentTag) => {
    const t = e.tag;
    const syntax = syntaxNote(t);
    const zh = syntax || t.translation;
    const cls = [
      'tag',
      query && !matches(e) ? 'dim' : '',
      editing?.key === e.key ? 'editing' : '',
      fading.includes(e.key) ? 'fading' : '',
      selected.includes(e.key) ? 'sel' : '',
      syntax ? 'warn' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <span
        key={e.key}
        className={cls}
        data-key={`t-${e.key}`}
        data-flip=""
        data-tag-key={e.key}
        role="button"
        tabIndex={0}
        data-tip={syntax ? undefined : categoryLabel(t.category)}
        onClick={(ev) => clickTag(e, ev)}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            openEditor(e);
          }
        }}
        onContextMenu={(ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          setEditing(null);
          setMenu({ at: [ev.clientX, ev.clientY], items: tagMenu(e) });
        }}
      >
        <span className="dot" style={{ background: `var(--cat-${catVar(t.category)})` }} />
        <span className="t">
          <span className="en">{t.tag}</span>
          {zh && <span className="zh">{zh}</span>}
        </span>
        {t.weight !== 1 && <span className="w">{t.weight}</span>}
      </span>
    );
  };
  /** 一行 Tag（data-drop 是拖动的落点），末尾是"输入中文或英文" */
  const tagsRow = (si: number, bi: number, list: DocumentTag[], add = true) => {
    const key = blockKey(si, bi);
    const shown = list.filter((e) => !drag?.keys.includes(e.key));
    const nodes: ReactNode[] = shown.map(tagEl);
    if (drag && drag.to === key)
      nodes.splice(
        Math.min(drag.index, nodes.length),
        0,
        <span
          key="dragslot"
          className="tag slot"
          data-key="dragslot"
          data-flip=""
          style={{ width: drag.w, height: drag.h }}
        />,
      );
    return (
      <div className={`tags ${lang}`} data-drop={key}>
        {nodes}
        {add && (
          <AddTags
            id={`add-${p.tabId}-${key}`}
            onAdd={(text) =>
              guard(() =>
                save(
                  bi < 0
                    ? replaceSection(doc, si, reparseSection(doc.scopes[si], text))
                    : insertTags(doc, si, bi, text),
                ),
              )
            }
          />
        )}
      </div>
    );
  };
  const acts = (items: () => MenuEntry[], label: string, k: string) => (
    <span className="acts">
      <button
        className={`btn quiet sm icon ${menu?.items && openMenuKey === k ? 'is-hover' : ''}`}
        aria-label={label}
        data-menu-key={k}
        onClick={(ev) => {
          const r = (ev.currentTarget as HTMLElement).getBoundingClientRect();
          setOpenMenuKey(k);
          setMenu({ at: [r.right - 208, r.bottom + 6], items: items() });
        }}
      >
        <Icon name="more-line" />
      </button>
    </span>
  );
  const [openMenuKey, setOpenMenuKey] = useState('');
  useEffect(() => {
    if (!menu) setOpenMenuKey('');
  }, [menu]);

  // ---------- 一块 ----------
  const blockEl = (si: number, bi: number, b: PromptBlock, negative: boolean) => {
    const key = blockKey(si, bi);
    const proposal = tidy.render(doc.scopes[si].scope.key, bi);
    const list = entries.filter((e) => e.section === si && e.block === bi && !e.automatic);
    const label = b.displayLabel || b.label;
    const fadingCls = fadingBlock === key ? 'fading' : '';
    if (b.type !== 'tags') {
      const on = paraEditing.includes(key);
      return (
        <div
          key={`b-${key}`}
          className={`blk ${on ? 'on' : ''} ${fadingCls}`}
          data-key={`b-${key}`}
          data-flip=""
          data-block={key}
        >
          <div className="blk-h">
            <span className="label">
              段落{label ? ` · ${label}` : ''}
              {on ? ' · 编辑中' : ''}
            </span>
            {!proposal && !on && acts(() => blockMenu(si, bi), '这一块的操作', `blk-${key}`)}
          </div>
          {proposal || (
            <ParagraphEditor
              block={b}
              language={view.language}
              translateRequest={paraTranslate.key === key ? paraTranslate.n : 0}
              onEditing={(v) =>
                setParaEditing((s) => (v ? [...new Set([...s, key])] : s.filter((x) => x !== key)))
              }
              onSave={(text, translation) =>
                guard(() => {
                  const next = editPromptParagraph(doc.scopes[si], bi, text);
                  next.blocks[bi] = { ...next.blocks[bi], translation };
                  save(replaceSection(doc, si, next));
                })
              }
            />
          )}
        </div>
      );
    }
    return (
      <div
        key={`b-${key}`}
        className={`blk ${fadingCls}`}
        data-key={`b-${key}`}
        data-flip=""
        data-block={key}
      >
        {!negative && (
          <div className="blk-h">
            <span className="label">
              TAG 块{label ? ` · ${label}` : ''} · {list.length} 个
            </span>
            {!proposal && acts(() => blockMenu(si, bi), '这一块的操作', `blk-${key}`)}
          </div>
        )}
        {proposal || tagsRow(si, bi, list)}
      </div>
    );
  };
  /** 块和块之间（以及最后一块下面）：指针移过来淡入"＋ Tag 块 · 段落 · 常用块" */
  const gap = (si: number, after: number) => {
    const k = `ins-${si}-${after}`;
    return (
      <div className="blk-gap" key={`gap-${si}-${after}`} data-key={`gap-${si}-${after}`}>
        <span className="add-blks">
          <Icon name="add-line" />
          <button className="btn quiet sm" onClick={() => setNewBlock({ si, after, type: 'tags' })}>
            Tag 块
          </button>
          <button
            className="btn quiet sm"
            onClick={() => setNewBlock({ si, after, type: 'paragraph' })}
          >
            段落
          </button>
          {p.tabId && (
            <button
              className={`btn quiet sm ${insert?.anchor === `[data-trigger="${k}"]` ? 'is-hover' : ''}`}
              data-trigger={k}
              onClick={() =>
                setInsert(
                  insert ? null : { si, before: after + 1, anchor: `[data-trigger="${k}"]` },
                )
              }
            >
              常用块
            </button>
          )}
        </span>
      </div>
    );
  };
  const newBlockEl = (si: number, after: number) =>
    newBlock && newBlock.si === si && newBlock.after === after ? (
      <div className="blk" key={`new-${si}-${after}`} data-enter="fade">
        <div className="blk-h">
          <span className="label">
            {newBlock.type === 'tags' ? 'TAG 块 · 新的块 · 0 个' : '段落 · 编辑中'}
          </span>
        </div>
        {newBlock.type === 'tags' ? (
          <div className={`tags ${lang}`}>
            <AddTags
              id={`new-${si}-${after}`}
              autoEdit
              onAdd={(text) => commitNewBlock(text)}
              onDismiss={() => setNewBlock(null)}
            />
          </div>
        ) : (
          <ParagraphEditor
            block={
              {
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
              } as unknown as PromptBlock
            }
            language={view.language}
            autoEdit
            onSave={commitNewBlock}
            onDismiss={() => setNewBlock(null)}
          />
        )}
      </div>
    ) : null;
  const blocksOf = (si: number, negative = false) => {
    const section = doc.scopes[si];
    const out: ReactNode[] = [];
    if (view.viewMode === 'category' && !tidy.active) {
      const list = entries.filter((e) => e.section === si && !e.automatic);
      for (const c of CATEGORY_OPTIONS) {
        const tags = list.filter((e) => (e.tag.category || 'Unsorted') === c);
        if (!tags.length) continue;
        out.push(
          <div className="blk" key={`cat-${si}-${c}`}>
            <div className="blk-h">
              <span className="label">
                {categoryLabel(c)} · {tags.length} 个
              </span>
            </div>
            <div className={`tags ${lang}`}>{tags.map(tagEl)}</div>
          </div>,
        );
      }
      for (const [bi, b] of section.blocks.entries())
        if (b.type !== 'tags') out.push(blockEl(si, bi, b, negative));
      return out;
    }
    section.blocks.forEach((b, bi) => {
      if (bi && !negative) out.push(gap(si, bi - 1));
      out.push(blockEl(si, bi, b, negative));
      out.push(newBlockEl(si, bi));
    });
    if (!negative && section.blocks.length) out.push(gap(si, section.blocks.length - 1));
    return out;
  };
  // NovelAI 自动添加的内容：收成一行说明，默认不显示，复制时默认不含
  const [autoOpen, setAutoOpen] = useState<string[]>([]);
  const autoRow = (si: number) => {
    const a = doc.scopes[si].scope.automation;
    if (!a || !['confirmed', 'inferred'].includes(a.status)) return null;
    const key = doc.scopes[si].scope.key,
      open = autoOpen.includes(key);
    const tags = (a.template || '')
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean);
    return (
      <div className="auto-row" key={`auto-${key}`}>
        <div className="auto-h">
          <Icon name="sparkling-line" />
          <span>
            NovelAI 自动添加 · {a.kind === 'quality' ? '质量 Tag' : '负面预设'} · {a.label}
            {a.status === 'inferred' && (
              <span
                className="guess"
                data-tip="原图里没有记录用了哪个预设，这是按负面提示词比对出来的"
              >
                （推断）
              </span>
            )}{' '}
            · {a.tagCount ? `${a.tagCount} 个` : a.label === 'None' ? '0 个' : '内容未知'}
          </span>
          <span className="sp" />
          {tags.length > 0 && (
            <button
              className="btn quiet sm"
              onClick={() =>
                setAutoOpen(open ? autoOpen.filter((k) => k !== key) : [...autoOpen, key])
              }
            >
              {open ? '收起' : '显示'}
            </button>
          )}
        </div>
        {open && (
          <div className={`tags auto-tags ${lang}`} data-enter="fade">
            {tags.map((t, i) => (
              <span className="tag auto" key={i}>
                <span className="t">
                  <span className="en">{t}</span>
                </span>
              </span>
            ))}
          </div>
        )}
      </div>
    );
  };
  const secCopy = (si: number, label: string) => (
    <button
      className="btn quiet sm icon"
      aria-label="复制"
      onClick={() => copy(copyPromptDocumentScope(doc, doc.scopes[si].scope.key), label)}
    >
      <Icon name="file-copy-line" />
    </button>
  );
  const baseIndex = doc.scopes.findIndex(
    (s) => s.scope.kind === 'base' && s.scope.polarity === 'prompt',
  );
  const negIndex = doc.scopes.findIndex(
    (s) => s.scope.kind === 'base' && s.scope.polarity === 'undesired',
  );
  const charScopes = chars.map((c) => ({
    c,
    si: doc.scopes.findIndex(
      (s) =>
        s.scope.kind === 'character' &&
        s.scope.character.id === c.id &&
        s.scope.polarity === 'prompt',
    ),
    ni: doc.scopes.findIndex(
      (s) =>
        s.scope.kind === 'character' &&
        s.scope.character.id === c.id &&
        s.scope.polarity === 'undesired',
    ),
  }));
  const countTags = (si: number) => entries.filter((e) => e.section === si && !e.automatic).length;
  const charRows = useExitList(charScopes, (x) => x.c.id);
  const addCharacter = () => {
    if (full) return;
    if (update(addPromptCharacter(p.project)))
      requestAnimationFrame(() =>
        scroll.current
          ?.querySelector('.char-sec:last-of-type')
          ?.scrollIntoView({ block: 'nearest', behavior: dur(3) ? 'smooth' : 'auto' }),
      );
  };
  const charHead = (
    <div className="sec-h" data-key="chars-h" key="chars-h" data-flip="">
      角色
      <span className="muted">
        {chars.length ? `${chars.length} 个` : '暂无角色 · 添加后可为每个角色单独编写提示词'}
      </span>
      <span className="acts" style={{ marginLeft: 'auto' }}>
        <span className="split">
          <button
            className={`btn quiet sm ${full ? 'is-off' : ''}`}
            aria-disabled={!!full || undefined}
            data-tip={full || undefined}
            onClick={addCharacter}
          >
            <Icon name="add-line" />
            添加角色
          </button>
          {p.tabId && (
            <button
              className={`btn quiet sm ${charPick ? 'is-hover' : ''}`}
              aria-label="从素材添加角色"
              data-trigger="charadd"
              onClick={() => setCharPick(!charPick)}
            >
              <Icon name="arrow-down-s-line" />
            </button>
          )}
        </span>
      </span>
    </div>
  );
  const blockDoc = (
    <div className="doc selectable" ref={docRoot} key="blocks">
      {polarity !== 'undesired' && baseIndex >= 0 && (
        <>
          <div className="sec-h" data-key="base-h">
            {chars.length ? '基础提示词' : '提示词'}
            <span className="muted">
              {query
                ? `${entries.filter((e) => e.section === baseIndex && !e.automatic && matches(e)).length} 个符合`
                : `${doc.scopes[baseIndex].blocks.length} 块`}
            </span>
            <span className="acts" style={{ marginLeft: 'auto' }}>
              {secCopy(baseIndex, chars.length ? '基础提示词' : '提示词')}
              {acts(
                () => [
                  { label: '切换为文本编辑', hint: 'Ctrl E', onSelect: () => setMode('text') },
                  {
                    label: '全部翻译并分类',
                    onSelect: () => void translate(entries.filter((e) => e.section === baseIndex)),
                  },
                ],
                '更多',
                'sec-base',
              )}
            </span>
          </div>
          {blocksOf(baseIndex)}
          {!doc.scopes[baseIndex].blocks.length && tagsRow(baseIndex, -1, [])}
          {autoRow(baseIndex)}
        </>
      )}
      {polarity !== 'undesired' && charHead}
      {charRows.map(({ item: { c, si, ni }, leaving }) =>
        polarity === 'undesired' && ni < 0 ? null : (
          <div
            className={`char-sec ${leaving ? 'leaving' : ''}`}
            key={`ch-${c.id}`}
            data-key={`ch-${c.id}`}
            data-flip=""
            data-exit="lift"
            data-enter="fade"
          >
            {polarity !== 'undesired' && si >= 0 && (
              <>
                <div className="sec-h char-h">
                  {renaming?.id === c.id ? (
                    <>
                      <label className="field sm is-focus char-name">
                        <input
                          autoFocus
                          value={renaming.name}
                          aria-label="角色名称"
                          onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
                          onBlur={() => {
                            if (renaming.name.trim() && renaming.name.trim() !== c.label)
                              update(
                                updatePromptCharacter(p.project, c.id, {
                                  label: renaming.name.trim(),
                                }),
                              );
                            setRenaming(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.nativeEvent.isComposing) return;
                            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                            if (e.key === 'Escape') {
                              e.stopPropagation();
                              setRenaming(null);
                            }
                          }}
                        />
                      </label>
                      <span className="help key-hint">
                        <Kbd keys="Enter" />
                        <span>保存</span>
                      </span>
                    </>
                  ) : (
                    <>
                      <span
                        role="button"
                        data-tip="点击重命名"
                        onClick={() => setRenaming({ id: c.id, name: c.label })}
                      >
                        {c.label}
                      </span>
                      <span className="muted">{doc.scopes[si].blocks.length} 块</span>
                    </>
                  )}
                  <span className="acts" style={{ marginLeft: 'auto' }}>
                    {secCopy(si, c.label)}
                    {acts(() => charMenu(si), '这个角色的操作', `char-${c.id}`)}
                  </span>
                </div>
                {doc.scopes[si].blocks.length ? (
                  blocksOf(si)
                ) : (
                  <>
                    <div className="char-empty" data-enter="fade">
                      <span className="help">这个角色还没有内容，先加一块</span>
                      <span className="row">
                        <button
                          className="btn sm"
                          onClick={() => setNewBlock({ si, after: -1, type: 'tags' })}
                        >
                          <Icon name="add-line" />
                          Tag 块
                        </button>
                        <button
                          className="btn sm"
                          onClick={() => setNewBlock({ si, after: -1, type: 'paragraph' })}
                        >
                          <Icon name="add-line" />
                          段落
                        </button>
                        {p.tabId && (
                          <button
                            className="btn sm"
                            data-trigger={`ins-${si}-e`}
                            onClick={() =>
                              setInsert({ si, before: 0, anchor: `[data-trigger="ins-${si}-e"]` })
                            }
                          >
                            <Icon name="bookmark-line" />
                            常用块
                          </button>
                        )}
                      </span>
                    </div>
                    {newBlockEl(si, -1)}
                  </>
                )}
              </>
            )}
            {ni >= 0 && (
              <>
                <div className="sub-h">
                  {c.label} 的负面提示词<span className="muted">{countTags(ni)} 个 Tag</span>
                </div>
                {doc.scopes[ni].blocks.length ? (
                  blocksOf(ni, true)
                ) : (
                  <div className="blk">{tagsRow(ni, -1, [])}</div>
                )}
              </>
            )}
          </div>
        ),
      )}
      {polarity !== 'prompt' && negIndex >= 0 && (
        <>
          <div className="sec-h" data-key="neg-h">
            负面提示词<span className="muted">{countTags(negIndex)} 个 Tag</span>
            <span className="acts" style={{ marginLeft: 'auto' }}>
              {secCopy(negIndex, '负面提示词')}
            </span>
          </div>
          {autoRow(negIndex)}
          {doc.scopes[negIndex].blocks.length ? (
            blocksOf(negIndex, true)
          ) : (
            <div className="blk">{tagsRow(negIndex, -1, [])}</div>
          )}
        </>
      )}
    </div>
  );

  // ---------- 文本方式 ----------
  const latestDoc = useRef(doc);
  latestDoc.current = doc;
  const textBox = (si: number, label: string) => {
    const section = doc.scopes[si];
    const key = section.scope.key;
    return (
      <TextSection
        key={`tx-${key}`}
        text={serializePromptSection(section)}
        label={label}
        query={query}
        tags={section.scope.tags}
        onSave={(text) => {
          const cur = latestDoc.current,
            i = cur.scopes.findIndex((s) => s.scope.key === key);
          if (i < 0) return;
          const next = replaceSection(cur, i, reparseSection(cur.scopes[i], text, true));
          latestDoc.current = next;
          save(next);
        }}
      />
    );
  };
  const textDoc = (
    <div className="doc text-doc" key="text">
      {baseIndex >= 0 && (
        <>
          <div className="sec-h">
            {chars.length ? '基础提示词' : '提示词'}
            <span className="muted">空一行是新的一块</span>
            <span className="acts" style={{ marginLeft: 'auto' }}>
              {secCopy(baseIndex, '基础提示词')}
            </span>
          </div>
          {textBox(baseIndex, '基础提示词')}
          {autoRow(baseIndex)}
        </>
      )}
      <div className="sec-h">
        角色<span className="muted">{chars.length ? `${chars.length} 个` : '暂无角色'}</span>
        <span className="acts" style={{ marginLeft: 'auto' }}>
          <button
            className={`btn quiet sm ${full ? 'is-off' : ''}`}
            aria-disabled={!!full || undefined}
            data-tip={full || undefined}
            onClick={addCharacter}
          >
            <Icon name="add-line" />
            添加角色
          </button>
        </span>
      </div>
      {charScopes.map(({ c, si, ni }) => (
        <div className="char-sec" key={`tch-${c.id}`}>
          <div className="sec-h char-h">{c.label}</div>
          {si >= 0 && textBox(si, c.label)}
          {ni >= 0 && (
            <>
              <div className="sub-h">{c.label} 的负面提示词</div>
              {textBox(ni, `${c.label} 的负面提示词`)}
            </>
          )}
        </div>
      ))}
      {negIndex >= 0 && (
        <>
          <div className="sec-h">负面提示词</div>
          {autoRow(negIndex)}
          {textBox(negIndex, '负面提示词')}
        </>
      )}
    </div>
  );
  const docs = useSwap(textMode ? 'text' : 'blocks', (k) => k);
  const moveTargets: MenuEntry[] = (() => {
    if (!chosen.length) return [];
    const pol = doc.scopes[chosen[0].section].scope.polarity;
    if (chosen.some((e) => doc.scopes[e.section].scope.polarity !== pol))
      return [{ label: '正面和负面的 Tag 不能一起移动', disabled: true }];
    return doc.scopes.flatMap((section, si) =>
      section.scope.polarity !== pol
        ? []
        : section.blocks
            .map((b, bi) => ({ b, bi }))
            .filter(({ b }) => b.type === 'tags')
            .map(({ b, bi }) => ({
              label: `${scopeLabel(section)}${section.blocks.length > 1 ? ` · TAG 块${b.displayLabel || b.label ? ` · ${b.displayLabel || b.label}` : ` ${bi + 1}`}` : ''}`,
              onSelect: () =>
                guard(() => {
                  save(moveTags(doc, chosen, { section: si, block: bi }));
                  setSelected([]);
                }),
            })),
    );
  })();
  const [moveMenu, setMoveMenu] = useState(false);
  const docks = useExitList(chosen.length && !textMode ? ['sel'] : [], (k) => k);
  const lastCount = useRef(chosen.length);
  if (chosen.length) lastCount.current = chosen.length;
  return (
    <>
      <div className="col-h" ref={col}>
        <Seg
          className="mode-sw"
          items={[
            ['blocks', <Icon key="b" name="layout-grid-line" />, '按块编辑（Ctrl E 切换）'],
            ['text', <Icon key="t" name="text" />, '按文本编辑（Ctrl E 切换）'],
          ]}
          value={mode}
          onChange={setMode}
          label="编辑方式"
        />
        <label className="field sm grow" data-tip={textMode ? '在文本里查找' : '搜索 Tag 或译文'}>
          <Icon name="search-line" />
          <input
            ref={search}
            placeholder={textMode ? '查找' : '搜索 Tag 或译文'}
            aria-label="搜索 Tag 或译文"
            value={query}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && query) {
                e.stopPropagation();
                setQuery('');
              }
            }}
          />
          <Kbd keys="Mod K" />
        </label>
        {!textMode && (
          <button
            className={`btn quiet sm ${pop === 'view' || view.language !== 'bilingual' || polarity !== 'all' || view.viewMode !== 'structure' ? 'on' : ''}`}
            data-trigger="view"
            aria-label="显示"
            onClick={() => setPop(pop === 'view' ? '' : 'view')}
          >
            <Icon name="equalizer-line" />
            <span className="lbl">显示</span>
          </button>
        )}
        <button
          className={`btn quiet sm ${translating ? 'loading' : ''}`}
          aria-label="翻译"
          onClick={() => void translate(entries)}
        >
          <Icon name={translating ? 'loader-4-line' : 'translate-2'} />
          <span className="lbl">{translating ? '翻译中' : '翻译'}</span>
        </button>
        {tidy.button}
        <span className="split" data-trigger="copy">
          <button className="btn sm" data-act="copy" aria-label={copyLabel} onClick={copyMain}>
            <Icon name="file-copy-line" />
            <span className="lbl">{copyLabel}</span>
          </button>
          <button
            className={`btn sm ${pop === 'copy' ? 'is-hover' : ''}`}
            aria-label="其他复制方式"
            data-trigger="copy-more"
            onClick={() => setPop(pop === 'copy' ? '' : 'copy')}
          >
            <Icon name="arrow-down-s-line" />
          </button>
        </span>
      </div>
      {tidy.bar}
      <div className="swap pane-swap">
        <FlipScope root={scroll}>
          <div className="scroll" ref={scroll}>
            <div className="swap">
              {docs.map(({ key, leaving }) => (
                <div key={key} className={leaving ? 'leaving' : ''} data-enter="fade">
                  {key === 'text' ? textDoc : blockDoc}
                </div>
              ))}
            </div>
          </div>
        </FlipScope>
      </div>
      {p.footer}
      <div className="dock" data-dock="">
        {docks.map(({ key, leaving }) => (
          <span key={key} className={`selbar ${leaving ? 'leaving' : ''}`} data-enter="up">
            <span className="n">已选 {lastCount.current} 个 Tag</span>
            <button className="btn quiet sm" onClick={copyMain}>
              复制
            </button>
            <button
              className={`btn quiet sm ${moveMenu ? 'is-hover' : ''}`}
              data-trigger="move"
              onClick={() => setMoveMenu(!moveMenu)}
            >
              移动到
              <Icon name="arrow-down-s-line" />
            </button>
            <button className="btn quiet sm" onClick={() => void translate(chosen)}>
              翻译并分类
            </button>
            <button
              className="btn danger sm"
              onClick={() => {
                const targets = chosen;
                setSelected([]);
                removeWithUndo(
                  targets.map((t) => t.key),
                  () => deleteTags(doc, targets),
                  `已删除 ${targets.length} 个 Tag`,
                );
              }}
            >
              删除
            </button>
            <button className="btn quiet sm" onClick={() => setSelected([])}>
              取消
            </button>
          </span>
        ))}
      </div>
      {/* 浮层 */}
      <MenuPop
        open={pop === 'copy'}
        onClose={() => setPop('')}
        anchor='[data-trigger="copy"]'
        place="below-right"
        wide
        items={copyItems}
      />
      <MenuPop
        open={moveMenu && chosen.length > 0}
        onClose={() => setMoveMenu(false)}
        anchor='[data-trigger="move"]'
        place="above-left"
        items={moveTargets}
      />
      <Pop
        open={pop === 'view'}
        onClose={() => setPop('')}
        anchor='[data-trigger="view"]'
        trigger='[data-trigger="view"]'
        place="below-right"
        className="popover view-pop"
        label="显示"
      >
        <div className="frow">
          <span className="label">语言</span>
          <Seg
            items={[
              ['original', '原文'],
              ['translated', '译文'],
              ['bilingual', '对照'],
            ]}
            value={view.language as 'original'}
            label="语言"
            onChange={(language) => p.onViewStateChange({ ...view, language })}
          />
        </div>
        <div className="frow">
          <span className="label">排列</span>
          <Seg
            items={[
              ['structure', '按块'],
              ['category', '按分类'],
            ]}
            value={view.viewMode as 'structure'}
            label="排列"
            onChange={(viewMode) => p.onViewStateChange({ ...view, viewMode })}
          />
        </div>
        <div className="frow">
          <span className="label">只看</span>
          <Seg
            items={[
              ['all', '全部'],
              ['prompt', '正面'],
              ['undesired', '负面'],
            ]}
            value={polarity}
            label="只看"
            onChange={setPolarity}
          />
        </div>
      </Pop>
      <Pop
        open={!!editing}
        onClose={commitEditor}
        anchor={editing ? `[data-tag-key="${CSS.escape(editing.key)}"]` : undefined}
        trigger={editing ? `[data-tag-key="${CSS.escape(editing.key)}"]` : undefined}
        className="popover tag-pop"
        label="编辑 Tag"
        deps={[editing?.key]}
      >
        {editing && (
          <>
            <div className="frow">
              <span className="label">Tag</span>
              <label className="field sm">
                <input
                  className="mono"
                  autoFocus
                  value={draft.tag}
                  aria-label="Tag"
                  spellCheck={false}
                  onChange={(e) => setDraft({ ...draft, tag: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && commitEditor()}
                />
              </label>
            </div>
            <div className="frow">
              <span className="label">译文</span>
              <label className="field sm">
                <input
                  value={draft.translation}
                  aria-label="译文"
                  placeholder="暂无译文"
                  onChange={(e) => setDraft({ ...draft, translation: e.target.value })}
                  onKeyDown={(e) => e.key === 'Enter' && commitEditor()}
                />
              </label>
            </div>
            <div className="frow">
              <span className="label">分类</span>
              <button
                className={`field sm ldd ${catMenu ? 'open' : ''}`}
                data-trigger="tag-cat"
                onClick={() => setCatMenu(!catMenu)}
              >
                <span
                  className="cdot"
                  style={{ background: `var(--cat-${catVar(draft.category)})` }}
                />
                <span>{categoryLabel(draft.category)}</span>
                <Icon name="arrow-down-s-line" />
              </button>
            </div>
            <div className="frow">
              <span className="label">权重</span>
              <span className="row">
                <span className="stepper">
                  <span
                    role="button"
                    aria-label="减小权重"
                    onClick={() =>
                      setDraft({ ...draft, weight: Math.round((draft.weight - 0.1) * 100) / 100 })
                    }
                  >
                    −
                  </span>
                  <b className="mono">
                    {Number(draft.weight).toFixed(Number.isInteger(draft.weight * 10) ? 1 : 2)}
                  </b>
                  <span
                    role="button"
                    aria-label="增加权重"
                    onClick={() =>
                      setDraft({ ...draft, weight: Math.round((draft.weight + 0.1) * 100) / 100 })
                    }
                  >
                    +
                  </span>
                </span>
                {draft.weight !== 1 && (
                  <button
                    className="btn quiet sm"
                    onClick={() => setDraft({ ...draft, weight: 1 })}
                  >
                    恢复 1.0
                  </button>
                )}
              </span>
            </div>
            <div className="row tag-pop-foot">
              <button
                className="btn danger sm"
                onClick={() => {
                  const e = editing;
                  setEditing(null);
                  removeWithUndo([e.key], () => deleteTags(doc, [e]), '已删除');
                }}
              >
                <Icon name="delete-bin-line" />
                删除
              </button>
              <span className="sp" />
              <span className="help key-hint">
                <Kbd keys="Esc" />
                <span>关闭</span>
              </span>
            </div>
          </>
        )}
      </Pop>
      <MenuPop
        open={catMenu && !!editing}
        onClose={() => setCatMenu(false)}
        anchor='[data-trigger="tag-cat"]'
        items={CATEGORY_OPTIONS.map((c: string) => ({
          label: categoryLabel(c),
          dot: `var(--cat-${catVar(c)})`,
          checked: draft.category === c,
          onSelect: () => setDraft((d) => ({ ...d, category: c })),
        }))}
      />
      <ContextMenu at={menu?.at || null} onClose={() => setMenu(null)} items={menu?.items || []} />
      {insert && p.tabId && (
        <InsertPop
          open={!!insert}
          onClose={() => setInsert(null)}
          anchor={insert.anchor}
          tabId={p.tabId}
          scope={doc.scopes[insert.si].scope.key}
          before={insert.before}
          flush={p.before}
          onManage={() => p.onShowMaterials?.()}
        />
      )}
      {p.tabId && (
        <CharacterPick
          open={charPick}
          onClose={() => setCharPick(false)}
          anchor='[data-trigger="charadd"]'
          tabId={p.tabId}
          flush={p.before}
          onManage={() => p.onShowMaterials?.('character')}
        />
      )}
      <Pop
        open={!!saveBlock}
        onClose={() => setSaveBlock(null)}
        anchor={
          saveBlock ? `[data-menu-key="blk-${blockKey(saveBlock.si, saveBlock.bi)}"]` : undefined
        }
        place="below-right"
        className="popover saveblk-pop"
        label="存为常用块"
      >
        {saveBlock && (
          <>
            <div className="vp-h">
              <b>存为常用块</b>
              <span className="help">存进素材，以后可以插入任何一张图的提示词</span>
            </div>
            <label className="field sm">
              <input
                autoFocus
                ref={(n) => {
                  if (n && !n.dataset.sel) {
                    n.dataset.sel = '1';
                    n.select();
                  }
                }}
                value={saveBlock.name}
                placeholder="常用块的名字"
                aria-label="常用块的名字"
                onChange={(e) => setSaveBlock({ ...saveBlock, name: e.target.value })}
                onKeyDown={(e) => {
                  if (!e.nativeEvent.isComposing && e.key === 'Enter') {
                    e.preventDefault();
                    void saveMaterial();
                  }
                }}
              />
            </label>
            <div className="row">
              <span className="help key-hint">
                <Kbd keys="Enter" />
                <span>保存</span>
                <Kbd keys="Esc" />
                <span>取消</span>
              </span>
              <span className="sp" />
              <button className="btn quiet sm" onClick={() => setSaveBlock(null)}>
                取消
              </button>
              <button
                className="btn ink sm"
                disabled={!saveBlock.name.trim()}
                onClick={() => void saveMaterial()}
              >
                保存
              </button>
            </div>
          </>
        )}
      </Pop>
      {drag && (
        <span
          ref={float}
          className="tag dragging drag-float"
          style={{ width: drag.w, height: drag.h }}
          dangerouslySetInnerHTML={{ __html: drag.inner }}
        />
      )}
      {marq && (
        <div
          className="marquee-box"
          style={{ display: 'block', left: marq.l, top: marq.t, width: marq.w, height: marq.h }}
        />
      )}
    </>
  );
}
