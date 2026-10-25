import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { dur } from '../../kit/motion';
import { blockTips } from '../../kit/tip';
import { type PromptDocument } from '../../lib/promptDocument';
import { moveTags } from '../edits';
import { type DocumentTag } from '../model';
import { blockKey, findTag } from './shared';
import type { usePromptState } from './state';
let dragging = false;
blockTips(() => dragging);
export function usePromptDrag({
  textMode,
  tidy,
  view,
  entries,
  doc,
  selected,
  chosen,
  setEditing,
  guard,
  save,
  setSelected,
}: Pick<
  ReturnType<typeof usePromptState>,
  | 'textMode'
  | 'tidy'
  | 'view'
  | 'entries'
  | 'doc'
  | 'selected'
  | 'chosen'
  | 'setEditing'
  | 'guard'
  | 'save'
  | 'setSelected'
>) {
  // ---------- 拖动 Tag ----------
  const scroll = useRef<HTMLDivElement>(null);
  const docRoot = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{
    keys: string[];
    from: string;
    to: string;
    index: number;
    /** 原来的位置；拖出提示词栏时回到这里，松手就是取消 */
    home: number;
    out?: boolean;
    w: number;
    h: number;
    inner: string;
    /** 原 Tag 的样式类（V5 控制词的 ctl / off、语法问题的 warn）和分类色，浮起来的那个照样带上 */
    cls: string;
    tc?: string;
  } | null>(null);
  const float = useRef<HTMLSpanElement>(null);
  const dragRef = useRef(drag);
  dragRef.current = drag;
  // 按下的信息放在 ref 里：拖动开始会重画，effect 每次重画都会重新执行，局部变量会被清掉
  const pressRef = useRef<{
    e: DocumentTag;
    el: HTMLElement;
    x: number;
    y: number;
    offX: number;
    offY: number;
  } | null>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const swallowRef = useRef(false);
  useEffect(() => {
    const down = (ev: PointerEvent) => {
      const el = (ev.target as Element).closest<HTMLElement>('[data-tag-key]');
      if (
        ev.button !== 0 ||
        !el ||
        ev.ctrlKey ||
        ev.metaKey ||
        ev.shiftKey ||
        textMode ||
        tidy.active ||
        view.viewMode === 'category'
      )
        return;
      if (!scroll.current?.contains(el) || el.closest('.tag.ro')) return;
      const e = entries.find((x) => x.key === el.dataset.tagKey);
      if (!e) return;
      const r = el.getBoundingClientRect();
      pressRef.current = {
        e,
        el,
        x: ev.clientX,
        y: ev.clientY,
        offX: ev.clientX - r.left,
        offY: ev.clientY - r.top,
      };
      ev.preventDefault();
    };
    const place = () => {
      const d = dragRef.current,
        sc = scroll.current,
        fl = float.current;
      if (!d || !sc || !fl || !pressRef.current) return;
      const cr = sc.getBoundingClientRect();
      const margin = 24,
        p0 = posRef.current;
      if (
        p0.x < cr.left - margin ||
        p0.x > cr.right + margin ||
        p0.y < cr.top - margin ||
        p0.y > cr.bottom + margin
      ) {
        if (!d.out) setDrag({ ...d, to: d.from, index: d.home, out: true });
        fl.style.left = `${p0.x - pressRef.current.offX}px`;
        fl.style.top = `${p0.y - pressRef.current.offY}px`;
        return;
      }
      const x = Math.max(
          cr.left,
          Math.min(cr.right - d.w, posRef.current.x - pressRef.current.offX),
        ),
        y = Math.max(cr.top, Math.min(cr.bottom - d.h, posRef.current.y - pressRef.current.offY));
      fl.style.left = `${x}px`;
      fl.style.top = `${y}px`;
      // 落点按被拖的那一个自己的位置（中心）判断，不按指针
      const cx = x + d.w / 2,
        cy = y + d.h / 2;
      const pol = doc.scopes[pressRef.current.e.section].scope.polarity;
      let best: { box: HTMLElement; dist: number } | null = null;
      for (const box of sc.querySelectorAll<HTMLElement>('[data-drop]')) {
        const [si] = box.dataset.drop!.split(':').map(Number);
        if (doc.scopes[si]?.scope.polarity !== pol) continue;
        const br = box.getBoundingClientRect();
        const dist = cy < br.top ? br.top - cy : cy > br.bottom ? cy - br.bottom : 0;
        if (!best || dist < best.dist) best = { box, dist };
      }
      if (best) {
        const to = best.box.dataset.drop!;
        const items = [...best.box.querySelectorAll<HTMLElement>(':scope > [data-tag-key]')].filter(
          (n) => !d.keys.includes(n.dataset.tagKey!),
        );
        let index = items.length;
        for (let i = 0; i < items.length; i++) {
          const r = items[i].getBoundingClientRect();
          if (cy < r.top) {
            index = i;
            break;
          }
          if (cy <= r.bottom && cx < r.left + r.width / 2) {
            index = i;
            break;
          }
        }
        if (to !== d.to || index !== d.index || d.out) setDrag({ ...d, to, index, out: false });
      }
      const edge = 32;
      if (posRef.current.y < cr.top + edge) sc.scrollTop -= 8;
      else if (posRef.current.y > cr.bottom - edge) sc.scrollTop += 8;
    };
    const move = (ev: PointerEvent) => {
      if (!pressRef.current) return;
      posRef.current = { x: ev.clientX, y: ev.clientY };
      if (!dragRef.current) {
        if (Math.hypot(ev.clientX - pressRef.current.x, ev.clientY - pressRef.current.y) < 4)
          return;
        const r = pressRef.current.el.getBoundingClientRect();
        const keys =
          selected.includes(pressRef.current.e.key) && chosen.length > 1
            ? chosen.map((c) => c.key)
            : [pressRef.current.e.key];
        dragging = true;
        document.documentElement.classList.add('is-dragging');
        getSelection()?.removeAllRanges();
        setEditing(null);
        const from = blockKey(pressRef.current.e.section, pressRef.current.e.block);
        const list = entries.filter(
          (x) =>
            x.section === pressRef.current!.e.section &&
            x.block === pressRef.current!.e.block &&
            !keys.includes(x.key),
        );
        const idx = list.findIndex((x) => x.index > pressRef.current!.e.index);
        setDrag({
          keys,
          from,
          to: from,
          index: idx < 0 ? list.length : idx,
          home: idx < 0 ? list.length : idx,
          w: r.width,
          h: r.height,
          inner: pressRef.current.el.innerHTML,
          cls: ['ctl', 'off', 'warn']
            .filter((c) => pressRef.current!.el.classList.contains(c))
            .join(' '),
          tc: pressRef.current.el.dataset.tc,
        });
        return;
      }
      place();
    };
    const finish = (cancel: boolean) => {
      const d = dragRef.current,
        pr = pressRef.current;
      pressRef.current = null;
      dragging = false;
      document.documentElement.classList.remove('is-dragging');
      if (!d || !pr) return;
      // 只吞掉松手那一下紧跟着的点击
      swallowRef.current = true;
      setTimeout(() => (swallowRef.current = false), 0);
      const commit = () => {
        setDrag(null);
        if (cancel || d.out || (d.keys.length === 1 && d.to === d.from && d.index === d.home))
          return;
        const [si, bi] = d.to.split(':').map(Number);
        const moving = entries.filter((x) => d.keys.includes(x.key));
        const remaining = entries.filter(
          (x) => x.section === si && x.block === bi && !d.keys.includes(x.key),
        );
        const index =
          d.index < remaining.length
            ? remaining[d.index].index
            : entries.filter((x) => x.section === si && x.block === bi).length;
        guard(() => {
          const next = moveTags(doc, moving, { section: si, block: bi, index });
          // 放回原处（或换来换去结果一样）不算改动（用户 10-21）
          const text = (x: PromptDocument) =>
            JSON.stringify(x.scopes.map((s) => [s.separators, s.blocks.map((b) => b.content)]));
          if (text(next) !== text(doc)) save(next);
        });
      };
      const slot = scroll.current?.querySelector<HTMLElement>('.tag.slot'),
        fl = float.current;
      if (!slot || !fl || !dur(3)) return commit();
      const sr = slot.getBoundingClientRect();
      fl.style.transition =
        'left var(--dur-3) var(--ease-move), top var(--dur-3) var(--ease-move), transform var(--dur-3) var(--ease-move), box-shadow var(--dur-3) var(--ease-move)';
      fl.classList.add('landing');
      fl.style.left = `${sr.left}px`;
      fl.style.top = `${sr.top}px`;
      setTimeout(commit, dur(3));
    };
    const up = () => {
      if (pressRef.current && !dragRef.current) pressRef.current = null;
      else finish(false);
    };
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && dragRef.current) {
        ev.stopPropagation();
        setDrag((d) => (d ? { ...d, to: d.from, index: d.home } : d));
        finish(true);
      }
    };
    const click = (ev: MouseEvent) => {
      if (!swallowRef.current) return;
      swallowRef.current = false;
      ev.stopPropagation();
      ev.preventDefault();
    };
    const sc = scroll.current;
    sc?.addEventListener('pointerdown', down);
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    addEventListener('keydown', key, true);
    addEventListener('click', click, true);
    return () => {
      sc?.removeEventListener('pointerdown', down);
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      removeEventListener('keydown', key, true);
      removeEventListener('click', click, true);
    };
  });
  useLayoutEffect(() => {
    if (!drag || !float.current) return;
    const el = float.current;
    if (!el.style.left) {
      const src = findTag(scroll.current, drag.keys[0]);
      const r = src?.getBoundingClientRect();
      if (r) {
        el.style.left = `${r.left}px`;
        el.style.top = `${r.top}px`;
      }
    }
  }, [!!drag]);

  // ---------- 框选：从空白处拖动；按住 Ctrl / Cmd / Shift 是加选；只点一下空白处取消 ----------
  const [marq, setMarq] = useState<{ l: number; t: number; w: number; h: number } | null>(null);
  const marqRef = useRef<{
    sx: number;
    sy: number;
    st: number;
    base: string[];
    on: boolean;
    px: number;
    py: number;
  } | null>(null);
  useEffect(() => {
    const sc = scroll.current;
    if (!sc) return;
    const update = () => {
      if (!marqRef.current?.on) return;
      const top = marqRef.current.sy - (sc.scrollTop - marqRef.current.st);
      const l = Math.min(marqRef.current.sx, marqRef.current.px),
        t = Math.min(top, marqRef.current.py),
        r = Math.max(marqRef.current.sx, marqRef.current.px),
        b = Math.max(top, marqRef.current.py);
      setMarq({ l, t, w: r - l, h: b - t });
      const hits = [...sc.querySelectorAll<HTMLElement>('[data-tag-key]')]
        .filter((n) => {
          const q = n.getBoundingClientRect();
          return q.right > l && q.left < r && q.bottom > t && q.top < b;
        })
        .map((n) => n.dataset.tagKey!);
      setSelected([...new Set([...marqRef.current.base, ...hits])]);
    };
    const down = (e: PointerEvent) => {
      if (e.button !== 0 || textMode || tidy.active) return;
      const t = e.target as Element;
      if (
        !t.closest('.doc') ||
        t.closest(
          '.tag, input, textarea, button, .para-view, .editor, [role="button"], .sec-h span, .auto-row, .blk-gap',
        )
      )
        return;
      e.preventDefault();
      marqRef.current = {
        sx: e.clientX,
        sy: e.clientY,
        st: sc.scrollTop,
        base: e.ctrlKey || e.metaKey || e.shiftKey ? [...selected] : [],
        on: false,
        px: e.clientX,
        py: e.clientY,
      };
    };
    const move = (e: PointerEvent) => {
      if (!marqRef.current) return;
      if (
        !marqRef.current.on &&
        Math.hypot(e.clientX - marqRef.current.sx, e.clientY - marqRef.current.sy) < 4
      )
        return;
      marqRef.current.on = true;
      marqRef.current.px = e.clientX;
      marqRef.current.py = e.clientY;
      document.documentElement.classList.add('is-dragging');
      const cr = sc.getBoundingClientRect();
      if (e.clientY < cr.top + 24) sc.scrollTop -= 8;
      else if (e.clientY > cr.bottom - 24) sc.scrollTop += 8;
      update();
    };
    const up = () => {
      if (!marqRef.current) return;
      if (!marqRef.current.on && selected.length && !marqRef.current.base.length) setSelected([]);
      if (marqRef.current.on) {
        const swallow = (ev: MouseEvent) => {
          ev.stopPropagation();
          ev.preventDefault();
        };
        addEventListener('click', swallow, { capture: true, once: true });
        setTimeout(() => removeEventListener('click', swallow, { capture: true }), 0);
      }
      marqRef.current = null;
      setMarq(null);
      document.documentElement.classList.remove('is-dragging');
    };
    const onScroll = () => update();
    sc.addEventListener('pointerdown', down);
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
    sc.addEventListener('scroll', onScroll);
    return () => {
      sc.removeEventListener('pointerdown', down);
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
      sc.removeEventListener('scroll', onScroll);
    };
  });
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (
        e.key === 'Escape' &&
        selected.length &&
        !(e.target as Element)?.closest?.('input, textarea')
      )
        setSelected([]);
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });
  return { scroll, drag, docRoot, float, marq };
}
