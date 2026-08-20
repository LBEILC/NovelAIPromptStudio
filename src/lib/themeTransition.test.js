import { describe, expect, it, vi } from 'vitest';
import {
  commitThemeAppearance,
  resolveThemeMode,
  shouldAnimateThemeTransition,
  THEME_TRANSITION_DURATION_MS,
} from './themeTransition.js';

function createWindow({ dark = false, reduced = false } = {}) {
  return {
    matchMedia: vi.fn((query) => ({
      matches: query.includes('color-scheme') ? dark : reduced,
    })),
  };
}

function createTransitionDocument({ themeMode = 'dark', visible = true } = {}) {
  const transitions = [];
  const documentRef = {
    documentElement: { dataset: { themeMode } },
    visibilityState: visible ? 'visible' : 'hidden',
    startViewTransition: vi.fn((update) => {
      let finish;
      const transition = {
        finished: new Promise((resolve) => { finish = resolve; }),
        finish,
        skipTransition: vi.fn(),
      };
      transitions.push(transition);
      update();
      return transition;
    }),
  };
  return { documentRef, transitions };
}

describe('theme transition', () => {
  it('resolves explicit and system theme modes', () => {
    expect(resolveThemeMode('dark', false)).toBe('dark');
    expect(resolveThemeMode('light', true)).toBe('light');
    expect(resolveThemeMode('auto', false)).toBe('light');
    expect(resolveThemeMode('auto', true)).toBe('dark');
  });

  it('uses the restrained theme reveal duration', () => {
    expect(THEME_TRANSITION_DURATION_MS).toBe(320);
  });

  it('only animates a visible supported theme change with motion enabled', () => {
    const base = {
      currentTheme: 'dark',
      nextTheme: 'light',
      motionMode: 'full',
      supported: true,
      visible: true,
    };
    expect(shouldAnimateThemeTransition(base)).toBe(true);
    expect(shouldAnimateThemeTransition({ ...base, nextTheme: 'dark' })).toBe(false);
    expect(shouldAnimateThemeTransition({ ...base, motionMode: 'off' })).toBe(false);
    expect(shouldAnimateThemeTransition({ ...base, motionMode: 'reduced', systemReducedMotion: true })).toBe(false);
    expect(shouldAnimateThemeTransition({ ...base, supported: false })).toBe(false);
    expect(shouldAnimateThemeTransition({ ...base, visible: false })).toBe(false);
  });

  it('commits directly when the resolved theme does not change', () => {
    const { documentRef } = createTransitionDocument({ themeMode: 'dark' });
    const update = vi.fn();
    const result = commitThemeAppearance({
      currentAppearance: { themeMode: 'dark', motion: 'full' },
      nextAppearance: { themeMode: 'auto', motion: 'full' },
      update,
      documentRef,
      windowRef: createWindow({ dark: true }),
    });

    expect(result).toBeNull();
    expect(update).toHaveBeenCalledOnce();
    expect(documentRef.startViewTransition).not.toHaveBeenCalled();
    expect(documentRef.documentElement.dataset.themeTransition).toBeUndefined();
  });

  it('wraps a theme update in an upward root transition and cleans up', async () => {
    const { documentRef, transitions } = createTransitionDocument();
    const update = vi.fn(() => {
      documentRef.documentElement.dataset.themeMode = 'light';
    });
    const transition = commitThemeAppearance({
      currentAppearance: { themeMode: 'dark', motion: 'full' },
      nextAppearance: { themeMode: 'light', motion: 'full' },
      update,
      documentRef,
      windowRef: createWindow(),
    });

    expect(transition).toBe(transitions[0]);
    expect(update).toHaveBeenCalledOnce();
    expect(documentRef.documentElement.dataset.themeTransition).toBe('up');

    transition.finish();
    await transition.finished;
    await Promise.resolve();
    expect(documentRef.documentElement.dataset.themeTransition).toBeUndefined();
  });

  it('interrupts an active reveal and keeps the newest transition state', async () => {
    const { documentRef, transitions } = createTransitionDocument();
    const windowRef = createWindow();
    const first = commitThemeAppearance({
      currentAppearance: { themeMode: 'dark', motion: 'full' },
      nextAppearance: { themeMode: 'light', motion: 'full' },
      update: () => { documentRef.documentElement.dataset.themeMode = 'light'; },
      documentRef,
      windowRef,
    });
    const second = commitThemeAppearance({
      currentAppearance: { themeMode: 'light', motion: 'full' },
      nextAppearance: { themeMode: 'dark', motion: 'full' },
      update: () => { documentRef.documentElement.dataset.themeMode = 'dark'; },
      documentRef,
      windowRef,
    });

    expect(first.skipTransition).toHaveBeenCalledOnce();
    expect(documentRef.documentElement.dataset.themeTransition).toBe('up');

    transitions[0].finish();
    await transitions[0].finished;
    await Promise.resolve();
    expect(documentRef.documentElement.dataset.themeTransition).toBe('up');

    second.finish();
    await second.finished;
    await Promise.resolve();
    expect(documentRef.documentElement.dataset.themeTransition).toBeUndefined();
  });
});
