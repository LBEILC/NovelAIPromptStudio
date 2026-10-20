// @vitest-environment happy-dom
import { Activity, act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { StudioApi } from '../shared/ipc';
import { useAISettings } from './ai';
import { useDictionary } from './dictionary';
import { AppearanceProvider, defaultAppearance, useAppearance } from './appearance';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete window.studio;
  document.documentElement.removeAttribute('style');
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
const ai = {
  baseUrl: 'https://example.test/v1',
  model: 'saved',
  hasApiKey: true,
  encryptionAvailable: true,
};
function mockStudio(handlers: Record<string, (input: any) => unknown>): StudioApi {
  return {
    invoke: async (name: string, input: unknown) => ({
      ok: true,
      data: await handlers[name]?.(input),
    }),
    onCommandEvent: () => () => {},
  } as unknown as StudioApi;
}
describe('settings domain state', () => {
  it('ignores stale appearance saves and the initial read after a newer choice', async () => {
    vi.stubGlobal('matchMedia', () => ({
      matches: false,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    type Settings = typeof defaultAppearance;
    let load!: (settings: Settings) => void;
    const saves: ((settings: Settings) => void)[] = [];
    window.studio = mockStudio({
      'settings.appearance.get': (input: any) =>
        (() =>
          new Promise<Settings>((resolve) => {
            load = resolve;
          }))(),
      'settings.appearance.save': (input: any) =>
        (() =>
          new Promise<Settings>((resolve) => {
            saves.push(resolve);
          }))(),
    });
    let state!: ReturnType<typeof useAppearance>;
    function Harness() {
      state = useAppearance();
      return null;
    }
    await act(async () =>
      root.render(
        <AppearanceProvider>
          <Harness />
        </AppearanceProvider>,
      ),
    );
    let first!: Promise<void>, last!: Promise<void>;
    act(() => {
      first = state.changeAppearance({ themeMode: 'light' });
      last = state.changeAppearance({ themeMode: 'dark' });
    });
    await act(async () => {
      saves[1]({ ...defaultAppearance, themeMode: 'dark' });
      await last;
    });
    await act(async () => {
      saves[0]({ ...defaultAppearance, themeMode: 'light' });
      load({ ...defaultAppearance, themeMode: 'light' });
      await first;
    });
    expect(state.appearance.themeMode).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
  });
  it.each([false, true])(
    'preserves drafts when the initial AI read arrives late (switch=%s)',
    async (switchSection) => {
      const pending: ((value: typeof ai) => void)[] = [];
      window.studio = mockStudio({
        'settings.ai.get': (input: any) =>
          (() => new Promise((resolve) => pending.push(resolve)))(),
      });
      let state!: ReturnType<typeof useAISettings>;
      function Harness() {
        state = useAISettings();
        return null;
      }
      const render = async (mode: 'visible' | 'hidden') => {
        await act(async () =>
          root.render(
            <Activity mode={mode}>
              <Harness />
            </Activity>,
          ),
        );
      };
      await render('visible');
      const draft = {
        baseUrl: 'https://draft.test/v1',
        model: 'draft',
        apiKey: 'secret',
      };
      act(() => state.setSettings((s) => ({ ...s, ...draft })));
      if (switchSection) {
        await render('hidden');
        await render('visible');
      }
      expect(pending).toHaveLength(switchSection ? 2 : 1);
      await act(async () => [...pending].reverse().forEach((resolve) => resolve(ai)));
      expect(state.settings).toMatchObject({ ...ai, ...draft });
    },
  );
  it('retains AI drafts across hidden settings sections and clears the key only after saving', async () => {
    const getAISettings = vi.fn(async () => ai);
    const saveAISettings = vi.fn(async (_settings: unknown) => ({ ...ai, model: 'draft' }));
    window.studio = mockStudio({
      'settings.ai.get': (input: any) => getAISettings(),
      'settings.ai.save': (input: any) => saveAISettings(input.settings),
    });
    let state!: ReturnType<typeof useAISettings>;
    function Harness() {
      state = useAISettings();
      return null;
    }
    await act(async () =>
      root.render(
        <Activity mode="visible">
          <Harness />
        </Activity>,
      ),
    );
    act(() => state.setSettings((s) => ({ ...s, model: 'draft', apiKey: 'secret' })));
    await act(async () =>
      root.render(
        <Activity mode="hidden">
          <Harness />
        </Activity>,
      ),
    );
    await act(async () =>
      root.render(
        <Activity mode="visible">
          <Harness />
        </Activity>,
      ),
    );
    expect(getAISettings).toHaveBeenCalledTimes(1);
    expect(state.settings).toMatchObject({ model: 'draft', apiKey: 'secret' });
    await act(async () => state.run('save'));
    expect(saveAISettings).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'draft', apiKey: 'secret' }),
    );
    expect(state.settings.apiKey).toBe('');
  });
  it.each([false, true])(
    'keeps cleared fields and newer saves ahead of an initial read (save=%s)',
    async (saveFirst) => {
      let resolveRead!: (value: typeof ai) => void;
      window.studio = mockStudio({
        'settings.ai.get': (input: any) =>
          (() =>
            new Promise((resolve) => {
              resolveRead = resolve;
            }))(),
        'settings.ai.save': (input: any) => (async () => ({ ...ai, model: '' }))(),
      });
      let state!: ReturnType<typeof useAISettings>;
      function Harness() {
        state = useAISettings();
        return null;
      }
      await act(async () => root.render(<Harness />));
      act(() => state.setSettings((s) => ({ ...s, model: 'temporary', apiKey: 'secret' })));
      act(() => state.setSettings((s) => ({ ...s, model: '' })));
      if (saveFirst) await act(async () => state.run('save'));
      await act(async () => resolveRead(ai));
      expect(state.settings).toEqual({ ...ai, model: '', apiKey: saveFirst ? '' : 'secret' });
    },
  );
  it('does not test a model after failed secure credential saving', async () => {
    const testAIModel = vi.fn();
    window.studio = mockStudio({
      'settings.ai.get': (input: any) => (async () => ai)(),
      'settings.ai.save': (input: any) =>
        (async () => {
          throw new Error('安全存储不可用');
        })(),
      'ai.test': (input: any) => testAIModel(),
    });
    let state!: ReturnType<typeof useAISettings>;
    function Harness() {
      state = useAISettings();
      return null;
    }
    await act(async () => root.render(<Harness />));
    await act(async () => state.run('test'));
    expect(testAIModel).not.toHaveBeenCalled();
    expect(state.busy).toBe(false);
    expect(state.testResult).toEqual({ ok: false, text: '连接失败：安全存储不可用' });
  });
  it('ignores an outdated dictionary snapshot and keeps local search without another query', async () => {
    vi.useFakeTimers();
    let finishOld!: (result: unknown) => void;
    const listTagCache = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockResolvedValue({ ok: true, items: [], total: 2, limit: 200, offset: 0 });
    window.studio = mockStudio({ 'dictionary.list': (input: any) => listTagCache(input) });
    let state!: ReturnType<typeof useDictionary>;
    function Harness() {
      state = useDictionary();
      return null;
    }
    act(() => root.render(<Harness />));
    await act(async () => vi.advanceTimersByTimeAsync(220));
    await act(async () => state.refresh());
    act(() => state.setFilters((f) => ({ ...f, query: 'new' })));
    await act(async () => finishOld({ ok: true, items: [], total: 99 }));
    expect(state.total).toBe(0);
    expect(listTagCache).toHaveBeenCalledTimes(2);
    expect(state.filters.query).toBe('new');
  });
  it('shares the resolved theme and applies the saved prose font', async () => {
    const media = new Map<
      string,
      {
        matches: boolean;
        listeners: Set<() => void>;
        addEventListener: (_: string, fn: () => void) => void;
        removeEventListener: (_: string, fn: () => void) => void;
      }
    >();
    vi.stubGlobal('matchMedia', (query: string) => {
      if (!media.has(query)) {
        const listeners = new Set<() => void>();
        media.set(query, {
          matches: false,
          listeners,
          addEventListener: (_, fn) => {
            listeners.add(fn);
          },
          removeEventListener: (_, fn) => {
            listeners.delete(fn);
          },
        });
      }
      return media.get(query);
    });
    window.studio = mockStudio({
      'settings.appearance.get': (input: any) =>
        (async () => ({ ...defaultAppearance, primaryColor: 'purple' }))(),
      'settings.appearance.save': (input: any) =>
        (async (patch: object) => ({ ...defaultAppearance, ...patch }))(input.settings),
    });
    let state!: ReturnType<typeof useAppearance>;
    function Harness() {
      state = useAppearance();
      return null;
    }
    await act(async () =>
      root.render(
        <AppearanceProvider>
          <Harness />
        </AppearanceProvider>,
      ),
    );
    expect(state.appearance.primaryColor).toBe('blue');
    expect(state.resolvedTheme).toBe('light');
    const dark = media.get('(prefers-color-scheme: dark)')!;
    act(() => {
      dark.matches = true;
      dark.listeners.forEach((fn) => fn());
    });
    expect(state.resolvedTheme).toBe('dark');
    expect(document.documentElement.dataset.theme).toBe('dark');
    await act(async () => state.changeAppearance({ proseFont: 'Georgia' }));
    expect(state.appearance.proseFont).toBe('Georgia');
    expect(document.documentElement.style.getPropertyValue('--font-prose')).toContain('"Georgia"');
  });
});
