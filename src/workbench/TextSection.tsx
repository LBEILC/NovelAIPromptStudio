import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Pop } from '../kit/layer';
import { Icon } from '../kit/controls';

type Suggestion = { id: string; text: string; translation?: string; count?: string };
import { invokeUI } from '../lib/commands';
import { parseRandomMarker, randomMarkers, randomSyntaxNote } from '../lib/randomPrompt';
import type { Material } from '../shared/materials';
import { poolTip } from './RandomBlock';
import { textErrors, textMarks } from '../lib/promptText.js';
import { singleTagCore } from '../lib/singleTag.js';
import { categoryLabel } from './model';
import type { Tag } from '../shared/types';

export function TextSection({
  text,
  label,
  query,
  tags,
  onSave,
  scope,
  onCaret,
  onMenuInsert,
  onMenuRandom,
  onEditRandom,
  pools,
  negative = false,
}: {
  scope?: string;
  text: string;
  label: string;
  query: string;
  tags: Tag[];
  onSave: (value: string) => void;
  /** 用户移动光标、打字时报告光标位置（插入常用块插在这里） */
  onCaret?: (position: number) => void;
  /** 右键菜单里的"插入常用块…"：插在右键点到的位置，浮层开在指针处 */
  onMenuInsert?: (position: number, point: [number, number]) => void;
  /** 右键菜单里的"插入随机块…" */
  onMenuRandom?: (position: number, point: [number, number]) => void;
  /** 右键点在随机块上："修改随机块…"，at 是这个随机块在文字里的起点 */
  onEditRandom?: (at: number, point: [number, number]) => void;
  /** 随机池：悬停随机块时列出条目、检查池子在不在 */
  pools?: Material[];
  /** 负面提示词里不能放随机块 */
  negative?: boolean;
}) {
  const [value, setValue] = useState(text),
    [cursor, setCursor] = useState(0),
    [items, setItems] = useState<Suggestion[]>([]),
    [active, setActive] = useState(0),
    [suggest, setSuggest] = useState(false),
    [tip, setTip] = useState(''),
    // 右键菜单开着时焦点在菜单上，浏览器不画文字框的选区：由后面那层照着画，点了菜单项或别处就收掉
    [held, setHeld] = useState<[number, number] | null>(null);
  const [dictionary, setDictionary] = useState(
    new Map<string, { translation?: string; category?: string }>(),
  );
  const area = useRef<HTMLTextAreaElement>(null),
    mirror = useRef<HTMLDivElement>(null),
    caret = useRef<HTMLSpanElement>(null),
    timer = useRef<ReturnType<typeof setTimeout>>(undefined),
    pending = useRef<string | null>(null),
    save = useRef(onSave),
    lastSaved = useRef(text);
  save.current = onSave;
  const menu = useRef({ onMenuInsert, onMenuRandom, onEditRandom });
  menu.current = { onMenuInsert, onMenuRandom, onEditRandom };
  // 输入框通用的右键菜单（app/session.tsx）问一声，这里在后面加"插入常用块…"
  useEffect(() => {
    const node = area.current;
    if (!node) return;
    const add = (event: Event) => {
      const { detail } = event as CustomEvent<{
        add: (item: { key: string; label: string; onClick: () => void }, first?: boolean) => void;
        point: [number, number];
      }>;
      const m = menu.current,
        at = node.selectionStart,
        [x, y] = detail.point;
      if (node.selectionStart !== node.selectionEnd) {
        setHeld([node.selectionStart, node.selectionEnd]);
        const clear = () => setHeld(null);
        document.addEventListener('pointerdown', clear, { capture: true, once: true });
        node.addEventListener('focus', clear, { once: true });
      }
      // 右键点在随机块上：最上面一项是修改它
      const hit = [...(mirror.current?.querySelectorAll<HTMLElement>('[data-rnd]') || [])].find(
        (n) =>
          [...n.getClientRects()].some(
            (r) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom,
          ),
      );
      if (hit && m.onEditRandom) {
        const start = Number(hit.dataset.at);
        detail.add(
          {
            key: 'edit-random',
            label: '修改随机块…',
            onClick: () => menu.current.onEditRandom?.(start, detail.point),
          },
          true,
        );
      }
      if (m.onMenuInsert)
        detail.add({
          key: 'insert-material',
          label: '插入常用块…',
          onClick: () => menu.current.onMenuInsert?.(at, detail.point),
        });
      if (m.onMenuRandom)
        detail.add({
          key: 'insert-random',
          label: '插入随机块…',
          onClick: () => menu.current.onMenuRandom?.(at, detail.point),
        });
    };
    node.addEventListener('nps:text-menu', add);
    return () => node.removeEventListener('nps:text-menu', add);
  }, []);
  const commit = () => {
    clearTimeout(timer.current);
    if (pending.current !== null) {
      const next = pending.current;
      pending.current = null;
      lastSaved.current = next;
      save.current(next);
    }
  };
  const commitRef = useRef(commit);
  commitRef.current = commit;
  useEffect(() => {
    if (text === lastSaved.current) return;
    lastSaved.current = text;
    pending.current = null;
    clearTimeout(timer.current);
    setValue(text);
  }, [text]);
  useEffect(() => {
    // 只有真的有没存的文字时才同步提交（多数时候没有，免得在 React 的生命周期里调 flushSync）
    const flush = () => pending.current !== null && flushSync(() => commitRef.current());
    window.addEventListener('nps:flush-text', flush);
    return () => {
      window.removeEventListener('nps:flush-text', flush);
      commitRef.current();
    };
  }, []);
  useLayoutEffect(() => {
    const node = area.current;
    if (!node) return;
    const resize = () => {
      // 量高度时先把框缩回 auto，外面的滚动区域会因为内容变短被浏览器夹回去（长文本在底部编辑时跳回顶部，#8），量完把它的位置放回去
      let scroller = node.parentElement;
      while (scroller && !/(auto|scroll)/.test(getComputedStyle(scroller).overflowY))
        scroller = scroller.parentElement;
      const top = scroller?.scrollTop ?? 0;
      node.style.height = 'auto';
      node.style.height = `${node.scrollHeight + 2 * parseFloat(getComputedStyle(node).borderTopWidth)}px`;
      if (scroller && scroller.scrollTop !== top) scroller.scrollTop = top;
    };
    resize();
    let width = node.clientWidth;
    const observer = new ResizeObserver(() => {
      if (node.clientWidth !== width) {
        width = node.clientWidth;
        resize();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [value]);
  const change = (next: string, position: number) => {
    setValue(next);
    setCursor(position);
    pending.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => commitRef.current(), 500);
    setSuggest(true);
  };
  const head = value.slice(0, cursor),
    start = Math.max(head.lastIndexOf(','), head.lastIndexOf('\n')) + 1,
    token = head.slice(start),
    // 权重前缀（1.5::、-2::）和开头的括号不参与补全，选中候选时原样留着；
    // 只有数字、权重、符号这类没有文字的不弹补全（#11：打 1.5 时弹出一串带 1.5 的条目）
    lead = /^\s*(?:-?[\d.]+::)?[{[(]*/.exec(token)![0],
    search = token.slice(lead.length).trim();
  useEffect(() => {
    let alive = true;
    if (!suggest || !/\p{L}/u.test(search) || search.length > 80) {
      setItems([]);
      return;
    }
    const delay = setTimeout(() => {
      void invokeUI('dictionary.suggest', { query: search }).then((r) => {
        if (alive) {
          setItems(
            r.items
              // 候选只放单个标签：带逗号、换行的（整段提示词被记成了一个条目）不放（#11）
              .filter((item) => !/[,\n]/.test(item.tag))
              .slice(0, 6)
              .map((item) => ({
                id: item.tag,
                text: item.tag,
                translation: item.translation,
                count: item.count ? String(item.count) : '',
              })),
          );
          setActive(0);
        }
      });
    }, 120);
    return () => {
      alive = false;
      clearTimeout(delay);
    };
  }, [search, suggest]);
  const choose = (item: Suggestion) => {
    const next = value.slice(0, start) + lead + item.text + ', ' + value.slice(cursor);
    const position = start + lead.length + item.text.length + 2;
    change(next, position);
    setSuggest(false);
    setItems([]);
    requestAnimationFrame(() => {
      if (area.current?.value !== next) return;
      area.current?.focus();
      area.current?.setSelectionRange(position, position);
    });
  };
  // 随机块（__画师池*2__）：池子不在、条目不够、写错时，和括号不配对一样写在下面
  const lineOf = (i: number) => value.slice(0, i).split('\n').length;
  const errors = [
      ...textErrors(value),
      ...randomMarkers(value).flatMap((m) => {
        const note = randomSyntaxNote(m[0], pools, negative);
        return note ? [{ at: m.index!, msg: `第 ${lineOf(m.index!)} 行：${note}` }] : [];
      }),
    ].sort((a, b) => a.at - b.at),
    marks = textMarks(value);
  /** 悬停随机块：抽取设置一行，下面是池里的条目 */
  const randomTip = (source: string) => {
    const note = randomSyntaxNote(source, pools, negative);
    if (note) return `${note} · 右键可以修改`;
    const r = parseRandomMarker(source);
    const pool = pools?.find((x) => x.name === r.pool);
    const head = [
      `${r.pool} · 抽 ${r.count} 个`,
      ...(r.repeat ? ['可重复'] : []),
      ...(r.weight ? [`权重 ${r.weight.min}～${r.weight.max}`] : []),
    ].join(' · ');
    return [head, ...poolTip(pool, r.pool).split('\n').slice(1), '右键可以修改'].join('\n');
  };
  let at = 0;
  const parts = value.split(/([,\n])/).map((part, index) => {
    const begin = at;
    at += part.length;
    const rnd = part.trim().startsWith('__') ? part.trim() : '';
    const core = rnd ? '' : singleTagCore(part);
    const runs: ReactNode[] = [];
    const markAt = (k: number) =>
      held && k >= held[0] && k < held[1] ? `${marks[k] || ''} held` : marks[k];
    let run = '',
      kind = markAt(begin);
    const push = (key: number) => {
      if (run) {
        runs.push(
          <span className={kind} key={key}>
            {run}
          </span>,
        );
        run = '';
      }
    };
    for (let k = begin; k < at; k++) {
      if (k === cursor) {
        push(k - 0.5);
        runs.push(<span key="caret" ref={caret} />);
      }
      if (markAt(k) !== kind) {
        push(k);
        kind = markAt(k);
      }
      run += value[k];
    }
    push(at);
    return (
      <span
        key={index}
        data-text-tag={core || undefined}
        data-rnd={rnd || undefined}
        data-at={rnd ? begin + part.indexOf(rnd) : undefined}
        className={`${rnd ? 'rnd' : ''} ${errors.some((e) => e.at >= begin && e.at < at) ? 'bad' : ''} ${query && part.toLowerCase().includes(query.toLowerCase()) ? 'hit' : ''}`}
      >
        {runs}
      </span>
    );
  });
  const lookup = async (core: string) => {
    if (dictionary.has(core)) return;
    const found = await invokeUI('dictionary.lookup', { tags: [core] });
    setDictionary((previous) => new Map(previous).set(core, found.items[0] || {}));
  };
  const position = caret.current?.getBoundingClientRect();
  return (
    <>
      <div className="tx-wrap" data-wb-scope={scope}>
        <div className="tx-hl" ref={mirror} aria-hidden="true">
          {parts}
          {cursor === value.length && <span ref={caret} />}{' '}
        </div>
        <textarea
          ref={area}
          className="area tx"
          aria-label={label}
          value={value}
          spellCheck={false}
          data-tip={tip || undefined}
          onChange={(e) => {
            change(e.target.value, e.target.selectionStart);
            onCaret?.(e.target.selectionStart);
          }}
          onSelect={(e) => {
            setCursor(e.currentTarget.selectionStart);
            onCaret?.(e.currentTarget.selectionStart);
          }}
          onBlur={() => {
            commitRef.current();
            setSuggest(false);
          }}
          onMouseLeave={() => setTip('')}
          onMouseMove={(event) => {
            const hit = [
              ...(mirror.current?.querySelectorAll<HTMLElement>('[data-text-tag], [data-rnd]') ||
                []),
            ].find((node) =>
              [...node.getClientRects()].some(
                (r) =>
                  event.clientX >= r.left &&
                  event.clientX <= r.right &&
                  event.clientY >= r.top &&
                  event.clientY <= r.bottom,
              ),
            );
            if (hit?.dataset.rnd) {
              setTip(randomTip(hit.dataset.rnd));
              return;
            }
            const core = hit?.dataset.textTag;
            if (!core) {
              setTip('');
              return;
            }
            const known = tags.find((t) => t.tag === core) || dictionary.get(core);
            setTip(
              known?.category
                ? `${known.translation || '没有译文'} · ${categoryLabel(known.category)}`
                : '不在词典里',
            );
            void lookup(core);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Escape') {
              setSuggest(false);
              event.stopPropagation();
            }
            if (items.length && suggest) {
              if (['ArrowUp', 'ArrowDown'].includes(event.key)) {
                event.preventDefault();
                setActive(
                  (active + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length,
                );
              }
              if (['Enter', 'Tab'].includes(event.key)) {
                event.preventDefault();
                choose(items[active]);
              }
            }
          }}
        />
      </div>
      {!!errors.length && (
        <div className="tx-err" role="status" data-enter="fade">
          <Icon name="alert-line" />
          {errors[0].msg}
          {errors.length > 1 ? `，另外还有 ${errors.length - 1} 处` : ''}
        </div>
      )}
      <Pop
        open={suggest && !!items.length}
        onClose={() => setSuggest(false)}
        point={position ? [position.left, position.bottom + 4] : undefined}
        anchor={area}
        className="menu complete"
        style={{ minWidth: 'var(--complete-min-w)' }}
        passive
        deps={[items.length, position?.left, position?.bottom]}
      >
        {items.map((item, i) => (
          <div
            key={item.id}
            className={`mi ${i === active ? 'on' : ''}`}
            onPointerDown={(e) => e.preventDefault()}
            onPointerEnter={() => setActive(i)}
            onClick={() => choose(item)}
          >
            <span className="en" data-tip-overflow={item.text}>
              {item.text}
            </span>
            <span className="zh">{item.translation}</span>
          </div>
        ))}
      </Pop>
    </>
  );
}
