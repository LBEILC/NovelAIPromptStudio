import { useEffect, useRef, useState } from 'react';
import { Icon, Kbd, isMod } from '../kit/controls';
import { invokeUI } from '../lib/commands';
import { BlurImg, type BlurImage } from '../kit/blur';
import { Swap } from '../settings/parts';
import type { Material } from '../shared/materials';
import { MaterialContent } from '../workbench/Insert';

export type Kind = 'block' | 'character' | 'vibe';

export type Vibe = {
  id: string;
  name: string;
  sources: { id: string; name: string; thumbnail: string }[];
};

export const TABS: [Kind, string, string][] = [
  ['block', '常用块', 'stack-line'],
  ['character', '角色', 'user-3-line'],
  ['vibe', 'Vibe', 'palette-line'],
];

export const NOUN: Record<Kind, string> = { block: '常用块', character: '角色', vibe: 'Vibe' };

// 名词前后接中文时，英文名词两边留空格（"搜索 Vibe 的名称"）
export const sp = (n: string) => (/^[A-Za-z]/.test(n) ? ` ${n} ` : n);

export const ROW = 3;

export type Part = 'self' | 'negative' | number;

export const UNDO_MS = 5000;

// ---------- 示例图片：按图片 id 读缩略图和名称，读过的记下来 ----------
/** thumb、image 是文件路径；rec 是图片记录，决定要不要模糊（2.37） */
export type Example = {
  id: string;
  thumb: string;
  image: string;
  rec: BlurImage;
  name: string;
  file: string;
};

export const exampleCache = new Map<string, Promise<Example | null>>();

export function loadExample(id: string) {
  let p = exampleCache.get(id);
  if (!p) {
    p = invokeUI('library.get', { id })
      .then(({ project }) =>
        project.deleted_at
          ? null
          : {
              id,
              thumb: project.thumbnail_path || project.image_path,
              image: project.image_path,
              rec: project as BlurImage,
              name: project.name || '',
              file: project.image_path.split(/[\\/]/).pop() || '',
            },
      )
      .catch(() => null);
    exampleCache.set(id, p);
  }
  return p;
}

export function useExamples(ids: string[]) {
  const [list, setList] = useState<Example[]>([]);
  const key = ids.join(',');
  useEffect(() => {
    let live = true;
    void Promise.all(ids.map(loadExample)).then(
      (rows) => live && setList(rows.filter((x): x is Example => !!x)),
    );
    return () => {
      live = false;
    };
  }, [key]);
  return list;
}

export const contentText = (m: Material) =>
  [...m.blocks, ...(m.negativeBlocks || [])].map((b) => b.content).join('\n\n');

export const preview = (m: Material) => {
  const b = m.blocks[0];
  if (!b) return <span className="muted">没有块</span>;
  return b.type === 'tags' ? (
    <span className="mono">{b.content}</span>
  ) : (
    <span className="prose-pre">{b.content}</span>
  );
};

export const typeText = (m: Material) => {
  if (m.kind === 'character') {
    const neg = (m.negativeBlocks || []).reduce(
      (n, b) => n + (b.type === 'tags' ? b.tags.length : 0),
      0,
    );
    return `${m.blocks.length} 块${neg ? ` · 负面 ${neg} 个 Tag` : ''}`;
  }
  const b = m.blocks[0];
  return b?.type === 'tags' ? `Tag 块 · ${b.tags.length} 个` : '段落';
};

export function PeekCard({ ids, i }: { ids: string[]; i: number }) {
  const ex = useExamples(ids);
  if (!ex.length) return null;
  const k = Math.min(i, ex.length - 1);
  const e = ex[k];
  return (
    <>
      <Swap k={e.id} className="tp-img">
        <BlurImg image={e.rec} path={e.image} eye={false} alt="" />
      </Swap>
      {e.name ? (
        <b className="tp-name">{e.name}</b>
      ) : (
        <span className="tp-file mono">{e.file}</span>
      )}
      <div className="mex-peek-f">
        <span className="mex-peek-strip">
          {ex.map((y, n) => (
            <BlurImg
              key={y.id}
              image={y.rec}
              path={y.thumb}
              eye={false}
              className={n === k ? 'cur' : ''}
              alt=""
            />
          ))}
        </span>
        <span className="sp" />
        <span className="tp-state mono">
          {k + 1} / {ex.length}
        </span>
      </div>
    </>
  );
}

export function Row({
  m,
  open,
  fading,
  menuOpen,
  rename,
  peekIndex,
  onToggle,
  onRename,
  onRenameDone,
  onMenu,
  onCopy,
  onSave,
  onShowImage,
  onPeekMove,
  onPeekLeave,
}: {
  m: Material;
  open: boolean;
  fading: boolean;
  menuOpen: boolean;
  rename: string | null;
  peekIndex: number;
  onToggle: () => void;
  onRename: (text: string) => void;
  onRenameDone: (save: boolean) => void;
  onMenu: (at: [number, number]) => void;
  onCopy: () => void;
  /** 保存编辑：part 是 'self'（常用块本身）、角色的第几块或 'negative'；成功时返回 true */
  onSave: (part: Part, text: string, asNew: boolean) => Promise<boolean>;
  onShowImage?: (id: string) => void;
  onPeekMove: (id: string, n: number) => (e: React.PointerEvent<HTMLElement>) => void;
  onPeekLeave: () => void;
}) {
  const ex = useExamples(m.examples);
  const renaming = rename !== null;
  const [edit, setEdit] = useState<{ part: Part; text: string } | null>(null);
  useEffect(() => {
    if (!open) setEdit(null);
  }, [open]);
  const startEdit = (part: Part) =>
    setEdit({
      part,
      text:
        part === 'negative'
          ? (m.negativeBlocks || []).map((b) => b.content).join(', ')
          : (part === 'self' ? m.blocks[0] : m.blocks[part])?.content || '',
    });
  const editBox = (part: Part, tags: boolean) =>
    edit?.part === part ? (
      <EditBox
        text={edit.text}
        tags={tags}
        noun={NOUN[m.kind]}
        onChange={(text) => setEdit({ part, text })}
        onCancel={() => setEdit(null)}
        onSave={async (asNew) => {
          if (await onSave(part, edit.text.trim(), asNew)) setEdit(null);
        }}
      />
    ) : null;
  const editButton = (part: Part) =>
    edit ? null : (
      <button className="btn quiet sm icon" aria-label="编辑" onClick={() => startEdit(part)}>
        <Icon name="edit-line" />
      </button>
    );
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (renaming) {
      input.current?.focus();
      input.current?.select();
    }
  }, [renaming]);
  // 点到改名框以外：保存
  useEffect(() => {
    if (!renaming) return;
    const down = (e: PointerEvent) => {
      if (!(e.target instanceof Element) || !e.target.closest('.mrow-rename')) onRenameDone(true);
    };
    document.addEventListener('pointerdown', down, true);
    return () => document.removeEventListener('pointerdown', down, true);
  }, [renaming, onRenameDone]);
  return (
    <div
      className={`mrow ${open ? 'open' : ''} ${fading ? 'fading' : ''}`}
      data-key={`mr-${m.id}`}
      data-flip=""
      data-enter="fade"
    >
      <div
        className="mrow-h"
        data-mat={m.id}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onToggle();
          }
        }}
        onContextMenu={(e) => {
          if ((e.target as Element).closest('input')) return;
          e.preventDefault();
          onMenu([e.clientX, e.clientY]);
        }}
      >
        <div className="mrow-main">
          <div className="mrow-t">
            {renaming ? (
              <label className="field sm mrow-rename" onClick={(e) => e.stopPropagation()}>
                <input
                  ref={input}
                  aria-label="名称"
                  placeholder="名称"
                  value={rename}
                  autoComplete="off"
                  spellCheck={false}
                  onChange={(e) => onRename(e.target.value)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.nativeEvent.isComposing) return;
                    if (e.key === 'Enter') onRenameDone(true);
                    if (e.key === 'Escape') onRenameDone(false);
                  }}
                />
              </label>
            ) : (
              <b className="mrow-name">{m.name}</b>
            )}
            <span className="mtype">{typeText(m)}</span>
          </div>
          <div className="mrow-pre">{preview(m)}</div>
        </div>
        {ex.length > 0 && (
          <span
            className={`mex-row ${peekIndex >= 0 ? 'peeking' : ''}`}
            data-mexrow={m.id}
            onPointerMove={onPeekMove(m.id, ex.length)}
            onPointerLeave={onPeekLeave}
          >
            {ex.slice(0, ROW).map((e, i) => (
              <BlurImg
                key={e.id}
                image={e.rec}
                path={e.thumb}
                eye={false}
                className={i === peekIndex ? 'cur' : ''}
                alt=""
                draggable={false}
              />
            ))}
            {ex.length > ROW && (
              <span className={`mex-more mono ${peekIndex >= ROW ? 'cur' : ''}`}>
                +{ex.length - ROW}
              </span>
            )}
          </span>
        )}
        <span className="mrow-n">用过 {m.uses} 次</span>
        <button
          className={`btn quiet sm icon mmore ${menuOpen ? 'is-hover' : ''}`}
          aria-label="更多"
          aria-haspopup="menu"
          onClick={(e) => {
            e.stopPropagation();
            const r = e.currentTarget.getBoundingClientRect();
            onMenu([r.right, r.bottom + 4]);
          }}
        >
          <Icon name="more-2-line" />
        </button>
      </div>
      <div className={`expand ${open ? 'open' : ''}`}>
        <div>
          <div className="mrow-body">
            {open && (
              <>
                {m.kind === 'character' ? (
                  <>
                    {m.blocks.map((b, i) => (
                      <div className="mat-sub" key={i}>
                        <div className="mat-sub-h">
                          <span className="label">{b.type === 'tags' ? 'Tag 块' : '段落'}</span>
                          {edit?.part !== i && editButton(i)}
                        </div>
                        {editBox(i, b.type === 'tags') || (
                          <MaterialContent m={{ ...m, blocks: [b] }} max={Infinity} />
                        )}
                      </div>
                    ))}
                    <div className="mat-sub">
                      <div className="mat-sub-h">
                        <span className="label">负面提示词</span>
                        {edit?.part !== 'negative' && editButton('negative')}
                      </div>
                      {editBox('negative', true) ||
                        (m.negativeBlocks?.some((b) => b.type !== 'tags' || b.tags.length) ? (
                          <MaterialContent m={{ ...m, blocks: m.negativeBlocks }} max={Infinity} />
                        ) : (
                          <p className="help">没有 Tag</p>
                        ))}
                    </div>
                  </>
                ) : edit?.part === 'self' ? (
                  editBox('self', m.blocks[0]?.type === 'tags')
                ) : (
                  <MaterialContent m={m} max={Infinity} />
                )}
                {edit?.part === 'self' ? null : (
                  <>
                    <div className="mat-sub mat-ex">
                      <div className="mat-ex-h">
                        <span className="label">示例图片</span>
                      </div>
                      {ex.length ? (
                        <div className="mat-ex-list">
                          {ex.map((e) => (
                            <span className="mat-ex-it" key={e.id}>
                              <BlurImg
                                image={e.rec}
                                path={e.thumb}
                                eye={false}
                                alt=""
                                draggable={false}
                                data-tip="在图片库中查看"
                                onClick={() => onShowImage?.(e.id)}
                              />
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="help">暂无示例图片。</span>
                      )}
                    </div>
                    <div className="mat-acts">
                      <span className="sp" />
                      <button className="btn quiet sm" onClick={onCopy}>
                        <Icon name="file-copy-line" />
                        复制
                      </button>
                      {m.kind === 'block' && (
                        <button className="btn sm" onClick={() => startEdit('self')}>
                          <Icon name="edit-line" />
                          编辑
                        </button>
                      )}
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export function VibeRow({
  v,
  open,
  onToggle,
  onShowImage,
}: {
  v: Vibe;
  open: boolean;
  onToggle: () => void;
  onShowImage?: (id: string) => void;
}) {
  const first = v.sources[0];
  return (
    <div className={`mrow ${open ? 'open' : ''}`} data-key={`mr-${v.id}`} data-flip="">
      <div
        className="mrow-h"
        data-mat={v.id}
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) {
            e.preventDefault();
            onToggle();
          }
        }}
      >
        {first && (
          <span className="mrow-pic">
            <BlurImg
              image={{ id: first.id }}
              path={first.thumbnail}
              eye={false}
              alt=""
              draggable={false}
            />
          </span>
        )}
        <div className="mrow-main">
          <div className="mrow-t">
            <b className="mrow-name">{v.name}</b>
            <span className="mtype">出自 {v.sources.length} 张图片</span>
          </div>
          <div className="mrow-pre">{v.sources.map((s) => s.name).join('、')}</div>
        </div>
      </div>
      <div className={`expand ${open ? 'open' : ''}`}>
        <div>
          <div className="mrow-body">
            {open && (
              <>
                <span className="help">
                  图片里只保存了 Vibe 的编码，没有参考图本身。下面是用过它的图片。
                </span>
                <div className="mat-ex-list">
                  {v.sources.map((s) => (
                    <span className="mat-ex-it" key={s.id}>
                      <BlurImg
                        image={{ id: s.id }}
                        path={s.thumbnail}
                        eye={false}
                        alt=""
                        draggable={false}
                        data-tip={`${s.name || '图片'} · 在图片库中查看`}
                        onClick={() => onShowImage?.(s.id)}
                      />
                    </span>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * 编辑一块素材（原型 matEditBox）：素材是模板，插进提示词时复制一份，所以改这里只影响以后插入的地方；
 * 想保留原来的可以"另存为新的"。Ctrl Enter 保存，Esc 取消；Tag 写成 1.2::tag:: 带权重。
 */
export function EditBox({
  text,
  tags,
  noun,
  onChange,
  onCancel,
  onSave,
}: {
  text: string;
  tags: boolean;
  noun: string;
  onChange: (text: string) => void;
  onCancel: () => void;
  onSave: (asNew: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const ok = !!text.trim();
  const save = async (asNew: boolean) => {
    if (!ok || busy) return;
    setBusy(true);
    try {
      await onSave(asNew);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <label className={`field mat-edit ${tags ? 'mono' : ''}`}>
        <textarea
          autoFocus
          rows={tags ? 3 : 4}
          spellCheck={false}
          aria-label="素材内容"
          value={text}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'Escape') {
              e.preventDefault();
              e.stopPropagation();
              onCancel();
            } else if (e.key === 'Enter' && isMod(e)) {
              e.preventDefault();
              void save(false);
            }
          }}
        />
      </label>
      <span className="help">
        修改只影响以后插入的地方，已经用过的提示词和图片不变。
        {tags ? '' : '保存后译文需要重新生成。'}
      </span>
      <div className="mat-acts">
        <span className="help key-hint">
          <Kbd keys="Mod Enter" />
          <span>保存</span>
          <Kbd keys="Esc" />
          <span>取消</span>
        </span>
        <span className="sp" />
        <button className="btn quiet sm" onClick={onCancel}>
          取消
        </button>
        <button className="btn sm" disabled={!ok || busy} onClick={() => void save(true)}>
          另存为新的{noun}
        </button>
        <button
          className={`btn ink sm ${busy ? 'loading' : ''}`}
          disabled={!ok || busy}
          data-tip={ok ? undefined : '内容不能为空'}
          onClick={() => void save(false)}
        >
          保存
        </button>
      </div>
    </>
  );
}
