import { useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../../kit/controls';
import { type MenuEntry } from '../../kit/menu';
import { dur, useExitList, useSwap } from '../../kit/motion';
import { serializePromptSection } from '../../lib/promptDocument';
import { addPromptCharacter } from '../../lib/promptStructure.js';
import { moveTags } from '../edits';
import { reparseSection, replaceSection, scopeLabel } from '../model';
import { TextSection } from '../TextSection';
import type { usePromptDrag } from './drag';
import type { usePromptRendering } from './rendering';
import { type EditorProps } from './shared';
import type { usePromptState } from './state';
export function usePromptDocumentView({
  full,
  update,
  p,
  scroll,
  chars,
  charPick,
  setCharPick,
  docRoot,
  polarity,
  baseIndex,
  query,
  entries,
  matches,
  doc,
  ctlBtn,
  secCopy,
  acts,
  setMode,
  translate,
  blocksOf,
  tagsRow,
  autoRow,
  charRows,
  charTitle,
  setNewBlock,
  setInsert,
  newBlockEl,
  countTags,
  negIndex,
  save,
  charScopes,
  textMode,
  chosen,
  guard,
  setSelected,
}: Pick<
  ReturnType<typeof usePromptState> &
    ReturnType<typeof usePromptDrag> &
    ReturnType<typeof usePromptRendering> & { p: EditorProps },
  | 'full'
  | 'update'
  | 'p'
  | 'scroll'
  | 'chars'
  | 'charPick'
  | 'setCharPick'
  | 'docRoot'
  | 'polarity'
  | 'baseIndex'
  | 'query'
  | 'entries'
  | 'matches'
  | 'doc'
  | 'ctlBtn'
  | 'secCopy'
  | 'acts'
  | 'setMode'
  | 'translate'
  | 'blocksOf'
  | 'tagsRow'
  | 'autoRow'
  | 'charRows'
  | 'charTitle'
  | 'setNewBlock'
  | 'setInsert'
  | 'newBlockEl'
  | 'countTags'
  | 'negIndex'
  | 'save'
  | 'charScopes'
  | 'textMode'
  | 'chosen'
  | 'guard'
  | 'setSelected'
>) {
  // 删掉的角色淡出时显示它删除前最后的样子：节编号已经变了，不能再用新的提示词重画
  const charEls = useRef(new Map<string, HTMLElement>());
  const charHtml = useRef(new Map<string, string>());
  useLayoutEffect(() => {
    for (const [id, el] of charEls.current) {
      if (el.isConnected && !el.classList.contains('leaving'))
        charHtml.current.set(id, el.innerHTML);
      else if (!el.isConnected) charEls.current.delete(id);
    }
  });
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
            data-feature="characters"
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
          <div className="sec-h" data-key="base-h" data-feature="blocks">
            {chars.length ? '基础提示词' : '提示词'}
            <span className="muted">
              {query
                ? `${entries.filter((e) => e.section === baseIndex && !e.automatic && matches(e)).length} 个符合`
                : `${doc.scopes[baseIndex].blocks.length} 块`}
            </span>
            <span className="acts" style={{ marginLeft: 'auto' }}>
              {ctlBtn(baseIndex)}
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
                'text-mode',
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
        polarity === 'undesired' && ni < 0 ? null : leaving ? (
          <div
            className="char-sec leaving"
            key={`ch-${c.id}`}
            data-key={`ch-${c.id}`}
            data-flip=""
            data-exit="lift"
            aria-hidden="true"
            dangerouslySetInnerHTML={{ __html: charHtml.current.get(c.id) || '' }}
          />
        ) : (
          <div
            ref={(el) => {
              if (el) charEls.current.set(c.id, el);
            }}
            className={`char-sec ${leaving ? 'leaving' : ''}`}
            key={`ch-${c.id}`}
            data-key={`ch-${c.id}`}
            data-flip=""
            data-exit="lift"
            data-enter="fade"
            data-wb-scope={si >= 0 ? doc.scopes[si].scope.key : undefined}
          >
            {polarity !== 'undesired' && si >= 0 && (
              <>
                {charTitle(c, si)}
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
        scope={key}
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
          {si >= 0 ? charTitle(c, si) : <div className="sec-h char-h">{c.label}</div>}
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
  // 文本方式 ↔ Tag 方式、换版本都整块淡出淡入：以前换版本时 Tag 块直接换（用户 10-25）。
  // 版本按图认（和舞台的大图一样，改 Tag 时不变）；离开的那份照最后的样子留着淡出
  const docs = useSwap(
    {
      key: `${textMode ? 'text' : 'blocks'}:${p.project.image_path || ''}`,
      node: textMode ? textDoc : blockDoc,
    },
    (v) => v.key,
  );
  // 提示词 / 参数 / 参考：换内容时旧的淡出、新的淡入；提示词一直挂着（编辑的状态不丢）
  const paneSwap = useSwap(p.pane || null, (v) => v?.key || 'prompt');
  const moveTargets: MenuEntry[] = (() => {
    if (!chosen.length) return [];
    const pol = doc.scopes[chosen[0].section].scope.polarity;
    if (chosen.some((e) => doc.scopes[e.section].scope.polarity !== pol))
      return [{ label: '正面和负面的 Tag 不能一起移动', disabled: true }];
    return doc.scopes.flatMap((section, si) =>
      section.scope.polarity !== pol
        ? []
        : !section.blocks.some((b) => b.type === 'tags')
          ? // 还没有 Tag 块的节（例如空角色）：移过去成为它的第一块
            [
              {
                label: `${scopeLabel(section)} · 新的一块`,
                onSelect: () =>
                  guard(() => {
                    save(moveTags(doc, chosen, { section: si, block: -1 }));
                    setSelected([]);
                  }),
              },
            ]
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
  const promptShown = paneSwap.some((x) => x.key === 'prompt');
  const promptLeaving = paneSwap.some((x) => x.key === 'prompt' && x.leaving);
  return {
    promptShown,
    promptLeaving,
    docs,
    textDoc,
    blockDoc,
    paneSwap,
    docks,
    lastCount,
    moveMenu,
    setMoveMenu,
    moveTargets,
  };
}
