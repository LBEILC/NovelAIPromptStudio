import { afterEach, expect, it, vi } from 'vitest';
import { waitForFeedback, TOOLTIP_SCROLL_CLOSE_MS } from './feedback.js';
afterEach(() => vi.useRealTimers());
it('accepts a render committed within the scroll deadline', async () => {
  vi.useFakeTimers();
  let visible = true;
  const result = waitForFeedback(
    () => !visible,
    TOOLTIP_SCROLL_CLOSE_MS,
    () => {
      setTimeout(() => {
        visible = false;
      }, 60);
    },
  );
  await vi.advanceTimersByTimeAsync(60);
  expect(await result).toBe(true);
});
it('fails when the tooltip remains beyond the deadline', async () => {
  vi.useFakeTimers();
  let visible = true;
  const result = waitForFeedback(
    () => !visible,
    TOOLTIP_SCROLL_CLOSE_MS,
    () => {
      setTimeout(() => {
        visible = false;
      }, 110);
    },
  );
  await vi.advanceTimersByTimeAsync(120);
  expect(await result).toBe(false);
});
it('includes synchronous action time in the deadline', async () => {
  vi.useFakeTimers();
  expect(
    await waitForFeedback(
      () => true,
      100,
      () => vi.advanceTimersByTime(101),
    ),
  ).toBe(false);
});
it('does not accept a predicate that resolves after the deadline', async () => {
  vi.useFakeTimers();
  const result = waitForFeedback(
    () => new Promise((resolve) => setTimeout(() => resolve(true), 110)),
    100,
  );
  await vi.advanceTimersByTimeAsync(110);
  expect(await result).toBe(false);
});
it('retries while a node is absent during a commit', async () => {
  vi.useFakeTimers();
  const predicate = vi
    .fn()
    .mockImplementationOnce(() => {
      throw Error('absent');
    })
    .mockReturnValue(true);
  const result = waitForFeedback(predicate, 100);
  await vi.advanceTimersByTimeAsync(5);
  expect(await result).toBe(true);
});
