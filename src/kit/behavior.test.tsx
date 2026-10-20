// @vitest-environment happy-dom
import { act, useRef, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MenuItems, MenuPop } from './menu';
import { Pop, useDismiss, layerOpen } from './layer';
import { Dialog } from './dialog';
import { Seg, Switch } from './controls';
import { NotificationProvider, useNotifications, type Notice } from './toast';
import { AddTags } from '../workbench/AddTags';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
let root: Root;
let host: HTMLDivElement;
const query = (s: string) => document.querySelector<HTMLElement>(s)!;
const render = (node: ReactNode) => act(() => root.render(node));
const key = (node: HTMLElement, value: string, extra: KeyboardEventInit = {}) =>
  act(() =>
    node.dispatchEvent(
      new KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true, ...extra }),
    ),
  );
const click = (node: HTMLElement) => act(() => node.click());
beforeEach(() => {
  document.documentElement.dataset.motion = 'off';
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

it('menu arrows skip disabled entries and separators; Enter executes and closes', () => {
  const run = vi.fn(),
    close = vi.fn();
  render(
    <MenuItems
      items={[
        { label: 'First', onSelect: run },
        'sep',
        { label: 'Disabled', disabled: 'Unavailable reason' },
        { label: 'Last' },
      ]}
      onClose={close}
    />,
  );
  const menu = query('[role=menu]');
  key(menu, 'ArrowDown');
  key(menu, 'ArrowDown');
  expect(query('.mi.on').textContent).toBe('Last');
  key(menu, 'ArrowUp');
  key(menu, 'Enter');
  expect(run).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  expect(query('[aria-disabled=true]').dataset.tip).toBe('Unavailable reason');
});

function submenuFixture() {
  const close = vi.fn();
  render(
    <MenuPop
      open
      onClose={close}
      anchor="#trigger"
      items={[{ label: 'Parent', sub: [{ label: 'Child' }] }]}
    />,
  );
  const menu = query('[role=menu]');
  key(menu, 'ArrowDown');
  key(menu, 'ArrowRight');
  return { close, menu, child: query('.submenu [role=menu]') };
}
it('ArrowRight transfers focus into the submenu', () => {
  const { child } = submenuFixture();
  expect(document.activeElement).toBe(child);
});
it('ArrowLeft closes the submenu and returns focus to its parent', () => {
  const { child, menu } = submenuFixture();
  act(() => child.focus());
  key(child, 'ArrowLeft');
  expect(query('.mi.open')).toBeNull();
  expect(document.activeElement).toBe(menu);
});
it('Escape closes only the submenu and preserves its parent', () => {
  const { child, close } = submenuFixture();
  act(() => child.focus());
  key(child, 'Escape');
  expect(close).not.toHaveBeenCalled();
  expect(query('.mi.open')).toBeNull();
});

function Layer({ name, close }: { name: string; close: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(true, close, [ref], { trigger: '#trigger' });
  return <div ref={ref} data-layer={name} />;
}
it('dismiss stack closes only the top on Escape, ignores trigger and closes outside', () => {
  const lower = vi.fn(),
    upper = vi.fn();
  render(
    <>
      <button id="trigger" />
      <Layer name="lower" close={lower} />
      <Layer name="upper" close={upper} />
    </>,
  );
  key(query('[data-layer=upper]'), 'Escape');
  expect(upper).toHaveBeenCalledOnce();
  expect(lower).not.toHaveBeenCalled();
  upper.mockClear();
  act(() => query('#trigger').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  expect(upper).not.toHaveBeenCalled();
  act(() => document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  expect(upper).toHaveBeenCalledOnce();
  expect(lower).toHaveBeenCalledOnce();
});
it('passive popovers do not register a dismiss layer', () => {
  render(
    <Pop open passive className="popover" onClose={vi.fn()}>
      Preview
    </Pop>,
  );
  expect(layerOpen()).toBe(false);
});

it.each([undefined, '#field'])(
  'dialog focuses %s, traps Tab and restores previous focus',
  (initialFocus) => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    trigger.focus();
    // happy-dom has no layout; provide visibility for the focus trap.
    Object.defineProperty(HTMLElement.prototype, 'offsetParent', {
      configurable: true,
      get: () => document.body,
    });
    render(
      <Dialog open onClose={vi.fn()} label="Test" initialFocus={initialFocus}>
        <input id="field" />
        <div className="acts">
          <button id="first">Cancel</button>
          <button id="last">OK</button>
        </div>
      </Dialog>,
    );
    expect(document.activeElement).toBe(query(initialFocus || '#first'));
    act(() => query('#last').focus());
    key(query('#last'), 'Tab');
    expect(document.activeElement).toBe(query('#field'));
    key(query('#field'), 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(query('#last'));
    render(null);
    expect(document.activeElement).toBe(trigger);
  },
);
it('sticky dialog ignores backdrop presses', () => {
  const close = vi.fn();
  render(
    <Dialog open sticky onClose={close} label="Test">
      <div className="acts">
        <button>Cancel</button>
      </div>
    </Dialog>,
  );
  act(() => query('.backdrop').dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })));
  expect(close).not.toHaveBeenCalled();
});
it('segments change with arrow keys and switches accept Space/Enter but respect disabled', () => {
  function Fixture() {
    const [value, set] = useState('a'),
      [on, change] = useState(false);
    return (
      <>
        <Seg
          items={[
            ['a', 'A'],
            ['b', 'B'],
          ]}
          value={value}
          onChange={set}
        />
        <Switch on={on} onChange={change} label="Enabled" />
        <Switch on={false} onChange={change} disabled label="Disabled" />
      </>
    );
  }
  render(<Fixture />);
  key(query('[role=radiogroup]'), 'ArrowRight');
  expect(query('[role=radio][aria-checked=true]').textContent).toBe('B');
  key(query('[role=radiogroup]'), 'ArrowLeft');
  expect(query('[role=radio][aria-checked=true]').textContent).toBe('A');
  key(query('[aria-label=Enabled]'), ' ');
  expect(query('[aria-label=Enabled]').getAttribute('aria-checked')).toBe('true');
  key(query('[aria-label=Enabled]'), 'Enter');
  key(query('[aria-label=Disabled]'), 'Enter');
  click(query('[aria-label=Disabled]'));
  expect(query('[aria-label=Enabled]').getAttribute('aria-checked')).toBe('false');
});
it('notices classify success/failure, replace, act and expire', () => {
  vi.useFakeTimers();
  let notify!: (n: Notice) => void;
  function Fixture() {
    notify = useNotifications();
    return null;
  }
  render(
    <NotificationProvider>
      <Fixture />
    </NotificationProvider>,
  );
  act(() => notify({ text: '已保存' }));
  expect(query('.toast .mark').classList.contains('ok')).toBe(true);
  act(() => notify({ text: '保存失败' }));
  expect(document.querySelectorAll('.toast')).toHaveLength(1);
  expect(query('.toast .mark').classList.contains('danger')).toBe(true);
  const undo = vi.fn();
  act(() => notify({ text: '已删除', action: { label: 'Undo', onClick: undo } }));
  click(query('.toast button'));
  expect(undo).toHaveBeenCalledOnce();
  expect(query('.toast')).toBeNull();
  act(() => notify({ text: '已保存', duration: 100 }));
  act(() => vi.advanceTimersByTime(100));
  expect(query('.toast')).toBeNull();
});
it('AddTags does not submit Enter during IME composition', () => {
  const add = vi.fn();
  render(<AddTags id="fixture" autoEdit onAdd={add} />);
  const input = query('input') as HTMLInputElement;
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'rain');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  key(input, 'Enter', { isComposing: true });
  expect(add).not.toHaveBeenCalled();
  key(input, 'Enter');
  expect(add).toHaveBeenCalledWith('rain');
});
