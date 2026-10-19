// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { DecodedImage, TransitionSurface, useNavigationSelection } from './transitions';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  delete document.documentElement.dataset.motion;
  vi.restoreAllMocks();
});

it('ignores stale decodes and presents an already displayed source without another fade', async () => {
  const pending: (() => void)[] = [];
  vi.spyOn(HTMLImageElement.prototype, 'decode').mockImplementation(
    () => new Promise<void>((resolve) => pending.push(resolve)),
  );
  act(() => root.render(<DecodedImage src="fixture-a.png" />));
  expect(host.querySelector('img')?.dataset.imageReady).toBeUndefined();
  act(() => root.render(<DecodedImage src="fixture-b.png" />));
  await act(async () => pending[0]());
  expect(host.querySelector('img')?.dataset.imageReady).toBeUndefined();
  await act(async () => pending[1]());
  expect(host.querySelector('img')?.dataset.imageReady).toBe('true');
  expect(host.querySelector('img')?.dataset.imageImmediate).toBeUndefined();
  act(() => root.render(<DecodedImage src="fixture-a.png" />));
  act(() => root.render(<DecodedImage src="fixture-b.png" />));
  expect(host.querySelector('img')?.dataset.imageImmediate).toBe('true');
});

it('keeps failed decodes as placeholders without caching the source', async () => {
  vi.spyOn(HTMLImageElement.prototype, 'decode').mockRejectedValue(
    new Error('fixture decode failure'),
  );
  await act(async () => root.render(<DecodedImage src="broken-fixture.png" />));
  expect(host.querySelector('img')?.dataset.imageReady).toBeUndefined();
  expect(host.querySelector('img')?.dataset.imageImmediate).toBeUndefined();
});

it('publishes new content and commands immediately with motion off', () => {
  document.documentElement.dataset.motion = 'off';
  const command = vi.fn();
  act(() =>
    root.render(
      <TransitionSurface change="first">
        <button>first</button>
      </TransitionSurface>,
    ),
  );
  act(() =>
    root.render(
      <TransitionSurface change="last">
        <button onClick={command}>last</button>
      </TransitionSurface>,
    ),
  );
  expect(host.textContent).toBe('last');
  act(() => host.querySelector('button')!.click());
  expect(command).toHaveBeenCalledOnce();
  expect(document.querySelector('.nps-transition-snapshot')).toBeNull();
});

it('starts navigation before its command and never overwrites subsequent input', () => {
  document.documentElement.dataset.motion = 'full';
  const command = vi.fn((next: string) => {
    expect(host.firstElementChild?.getAttribute('data-selected')).toBe(next);
  });
  function Navigation() {
    const [selected, select] = useNavigationSelection<string>('first', command);
    return (
      <div data-selected={selected}>
        <button onClick={() => select('second')}>second</button>
        <button onClick={() => select('last')}>last</button>
        <input aria-label="search" />
      </div>
    );
  }
  vi.useFakeTimers();
  try {
    act(() => root.render(<Navigation />));
    act(() => host.querySelectorAll('button')[0].click());
    expect(command).toHaveBeenLastCalledWith('second');
    act(() => host.querySelectorAll('button')[1].click());
    expect(command).toHaveBeenLastCalledWith('last');
    host.querySelector('input')!.value = 'subsequent search';
    act(() => vi.runAllTimers());
    expect(command).toHaveBeenCalledTimes(2);
    expect(host.querySelector('input')!.value).toBe('subsequent search');
    act(() => root.render(null));
    expect(command).toHaveBeenCalledTimes(2);
  } finally {
    vi.useRealTimers();
  }
});
