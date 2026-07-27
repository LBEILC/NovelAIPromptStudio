import { describe, expect, it, vi } from 'vitest';
import { galleryPreviewActions } from './imagePreview.js';

describe('gallery image preview actions', () => {
  it('provides one application-owned copy and download action', () => {
    const onCopy = vi.fn();
    const onDownload = vi.fn();
    const actions = galleryPreviewActions({}, { onCopy, onDownload });

    expect(actions.map((action) => action.key)).toEqual([
      'flip-horizontal',
      'flip-vertical',
      'rotate-left',
      'rotate-right',
      'zoom-out',
      'zoom-in',
      'copy',
      'download',
    ]);
    expect(actions.find((action) => action.key === 'copy')?.onClick).toBe(onCopy);
    expect(actions.find((action) => action.key === 'download')?.onClick).toBe(onDownload);
  });

  it('disables zoom actions at the supported preview bounds', () => {
    expect(galleryPreviewActions({ transform: { scale: 0.32 } })[4].disabled).toBe(true);
    expect(galleryPreviewActions({ transform: { scale: 32 } })[5].disabled).toBe(true);
  });
});
