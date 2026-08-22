import { useReducedMotion } from 'motion/react';

export const MOTION_EASE_OUT = [0.16, 1, 0.3, 1];
export const MOTION_EASE_IN_OUT = [0.77, 0, 0.175, 1];
export const MOTION_EASE_SMOOTH_OUT = [0.22, 1, 0.36, 1];
export const MOTION_DURATION_FAST_SECONDS = 0.25;
export const MOTION_DISTANCE_BASE_PX = 8;
export const MOTION_BLUR_MEDIUM_PX = 3;

export function studioMotionMode(root = globalThis.document?.documentElement) {
  return root?.dataset?.motion || 'full';
}

export function shouldReduceStudioMotion(mode, systemReducedMotion = false) {
  return mode === 'off' || (mode === 'reduced' && Boolean(systemReducedMotion));
}

export function useStudioReducedMotion(mode = studioMotionMode()) {
  return shouldReduceStudioMotion(mode, useReducedMotion());
}
