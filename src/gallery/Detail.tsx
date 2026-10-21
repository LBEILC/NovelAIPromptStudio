// 图片库的详情栏（doc/design.md 2.13、2.15）：只读显示提示词，可以直接复制。
// 尺寸、模型、Vibe、导入日期和文件名；步数、引导、Seed 不在这里显示。提示词的结构照工作台（各节、多块和段落），只读。
// 多选时是"已选 N 组 · M 张"和叠放的封面。
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Kbd } from '../kit/controls';
import { useNotifications } from '../kit/toast';
import { useSwap } from '../kit/motion';
import { writeClipboardText } from '../lib/clipboard';
import { mediaUrl } from '../lib/imageStage.js';
import { hasImageName, imageFileName, imageAccessibleName } from '../lib/imageNaming.js';
import { createPromptDocument, type PromptBlock } from '../lib/promptDocument';
import { dimensions, libraryCountText, modelDisplayName } from '../library/presentation';
import { libraryPositivePrompt } from '../library/Prompt';
import type { ImageRecord, Tag, TagCategory } from '../shared/types';
import type { LibraryGroup, LibraryProps } from '../library/types';

export { CAT_VAR, CAT_NAME } from '../kit/categories';
import { CAT_VAR, CAT_NAME } from '../kit/categories';
const thumb = (c: { thumbnail_path?: string; image_path: string }) =>
  mediaUrl(c.thumbnail_path || c.image_path);
const STRIP_ROW = 6;

export interface DetailActions {
  onViewer: (group: LibraryGroup, member?: ImageRecord) => void;
  onCollect: () => void;
  onNameAI: (groups: LibraryGroup[]) => void;
  collectOpen: boolean;
  colRef: React.RefObject<HTMLDivElement | null>;
  handle: React.ReactNode;
}

export function Detail({
  p,
  detail,
  a,
}: {
  p: LibraryProps;
  detail: ImageRecord | null;
  a: DetailActions;
}) {
  if (p.selectedGroupIds.length) return <Summary p={p} a={a} />;
  if (!detail || !p.previewGroup)
    return (
      <div className="col detail" ref={a.colRef}>
        {a.handle}
      </div>
    );
  return <One p={p} detail={detail} group={p.previewGroup} a={a} />;
}

function One({
  p,
  detail,
  group,
  a,
}: {
  p: LibraryProps;
  detail: ImageRecord;
  group: LibraryGroup;
  a: DetailActions;
}) {
  const notify = useNotifications();
  const trash = p.view === 'trash';
  const n = group.members.length;
  const si = Math.max(
    0,
    group.members.findIndex((m) => m.id === detail.id),
  );
  const named = hasImageName(detail);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [stripOpen, setStripOpen] = useState(false);
  const saving = useRef(false);
  useEffect(() => setEditing(false), [detail.id]);
  useEffect(() => setStripOpen(false), [group.id]);
  const startRename = () => {
    if (trash) return;
    setText(named ? detail.name : '');
    setEditing(true);
  };
  useEffect(() => {
    if (
      p.renameRequest?.id === detail.id ||
      group.members.some((m) => m.id === p.renameRequest?.id)
    )
      startRename();
  }, [p.renameRequest]);
  const commit = async (save: boolean) => {
    if (saving.current) return;
    const name = text.trim();
    if (!save || !name || name === (named ? detail.name : '')) {
      setEditing(false);
      return;
    }
    saving.current = true;
    try {
      if (
        await p.onRenameMany(
          group.members.map((m) => m.id),
          name,
        )
      )
        setEditing(false);
    } finally {
      saving.current = false;
    }
  };
  const file = imageFileName(detail);
  // 一组和单张之间切换时小图条展开或收起；收起时保留上一次的内容，下面不跳
  const lastStrip = useRef<LibraryGroup | null>(null);
  if (n > 1) lastStrip.current = group;
  const pics = useSwap(detail, (d) => d.id);
  const ids = group.members.map((m) => m.id);
  return (
    <div className="col detail" data-detail-id={detail.id} ref={a.colRef}>
      {a.handle}
      <div className="scroll">
        <div className="pic swap">
          {pics.map(({ key, value, leaving }) => (
            <img
              key={key}
              className={leaving ? 'leaving' : ''}
              data-enter="fade"
              src={mediaUrl(value.image_path)}
              alt={imageAccessibleName(value)}
              draggable={false}
              data-tip="查看大图"
              role="button"
              tabIndex={0}
              onClick={() => a.onViewer(group, detail)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  a.onViewer(group, detail);
                }
              }}
            />
          ))}
        </div>
        <div className={`expand lstrip-x ${n > 1 ? 'open' : ''}`}>
          <div>
            {lastStrip.current && (
              <Strip
                p={p}
                group={lastStrip.current}
                si={si}
                open={stripOpen}
                onToggle={() => setStripOpen(!stripOpen)}
              />
            )}
          </div>
        </div>
        <div className="caption dcap">
          {editing ? (
            <>
              <label className="field sm lname-edit">
                <input
                  autoFocus
                  ref={(el) => {
                    if (el && !el.dataset.sel) {
                      el.dataset.sel = '1';
                      el.select();
                    }
                  }}
                  value={text}
                  placeholder={n > 1 ? '为这组图片起名' : '输入名称'}
                  aria-label="名称"
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => setText(e.target.value)}
                  onBlur={() => void commit(true)}
                  onKeyDown={(e) => {
                    if (e.nativeEvent.isComposing) return;
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      void commit(true);
                    }
                    if (e.key === 'Escape') {
                      e.preventDefault();
                      e.stopPropagation();
                      void commit(false);
                    }
                  }}
                />
              </label>
              <span className="meta lname-hint">
                <span className="help key-hint">
                  <Kbd keys="Enter" />
                  <span>保存</span>
                  <Kbd keys="Esc" />
                  <span>取消</span>
                </span>
                {n > 1 && <span>{n} 张图片将按顺序编号</span>}
              </span>
            </>
          ) : (
            named && (
              <b
                className="lname selectable"
                data-tip={trash ? undefined : '重命名'}
                onClick={startRename}
              >
                {detail.name}
              </b>
            )
          )}
          {n > 1 && <span className="meta">一组 · {n} 张</span>}
          <span className="meta mono selectable">
            {dimensions(detail.metadata)}
            {detail.metadata.model && (
              <>
                {' · '}
                <span data-tip={detail.metadata.model}>
                  {modelDisplayName(detail.metadata.model)}
                </span>
              </>
            )}
            {detail.vibe_fingerprint && ` · Vibe ${detail.vibe_fingerprint.slice(0, 8)}`}
          </span>
          <span className="meta">
            {(trash ? detail.deleted_at : detail.created_at).slice(0, 10)}{' '}
            {trash ? '移入回收站' : '导入'}
          </span>
          {!named && (
            <span className="meta mono lfile selectable" data-tip-overflow={file}>
              文件 {file}
            </span>
          )}
        </div>
        <div className="stage-acts dacts">
          {trash ? (
            <>
              <button className="btn quiet sm" onClick={() => p.onRestore(ids, 'detail')}>
                <Icon name="arrow-go-back-line" />
                恢复
              </button>
              <span className="sp" />
              <button
                className="btn danger sm"
                onClick={() => p.onPermanentDelete(ids, null, 'detail')}
              >
                永久删除
              </button>
            </>
          ) : (
            <>
              <button
                className={`btn quiet sm ${a.collectOpen ? 'is-hover' : ''}`}
                data-trigger="lcollect-detail"
                onClick={a.onCollect}
              >
                <Icon name="folder-add-line" />
                加入收藏集
              </button>
              <button className="btn quiet sm" onClick={startRename}>
                <Icon name="edit-line" />
                {named ? '重命名' : '起名'}
              </button>
              <button
                className={`btn quiet sm icon ${p.aiConfigured ? '' : 'is-off'}`}
                aria-label="根据提示词起名"
                aria-disabled={!p.aiConfigured || undefined}
                data-tip={
                  p.aiConfigured
                    ? '根据提示词起名'
                    : '根据提示词起名：请先在设置的"AI 服务"中完成配置'
                }
                onClick={() => p.aiConfigured && a.onNameAI([group])}
              >
                <Icon name="sparkling-2-line" />
              </button>
              <button
                className="btn quiet sm icon"
                aria-label="在文件夹中显示"
                onClick={() => p.onReveal(detail)}
              >
                <Icon name="folder-open-line" />
              </button>
              <span className="sp" />
              <button
                className="btn danger sm icon"
                aria-label="移入回收站"
                onClick={() => p.onTrash(ids, 'detail')}
              >
                <Icon name="delete-bin-line" />
              </button>
            </>
          )}
        </div>
        <Prompt
          project={detail}
          onCopyTag={(t) => void writeClipboardText(t).then(() => notify({ text: `已复制"${t}"` }))}
        />
      </div>
      <div className="bar">
        <span className="sp" />
        <button
          className="btn"
          onClick={() =>
            void writeClipboardText(libraryPositivePrompt(detail)).then(() =>
              notify({ text: '已复制提示词' }),
            )
          }
        >
          <Icon name="file-copy-line" />
          复制提示词
        </button>
        {!trash && (
          <button className="btn ink" onClick={() => p.onOpenWorkbench(detail)}>
            在工作台打开
          </button>
        )}
      </div>
    </div>
  );
}

function Strip({
  p,
  group,
  si,
  open,
  onToggle,
}: {
  p: LibraryProps;
  group: LibraryGroup;
  si: number;
  open: boolean;
  onToggle: () => void;
}) {
  const n = group.members.length,
    fold = n > STRIP_ROW + 1;
  const th = (m: LibraryGroup['members'][number], i: number) => (
    <img
      key={m.id}
      className={i === si ? 'is-cur' : ''}
      src={thumb(m)}
      alt=""
      draggable={false}
      data-tip={`第 ${i + 1} 张`}
      onClick={() => p.onPreview(group, m)}
    />
  );
  return (
    <div className="strip lstrip">
      <div className="lstrip-row">
        {group.members.slice(0, fold ? STRIP_ROW : n).map(th)}
        {fold && (
          <button
            className={`lstrip-more ${open ? '' : 'mono'}`}
            aria-expanded={open}
            data-tip={open ? '收起' : `展开全部 ${n} 张`}
            onClick={onToggle}
          >
            {open ? <Icon name="arrow-up-s-line" /> : `+${n - STRIP_ROW}`}
          </button>
        )}
        <span className="label mono">
          {si + 1} / {n}
        </span>
      </div>
      {fold && (
        <div className={`expand ${open ? 'open' : ''}`}>
          <div>
            <div className="lstrip-rest">
              {group.members.slice(STRIP_ROW).map((m, i) => th(m, i + STRIP_ROW))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Summary({ p, a }: { p: LibraryProps; a: DetailActions }) {
  const groups = p.groups.filter((g) => p.selectedGroupIds.includes(g.id));
  return (
    <div className="col detail" ref={a.colRef}>
      {a.handle}
      <div className="scroll">
        <div className="sum" data-enter="fade">
          <b>已选 {libraryCountText(groups.length, p.selectedImageCount)}</b>
          <div className="fan">
            {groups.slice(0, 5).map((g) => (
              <img key={g.id} src={thumb(g.cover)} alt="" draggable={false} />
            ))}
          </div>
          <span className="help">
            点击图片可继续选择或取消，按住 <Kbd keys="Shift" /> 可连续选择，按 <Kbd keys="Esc" />{' '}
            退出多选
          </span>
        </div>
      </div>
      <div className="bar">
        <span className="sp" />
        <button className="btn" onClick={p.onClearSelection}>
          取消选择
        </button>
        {p.view !== 'trash' && (
          <button
            className="btn ink"
            onClick={() => {
              for (const g of groups) for (const m of g.members) p.onOpenWorkbench(m);
            }}
          >
            在工作台打开 {p.selectedImageCount} 张
          </button>
        )}
      </div>
    </div>
  );
}

/** 只读的提示词：基础提示词、每个角色、负面提示词各一节；块照工作台的样子。点 Tag 复制它。 */
export function Prompt({
  project,
  onCopyTag,
}: {
  project: ImageRecord;
  onCopyTag: (t: string) => void;
}) {
  const doc = useMemo(() => createPromptDocument(project), [project]);
  const hasChars = doc.scopes.some((s) => s.scope.kind !== 'base');
  return (
    <div className="doc selectable ddoc">
      {doc.scopes.map((section) => {
        const scope = section.scope;
        if (!scope.raw_prompt) return null;
        const neg = scope.polarity === 'undesired';
        const title =
          scope.kind === 'base'
            ? neg
              ? '负面提示词'
              : hasChars
                ? '基础提示词'
                : '提示词'
            : `${/^Character \d+$/i.test(scope.character.label) || !scope.character.label ? `角色 ${scope.characterIndex + 1}` : scope.character.label}${neg ? ' 的负面提示词' : ''}`;
        return (
          <section key={scope.key}>
            <div className="sec-h">
              {title}
              <span className="muted">{section.blocks.length} 块</span>
            </div>
            {section.blocks.map((b, i) => (
              <Block key={i} block={b} tags={scope.tags} onCopyTag={onCopyTag} />
            ))}
          </section>
        );
      })}
    </div>
  );
}
function Block({
  block,
  tags,
  onCopyTag,
}: {
  block: PromptBlock;
  tags: Tag[];
  onCopyTag: (t: string) => void;
}) {
  const [all, setAll] = useState(false);
  if (block.type !== 'tags') {
    const zh = tags.find(
      (t) => t.segment_type === 'text_block' && t.tag === block.content,
    )?.translation;
    return (
      <div className="blk">
        <div className="blk-h">
          <span className="label">段落{block.label ? ` · ${block.label}` : ''}</span>
        </div>
        <p className="prose">{block.content}</p>
        {zh && <p className="trans">{zh}</p>}
      </div>
    );
  }
  const shown = all ? block.tags : block.tags.slice(0, 8);
  return (
    <div className="blk">
      <div className="blk-h">
        <span className="label">
          TAG 块{block.label ? ` · ${block.label}` : ''} · {block.tags.length} 个
        </span>
      </div>
      <div className="tags">
        {shown.map((t, i) => {
          const ann = tags.find((x) => x.tag === t.tag);
          const cat = (ann?.category || 'Unsorted') as TagCategory;
          return (
            <span
              key={i}
              className="tag ltag"
              role="button"
              tabIndex={0}
              data-tip={`复制 · ${CAT_NAME[cat]}`}
              onClick={() => onCopyTag(t.tag)}
            >
              <span className="dot" style={{ background: `var(--cat-${CAT_VAR[cat]})` }} />
              <span className="t">
                <span className="en">{t.tag}</span>
                {ann?.translation && <span className="zh">{ann.translation}</span>}
              </span>
            </span>
          );
        })}
        {!all && block.tags.length > 8 && (
          <button className="tag ghost" onClick={() => setAll(true)}>
            还有 {block.tags.length - 8} 个
          </button>
        )}
      </div>
    </div>
  );
}
