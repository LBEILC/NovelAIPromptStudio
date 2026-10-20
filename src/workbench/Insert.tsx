// 插入常用块，和"添加角色"旁边的箭头（doc/design.md 2.25）：在两块之间、或空角色里点"常用块"，浮层里可以搜索，↑ ↓ 选、回车插入。
// 每行第一行是名称、类型和"用过 N 次"，第二行是内容的前两行、右边几张示例小图；刚打开时不高亮，指针或方向键所在的那一行用悬停的底色。
// 停在名称或内容上弹出完整内容，停在小图上弹出示例图片的预览，两个不同时出现，都贴在浮层左边。
import { useEffect, useRef, useState } from 'react';
import { invokeUI } from '../lib/commands';
import { mediaUrl } from '../lib/imageStage.js';
import { CAT_VAR } from '../kit/categories';
import { Icon, Kbd } from '../kit/controls';
import { Pop, type Place } from '../kit/layer';
import { useNotifications } from '../kit/toast';
import type { Material } from '../shared/materials';
import type { TagCategory } from '../shared/types';

const ROW = 3;
const examplesCache = new Map<string, Promise<string>>();
function exampleSrc(id: string) {
  let p = examplesCache.get(id);
  if (!p) {
    p = invokeUI('library.get', { id }).then((r) =>
      mediaUrl(r.project.thumbnail_path || r.project.image_path),
    );
    examplesCache.set(id, p);
    p.catch(() => examplesCache.delete(id));
  }
  return p;
}
function Example({
  id,
  onPeek,
  cur,
}: {
  id: string;
  onPeek?: (src: string) => void;
  cur?: boolean;
}) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    let live = true;
    void exampleSrc(id)
      .then((s) => live && setSrc(s))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [id]);
  return src ? (
    <img
      className={cur ? 'cur' : ''}
      src={src}
      alt=""
      draggable={false}
      onPointerEnter={() => onPeek?.(src)}
    />
  ) : null;
}
const typeOf = (m: Material) =>
  m.kind === 'character'
    ? `${m.blocks.length} 块`
    : m.blocks[0]?.type === 'tags'
      ? `Tag 块 · ${m.blocks[0].tags.length} 个`
      : '段落';
const matText = (m: Material) =>
  m.blocks.map((b) => (b.type === 'tags' ? b.content : b.content)).join('\n\n');

/** 一块素材的完整内容：Tag 带圆点、译文和权重（超过 24 个写"还有 N 个"）；段落是原文加译文 */
export function MaterialContent({ m, max = 24 }: { m: Material; max?: number }) {
  return (
    <>
      {m.blocks.map((b, i) =>
        b.type === 'tags' ? (
          <div className="tags" key={i}>
            {b.tags.slice(0, max).map((t, k) => (
              <span className="tag ro" key={k}>
                <span
                  className="dot"
                  style={{
                    background: `var(--cat-${CAT_VAR[(t.category as TagCategory) || 'Unsorted'] || 'unsorted'})`,
                  }}
                />
                <span className="t">
                  <span className="en">{t.tag}</span>
                  {t.translation && <span className="zh">{t.translation}</span>}
                </span>
                {t.weight !== 1 && <span className="w">{t.weight}</span>}
              </span>
            ))}
            {b.tags.length > max && (
              <span className="tag ghost">还有 {b.tags.length - max} 个</span>
            )}
          </div>
        ) : (
          <div key={i}>
            <p className="prose">{b.content}</p>
            {b.translation && <p className="trans">{b.translation}</p>}
          </div>
        ),
      )}
    </>
  );
}

export function InsertPop({
  open,
  onClose,
  anchor,
  tabId,
  scope,
  before,
  flush,
  onManage,
  kind = 'block',
  place,
}: {
  open: boolean;
  onClose: () => void;
  anchor: string;
  tabId: string;
  scope?: string;
  before?: number;
  flush?: () => Promise<void>;
  onManage?: () => void;
  /** 常用块，或者"添加角色"旁边的箭头：从素材里选一个角色 */
  kind?: 'block' | 'character';
  place?: Place;
}) {
  const notify = useNotifications();
  const noun = kind === 'character' ? '角色' : '常用块';
  const [items, setItems] = useState<Material[]>([]);
  const [q, setQ] = useState('');
  const [pick, setPick] = useState(-1);
  const [peek, setPeek] = useState<{ id: string; kind: 'text' | 'img'; src?: string } | null>(null);
  const timer = useRef(0);
  useEffect(() => {
    if (!open) return;
    setQ('');
    setPick(-1);
    setPeek(null);
    void invokeUI('material.list', {})
      .then((r) => setItems(r.items.filter((x) => x.kind === kind)))
      .catch((e) => notify({ text: (e as Error).message, tone: 'error' }));
  }, [open]);
  const list = items.filter(
    (m) => !q.trim() || `${m.name}\n${matText(m)}`.toLowerCase().includes(q.trim().toLowerCase()),
  );
  const insert = async (m: Material) => {
    try {
      await flush?.();
      await invokeUI(
        'material.insert',
        kind === 'character' ? { tabId, id: m.id } : { tabId, id: m.id, scope, before },
      );
      onClose();
    } catch (e) {
      notify({ text: (e as Error).message, tone: 'error' });
    }
  };
  const peekText = (id: string) => {
    clearTimeout(timer.current);
    if (peek) setPeek({ id, kind: 'text' });
    else timer.current = window.setTimeout(() => setPeek({ id, kind: 'text' }), 500);
  };
  const unpeek = () => {
    clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setPeek(null), 80);
  };
  const peeked = peek && items.find((m) => m.id === peek.id);
  return (
    <>
      <Pop
        open={open}
        onClose={onClose}
        anchor={anchor}
        trigger={anchor}
        className="popover ins-pop"
        place={place}
        label={kind === 'character' ? '从素材添加角色' : '插入常用块'}
        deps={[list.length]}
      >
        <label className="field sm">
          <Icon name="search-line" />
          <input
            autoFocus
            value={q}
            placeholder={`搜索${noun}`}
            aria-label={`搜索${noun}`}
            autoComplete="off"
            spellCheck={false}
            onChange={(e) => {
              setQ(e.target.value);
              setPick(-1);
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                if (list.length)
                  setPick(
                    (v) =>
                      (v +
                        (e.key === 'ArrowDown' ? 1 : -1) +
                        list.length +
                        (v < 0 && e.key === 'ArrowUp' ? 1 : 0)) %
                      list.length,
                  );
              } else if (e.key === 'Enter' && list[pick]) {
                e.preventDefault();
                void insert(list[pick]);
              }
            }}
          />
        </label>
        <div className="ins-list" data-scroll="" role="listbox" aria-label={noun}>
          {list.length ? (
            list.map((m, i) => (
              <div
                key={m.id}
                className={`ins-row ${i === pick ? 'on' : ''}`}
                data-insrow={m.id}
                role="option"
                aria-selected={i === pick}
                onPointerEnter={() => setPick(i)}
                onClick={() => void insert(m)}
              >
                <div className="ir-h">
                  <span
                    className="ir-t"
                    onPointerEnter={() => peekText(m.id)}
                    onPointerLeave={unpeek}
                  >
                    <b>{m.name}</b>
                    <span className="muted">{typeOf(m)}</span>
                  </span>
                  <span className="sp" />
                  <span className="muted mono">用过 {m.uses} 次</span>
                </div>
                <div className="ir-b">
                  <span
                    className={`ir-p ${m.blocks[0]?.type === 'tags' ? 'mono' : ''}`}
                    onPointerEnter={() => peekText(m.id)}
                    onPointerLeave={unpeek}
                  >
                    {matText(m)}
                  </span>
                  {m.examples.length > 0 && (
                    <span className="mex-row" onPointerLeave={unpeek}>
                      {m.examples.slice(0, ROW).map((id) => (
                        <Example
                          key={id}
                          id={id}
                          cur={peek?.kind === 'img' && peek.id === m.id}
                          onPeek={(src) => {
                            clearTimeout(timer.current);
                            setPeek({ id: m.id, kind: 'img', src });
                          }}
                        />
                      ))}
                      {m.examples.length > ROW && (
                        <span className="mex-more mono">+{m.examples.length - ROW}</span>
                      )}
                    </span>
                  )}
                </div>
              </div>
            ))
          ) : (
            <p className="help ins-empty">
              {q.trim()
                ? `没有找到匹配的${noun}`
                : kind === 'character'
                  ? '暂无保存的角色。在角色的“更多”菜单里选“存为角色”即可添加。'
                  : '暂无常用块。在块的菜单里选"存为常用块"即可添加。'}
            </p>
          )}
        </div>
        <div className="row">
          <span className="help key-hint">
            <Kbd keys="↑" />
            <Kbd keys="↓" />
            <span>选择</span>
            <Kbd keys="Enter" />
            <span>插入</span>
          </span>
          <span className="sp" />
          <button
            className="btn quiet sm"
            onClick={() => {
              onClose();
              onManage?.();
            }}
          >
            管理{noun}
          </button>
        </div>
      </Pop>
      <Pop
        open={open && !!peeked}
        onClose={() => setPeek(null)}
        anchor=".ins-pop:not(.leaving)"
        place="left-top"
        className="popover ins-peek"
        passive
        deps={[peek?.id, peek?.kind]}
      >
        {peeked &&
          (peek?.kind === 'img' ? (
            <div className="tp-img">
              <img src={peek.src} alt="" />
            </div>
          ) : (
            <>
              <div className="vp-h">
                <b>{peeked.name}</b>
                <span className="help">
                  {typeOf(peeked)} · 用过 {peeked.uses} 次
                </span>
              </div>
              <div className="ins-peek-b">
                <MaterialContent m={peeked} />
              </div>
            </>
          ))}
      </Pop>
    </>
  );
}

/** "添加角色"旁边的箭头：从素材里选一个角色，连同它的块和负面一起加进来。和常用块用同一个浮层（带示例小图） */
export function CharacterPick(p: {
  open: boolean;
  onClose: () => void;
  anchor: string;
  tabId: string;
  flush?: () => Promise<void>;
  onManage?: () => void;
}) {
  return <InsertPop {...p} kind="character" place="below-right" />;
}
