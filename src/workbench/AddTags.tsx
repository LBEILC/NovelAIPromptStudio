// 添加 Tag（doc/design.md 2.14）：块末尾的虚线框，点了变成输入框；中文会找对应的英文 Tag，逗号或换行一次加多个，回车添加。
// 虚线框和输入框跟 Tag 一样高。什么都没输就离开，输入框收回去（新建的空块这时会被拿掉）。
import { useEffect, useRef, useState } from 'react';
import { invokeResult } from '../lib/commands';
import { Icon } from '../kit/controls';
import { Pop } from '../kit/layer';
import { suggestControls } from '../lib/v5Controls';

type Hit = { tag: string; translation?: string };
export function AddTags({
  onAdd,
  autoEdit = false,
  onDismiss,
  id,
}: {
  onAdd: (text: string) => void;
  autoEdit?: boolean;
  onDismiss?: () => void;
  /** 这一块的标识，补全浮层贴着它 */
  id: string;
}) {
  const [editing, setEditing] = useState(autoEdit);
  const [text, setText] = useState('');
  const [hits, setHits] = useState<Hit[]>([]);
  const [pick, setPick] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const q = text.trim();
    if (!q || /[,，\n]/.test(q)) {
      setHits([]);
      return;
    }
    let live = true;
    // V5 控制词排在最前（中文名也能找到），后面是词典的结果
    const controls = suggestControls(q, 4);
    const merge = (items: Hit[]) => {
      const seen = new Set(controls.map((c) => c.tag));
      return [...controls, ...items.filter((x) => !seen.has(x.tag))].slice(0, 6);
    };
    const t = setTimeout(() => {
      void invokeResult('dictionary.suggest', { query: q })
        .then((r) => {
          if (live && r.ok) {
            setHits(merge(r.items));
            setPick(0);
          }
        })
        .catch(() => live && setHits(controls));
    }, 120);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [text]);
  const add = (value: string) => {
    if (!value.trim()) return;
    onAdd(value.trim());
    setText('');
    setHits([]);
    requestAnimationFrame(() => input.current?.focus());
  };
  const close = () => {
    setEditing(false);
    setText('');
    setHits([]);
    onDismiss?.();
  };
  if (!editing)
    return (
      <span
        className="tag ghost"
        role="button"
        tabIndex={0}
        data-add={id}
        onClick={() => setEditing(true)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setEditing(true);
          }
        }}
      >
        <Icon name="add-line" />
        输入中文或英文
      </span>
    );
  return (
    <>
      <span className="tag input" data-add={id}>
        <input
          ref={input}
          autoFocus
          value={text}
          placeholder="输入中文或英文"
          aria-label="添加 Tag"
          autoComplete="off"
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
          onBlur={(e) => {
            if (e.relatedTarget instanceof Element && e.relatedTarget.closest('.complete')) return;
            if (!text.trim()) close();
          }}
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              if (!hits.length) return;
              e.preventDefault();
              setPick((pick + (e.key === 'ArrowDown' ? 1 : -1) + hits.length) % hits.length);
            } else if (e.key === 'Enter' || e.key === ',' || e.key === '，') {
              e.preventDefault();
              add(hits.length && text.trim() && !/[,，\n]/.test(text) ? hits[pick].tag : text);
            } else if (e.key === 'Escape') {
              e.stopPropagation();
              if (text) setText('');
              else close();
            }
          }}
        />
      </span>
      <Pop
        open={hits.length > 0 && !!text.trim()}
        onClose={() => setHits([])}
        anchor={`[data-add="${id}"]`}
        trigger={`[data-add="${id}"]`}
        className="menu complete"
        style={{ minWidth: 'var(--complete-min-w)' }}
        passive
        deps={[hits.length]}
      >
        {hits.map((h, i) => (
          <div
            key={h.tag}
            className={`mi ${i === pick ? 'on' : ''}`}
            onPointerDown={(e) => e.preventDefault()}
            onPointerEnter={() => setPick(i)}
            onClick={() => add(h.tag)}
          >
            <span className="en" data-tip-overflow={h.tag}>
              {h.tag}
            </span>
            <span className="zh">{h.translation}</span>
          </div>
        ))}
      </Pop>
    </>
  );
}
