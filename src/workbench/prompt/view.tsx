import { Activity, cloneElement, isValidElement } from 'react';
import { Icon, Kbd, Seg, Stepper } from '../../kit/controls';
import { Pop } from '../../kit/layer';
import { ContextMenu, MenuPop } from '../../kit/menu';
import { FlipScope } from '../../kit/motion';
import { CATEGORY_OPTIONS } from '../../lib/prompt.js';
import { matchControl } from '../../lib/v5Controls';
import { ControlPanel } from '../Controls';
import { deleteTags } from '../edits';
import { CharacterPick, InsertPop } from '../Insert';
import { categoryLabel } from '../model';
import { RandomPop, readRandom } from '../RandomBlock';
import type { usePromptDocumentView } from './document';
import type { usePromptDrag } from './drag';
import type { usePromptRendering } from './rendering';
import { blockKey, catVar, tagRef, type EditorProps } from './shared';
import type { usePromptState } from './state';
export function renderPromptView({
  p,
  promptShown,
  promptLeaving,
  col,
  mode,
  setMode,
  textMode,
  search,
  query,
  setQuery,
  pop,
  view,
  polarity,
  setPop,
  translating,
  translate,
  entries,
  tidy,
  copyLabel,
  copyMain,
  scroll,
  docs,
  textDoc,
  blockDoc,
  paneSwap,
  docks,
  lastCount,
  moveMenu,
  setMoveMenu,
  chosen,
  setSelected,
  removeWithUndo,
  closeWeight,
  doc,
  copyItems,
  moveTargets,
  setPolarity,
  editing,
  commitEditor,
  lastEditKey,
  draft,
  v5,
  setDraft,
  catMenu,
  setCatMenu,
  setEditing,
  menu,
  setMenu,
  ctlFor,
  setCtlFor,
  baseIndex,
  pickControl,
  insert,
  setInsert,
  charPick,
  setCharPick,
  saveBlock,
  setSaveBlock,
  saveMaterial,
  drag,
  lang,
  float,
  marq,
  random,
}: Pick<
  ReturnType<typeof usePromptState> &
    ReturnType<typeof usePromptDrag> &
    ReturnType<typeof usePromptRendering> &
    ReturnType<typeof usePromptDocumentView> & { p: EditorProps },
  | 'p'
  | 'promptShown'
  | 'promptLeaving'
  | 'col'
  | 'mode'
  | 'setMode'
  | 'textMode'
  | 'search'
  | 'query'
  | 'setQuery'
  | 'pop'
  | 'view'
  | 'polarity'
  | 'setPop'
  | 'translating'
  | 'translate'
  | 'entries'
  | 'tidy'
  | 'copyLabel'
  | 'copyMain'
  | 'scroll'
  | 'docs'
  | 'textDoc'
  | 'blockDoc'
  | 'paneSwap'
  | 'docks'
  | 'lastCount'
  | 'moveMenu'
  | 'setMoveMenu'
  | 'chosen'
  | 'setSelected'
  | 'removeWithUndo'
  | 'closeWeight'
  | 'doc'
  | 'copyItems'
  | 'moveTargets'
  | 'setPolarity'
  | 'editing'
  | 'commitEditor'
  | 'lastEditKey'
  | 'draft'
  | 'v5'
  | 'setDraft'
  | 'catMenu'
  | 'setCatMenu'
  | 'setEditing'
  | 'menu'
  | 'setMenu'
  | 'ctlFor'
  | 'setCtlFor'
  | 'baseIndex'
  | 'pickControl'
  | 'insert'
  | 'setInsert'
  | 'charPick'
  | 'setCharPick'
  | 'saveBlock'
  | 'setSaveBlock'
  | 'saveMaterial'
  | 'drag'
  | 'lang'
  | 'float'
  | 'marq'
  | 'random'
>) {
  return (
    <>
      {p.header}
      <div className="swap ptab-swap">
        <Activity mode={promptShown ? 'visible' : 'hidden'}>
          <div className={`ptab-body ${promptLeaving ? 'leaving' : ''}`} data-enter="fade">
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
              <label
                className="field sm grow"
                data-tip={textMode ? '在文本里查找' : '搜索 Tag 或译文'}
              >
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
                  data-enter="fade"
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
              <span className="split" data-trigger="copy" data-feature="copy">
                <button
                  className="btn sm"
                  data-act="copy"
                  aria-label={copyLabel}
                  onClick={copyMain}
                >
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
                    {/* 当前这份排在前面：离开的叠在上面淡出，querySelector 先找到当前的 */}
                    {[...docs.filter((d) => !d.leaving), ...docs.filter((d) => d.leaving)].map(
                      ({ key, value, leaving }) => (
                        <div
                          key={key}
                          className={leaving ? 'leaving' : ''}
                          inert={leaving || undefined}
                          data-enter="fade"
                        >
                          {/* 离开的那份去掉文档根的 ref：它卸载时会把共用的 ref 清空，当前这份的拖动、框选就找不到根了 */}
                          {leaving && isValidElement(value.node)
                            ? cloneElement(value.node, { ref: null } as never)
                            : value.node}
                        </div>
                      ),
                    )}
                  </div>
                </div>
              </FlipScope>
            </div>
          </div>
        </Activity>
        {paneSwap
          .filter((x) => x.key !== 'prompt')
          .map((x) => (
            <div
              key={x.key}
              className={`ptab-body ${x.leaving ? 'leaving' : ''}`}
              data-enter="fade"
            >
              <div className="scroll ptab-scroll">{x.value?.node}</div>
            </div>
          ))}
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
        anchor={lastEditKey.current ? tagRef(lastEditKey.current) : undefined}
        trigger={lastEditKey.current ? tagRef(lastEditKey.current) : undefined}
        className="popover tag-pop"
        restoreFocus
        label="编辑 Tag"
        deps={[editing?.key]}
      >
        {editing && (
          <>
            <span
              data-command-scope={doc.scopes[editing.section]?.scope.key}
              data-command-block={editing.block}
            />
            {editing.tag.syntax_issue === 'unclosed_weight' && (
              <p className="help warn-note">
                前一段权重没写结束的 ::。V5 从这里开始新的权重，V4.5 会把前面的数字当成文字
                <button
                  className="btn quiet sm"
                  onClick={() => {
                    const e = editing;
                    setEditing(null);
                    closeWeight(e);
                  }}
                >
                  补上 ::
                </button>
              </p>
            )}
            {(() => {
              // V5 控制词：一句说明；互斥组可以直接换档位；写法不标准给"改成官方写法"；不是 V5 时提醒
              const m = matchControl(draft.tag);
              if (!m) return null;
              return (
                <div className="ctl-pop">
                  <div className="ctl-pop-h">
                    <span className={`v5-badge ${v5 ? '' : 'off'}`}>V5</span>
                    <b>{m.name}</b>
                    <span className="muted">控制词</span>
                  </div>
                  <p className="help">{m.item.help}</p>
                  {m.group.exclusive && (
                    <Seg
                      label={m.group.label}
                      items={m.group.items.map((x) => [x.tag, x.short] as const)}
                      value={m.item.tag}
                      onChange={(tag) => setDraft({ ...draft, tag, translation: '' })}
                    />
                  )}
                  {m.nonstandard && (
                    <p className="help warn-note">
                      官方写法是 <span className="mono">{m.item.tag}</span>
                      <button
                        className="btn quiet sm"
                        onClick={() => setDraft({ ...draft, tag: m.item.tag })}
                      >
                        改成官方写法
                      </button>
                    </p>
                  )}
                  {!v5 && <p className="help warn-note">当前模型不是 V5，这个词不起控制作用</p>}
                </div>
              );
            })()}
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
                <Stepper
                  value={draft.weight}
                  step={0.1}
                  min={-10}
                  max={10}
                  digits={2}
                  fallback={1}
                  label="权重"
                  format={(v) => v.toFixed(Math.abs(v * 10 - Math.round(v * 10)) < 1e-9 ? 1 : 2)}
                  onChange={(weight) => setDraft({ ...draft, weight })}
                />
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
      <ControlPanel
        open={ctlFor != null && !!doc.scopes[ctlFor]}
        onClose={() => setCtlFor(null)}
        anchor={`[data-trigger="ctl-${ctlFor ?? baseIndex}"]`}
        tags={entries.filter((e) => e.section === ctlFor && !e.automatic).map((e) => e.tag.tag)}
        v5={v5}
        onPick={(g, x) => ctlFor != null && pickControl(ctlFor, g, x)}
      />
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
      <RandomPop
        open={!!random.edit && !!doc.scopes[random.edit.si]}
        anchor={random.edit?.anchor}
        editing={random.edit?.bi !== undefined}
        initial={
          random.edit?.bi !== undefined
            ? readRandom(doc.scopes[random.edit.si]?.blocks[random.edit.bi])
            : null
        }
        pools={random.pools}
        onClose={() => random.setEdit(null)}
        onSave={random.commit}
        onManage={() => p.onShowMaterials?.('pool')}
      />
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
        // 套一层显示语言的类：只显示原文 / 译文时，拖着走的那个也一样
        <span className={lang}>
          <span
            ref={float}
            className={`tag dragging drag-float ${drag.cls}`}
            data-tc={drag.tc}
            style={{ width: drag.w, height: drag.h }}
            dangerouslySetInnerHTML={{ __html: drag.inner }}
          />
        </span>
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
