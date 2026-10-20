import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { Pop } from '../kit/layer';
import { Icon } from '../kit/controls';

type Suggestion = { id: string; text: string; translation?: string; count?: string };
import { invokeUI } from '../lib/commands';
import { textErrors, textMarks } from '../lib/promptText.js';
import { categoryLabel } from './model';
import type { Tag } from '../shared/types';

export function TextSection({
  text,
  label,
  query,
  tags,
  onSave,
}: {
  text: string;
  label: string;
  query: string;
  tags: Tag[];
  onSave: (value: string) => void;
}) {
  const [value, setValue] = useState(text),
    [cursor, setCursor] = useState(0),
    [items, setItems] = useState<Suggestion[]>([]),
    [active, setActive] = useState(0),
    [suggest, setSuggest] = useState(false),
    [tip, setTip] = useState('');
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
    const flush = () => flushSync(() => commitRef.current());
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
      node.style.height = 'auto';
      node.style.height = `${node.scrollHeight + 2 * parseFloat(getComputedStyle(node).borderTopWidth)}px`;
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
    search = head.slice(start).trim();
  useEffect(() => {
    let alive = true;
    if (!suggest || !search || search.length > 80) {
      setItems([]);
      return;
    }
    const delay = setTimeout(() => {
      void invokeUI('dictionary.suggest', { query: search }).then((r) => {
        if (alive) {
          setItems(
            r.items.slice(0, 6).map((item) => ({
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
    const whitespace = /^\s*/.exec(value.slice(start, cursor))![0];
    const next = value.slice(0, start) + whitespace + item.text + ', ' + value.slice(cursor);
    const position = start + whitespace.length + item.text.length + 2;
    change(next, position);
    setSuggest(false);
    setItems([]);
    requestAnimationFrame(() => {
      if (area.current?.value !== next) return;
      area.current?.focus();
      area.current?.setSelectionRange(position, position);
    });
  };
  const errors = textErrors(value),
    marks = textMarks(value);
  let at = 0;
  const parts = value.split(/([,\n])/).map((part, index) => {
    const begin = at;
    at += part.length;
    const core = part
      .trim()
      .replace(/^-?[\d.]+::/, '')
      .replace(/::$/, '')
      .replace(/^[{[(]+|[}\])]+$/g, '')
      .trim();
    const isTag =
      !!core &&
      core.split(/\s+/).length <= 6 &&
      !/[.!?]$/.test(core) &&
      part !== ',' &&
      part !== '\n';
    const runs: ReactNode[] = [];
    let run = '',
      kind = marks[begin];
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
      if (marks[k] !== kind) {
        push(k);
        kind = marks[k];
      }
      run += value[k];
    }
    push(at);
    return (
      <span
        key={index}
        data-text-tag={isTag ? core : undefined}
        className={`${errors.some((e) => e.at >= begin && e.at < at) ? 'bad' : ''} ${query && part.toLowerCase().includes(query.toLowerCase()) ? 'hit' : ''}`}
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
      <div className="tx-wrap">
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
          onChange={(e) => change(e.target.value, e.target.selectionStart)}
          onSelect={(e) => setCursor(e.currentTarget.selectionStart)}
          onBlur={() => {
            commitRef.current();
            setSuggest(false);
          }}
          onMouseLeave={() => setTip('')}
          onMouseMove={(event) => {
            const hit = [
              ...(mirror.current?.querySelectorAll<HTMLElement>('[data-text-tag]') || []),
            ].find((node) =>
              [...node.getClientRects()].some(
                (r) =>
                  event.clientX >= r.left &&
                  event.clientX <= r.right &&
                  event.clientY >= r.top &&
                  event.clientY <= r.bottom,
              ),
            );
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
            <span className="en">{item.text}</span>
            <span className="zh">{item.translation}</span>
          </div>
        ))}
      </Pop>
    </>
  );
}
