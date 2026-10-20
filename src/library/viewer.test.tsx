// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { it, expect, vi } from 'vitest';
import { LibraryViewer } from './Viewer';
import type { LibraryProps } from './types';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

it('keeps the opening group and member order when library props change', async () => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const image = (id: string) => ({
    id,
    name: id,
    image_path: '',
    thumbnail_path: '',
    metadata: { width: 100, height: 100 },
  });
  const images = ['first', 'stack-a', 'stack-b', 'stack-c', 'last'].map(image);
  const groups = [[images[0]], images.slice(1, 4), [images[4]]].map((members, i) => ({
    id: String(i),
    members,
    cover: members[i === 1 ? 1 : 0],
  }));
  const p = {
    groups,
    preview: images[0],
    previewGroup: groups[0],
    onPreview: vi.fn(),
    onCopyImage: vi.fn(),
    onDownloadImage: vi.fn(),
  } as unknown as LibraryProps;
  const key = async (key: string) =>
    act(() => {
      document
        .querySelector('.library-viewer')!
        .dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
    });
  const current = () =>
    document.querySelector<HTMLElement>('.library-viewer')!.dataset.viewerProjectId;
  try {
    await act(() => root.render(<LibraryViewer p={p} onClose={() => {}} />));
    await key('ArrowRight');
    expect(current()).toBe('stack-a');
    await act(() =>
      root.render(
        <LibraryViewer
          p={{ ...p, groups: [...p.groups].reverse(), preview: p.groups[2].cover }}
          onClose={() => {}}
        />,
      ),
    );
    await key('ArrowRight');
    expect(current()).toBe('stack-b');
    await key('ArrowRight');
    expect(current()).toBe('stack-c');
    await key('ArrowRight');
    expect(current()).toBe('last');
    await key('ArrowRight');
    expect(current()).toBe('last');
    await key('ArrowLeft');
    await key('ArrowLeft');
    await key('ArrowLeft');
    await key('ArrowLeft');
    await key('ArrowLeft');
    expect(current()).toBe('first');
  } finally {
    await act(() => root.unmount());
    host.remove();
    vi.unstubAllGlobals();
  }
});
