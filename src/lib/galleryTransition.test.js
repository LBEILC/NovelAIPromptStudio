import { describe, expect, it, vi } from 'vitest';
import {
  GALLERY_COMPUTATION_GATE_MS,
  galleryCardTransitionDelay,
  galleryComputationGateDelay,
  scheduleGalleryComputation,
} from './galleryTransition.js';

describe('gallery result transition scheduling', () => {
  it('bounds sequential card timing for large result sets', () => {
    expect(galleryCardTransitionDelay(0)).toBe(0);
    expect(galleryCardTransitionDelay(5)).toBeCloseTo(0.04);
    expect(galleryCardTransitionDelay(100)).toBeCloseTo(0.096);
    expect(galleryCardTransitionDelay(100, 'exit')).toBeCloseTo(0.072);
  });

  it('waits until the bounded exit choreography ends unless motion is reduced', () => {
    expect(galleryComputationGateDelay()).toBe(GALLERY_COMPUTATION_GATE_MS);
    expect(GALLERY_COMPUTATION_GATE_MS).toBe(176);
    expect(galleryComputationGateDelay(true)).toBe(0);
  });

  it('cancels superseded computation requests', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    const cancel = scheduleGalleryComputation(callback, false);
    vi.advanceTimersByTime(GALLERY_COMPUTATION_GATE_MS - 1);
    expect(callback).not.toHaveBeenCalled();
    cancel();
    vi.runAllTimers();
    expect(callback).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('releases computation immediately after the exit gate', () => {
    vi.useFakeTimers();
    const callback = vi.fn();
    scheduleGalleryComputation(callback, false);
    vi.advanceTimersByTime(GALLERY_COMPUTATION_GATE_MS);
    expect(callback).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
