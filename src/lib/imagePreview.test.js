import { describe, expect, it, vi } from 'vitest';
import { fitTabPreviewCanvas, imagePreviewActions } from './imagePreview.js';

describe('image preview actions', () => {
  it('provides one application-owned copy and download action', () => {
    const onCopy = vi.fn();
    const onDownload = vi.fn();
    const actions = imagePreviewActions({}, { onCopy, onDownload });

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
    expect(imagePreviewActions({ transform: { scale: 0.32 } })[4].disabled).toBe(true);
    expect(imagePreviewActions({ transform: { scale: 32 } })[5].disabled).toBe(true);
  });
});

describe('tab image preview sizing', () => {
  it('adapts common portrait, landscape, and square images to their source ratio', () => {
    expect(fitTabPreviewCanvas(832, 1216)).toEqual({ width: 246, height: 360 });
    expect(fitTabPreviewCanvas(1216, 832)).toEqual({ width: 320, height: 219 });
    expect(fitTabPreviewCanvas(1024, 1024)).toEqual({ width: 320, height: 320 });
  });

  it('keeps extreme and missing dimensions within readable preview bounds', () => {
    expect(fitTabPreviewCanvas(100, 1000)).toEqual({ width: 220, height: 360 });
    expect(fitTabPreviewCanvas(1000, 100)).toEqual({ width: 320, height: 160 });
    expect(fitTabPreviewCanvas(0, 0)).toEqual({ width: 260, height: 260 });
  });
});
