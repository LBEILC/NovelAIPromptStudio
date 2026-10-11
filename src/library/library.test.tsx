// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useLibraryDetail } from '../state/libraryDetail';
import { useLibraryCacheProgress } from '../state/libraryCacheProgress';
import { libraryPositivePrompt } from './Prompt';
import { createPromptStructure, formatPositivePromptForCopy } from '../lib/promptStructure.js';
import { parsePrompt } from '../lib/prompt.js';
import type { ImageRecord } from '../shared/types';
import { LibraryGrid } from './Grid';
import type { LibraryProps } from './types';
import type { LibraryCardCacheProgress } from '../shared/ipc';
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
function project(id: string, raw = '  sky, rain\r\n') {
  const metadata = { prompt_raw: raw, negative_prompt: ' lowres, blur\r\n' };
  return {
    id,
    metadata,
    tags: parsePrompt(raw),
    prompt_structure: createPromptStructure(metadata),
  } as ImageRecord;
}
it('copies an unedited base prompt exactly without negative content', () => {
  const record = project('one');
  expect(libraryPositivePrompt(record)).toBe(record.metadata.prompt_raw);
  expect(libraryPositivePrompt(record)).not.toContain('lowres');
});
it('uses the workbench character concatenation policy', () => {
  const record = project('one');
  record.prompt_structure.characters.push({
    id: 'character',
    label: 'Character 1',
    prompt_raw: ' blue hair ',
    undesired_raw: 'bad hands',
    prompt_tags: parsePrompt(' blue hair '),
    undesired_tags: [],
    center: { x: 0.5, y: 0.5 },
  });
  expect(libraryPositivePrompt(record)).toBe(formatPositivePromptForCopy(record));
  expect(libraryPositivePrompt(record)).toContain('\n|\n');
});
it('keeps the painted detail while loading and ignores late stale replies', async () => {
  const pending = new Map<string, (value: ImageRecord) => void>();
  vi.stubGlobal('studio', undefined);
  Object.defineProperty(window, 'studio', {
    configurable: true,
    value: {
      loadLibraryDetail: (id: string) =>
        new Promise<ImageRecord>((resolve) => pending.set(id, resolve)),
    },
  });
  const host = document.createElement('div');
  const root = createRoot(host);
  function Detail({ id }: { id: string }) {
    const { detail } = useLibraryDetail(id, id);
    return <span>{detail?.id}</span>;
  }
  try {
    await act(async () => root.render(<Detail id="first" />));
    await act(async () => pending.get('first')!(project('first')));
    await act(async () => root.render(<Detail id="slow" />));
    expect(host.textContent).toBe('first');
    await act(async () => root.render(<Detail id="latest" />));
    await act(async () => pending.get('latest')!(project('latest')));
    await act(async () => pending.get('slow')!(project('slow')));
    expect(host.textContent).toBe('latest');
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('handles queued scroll updates after React clears the event currentTarget', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  const host = document.createElement('div');
  const root = createRoot(host);
  const props = {
    groups: [],
    selectedGroupIds: [],
    previewGroup: null,
    contentKey: 'test',
  } as unknown as LibraryProps;
  try {
    await act(async () =>
      root.render(
        <LibraryGrid p={props} rowHeight={200} onRowHeight={() => {}} onViewer={() => {}} />,
      ),
    );
    const grid = host.querySelector<HTMLElement>('[data-library-grid]')!;
    await act(async () => {
      grid.scrollTop = 250;
      grid.dispatchEvent(new Event('scroll'));
      grid.scrollTop = 500;
      grid.dispatchEvent(new Event('scroll'));
    });
    expect(host.querySelector('[data-library-grid]')).toBe(grid);
  } finally {
    act(() => root.unmount());
    vi.unstubAllGlobals();
  }
});

it('delays cache progress and hides it on list completion without a terminal event', async () => {
  vi.useFakeTimers();
  let progress: (value: LibraryCardCacheProgress) => void = () => {};
  const unsubscribe = vi.fn();
  vi.stubGlobal('studio', {
    onLibraryCardCacheProgress: (callback: typeof progress) => {
      progress = callback;
    },
    offLibraryCardCacheProgress: unsubscribe,
  });
  const host = document.createElement('div');
  const root = createRoot(host);
  function Fixture({ loading }: { loading: boolean }) {
    const value = useLibraryCacheProgress(loading);
    return <span>{value ? `${value.completed}/${value.total}` : ''}</span>;
  }
  try {
    await act(async () => root.render(<Fixture loading />));
    act(() => progress({ completed: 12, total: 100 }));
    act(() => vi.advanceTimersByTime(299));
    expect(host.textContent).toBe('');
    act(() => vi.advanceTimersByTime(1));
    expect(host.textContent).toBe('12/100');
    await act(async () => root.render(<Fixture loading={false} />));
    expect(host.textContent).toBe('');
    act(() => progress({ completed: 90, total: 100 }));
    expect(host.textContent).toBe('');
  } finally {
    act(() => root.unmount());
    expect(unsubscribe).toHaveBeenCalledOnce();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  }
});
