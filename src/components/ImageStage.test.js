import { describe, expect, it } from 'vitest';
import { mediaUrl, shouldResetImageStageLoading } from '../lib/imageStage.js';

describe('ImageStage loading state', () => {
  it('keeps a loaded image settled when an Activity resumes the same file', () => {
    expect(shouldResetImageStageLoading('C:\\images\\same.png', 'C:\\images\\same.png')).toBe(false);
  });

  it('resets loading only when the displayed file changes', () => {
    expect(shouldResetImageStageLoading('C:\\images\\one.png', 'C:\\images\\two.png')).toBe(true);
  });

  it('encodes local paths for the media protocol', () => {
    expect(mediaUrl('C:\\图片\\one image.png')).toBe('novelai-media://file?path=C%3A%5C%E5%9B%BE%E7%89%87%5Cone%20image.png');
  });
});
