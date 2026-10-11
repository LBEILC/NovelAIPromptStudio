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
  translationPrompt: 'translate',
  classificationPrompt: 'classify',
  defaultPrompts: { translation: 'translate', classification: 'classify' },
  hasApiKey: true,
  encryptionAvailable: true,
};
describe('settings domain state', () => {
  it('retains AI drafts across hidden settings sections and clears the key only after saving', async () => {
    const getAISettings = vi.fn(async () => ai);
    const saveAISettings = vi.fn(async () => ({ ...ai, model: 'draft' }));
    window.studio = { getAISettings, saveAISettings } as unknown as StudioApi;
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
  it('does not test a model after failed secure credential saving', async () => {
    const testAIModel = vi.fn();
    window.studio = {
      getAISettings: async () => ai,
      saveAISettings: async () => {
        throw new Error('安全存储不可用');
      },
      testAIModel,
    } as unknown as StudioApi;
    let state!: ReturnType<typeof useAISettings>;
    function Harness() {
      state = useAISettings();
      return null;
    }
    await act(async () => root.render(<Harness />));
    await act(async () => state.run('test'));
    expect(testAIModel).not.toHaveBeenCalled();
    expect(state.busy).toBe(false);
    expect(state.message).toBe('安全存储不可用');
  });
  it('ignores an outdated dictionary response after a new search', async () => {
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
    window.studio = { listTagCache } as unknown as StudioApi;
    let state!: ReturnType<typeof useDictionary>;
    function Harness() {
      state = useDictionary();
      return null;
    }
    act(() => root.render(<Harness />));
    await act(async () => vi.advanceTimersByTimeAsync(220));
    act(() => state.setFilters((f) => ({ ...f, query: 'new' })));
    await act(async () => vi.advanceTimersByTimeAsync(220));
    await act(async () => finishOld({ ok: true, items: [], total: 99 }));
    expect(state.total).toBe(2);
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
    window.studio = {
      getAppearanceSettings: async () => ({ ...defaultAppearance, primaryColor: 'purple' }),
      saveAppearanceSettings: async (patch: object) => ({ ...defaultAppearance, ...patch }),
    } as unknown as StudioApi;
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
