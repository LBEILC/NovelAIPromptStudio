import { shouldReduceStudioMotion } from './motion.js';

export const THEME_TRANSITION_DURATION_MS = 320;

let activeThemeTransition = null;
let themeTransitionSequence = 0;

function mediaMatches(windowRef, query) {
  return Boolean(windowRef?.matchMedia?.(query)?.matches);
}

export function resolveThemeMode(themeMode, systemDark = false) {
  if (themeMode === 'auto') return systemDark ? 'dark' : 'light';
  return themeMode === 'light' ? 'light' : 'dark';
}

export function shouldAnimateThemeTransition({
  currentTheme,
  nextTheme,
  motionMode = 'full',
  systemReducedMotion = false,
  supported = false,
  visible = true,
}) {
  return supported
    && visible
    && currentTheme !== nextTheme
    && !shouldReduceStudioMotion(motionMode, systemReducedMotion);
}

export function commitThemeAppearance({
  currentAppearance,
  nextAppearance,
  update,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
}) {
  const root = documentRef?.documentElement;
  const systemDark = mediaMatches(windowRef, '(prefers-color-scheme: dark)');
  const currentTheme = root?.dataset?.themeMode
    || resolveThemeMode(currentAppearance?.themeMode, systemDark);
  const nextTheme = resolveThemeMode(nextAppearance?.themeMode, systemDark);
  const sequence = ++themeTransitionSequence;

  activeThemeTransition?.skipTransition?.();
  activeThemeTransition = null;

  const animate = shouldAnimateThemeTransition({
    currentTheme,
    nextTheme,
    motionMode: nextAppearance?.motion,
    systemReducedMotion: mediaMatches(windowRef, '(prefers-reduced-motion: reduce)'),
    supported: typeof documentRef?.startViewTransition === 'function',
    visible: documentRef?.visibilityState !== 'hidden',
  });

  if (!animate || !root) {
    if (root?.dataset) delete root.dataset.themeTransition;
    update();
    return null;
  }

  root.dataset.themeTransition = 'up';
  let updated = false;
  const commit = () => {
    updated = true;
    update();
  };

  try {
    const transition = documentRef.startViewTransition(commit);
    activeThemeTransition = transition;
    Promise.resolve(transition.finished)
      .catch(() => {})
      .finally(() => {
        if (activeThemeTransition === transition) activeThemeTransition = null;
        if (sequence === themeTransitionSequence) delete root.dataset.themeTransition;
      });
    return transition;
  } catch {
    if (!updated) update();
    if (sequence === themeTransitionSequence) delete root.dataset.themeTransition;
    return null;
  }
}
