// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from 'vitest';
import { ms } from './motion';

describe('ms', () => {
  afterEach(() => document.documentElement.removeAttribute('style'));
  // 正式版的 CSS 压缩会把 240ms 写成 .24s
  it('reads durations in seconds or milliseconds, and lengths in pixels', () => {
    const html = document.documentElement.style;
    html.setProperty('--a', '.24s');
    html.setProperty('--b', '240ms');
    html.setProperty('--c', '14px');
    html.setProperty('--d', '0.5');
    expect([ms('--a'), ms('--b'), ms('--c'), ms('--d'), ms('--missing')]).toEqual([
      240, 240, 14, 0.5, 0,
    ]);
  });
});
