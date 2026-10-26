// 图片库的详情栏（doc/design.md 2.13、2.15）：只读显示提示词，可以直接复制。
// 尺寸、模型、Vibe、导入日期和文件名；步数、引导、Seed 不在这里显示。提示词的结构照工作台（各节、多块和段落），只读。
// 多选时是"已选 N 组 · M 张"和叠放的封面。
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, Kbd } from '../kit/controls';
import { useNotifications } from '../kit/toast';
import { useDecoded, useSwap } from '../kit/motion';
import { writeClipboardText } from '../lib/clipboard';
import { mediaUrl } from '../lib/imageStage.js';
import { imageDisplayName, imageFileName, imageAccessibleName } from '../lib/imageNaming.js';
import { createPromptDocument, type PromptBlock } from '../lib/promptDocument';
import { dimensions, libraryCountText, modelDisplayName } from '../library/presentation';
import { libraryPositivePrompt } from '../library/Prompt';
import type { ImageRecord, Tag, TagCategory } from '../shared/types';
import type { LibraryGroup, LibraryProps } from '../library/types';
import { isGroupOrigin } from '../lib/gallery.js';

/** 缩略图等高、宽度按图自己的比例（1.5.6，用户 10-22："很多地方的比例都是直接默认竖屏的"）；太宽太窄的收在 0.5～2 */
const ratioOf = (m: { metadata?: { width?: number | null; height?: number | null } }) => {
  const { width, height } = m.metadata || {};
  return width && height ? Math.min(2, Math.max(0.5, width / height)) : 832 / 1216;
};
import { WORK_ICON, stillIn } from './Grid';
import { workLabel } from '../lib/workNames';

export { CAT_VAR, CAT_NAME } from '../kit/categories';
import { CAT_VAR, CAT_NAME } from '../kit/categories';
import { markLoaded } from '../kit/alpha';
import { BlurImg, nsfwLabel } from '../kit/blur';
import { useNsfwState } from '../state/blur';
/** 详情栏的大图：恢复备份后原图找不到（1.7.0）时用缩略图顶上 */
const picUrl = (c: { missing?: boolean; thumbnail_path?: string; image_path: string }) =>
  mediaUrl(c.missing ? c.thumbnail_path || c.image_path : c.image_path);
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
  // 一张、多选、没选三种状态在同一个栏里换内容（2.17）：以前各画一整个栏，换收藏集、开始多选时
  // 整栏直接没了再重建（用户 10-25）。换一组图也整块淡出淡入；同一组里换一张只换图（One 里的 pics）。
  // 新的一组先把图解码好再换，不然淡入时图还没画出来
  const mode = p.selectedGroupIds.length
    ? 'sum'
    : !detail || !p.previewGroup
      ? 'none'
      : `one:${p.view}:${p.previewGroup.id}`;
  const frames = useSwap(
    useDecoded(
      { mode, p, detail, group: p.previewGroup },
      (v) => v.mode,
      (v) => (v.mode.startsWith('one:') && v.detail ? picUrl(v.detail) : ''),
    ),
    (v) => v.mode,
  );
  // 正在离开的排在后面：叠在上面淡出，querySelector 先找到当前这一份
  const ordered = [...frames.filter((f) => !f.leaving), ...frames.filter((f) => f.leaving)];
  const current = frames.find((f) => !f.leaving)?.value;
  return (
    <div
      className="col detail"
      data-detail-id={current?.mode.startsWith('one:') ? current.detail?.id : undefined}
      ref={a.colRef}
    >
      {a.handle}
      <div className="swap dswap">
        {ordered.map(({ key, value, leaving }) => (
          <div
            key={key}
            className={`dframe ${leaving ? 'leaving' : ''}`}
            inert={leaving || undefined}
            data-enter="fade"
          >
            {value.mode === 'sum' ? (
              <Summary p={value.p} />
            ) : value.mode !== 'none' && value.detail && value.group ? (
              <One p={value.p} detail={value.detail} group={value.group} a={a} />
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
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
  // 生成的图自己没起名时跟着作品名（1.8.4）
  const shownName = imageDisplayName(detail);
  const named = !!shownName;
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  const [stripOpen, setStripOpen] = useState(false);
  const saving = useRef(false);
  useEffect(() => setEditing(false), [detail.id]);
  useEffect(() => setStripOpen(false), [group.id]);
  const startRename = () => {
    if (trash) return;
    setText(shownName);
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
    if (!save || !name || name === shownName) {
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
  const nsfw = useNsfwState(detail);
  // 一组和单张之间切换时小图条展开或收起；收起时保留上一次的内容，下面不跳
  const lastStrip = useRef<LibraryGroup | null>(null);
  if (n > 1) lastStrip.current = group;
  // 新图解码好了再换，不然淡入时图还没画出来，看着像闪一下
  const pics = useSwap(
    useDecoded(
      detail,
      (d) => d.id,
      (d) => picUrl(d),
    ),
    (d) => d.id,
  );
  const ids = group.members.map((m) => m.id);
  const refs = group.members.find((m) => m.id === detail.id)?.work_refs || detail.work_refs || [];
  // 回收站里不列"也是…"：放回之前点过去也看不到（去掉的记录在下面单独写）
  const others = trash ? [] : refs.filter((r) => `work:${r.workId}` !== group.id);
  const gone = group.detached;
  return (
    <>
      <div className="scroll">
        <div className="pic swap">
          {pics.map(({ key, value, leaving }) => (
            <BlurImg
              key={key}
              image={value}
              path={value.missing ? value.thumbnail_path || value.image_path : value.image_path}
              eye={leaving ? false : 'md'}
              className={`alpha-bg ${leaving ? 'leaving' : ''}`}
              data-enter="fade"
              onLoad={markLoaded}
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
          {detail.missing && (
            <span
              className="lmissing pmissing"
              data-tip="恢复备份时没有在这台电脑上找到这张图的文件，这里显示的是缩略图"
            >
              <Icon name="file-damage-line" />
              图片缺失
            </span>
          )}
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
                {shownName}
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
          {nsfwLabel(nsfw) && <span className="meta">{nsfwLabel(nsfw)}</span>}
          {gone ? (
            <span className="meta">
              {gone.detachedAt ? `${gone.detachedAt.slice(0, 10)} ` : ''}已从
              {workLabel(gone.workName, '作品')}里去掉 · {stillIn(gone)}
            </span>
          ) : (
            <span className="meta">
              {(trash ? detail.deleted_at : detail.created_at).slice(0, 10)}{' '}
              {trash ? '移入回收站' : '导入'}
            </span>
          )}
          {!named && (
            <span className="meta mono lfile selectable" data-tip-overflow={file}>
              文件 {file}
            </span>
          )}
          {/* 这张图在别的作品里的身份（1.5.6）：点一下选中图片库里的那一组，那一组不在当前结果里时去工作台打开 */}
          {others.map((r) => (
            <button
              key={r.workId + r.role}
              className="meta lalso"
              onClick={() => {
                const other = p.groups.find((g) => g.id === `work:${r.workId}`);
                if (other)
                  p.onPreview(
                    other,
                    other.members.find((m) => m.id === detail.id),
                  );
                else p.onOpenWorkbench(detail, { id: `work:${r.workId}` });
              }}
            >
              <Icon name={WORK_ICON} />
              也是{workLabel(r.workName, '另一个作品')}的
              {r.role === 'origin' ? '原图' : `第 ${r.number} 版`}
            </button>
          ))}
        </div>
        <div className="stage-acts dacts">
          {gone ? (
            <>
              <button className="btn quiet sm" onClick={() => void p.onPutBack?.([gone])}>
                <Icon name="arrow-go-back-line" />
                放回{workLabel(gone.workName, '作品')}
              </button>
              <span className="sp" />
              {/* 不叫"永久删除"：只丢掉这条记录，图还在别的作品里，什么都不从磁盘删 */}
              <button
                className="btn quiet sm"
                data-tip="丢掉这条记录，图片本身不删"
                onClick={() => void p.onDiscardDetached?.([gone])}
              >
                不再恢复
              </button>
            </>
          ) : trash ? (
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
              {/* 一组时只删正在看的这一张；整组在卡片的右键菜单里 */}
              <button
                className="btn danger sm icon"
                aria-label={n > 1 ? '把这一张移入回收站' : '移入回收站'}
                onClick={() => p.onTrash(n > 1 ? [detail.id] : ids, 'detail')}
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
          <button className="btn ink" onClick={() => p.onOpenWorkbench(detail, group)}>
            在工作台打开
          </button>
        )}
      </div>
    </>
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
  // 作品组里原图那一张左上角一个很小的作品图标（1.5.6）
  const th = (m: LibraryGroup['members'][number], i: number) => {
    const origin = isGroupOrigin(group, m);
    return (
      <span key={m.id} className={`lth ${origin ? 'origin' : ''}`}>
        <BlurImg
          image={m}
          path={m.thumbnail_path || m.image_path}
          eye={false}
          className={`alpha-bg ${i === si ? 'is-cur' : ''}`}
          onLoad={markLoaded}
          alt=""
          draggable={false}
          style={{ width: `calc(var(--strip-h) * ${ratioOf(m)})` }}
          data-tip={origin ? '原图' : `第 ${i + 1} 张`}
          onClick={() => p.onPreview(group, m)}
        />
        {origin && <Icon name={WORK_ICON} />}
      </span>
    );
  };
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

function Summary({ p }: { p: LibraryProps }) {
  const groups = p.groups.filter((g) => p.selectedGroupIds.includes(g.id));
  return (
    <>
      <div className="scroll">
        <div className="sum" data-enter="fade">
          <b>已选 {libraryCountText(groups.length, p.selectedImageCount)}</b>
          <div className="fan">
            {groups.slice(0, 5).map((g) => (
              <BlurImg
                key={g.id}
                image={g.cover}
                path={g.cover.thumbnail_path || g.cover.image_path}
                eye={false}
                className="alpha-bg"
                onLoad={markLoaded}
                alt=""
                draggable={false}
                style={{ width: `calc(var(--fan-h) * ${ratioOf(g.cover)})` }}
              />
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
              for (const g of groups) for (const m of g.members) p.onOpenWorkbench(m, g);
            }}
          >
            在工作台打开 {p.selectedImageCount} 张
          </button>
        )}
      </div>
    </>
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
              data-tc={CAT_VAR[cat]}
              onClick={() => onCopyTag(t.tag)}
            >
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
