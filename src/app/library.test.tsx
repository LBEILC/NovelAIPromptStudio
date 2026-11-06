// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { expect, it, vi } from 'vitest';
import { useLibraryLoading } from './library';
import { invokeResult, invokeUI } from '../lib/commands';
import type { LibraryCard } from '../shared/types';

vi.mock('../lib/commands', () => ({ invokeUI: vi.fn(), invokeResult: vi.fn() }));
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('keeps hidden events deferred and preserves loaded cards during background refresh', async () => {
  const pending: Array<(cards: LibraryCard[]) => void> = [];
  vi.mocked(invokeUI).mockImplementation((name) => {
    if (name === 'library.cards') return new Promise((resolve) => pending.push(resolve)) as never;
    return Promise.resolve({ items: [] }) as never;
  });
  vi.mocked(invokeResult).mockResolvedValue({ ok: true, items: [] } as never);
  const setLoading = vi.fn();
  const options = {
    libraryRequestsRef: { current: { all: 0, trash: 0 } },
    loadedLibraryViewsRef: { current: new Set<string>() },
    setLibraryLoadingByView: setLoading,
    setDetachedRecords: vi.fn(),
    setProjectsByView: vi.fn(),
    showToast: vi.fn(),
    hydrateProject: vi.fn(),
    setGalleryCollections: vi.fn(),
    setActiveCollectionId: vi.fn(),
  } as unknown as Omit<Parameters<typeof useLibraryLoading>[0], 'page'>;
  let library!: ReturnType<typeof useLibraryLoading>;
  function Harness({ page }: { page: Parameters<typeof useLibraryLoading>[0]['page'] }) {
    library = useLibraryLoading({ ...options, page });
    return null;
  }
  const host = document.createElement('div');
  const root = createRoot(host);
  try {
    await act(async () => root.render(<Harness page="workbench" />));
    act(() => {
      library.libraryChanged();
      library.libraryChanged();
      library.libraryChanged();
    });
    expect(invokeUI).not.toHaveBeenCalled();
    expect(invokeResult).not.toHaveBeenCalled();
    await act(async () => root.render(<Harness page="gallery" />));
    expect(pending).toHaveLength(2);
    expect(invokeResult).toHaveBeenCalledTimes(1);
    expect(setLoading.mock.calls.map(([update]) => update({}))).toEqual([
      { all: true },
      { trash: true },
    ]);
    await act(async () => {
      pending.splice(0).forEach((resolve) => resolve([]));
    });
    setLoading.mockClear();
    act(() => library.libraryChanged());
    expect(pending).toHaveLength(2);
    expect(setLoading).not.toHaveBeenCalled();
    await act(async () => {
      pending.splice(0).forEach((resolve) => resolve([]));
    });
    expect(setLoading.mock.calls.map(([update]) => update({}))).toEqual([
      { all: false },
      { trash: false },
    ]);
  } finally {
    act(() => root.unmount());
    vi.clearAllMocks();
  }
});
