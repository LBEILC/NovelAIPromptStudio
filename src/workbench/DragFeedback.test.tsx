// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DragStartEvent } from '@dnd-kit/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { motionMilliseconds, useDragFeedback } from './DragFeedback';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let host: HTMLDivElement;
let root: Root;
let feedback: ReturnType<typeof useDragFeedback>;
function Probe() {
  feedback = useDragFeedback();
  return null;
}
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  document.documentElement.style.setProperty('--dur-3', '240ms');
  act(() => root.render(<Probe />));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.documentElement.style.removeProperty('--dur-3');
  delete document.documentElement.dataset.motion;
});
function start(motion: string) {
  document.documentElement.dataset.motion = motion;
  act(() => {
    const event: DragStartEvent = {
      activatorEvent: new Event('pointerdown'),
      active: {
        id: 'synthetic-tag',
        data: { current: {} },
        rect: { current: { initial: host.getBoundingClientRect(), translated: null } },
      },
    };
    feedback.start(event, host);
  });
}
describe('drop commits independently of visual feedback', () => {
  it('keeps the rendered thumbnail, name and dirty mark in an inert drag copy', () => {
    host.innerHTML =
      '<span id="fixture-tab" data-workbench-tab-id="fixture" aria-selected="true"><img class="nps-decoded-image" src="fixture.png" data-image-ready="true"><span class="wb-tab-name">Synthetic name</span><span class="wb-dirty" aria-label="modified"></span></span>';
    start('full');
    const html = feedback.overlay.props.children.props.dangerouslySetInnerHTML.__html;
    const copy = document.createElement('div');
    copy.innerHTML = html;
    expect(copy.querySelector('img')?.dataset.imageReady).toBe('true');
    expect(copy.querySelector('img')?.dataset.imageImmediate).toBe('true');
    expect(copy.querySelector('.wb-tab-name')?.textContent).toBe('Synthetic name');
    expect(copy.querySelector('.wb-dirty')).not.toBeNull();
    expect(copy.querySelector('[id],[data-workbench-tab-id],[aria-selected]')).toBeNull();
  });
  it('preserves token time when the production CSS minifier converts milliseconds to seconds', () => {
    expect(motionMilliseconds('240ms')).toBe(240);
    expect(motionMilliseconds(' .24s ')).toBe(240);
  });
  it.each(['off', 'full'])(
    'commits synchronously in %s mode without an overlay animation',
    (mode) => {
      start(mode);
      const commit = vi.fn();
      const measure = vi.fn(() => ({ left: 10, top: 20 }));
      act(() => {
        feedback.finish(commit, measure);
        expect(commit).toHaveBeenCalledTimes(1);
      });
      expect(measure).toHaveBeenCalledTimes(mode === 'off' ? 0 : 1);
      expect(feedback.overlay.props.children).toBeNull();
      act(() => feedback.end());
      expect(commit).toHaveBeenCalledTimes(1);
    },
  );
  it('does not measure or wait when motion is disabled during a drag', () => {
    start('full');
    document.documentElement.dataset.motion = 'off';
    const commit = vi.fn();
    const measure = vi.fn(() => {
      throw new Error('Disabled motion must not measure a landing animation');
    });
    act(() => feedback.finish(commit, measure));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(measure).not.toHaveBeenCalled();
    expect(feedback.overlay.props.children).toBeNull();
  });
});
