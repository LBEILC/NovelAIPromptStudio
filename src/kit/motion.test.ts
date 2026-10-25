// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { ms, useExitList, type Exiting } from './motion';

describe('useExitList', () => {
  const roots: ReturnType<typeof createRoot>[] = [];
  afterEach(() => {
    act(() => roots.splice(0).forEach((root) => root.unmount()));
    vi.useRealTimers();
    document.body.replaceChildren();
    document.documentElement.removeAttribute('style');
  });
  function mount() {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    let result: Exiting<{ id: string; value: string }>[] = [];
    const keyOf = vi.fn((item: { id: string }) => item.id);
    function Probe({ items }: { items: { id: string; value: string }[] }) {
      result = useExitList(items, keyOf);
      return null;
    }
    return {
      render: (items: { id: string; value: string }[]) =>
        act(() => root.render(createElement(Probe, { items }))),
      read: () => result,
      keyOf,
    };
  }
  it('avoids traversing unchanged inputs while updating payloads with stable keys', () => {
    const probe = mount();
    const items = Array.from({ length: 1000 }, (_, i) => ({ id: String(i), value: 'before' }));
    probe.render(items);
    const first = probe.read();
    probe.keyOf.mockClear();
    probe.render(items);
    expect(probe.keyOf).not.toHaveBeenCalled();
    expect(probe.read()).toBe(first);
    probe.render([{ id: '0', value: 'after' }]);
    expect(probe.read()[0].item.value).toBe('after');
  });
  it('keeps reinserted live data and removes entries after pending exits finish', () => {
    vi.useFakeTimers();
    document.documentElement.style.setProperty('--dur-1', '120ms');
    const probe = mount();
    probe.render([
      { id: 'a', value: 'before' },
      { id: 'b', value: 'remove' },
    ]);
    probe.render([]);
    probe.render([{ id: 'a', value: 'after' }]);
    act(() => vi.runAllTimers());
    expect(probe.read()).toEqual([{ key: 'a', item: { id: 'a', value: 'after' }, leaving: false }]);
    probe.render([]);
    act(() => vi.runAllTimers());
    expect(probe.read()).toEqual([]);
  });
});

describe('ms', () => {
  afterEach(() => document.documentElement.removeAttribute('style'));
  // 正式版的 CSS 压缩会把 240ms 写成 .24s
  it('reads durations in seconds or milliseconds, and lengths in pixels', () => {
    const html = document.documentElement.style;
    html.setProperty('--a', '.24s');
    html.setProperty('--b', '240ms');
    html.setProperty('--c', '14px');
    html.setProperty('--d', '0.5');
    expect([ms('--a'), ms('--b'), ms('--c'), ms('--d'), ms('--missing')]).toEqual([
      240, 240, 14, 0.5, 0,
    ]);
  });
});
