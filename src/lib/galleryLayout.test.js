import { describe, expect, it, vi } from 'vitest';
import {
  GALLERY_CARD_SIZE_DEFAULT,
  GALLERY_CARD_SIZE_KEY,
  GALLERY_CARD_SIZE_MAX,
  GALLERY_CARD_SIZE_MIN,
  galleryCardSizeFromWheel,
  galleryDensityForSize,
  isGalleryWheelZoomGesture,
  normalizeGalleryCardSize,
  readGalleryCardSize,
  writeGalleryCardSize,
} from './galleryLayout.js';

describe('gallery card sizing', () => {
  it('clamps persisted card sizes to the supported range', () => {
    expect(normalizeGalleryCardSize(48)).toBe(96);
    expect(normalizeGalleryCardSize('214.4')).toBe(214);
    expect(normalizeGalleryCardSize(320)).toBe(260);
    expect(normalizeGalleryCardSize('invalid')).toBeUndefined();
  });

  it('maps card sizes to semantic density levels', () => {
    expect(galleryDensityForSize(96)).toBe('overview');
    expect(galleryDensityForSize(144)).toBe('compact');
    expect(galleryDensityForSize(190)).toBe('comfortable');
  });

  it('maps modified wheel gestures to bounded browser-style zoom steps', () => {
    expect(isGalleryWheelZoomGesture({ ctrlKey: true, deltaY: -100 })).toBe(true);
    expect(isGalleryWheelZoomGesture({ metaKey: true, deltaY: 100 })).toBe(true);
    expect(isGalleryWheelZoomGesture({ deltaY: -100 })).toBe(false);
    expect(isGalleryWheelZoomGesture({ ctrlKey: true, deltaY: 0 })).toBe(false);

    expect(galleryCardSizeFromWheel(190, -100)).toBe(198);
    expect(galleryCardSizeFromWheel(190, 100)).toBe(182);
    expect(galleryCardSizeFromWheel(GALLERY_CARD_SIZE_MAX, -100)).toBe(GALLERY_CARD_SIZE_MAX);
    expect(galleryCardSizeFromWheel(GALLERY_CARD_SIZE_MIN, 100)).toBe(GALLERY_CARD_SIZE_MIN);
  });

  it('reads, writes, and safely falls back when storage is unavailable', () => {
    const storage = {
      getItem: vi.fn(() => '152'),
      setItem: vi.fn(),
    };
    expect(readGalleryCardSize(storage)).toBe(152);
    expect(writeGalleryCardSize(storage, 204)).toBe(204);
    expect(storage.setItem).toHaveBeenCalledWith(GALLERY_CARD_SIZE_KEY, '204');

    expect(readGalleryCardSize({ getItem: () => { throw new Error('blocked'); } })).toBe(GALLERY_CARD_SIZE_DEFAULT);
    expect(writeGalleryCardSize({ setItem: () => { throw new Error('blocked'); } }, 176)).toBe(176);
  });
});
