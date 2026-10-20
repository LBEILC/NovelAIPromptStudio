// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { Dictionary } from './Dictionary';
import { NotificationProvider } from '../kit/toast';

const save = vi.hoisted(() => vi.fn(async () => true));
vi.mock('../state/dictionary', async (original) => {
  const actual = await original<typeof import('../state/dictionary')>();
  const items = [{ tag: 'rain', translation: '雨', category: 'Unsorted', usage_count: 1 }];
  return {
    ...actual,
    useDictionary: () => ({
      items,
      allItems: items,
      filters: { query: '', category: '', view: 'all', sort: 'usage' },
      counts: { all: 1, untranslated: 0, unsorted: 1, ai: 0, manual: 0 },
      total: 1,
      selected: [],
      loading: false,
      busy: false,
      running: false,
      aiReady: false,
      error: '',
      save,
    }),
  };
});

it('dictionary inline editing ignores composing Enter and saves a completed Enter', async () => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  document.documentElement.dataset.motion = 'off';
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () =>
      root.render(
        <NotificationProvider>
          <Dictionary />
        </NotificationProvider>,
      ),
    );
    act(() => host.querySelector<HTMLElement>('[data-dxrow] [data-tip="点击修改"]')!.click());
    const input = host.querySelector<HTMLInputElement>('[data-dxrow] input')!;
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(
        input,
        '阵雨',
      );
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() =>
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, isComposing: true }),
      ),
    );
    expect(save).not.toHaveBeenCalled();
    expect(host.querySelector('[data-dxrow] input')).toBe(input);
    await act(async () => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(save).toHaveBeenCalledWith('rain', { translation: '阵雨' });
  } finally {
    act(() => root.unmount());
    host.remove();
  }
});
