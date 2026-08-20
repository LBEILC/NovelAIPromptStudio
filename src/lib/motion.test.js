import { describe, expect, it } from 'vitest';
import { shouldReduceStudioMotion, studioMotionMode } from './motion.js';

describe('studio motion preferences', () => {
  it('respects explicit full, system-following, and off modes', () => {
    expect(shouldReduceStudioMotion('full', true)).toBe(false);
    expect(shouldReduceStudioMotion('reduced', false)).toBe(false);
    expect(shouldReduceStudioMotion('reduced', true)).toBe(true);
    expect(shouldReduceStudioMotion('off', false)).toBe(true);
  });

  it('reads the configured mode and falls back to full motion', () => {
    expect(studioMotionMode({ dataset: { motion: 'off' } })).toBe('off');
    expect(studioMotionMode(null)).toBe('full');
  });
});
