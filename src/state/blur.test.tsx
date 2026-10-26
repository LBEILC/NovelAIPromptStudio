// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import type { CommandEvent } from '../shared/commands';
import type { BlurSettings, LibraryCard, NsfwState } from '../shared/types';
import type { StudioApi } from '../shared/ipc';
import { useLibraryState } from './library';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
it('retains event states for old image objects and updates cards without refetching', async () => {
  const { useBlurSettings, useNsfwState } = await import('./blur');
  const listeners = new Set<(event: CommandEvent) => void>();
  let finish!: (value: unknown) => void;
  const invoke = vi.fn(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  window.studio = {
    invoke,
    onCommandEvent: (listener: (event: CommandEvent) => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  } as unknown as StudioApi;
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const original = { id: 'synthetic', nsfw: { value: false, source: 'auto' } as NsfwState };
  let blur: BlurSettings | null = null,
    image: NsfwState | null = null;
  let library!: ReturnType<typeof useLibraryState>;
  function Harness() {
    blur = useBlurSettings();
    image = useNsfwState(original);
    library = useLibraryState();
    return null;
  }
  try {
    await act(async () => root.render(<Harness />));
    expect(blur).toBeNull();
    expect(image).toEqual(original.nsfw);
    act(() => library.setProjectsByView({ all: [original as LibraryCard], trash: [] }));
    const settings: BlurSettings = {
      mode: 'nsfw',
      quickAll: true,
      words: ['nsfw'],
      defaultWords: ['nsfw'],
    };
    act(() => {
      for (const listener of listeners) {
        listener({ type: 'blur', settings });
        listener({
          type: 'nsfw-changed',
          states: { synthetic: { value: true, source: 'manual' } },
        });
      }
    });
    await act(async () => finish({ ok: true, data: { ...settings, quickAll: false } }));
    expect(blur).toEqual(settings);
    expect(image).toEqual({ value: true, source: 'manual' });
    expect(original.nsfw.value).toBe(false);
    expect(library.projectsByView.all[0].nsfw.value).toBe(true);
    expect(invoke).toHaveBeenCalledTimes(1);
    expect(invoke.mock.calls[0]).toEqual(['settings.blur.get', {}]);
    await act(async () => root.render(<Harness />));
    expect(image).toEqual({ value: true, source: 'manual' });
  } finally {
    act(() => root.unmount());
    host.remove();
    delete window.studio;
  }
});
