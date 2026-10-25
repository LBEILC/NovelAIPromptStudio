import { useState, type ReactNode } from 'react';
import { Icon, Kbd, isMod } from '../../kit/controls';
import { MenuButton, type MenuEntry } from '../../kit/menu';
import { useExitList } from '../../kit/motion';
import { CATEGORY_OPTIONS } from '../../lib/prompt.js';
import {
  copyPromptDocumentScope,
  editPromptParagraph,
  type PromptBlock,
} from '../../lib/promptDocument';
import { updatePromptCharacter } from '../../lib/promptStructure.js';
import { matchControl } from '../../lib/v5Controls';
import { AddTags } from '../AddTags';
import { insertTags, moveTags } from '../edits';
import { categoryLabel, reparseSection, replaceSection, type DocumentTag } from '../model';
import { ParagraphEditor } from '../Paragraph';
import type { usePromptDrag } from './drag';
import { blockKey, catVar, findTag, syntaxNote, type EditorProps } from './shared';
import type { usePromptState } from './state';
export function usePromptRendering({
  setSelected,
  selected,
  entries,
  lastClicked,
  openEditor,
  ctlClash,
  query,
  matches,
  editing,
  fading,
  v5,
  guard,
  save,
  doc,
  scroll,
  setEditing,
  setMenu,
  tagMenu,
  drag,
  lang,
  p,
  chars,
  renaming,
  setRenaming,
  update,
  charMenu,
  tidy,
  fadingBlock,
  paraEditing,
  blockMenu,
  view,
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
}: Pick<
  ReturnType<typeof usePromptState> & ReturnType<typeof usePromptDrag> & { p: EditorProps },
  | 'setSelected'
  | 'selected'
  | 'entries'
  | 'lastClicked'
  | 'openEditor'
  | 'ctlClash'
  | 'query'
  | 'matches'
  | 'editing'
  | 'fading'
  | 'v5'
  | 'guard'
  | 'save'
  | 'doc'
  | 'scroll'
  | 'setEditing'
  | 'setMenu'
  | 'tagMenu'
  | 'drag'
  | 'lang'
  | 'p'
  | 'chars'
  | 'renaming'
  | 'setRenaming'
  | 'update'
  | 'charMenu'
  | 'tidy'
  | 'fadingBlock'
  | 'paraEditing'
  | 'blockMenu'
  | 'view'
  | 'paraTranslate'
  | 'setParaEditing'
  | 'setNewBlock'
  | 'insert'
  | 'setInsert'
  | 'newBlock'
  | 'commitNewBlock'
  | 'ctlFor'
  | 'setCtlFor'
  | 'copy'
>) {
  // ---------- 画 Tag ----------
  const braces = (depth = 0) =>
    depth > 0
      ? ['{'.repeat(depth), '}'.repeat(depth)]
      : depth < 0
        ? ['['.repeat(-depth), ']'.repeat(-depth)]
        : ['', ''];
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
    const ctl = matchControl(t.tag);
    const clash = ctlClash.get(e.key);
    const syntax = syntaxNote(t) || (clash ? `${clash.label}写了不止一档，只留一个` : '');
    // 控制词显示中文名；用户自己改过的译文优先
    const zh =
      syntax || (ctl && t.translation_source !== 'manual' ? ctl.name : t.translation) || ctl?.name;
    const cls = [
      'tag',
      query && !matches(e) ? 'dim' : '',
      editing?.key === e.key ? 'editing' : '',
      fading.includes(e.key) ? 'fading' : '',
      selected.includes(e.key) ? 'sel' : '',
      syntax ? 'warn' : '',
      ctl ? 'ctl' : '',
      ctl && !v5 ? 'off' : '',
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
        data-tc={ctl ? 'ctl' : catVar(t.category)}
        role="button"
        tabIndex={0}
        data-tip={
          syntax
            ? undefined
            : ctl
              ? `V5 控制词 · ${ctl.name}${v5 ? '' : ' · 当前模型不是 V5，不起作用'}`
              : categoryLabel(t.category)
        }
        onClick={(ev) => clickTag(e, ev)}
        onKeyDown={(ev) => {
          if (ev.key === 'Enter' || ev.key === ' ') {
            ev.preventDefault();
            openEditor(e);
            return;
          }
          // Alt + 方向键：在这一块里往前（← ↑）或往后（→ ↓）挪一个位置，焦点跟着它
          const d = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[ev.key];
          if (!ev.altKey || !d || e.automatic) return;
          ev.preventDefault();
          const row = entries.filter(
            (x) => x.section === e.section && x.block === e.block && !x.automatic,
          );
          const i = row.findIndex((x) => x.key === e.key);
          if (i < 0 || i + d < 0 || i + d >= row.length) return;
          guard(() => {
            save(
              moveTags(doc, [e], {
                section: e.section,
                block: e.block,
                index: d > 0 ? i + 2 : i - 1,
              }),
            );
            requestAnimationFrame(() => findTag(scroll.current, e.key)?.focus());
          });
        }}
        onContextMenu={(ev) => {
          ev.preventDefault();
          ev.stopPropagation();
          setEditing(null);
          setMenu({ at: [ev.clientX, ev.clientY], items: tagMenu(e) });
        }}
      >
        {/* 分类用英文的文字颜色表示（data-tc）；控制词不是分类，左边嵌一小段"V5" */}
        {ctl && <span className="v5">V5</span>}
        <span className="t">
          <span className="en">
            {/* 括号强调：{} 加强、[] 减弱，括号画淡一点 */}
            {braces(t.brace_depth)[0] && <span className="br">{braces(t.brace_depth)[0]}</span>}
            {t.tag}
            {braces(t.brace_depth)[1] && <span className="br">{braces(t.brace_depth)[1]}</span>}
          </span>
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
      <MenuButton label={label} items={items} menuKey={k} />
    </span>
  );

  /** 角色的标题行：名字（点击重命名）、块数、复制和更多（按块、按文本两种方式共用） */
  const charTitle = (c: (typeof chars)[number], si: number) => (
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
        {ctlBtn(si)}
        {secCopy(si, c.label)}
        {acts(() => charMenu(si), '这个角色的操作', `char-${c.id}`)}
      </span>
    </div>
  );
  /** 块标题上的图例：这块里每种分类各有几个，文字用分类色；悬停一项时块里其他 Tag 淡下去（聚光写在样式里） */
  const legend = (list: DocumentTag[]) => {
    const n = new Map<string, number>();
    for (const e of list) {
      const k = matchControl(e.tag.tag) ? 'ctl' : catVar(e.tag.category);
      n.set(k, (n.get(k) || 0) + 1);
    }
    const order = [
      ...CATEGORY_OPTIONS.map((c: string) => [catVar(c), categoryLabel(c)]),
      ['ctl', 'V5 控制'],
    ];
    return n.size ? (
      <span className="cat-lg">
        {order
          .filter(([k]) => n.has(k))
          .map(([k, name]) => (
            <span key={k} data-tc={k}>
              {name} {n.get(k)}
            </span>
          ))}
      </span>
    ) : null;
  };
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
          data-wb-scope={doc.scopes[si].scope.key}
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
        data-wb-scope={doc.scopes[si].scope.key}
      >
        {!negative && (
          <div className="blk-h">
            <span className="label">
              TAG 块{label ? ` · ${label}` : ''} · {list.length} 个
            </span>
            {!proposal && legend(list)}
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
      <div
        className="blk"
        key={`new-${si}-${after}`}
        data-enter="fade"
        data-wb-scope={doc.scopes[si].scope.key}
      >
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
      // 小节标题用分类色；V5 控制词不是分类，单独放在最后一节
      const ctls = list.filter((e) => matchControl(e.tag.tag));
      const groups: [string, string, DocumentTag[]][] = [
        ...CATEGORY_OPTIONS.map((c: string): [string, string, DocumentTag[]] => [
          catVar(c),
          categoryLabel(c),
          list.filter((e) => !ctls.includes(e) && (e.tag.category || 'Unsorted') === c),
        ]),
        ['ctl', 'V5 控制词', ctls],
      ];
      for (const [k, name, tags] of groups) {
        if (!tags.length) continue;
        out.push(
          <div className="blk" key={`cat-${si}-${k}`}>
            <div className="blk-h">
              <span className="label" data-tc={k}>
                {name} · {tags.length} 个
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
  /**
   * 节标题上的"V5 控制词"按钮，点了打开点选面板。用户 10-25："只有图标太隐蔽，看不出干嘛的"：
   * 改成带字的，左边一小段"V5"和控制词 Tag 上的那一段一样，用了几个写在后面。
   * 不是 V5、这一节里也没有控制词时不显示（没用）
   */
  const ctlBtn = (si: number) => {
    const n = entries.filter(
      (e) => e.section === si && !e.automatic && matchControl(e.tag.tag),
    ).length;
    if (!v5 && !n && ctlFor !== si) return null;
    return (
      <button
        className={`btn sm ctl-entry ${ctlFor === si ? 'on' : ''} ${v5 ? '' : 'off'}`}
        aria-label="V5 控制词"
        aria-expanded={ctlFor === si}
        data-tip={
          v5
            ? '复杂度、透明背景、年代感这类 V5 专用的控制词，点选加上'
            : '当前模型不是 V5，这些控制词不起作用'
        }
        data-trigger={`ctl-${si}`}
        onClick={() => setCtlFor(ctlFor === si ? null : si)}
      >
        <span className="v5">V5</span>
        控制词
        {n > 0 && <span className="ctl-n mono">{n}</span>}
      </button>
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
  return {
    baseIndex,
    ctlBtn,
    secCopy,
    acts,
    blocksOf,
    tagsRow,
    autoRow,
    charRows,
    charTitle,
    newBlockEl,
    countTags,
    negIndex,
    charScopes,
  };
}
