import { useEffect, useRef, useState } from 'react';
import { Button, Input, SurfaceButton } from './controls';
import { Popover } from './overlays';
import { TransitionSurface } from './transitions';
import { GALLERY_DATE_PRESETS } from '../lib/galleryFilters.js';
import {
  dateRangeLabel,
  dateRangeValues,
  localDateKey,
  monthCells,
  moveDate,
  orderedRange,
  parseDateKey,
} from '../lib/dateRange.js';
import type { GalleryFilters } from '../shared/types';
import './dateRange.css';

type Range = Pick<GalleryFilters, 'datePreset' | 'dateFrom' | 'dateTo'>;
export function DateRange({
  value,
  onChange,
  loadDays,
}: {
  value: Range;
  onChange: (value: Range) => void;
  loadDays?: (month: string) => Promise<Record<string, number>>;
}) {
  const anchor = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(localDateKey(new Date()).slice(0, 7));
  const [mode, setMode] = useState<'day' | 'month' | 'year'>('day');
  const [start, setStart] = useState('');
  const [hover, setHover] = useState('');
  const [focus, setFocus] = useState('');
  const [keyboard, setKeyboard] = useState(false);
  const [fields, setFields] = useState<string[]>(['', '']);
  const [error, setError] = useState(-1);
  const errorTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loadError, setLoadError] = useState('');
  const today = localDateKey(new Date());
  const range = dateRangeValues(value);
  const [from, to] = start ? orderedRange(start, hover || start) : range;
  const [year, index] = month.split('-').map(Number);
  const yearStart = Math.floor(year / 12) * 12;
  useEffect(() => () => clearTimeout(errorTimer.current), []);
  useEffect(() => {
    if (!open) return;
    const dates = dateRangeValues(value);
    setFields(dates);
  }, [open, value.datePreset, value.dateFrom, value.dateTo]);
  useEffect(() => {
    if (!open || !loadDays) return;
    let active = true;
    setCounts({});
    setLoadError('');
    void loadDays(month)
      .then((days) => {
        if (active) setCounts(days);
      })
      .catch((e: Error) => {
        if (active) setLoadError(e.message);
      });
    return () => {
      active = false;
    };
  }, [open, month, loadDays]);
  const show = () => {
    if (open) {
      setOpen(false);
      return;
    }
    const end = range[1] || today;
    setMonth(end.slice(0, 7));
    setFocus(end);
    setMode('day');
    setStart('');
    setHover('');
    setKeyboard(false);
    setError(-1);
    setOpen(true);
  };
  const apply = (a: string, b: string) => {
    const [dateFrom, dateTo] = orderedRange(a, b);
    onChange({ datePreset: 'custom', dateFrom, dateTo });
    setFields([dateFrom, dateTo]);
    setStart('');
    setHover('');
  };
  const pick = (day: string) => {
    setFocus(day);
    if (!start) {
      setStart(day);
      setHover(day);
    } else apply(start, day);
  };
  const commitField = (i: number) => {
    if (!parseDateKey(fields[i])) {
      setFields(range);
      setError(i);
      clearTimeout(errorTimer.current);
      errorTimer.current = setTimeout(() => setError(-1), 600);
      return;
    }
    const other = fields[1 - i];
    apply(
      i === 0 ? fields[i] : parseDateKey(other) ? other : fields[i],
      i === 1 ? fields[i] : parseDateKey(other) ? other : fields[i],
    );
    setMonth(fields[i].slice(0, 7));
    setFocus(fields[i]);
  };
  const nav = (amount: number) => {
    const date = new Date(year, index - 1, 1);
    if (mode === 'day') date.setMonth(date.getMonth() + amount);
    else date.setFullYear(year + amount * (mode === 'year' ? 12 : 1));
    setMonth(localDateKey(date).slice(0, 7));
  };
  return (
    <>
      <Button ref={anchor} aria-label="导入时间" aria-expanded={open} onClick={show}>
        <i className="ri-calendar-line" />
        <span className={value.datePreset === 'custom' ? 'nps-date-mono' : ''}>
          {dateRangeLabel(value)}
        </span>
        <i className="ri-arrow-down-s-line" />
      </Button>
      <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} label="日期范围">
        <div
          className="nps-date-range"
          onKeyDown={(event) => {
            if ((event.target as HTMLElement).closest('input') || event.key === 'Escape') return;
            if (
              ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown'].includes(
                event.key,
              )
            ) {
              event.preventDefault();
              event.stopPropagation();
              const day = moveDate(focus || today, event.key);
              setFocus(day);
              setMonth(day.slice(0, 7));
              setMode('day');
              setKeyboard(true);
              if (start) setHover(day);
            } else if (event.key === 'Enter' && keyboard) {
              event.preventDefault();
              event.stopPropagation();
              pick(focus);
            }
          }}
        >
          <div className="nps-date-quick">
            {GALLERY_DATE_PRESETS.filter((p) => p.value !== 'custom').map((preset) => (
              <SurfaceButton
                type="button"
                key={preset.value}
                className={value.datePreset === preset.value ? 'on' : ''}
                onClick={() => {
                  onChange({
                    datePreset: preset.value as Range['datePreset'],
                    dateFrom: '',
                    dateTo: '',
                  });
                  setOpen(false);
                }}
              >
                {preset.label}
              </SurfaceButton>
            ))}
          </div>
          <div className="nps-date-main">
            <div className="nps-date-inputs">
              {[0, 1].map((i) => (
                <span key={i}>
                  {i === 1 && <span className="nps-help">至</span>}
                  <Input
                    aria-label={i === 0 ? '开始日期' : '结束日期'}
                    placeholder={i === 0 ? '开始日期' : '结束日期'}
                    value={fields[i]}
                    maxLength={10}
                    autoComplete="off"
                    spellCheck={false}
                    aria-invalid={error === i}
                    className={`nps-date-mono ${error === i ? 'nps-field-error' : ''}`}
                    onChange={(e) =>
                      setFields((old) => old.map((v, at) => (at === i ? e.target.value : v)))
                    }
                    onBlur={() => {
                      if (fields[i] !== range[i]) commitField(i);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                        e.preventDefault();
                        commitField(i);
                      }
                    }}
                  />
                </span>
              ))}
            </div>
            <div className="nps-date-head">
              <Button variant="quiet" size="small" aria-label="上一页" onClick={() => nav(-1)}>
                <i className="ri-arrow-left-s-line" />
              </Button>
              <SurfaceButton
                type="button"
                className="nps-date-title"
                disabled={mode === 'year'}
                onClick={() => setMode(mode === 'day' ? 'month' : 'year')}
              >
                {mode === 'day'
                  ? `${year} 年 ${index} 月`
                  : mode === 'month'
                    ? `${year} 年`
                    : `${yearStart} – ${yearStart + 11}`}
              </SurfaceButton>
              <Button variant="quiet" size="small" aria-label="下一页" onClick={() => nav(1)}>
                <i className="ri-arrow-right-s-line" />
              </Button>
            </div>
            <TransitionSurface
              change={`${mode}-${mode === 'year' ? yearStart : month}`}
              className="nps-date-body"
            >
              {mode === 'day' ? (
                <>
                  <div className="nps-date-week">
                    {Array.from('一二三四五六日').map((day) => (
                      <span key={day}>{day}</span>
                    ))}
                  </div>
                  <div className="nps-date-grid">
                    {monthCells(month).map((day: string, i: number) =>
                      day ? (
                        <SurfaceButton
                          key={day}
                          type="button"
                          data-date={day}
                          aria-label={day}
                          data-tip={counts[day] ? `导入了 ${counts[day]} 张` : undefined}
                          className={`nps-date-day ${day === from ? 'start' : ''} ${day === to ? 'end' : ''} ${from && day > from && day < to ? 'mid' : ''} ${day === today ? 'today' : ''} ${keyboard && day === focus ? 'focus' : ''}`}
                          onPointerEnter={() => {
                            if (start) setHover(day);
                          }}
                          onClick={() => {
                            setKeyboard(false);
                            pick(day);
                          }}
                        >
                          <span>{Number(day.slice(-2))}</span>
                          {!!counts[day] && <i className="dot" />}
                        </SurfaceButton>
                      ) : (
                        <span key={`blank-${i}`} />
                      ),
                    )}
                  </div>
                </>
              ) : (
                <div className="nps-date-pick">
                  {Array.from({ length: 12 }, (_, i) => (
                    <SurfaceButton
                      type="button"
                      key={i}
                      className={
                        (mode === 'month' ? index === i + 1 : year === yearStart + i) ? 'on' : ''
                      }
                      onClick={() => {
                        setMonth(
                          mode === 'month'
                            ? `${year}-${String(i + 1).padStart(2, '0')}`
                            : `${yearStart + i}-${String(index).padStart(2, '0')}`,
                        );
                        setMode(mode === 'month' ? 'day' : 'month');
                      }}
                    >
                      {mode === 'month' ? `${i + 1} 月` : yearStart + i}
                    </SurfaceButton>
                  ))}
                </div>
              )}
            </TransitionSurface>
            {loadError && <span role="alert">{loadError}</span>}
          </div>
        </div>
      </Popover>
    </>
  );
}
