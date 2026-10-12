// @vitest-environment happy-dom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { DragStartEvent } from '@dnd-kit/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDragFeedback } from './DragFeedback';

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
