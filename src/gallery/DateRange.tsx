// 日期范围选择（doc/design.md 2.21）：筛选浮层里的子浮层。左边快捷选项，点一下生效并关闭；右边月历。
// 点一天定开始、再点一天定结束（比开始早就对调），中间连成一条底；定了开始还没定结束时，指针移到哪天就预览到哪天。
// 有图片的日子下面一个小点，悬停"导入了 N 张"。上面两个框可以直接打字，回车或移开生效，格式不对变回原来的值并标红一下。
// 键盘：方向键一天、上下一周、PageUp / PageDown 换月、回车选中；Esc 只关它。日期按本机时区。
import { useEffect, useState } from 'react';
import { Pop } from '../kit/layer';
import { Icon } from '../kit/controls';
import { GALLERY_DATE_PRESETS } from '../lib/galleryFilters.js';
import {
  dateRangeValues,
  localDateKey,
  monthCells,
  moveDate,
  orderedRange,
  parseDateKey,
} from '../lib/dateRange.js';
import type { GalleryFilters } from '../shared/types';

type Range = Pick<GalleryFilters, 'datePreset' | 'dateFrom' | 'dateTo'>;
const QUICK = (
  GALLERY_DATE_PRESETS as { value: GalleryFilters['datePreset']; label: string }[]
).filter((q) => q.value !== 'custom');
const addMonth = (ym: string, n: number) => {
  const [y, m] = ym.split('-').map(Number),
    t = new Date(y, m - 1 + n, 1);
  return localDateKey(t).slice(0, 7);
};

export function DateRangePop({
  open,
  onClose,
  anchor,
  value,
  onChange,
  loadDays,
}: {
  open: boolean;
  onClose: () => void;
  anchor: string;
  value: Range;
  onChange: (patch: Partial<GalleryFilters>) => void;
  loadDays: (month: string) => Promise<Record<string, number>>;
}) {
  return (
    <Pop
      open={open}
      onClose={onClose}
      anchor={anchor}
      trigger={anchor}
      className="popover lsp lcal"
      label="选择时间范围"
    >
      <Calendar value={value} onChange={onChange} onClose={onClose} loadDays={loadDays} />
    </Pop>
  );
}

function Calendar({
  value,
  onChange,
  onClose,
  loadDays,
}: {
  value: Range;
  onChange: (patch: Partial<GalleryFilters>) => void;
  onClose: () => void;
  loadDays: (month: string) => Promise<Record<string, number>>;
}) {
  const today = localDateKey(new Date());
  const [from0, to0] = dateRangeValues(value);
  const end = to0 || today;
  const [month, setMonth] = useState(end.slice(0, 7));
  const [mode, setMode] = useState<'day' | 'month' | 'year'>('day');
  const [start, setStart] = useState('');
  const [hover, setHover] = useState('');
  const [focus, setFocus] = useState(end);
  const [kb, setKb] = useState(false);
  const [err, setErr] = useState<'' | 'from' | 'to'>('');
  const [inputs, setInputs] = useState({ from: from0, to: to0 });
  const [days, setDays] = useState<Record<string, number>>({});
  useEffect(() => setInputs({ from: from0, to: to0 }), [from0, to0]);
  useEffect(() => {
    let live = true;
    void loadDays(month)
      .then((d) => live && setDays(d))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [month, loadDays]);
  const set = (from: string, to: string) => {
    [from, to] = orderedRange(from, to);
    onChange({ datePreset: 'custom', dateFrom: from, dateTo: to });
  };
  const pick = (d: string) => {
    setFocus(d);
    if (!start) {
      setStart(d);
      setHover(d);
      return;
    }
    setStart('');
    setHover('');
    set(start, d);
  };
  const applyInput = (k: 'from' | 'to', raw: string) => {
    const v = raw.trim(),
      cur = k === 'from' ? from0 : to0;
    if (v === cur) return;
    if (!parseDateKey(v)) {
      setErr(k);
      setInputs({ from: from0, to: to0 });
      setTimeout(() => setErr(''), 600);
      return;
    }
    const from = k === 'from' ? v : from0 || v,
      to = k === 'to' ? v : to0 || v;
    setStart('');
    setMonth((k === 'from' ? from : to).slice(0, 7));
    setFocus(v);
    set(from, to);
  };
  let [a, b] = [from0, to0];
  if (start) [a, b] = orderedRange(start, hover || start);
  const [y, m] = month.split('-').map(Number),
    y0 = Math.floor(y / 12) * 12;
  const title =
    mode === 'day' ? `${y} 年 ${m} 月` : mode === 'month' ? `${y} 年` : `${y0} – ${y0 + 11}`;
  const nav = (n: number) => {
    if (mode === 'day') setMonth(addMonth(month, n));
    else setMonth(`${y + n * (mode === 'month' ? 1 : 12)}${month.slice(4)}`);
  };
  const keys = (e: React.KeyboardEvent) => {
    if ((e.target as Element).matches('input')) return;
    if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(e.key)) {
      e.preventDefault();
      const next = moveDate(focus, e.key);
      setFocus(next);
      setMonth(next.slice(0, 7));
      setMode('day');
      setKb(true);
      if (start) setHover(next);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      setKb(true);
      pick(focus);
    }
  };
  const input = (k: 'from' | 'to', ph: string) => (
    <label className={`field sm mono ${err === k ? 'is-error' : ''}`}>
      <input
        value={inputs[k]}
        placeholder={ph}
        maxLength={10}
        autoComplete="off"
        spellCheck={false}
        aria-label={ph}
        onChange={(e) => setInputs({ ...inputs, [k]: e.target.value })}
        onBlur={(e) => applyInput(k, e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            applyInput(k, e.currentTarget.value);
          }
        }}
      />
    </label>
  );
  let body;
  if (mode === 'day')
    body = (
      <>
        <div className="lcal-week">
          {'一二三四五六日'.split('').map((w) => (
            <span key={w}>{w}</span>
          ))}
        </div>
        <div className="lcal-grid" role="grid" aria-label={title}>
          {monthCells(month).map((d: string, i: number) => {
            if (!d) return <span key={`e${i}`} />;
            const n = days[d] || 0;
            const cls = [
              d === a && 'start',
              d === b && 'end',
              a && d > a && d < b && 'mid',
              d === today && 'today',
              kb && d === focus && 'focus',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button
                key={d}
                className={`lcal-d ${cls}`}
                data-tip={n ? `导入了 ${n} 张` : undefined}
                tabIndex={d === focus ? 0 : -1}
                onClick={() => pick(d)}
                onPointerEnter={() => start && setHover(d)}
              >
                <span>{Number(d.slice(8))}</span>
                {n > 0 && <i className="dot" />}
              </button>
            );
          })}
        </div>
      </>
    );
  else if (mode === 'month')
    body = (
      <div className="lcal-pick">
        {Array.from({ length: 12 }, (_, i) => (
          <button
            key={i}
            className={i + 1 === m ? 'on' : ''}
            onClick={() => {
              setMonth(`${y}-${String(i + 1).padStart(2, '0')}`);
              setMode('day');
            }}
          >
            {i + 1} 月
          </button>
        ))}
      </div>
    );
  else
    body = (
      <div className="lcal-pick">
        {Array.from({ length: 12 }, (_, i) => (
          <button
            key={i}
            className={`mono ${y0 + i === y ? 'on' : ''}`}
            onClick={() => {
              setMonth(`${y0 + i}${month.slice(4)}`);
              setMode('month');
            }}
          >
            {y0 + i}
          </button>
        ))}
      </div>
    );
  return (
    <>
      <div className="lcal-quick">
        {QUICK.map((q) => (
          <button
            key={q.value}
            className={`mi ${value.datePreset === q.value ? 'on' : ''}`}
            onClick={() => {
              onChange({ datePreset: q.value, dateFrom: '', dateTo: '' });
              onClose();
            }}
          >
            {q.label}
          </button>
        ))}
      </div>
      <div className="lcal-main" onKeyDown={keys}>
        <div className="lcal-inputs">
          {input('from', '开始日期')}
          <span className="muted">至</span>
          {input('to', '结束日期')}
        </div>
        <div className="lcal-head">
          <button className="btn quiet sm icon" aria-label="上一页" onClick={() => nav(-1)}>
            <Icon name="arrow-left-s-line" />
          </button>
          <button
            className="lcal-title"
            disabled={mode === 'year'}
            onClick={() => setMode(mode === 'day' ? 'month' : 'year')}
          >
            {title}
          </button>
          <button className="btn quiet sm icon" aria-label="下一页" onClick={() => nav(1)}>
            <Icon name="arrow-right-s-line" />
          </button>
        </div>
        <div className="swap lcal-body">
          <div
            key={`${mode}-${mode === 'day' ? month : mode === 'month' ? y : y0}`}
            data-enter="fade"
          >
            {body}
          </div>
        </div>
      </div>
    </>
  );
}
