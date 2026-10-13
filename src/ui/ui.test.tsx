// @vitest-environment happy-dom
import { act, useRef, useState, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  Button,
  Input,
  Select,
  OptionGroup,
  Tabs,
  Slider,
  Stepper,
  Switch,
  Checkbox,
} from './controls';
import { Menu, ContextMenu, type MenuItem } from './Menu';
import { Popover, Dialog, Tooltip, TooltipRoot } from './overlays';
import { Autocomplete } from './Autocomplete';
import {
  Notification,
  NotificationProvider,
  useNotifications,
  Progress,
  SelectionBar,
} from './feedback';
import { ResizablePanel } from './ResizablePanel';
import { ThemeProvider, Shortcut } from './ThemeProvider';
import { placeLayer } from './internal';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Object.assign(HTMLElement.prototype, { showPopover() {}, hidePopover() {} });
let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  // DOM shims do not implement the browser top layer or inertness. The real
  // Electron screenshot command separately probes showModal/default focus/inert.
  vi.spyOn(HTMLElement.prototype, 'showPopover').mockImplementation(function (this: HTMLElement) {
    this.setAttribute('data-test-open', 'true');
  });
  vi.spyOn(HTMLElement.prototype, 'hidePopover').mockImplementation(function (this: HTMLElement) {
    this.removeAttribute('data-test-open');
  });
  vi.spyOn(HTMLDialogElement.prototype, 'showModal').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.open = true;
  });
  vi.spyOn(HTMLDialogElement.prototype, 'close').mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.open = false;
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.restoreAllMocks();
});
function render(node: ReactNode) {
  act(() =>
    root.render(
      <>
        {node}
        <TooltipRoot />
      </>,
    ),
  );
}
function query<T extends HTMLElement = HTMLElement>(selector: string): T {
  const result = host.querySelector<T>(selector);
  if (!result) throw new Error(`Missing ${selector}`);
  return result;
}
function button(text: string) {
  const result = [...host.querySelectorAll('button')]
    .reverse()
    .find((node) => (node.getAttribute('aria-label') ?? node.textContent) === text);
  if (!result) throw new Error(`Missing button ${text}`);
  return result;
}
function key(target: HTMLElement, value: string, extra: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', {
    key: value,
    bubbles: true,
    cancelable: true,
    ...extra,
  });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}
function click(target: HTMLElement) {
  act(() => target.click());
}
function focus(target: HTMLElement) {
  act(() => target.focus());
}
function pointer(target: HTMLElement, type: string) {
  act(() => target.dispatchEvent(new PointerEvent(type, { bubbles: true })));
}
function input(target: HTMLInputElement, value: string) {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(target, value);
    target.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const menuItems: MenuItem[] = [
  { id: 'one', label: 'One' },
  { id: 'off', label: 'Unavailable', disabled: true },
  { id: 'separator', separator: true },
  {
    id: 'sub',
    label: 'More',
    children: [
      { id: 'off-child', label: 'Disabled child', disabled: true },
      { id: 'child', label: 'Child' },
    ],
  },
  { id: 'last', label: 'Last' },
];

describe('Menu', () => {
  it('moves with arrows, wraps, and skips disabled items and separators', () => {
    render(<Menu label="Open" items={menuItems} />);
    click(button('Open'));
    expect(document.activeElement).toBe(button('One'));
    key(button('One'), 'ArrowDown');
    expect(document.activeElement).toBe(button('More'));
    key(button('More'), 'ArrowUp');
    expect(document.activeElement).toBe(button('One'));
    key(button('One'), 'ArrowUp');
    expect(document.activeElement).toBe(button('Last'));
    key(button('Last'), 'Home');
    expect(document.activeElement).toBe(button('One'));
    key(button('One'), 'End');
    expect(document.activeElement).toBe(button('Last'));
  });
  it('enters submenu with Right, returns with Left, closes one layer per Escape', () => {
    render(<Menu label="Open" items={menuItems} />);
    click(button('Open'));
    key(button('One'), 'ArrowDown');
    key(button('More'), 'ArrowRight');
    expect(document.activeElement).toBe(button('Child'));
    key(button('Child'), 'ArrowLeft');
    expect(document.activeElement).toBe(button('More'));
    expect(host.querySelectorAll('[role="menu"]')).toHaveLength(1);
    key(button('More'), 'ArrowRight');
    key(button('Child'), 'Escape');
    expect(host.querySelectorAll('[role="menu"]')).toHaveLength(1);
    key(button('More'), 'Escape');
    expect(host.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(button('Open'));
  });
  it('executes Enter once and never executes disabled items', () => {
    const action = vi.fn();
    render(
      <Menu
        label="Open"
        items={[
          { id: 'off', label: 'Off', disabled: true, onSelect: action },
          { id: 'on', label: 'Run', onSelect: action },
        ]}
      />,
    );
    click(button('Open'));
    click(button('Off'));
    expect(action).not.toHaveBeenCalled();
    key(button('Run'), 'Enter');
    expect(action).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(button('Open'));
  });
  it.each(['beforetoggle', 'toggle'])(
    'owns outside dismissal and ignores a stale native %s after reopening',
    (eventType) => {
      render(
        <>
          <Menu label="Open" items={menuItems} />
          <Button>Next</Button>
        </>,
      );
      click(button('Open'));
      const layer = query('[popover]');
      pointer(button('Next'), 'pointerdown');
      expect(host.querySelector('[role="menu"]')).toBeNull();
      expect(document.activeElement).toBe(button('Open'));
      click(button('Open'));
      act(() => layer.dispatchEvent(Object.assign(new Event(eventType), { newState: 'closed' })));
      expect(host.querySelector('[role="menu"]')).not.toBeNull();
      expect(document.activeElement).toBe(button('One'));
      pointer(button('Next'), 'pointerdown');
      focus(button('Next'));
      act(() => layer.dispatchEvent(Object.assign(new Event('toggle'), { newState: 'closed' })));
      expect(document.activeElement).toBe(button('Next'));
    },
  );
  it('opens a context menu from the keyboard', () => {
    render(
      <ContextMenu label="Context" items={menuItems}>
        Target
      </ContextMenu>,
    );
    const trigger = query('[aria-label="Context"]');
    focus(trigger);
    key(trigger, 'F10', { shiftKey: true });
    expect(document.activeElement).toBe(button('One'));
    key(button('One'), 'Escape');
    expect(document.activeElement).toBe(trigger);
  });
});

describe('Dialog and Popover', () => {
  it('treats the trigger and nested layer as inside, while Escape closes only the top layer', () => {
    function Fixture() {
      const [open, setOpen] = useState(false);
      const anchor = useRef<HTMLButtonElement>(null);
      return (
        <>
          <Button ref={anchor} onClick={() => setOpen((value) => !value)}>
            Toggle
          </Button>
          <Popover open={open} anchor={anchor} onClose={() => setOpen(false)} label="Parent">
            <Select
              label="Child"
              value="a"
              onChange={() => {}}
              options={[{ value: 'a', label: 'Alpha' }]}
            />
          </Popover>
          <button>Outside</button>
        </>
      );
    }
    render(<Fixture />);
    for (let count = 1; count <= 5; count++) {
      pointer(button('Toggle'), 'pointerdown');
      click(button('Toggle'));
      expect(!!host.querySelector('[role=dialog]')).toBe(count % 2 === 1);
    }
    click(button('Child'));
    pointer(button('Alpha'), 'pointerdown');
    expect(host.querySelector('[role=dialog]')).not.toBeNull();
    key(button('Alpha'), 'Escape');
    expect(host.querySelector('[role=listbox]')).toBeNull();
    expect(host.querySelector('[role=dialog]')).not.toBeNull();
    expect(document.activeElement).toBe(button('Child'));
    pointer(button('Outside'), 'pointerdown');
    expect(host.querySelector('[role=dialog]')).toBeNull();
  });
  function ModalFixture({ destructive = true }: { destructive?: boolean }) {
    const [open, setOpen] = useState(false);
    return (
      <>
        <Button onClick={() => setOpen(true)}>Open</Button>
        <Dialog
          open={open}
          title="Title"
          cancelLabel="Cancel"
          confirmLabel="Confirm"
          destructive={destructive}
          onCancel={() => setOpen(false)}
          onConfirm={() => setOpen(false)}
        >
          Body
        </Dialog>
      </>
    );
  }
  it('uses showModal, defaults to Cancel, cycles Tab and returns focus', () => {
    render(<ModalFixture />);
    focus(button('Open'));
    click(button('Open'));
    expect(HTMLDialogElement.prototype.showModal).toHaveBeenCalled();
    expect(document.activeElement).toBe(button('Cancel'));
    key(button('Cancel'), 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(button('Confirm'));
    key(button('Confirm'), 'Tab');
    expect(document.activeElement).toBe(button('Cancel'));
    click(button('Cancel'));
    expect(document.activeElement).toBe(button('Open'));
  }, 30_000);
  it('cancels from native Escape cancel event and blocks destructive Enter', () => {
    render(<ModalFixture />);
    focus(button('Open'));
    click(button('Open'));
    focus(button('Confirm'));
    expect(key(button('Confirm'), 'Enter').defaultPrevented).toBe(true);
    expect(host.querySelector('dialog')).not.toBeNull();
    act(() => query('dialog').dispatchEvent(new Event('cancel', { cancelable: true })));
    expect(host.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(button('Open'));
  });
  it('does not block explicit pointer confirmation', () => {
    render(<ModalFixture />);
    click(button('Open'));
    click(button('Confirm'));
    expect(host.querySelector('dialog')).toBeNull();
  });
  it('leaves a closed popover unfocused, traps Tab when open and restores focus after Escape', () => {
    function Fixture() {
      const [open, setOpen] = useState(false);
      const anchor = useRef<HTMLButtonElement>(null);
      return (
        <>
          <Button ref={anchor} onClick={() => setOpen(true)}>
            Open
          </Button>
          <Popover open={open} onClose={() => setOpen(false)} anchor={anchor} label="Edit">
            <div style={{ display: 'none' }}>
              <button>Hidden</button>
            </div>
            <button disabled>Disabled</button>
            <button>First</button>
            <button>Last</button>
          </Popover>
        </>
      );
    }
    render(<Fixture />);
    expect(document.activeElement).toBe(document.body);
    click(button('Open'));
    expect(document.activeElement).toBe(button('First'));
    key(button('First'), 'Tab', { shiftKey: true });
    expect(document.activeElement).toBe(button('Last'));
    key(button('Last'), 'Tab');
    expect(document.activeElement).toBe(button('First'));
    key(button('First'), 'Escape');
    expect(document.activeElement).toBe(button('Open'));
    expect(host.querySelector('[role="dialog"]')).toBeNull();
  });
});

describe('Select and groups', () => {
  it('keeps decorative category prefixes out of keyboard matching and selected values', () => {
    const changed = vi.fn();
    render(
      <Select
        label="Category"
        value="body"
        onChange={changed}
        options={[
          { value: 'body', label: 'Body', prefix: <span aria-hidden="true" data-dot="body" /> },
          {
            value: 'clothing',
            label: 'Clothing',
            prefix: <span aria-hidden="true" data-dot="clothing" />,
          },
        ]}
      />,
    );
    const trigger = query('[aria-label="Category"]');
    expect(trigger.querySelector('[data-dot="body"]')).not.toBeNull();
    click(trigger);
    key(button('Body'), 'c');
    expect(document.activeElement).toBe(button('Clothing'));
    key(button('Clothing'), 'Enter');
    expect(changed).toHaveBeenCalledWith('clothing');
  });
  const options = [
    { value: 'a', label: 'Alpha' },
    { value: 'b', label: 'Beta', disabled: true },
    { value: 'g', label: 'Gamma' },
    { value: 'd', label: 'Delta' },
  ];
  it('supports arrows, Home/End, typeahead, Enter and Escape without committing', () => {
    const changed = vi.fn();
    render(<Select options={options} value="a" onChange={changed} label="Select" />);
    const trigger = query('[aria-label="Select"]');
    key(trigger, 'ArrowDown');
    expect(document.activeElement).toBe(button('Alpha'));
    key(button('Alpha'), 'ArrowDown');
    expect(document.activeElement).toBe(button('Gamma'));
    key(button('Gamma'), 'End');
    expect(document.activeElement).toBe(button('Delta'));
    key(button('Delta'), 'Home');
    expect(document.activeElement).toBe(button('Alpha'));
    key(button('Alpha'), 'g');
    expect(document.activeElement).toBe(button('Gamma'));
    key(button('Gamma'), 'Escape');
    expect(changed).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(trigger);
    click(trigger);
    key(button('Alpha'), 'End');
    key(button('Delta'), 'Enter');
    expect(changed).toHaveBeenCalledWith('d');
    expect(document.activeElement).toBe(trigger);
  });
  it('handles empty and entirely disabled lists', () => {
    render(<Select options={[]} value="" onChange={vi.fn()} label="Select" />);
    click(query('[aria-label="Select"]'));
    key(query('[role="listbox"]'), 'ArrowDown');
    key(query('[role="listbox"]'), 'Enter');
    expect(host.querySelector('[role="listbox"]')).toBeNull();
  });
  it('Home and End open directly at the boundary without changing the value', () => {
    const changed = vi.fn();
    render(<Select options={options} value="g" onChange={changed} label="Select" />);
    const trigger = query('[aria-label="Select"]');
    key(trigger, 'End');
    expect(document.activeElement).toBe(button('Delta'));
    key(button('Delta'), 'Escape');
    key(trigger, 'Home');
    expect(document.activeElement).toBe(button('Alpha'));
    expect(changed).not.toHaveBeenCalled();
  });
  it('option group has one tab stop and selects while moving', () => {
    function Fixture() {
      const [value, setValue] = useState('a');
      return <OptionGroup label="Options" options={options} value={value} onChange={setValue} />;
    }
    render(<Fixture />);
    key(button('Alpha'), 'ArrowRight');
    expect(button('Gamma').getAttribute('aria-checked')).toBe('true');
    expect(host.querySelectorAll('[role="radio"][tabindex="0"]')).toHaveLength(1);
  });
  it('tabs link the selected panel and keep it focusable after the tab list', () => {
    function Fixture() {
      const [value, setValue] = useState('a');
      return (
        <Tabs
          label="Tabs"
          items={options.map((item) => ({ ...item, content: item.label }))}
          value={value}
          onChange={setValue}
        />
      );
    }
    render(<Fixture />);
    key(button('Alpha'), 'ArrowRight');
    expect(button('Gamma').getAttribute('aria-selected')).toBe('true');
    const panel = query('[role="tabpanel"]:not([hidden])');
    expect(panel.id).toBe(button('Gamma').getAttribute('aria-controls'));
    expect(panel.tabIndex).toBe(0);
  });
});

describe('Numeric controls', () => {
  it('slider enforces boundaries, decimal steps, larger Shift step and Home/End', () => {
    function Fixture() {
      const [value, setValue] = useState(0.9);
      return <Slider value={value} onChange={setValue} min={0} max={1} step={0.1} label="Slider" />;
    }
    render(<Fixture />);
    const slider = query<HTMLInputElement>('input');
    key(slider, 'ArrowRight');
    expect(slider.value).toBe('1');
    key(slider, 'ArrowRight');
    expect(slider.value).toBe('1');
    key(slider, 'Home');
    expect(slider.value).toBe('0');
    key(slider, 'ArrowLeft');
    expect(slider.value).toBe('0');
    key(slider, 'ArrowRight', { shiftKey: true });
    expect(slider.value).toBe('1');
    key(slider, 'ArrowLeft');
    expect(slider.value).toBe('0.9');
    key(slider, 'End');
    expect(slider.value).toBe('1');
  });
  it('stepper clamps typed values, handles decimals and recovers invalid input', () => {
    function Fixture() {
      const [value, setValue] = useState(0.2);
      return (
        <Stepper
          value={value}
          onChange={setValue}
          min={0}
          max={1}
          step={0.1}
          label="Value"
          decreaseLabel="Minus"
          increaseLabel="Plus"
        />
      );
    }
    render(<Fixture />);
    const field = query<HTMLInputElement>('input');
    key(field, 'ArrowUp');
    expect(field.value).toBe('0.3');
    input(field, '10');
    key(field, 'Enter');
    expect(field.value).toBe('1');
    expect(button('Plus').disabled).toBe(true);
    input(field, '-10');
    key(field, 'Enter');
    expect(field.value).toBe('0');
    expect(button('Minus').disabled).toBe(true);
    key(field, 'ArrowDown');
    expect(field.value).toBe('0');
    input(field, 'invalid');
    key(field, 'Enter');
    expect(field.value).toBe('0');
  });
  it('unbounded prompt weights retain exact typed values without snapping', () => {
    function Fixture() {
      const [value, setValue] = useState(1.25);
      return (
        <Stepper
          value={value}
          onChange={setValue}
          step={0.1}
          snapToStep={false}
          label="Weight"
          decreaseLabel="Minus"
          increaseLabel="Plus"
        />
      );
    }
    render(<Fixture />);
    const field = query<HTMLInputElement>('input');
    key(field, 'Enter');
    expect(field.value).toBe('1.25');
    input(field, '-2.375');
    key(field, 'Enter');
    expect(field.value).toBe('-2.375');
  });
});

describe('IME and autocomplete', () => {
  it('does not invoke submission/shortcut handlers during composition', () => {
    const submit = vi.fn();
    const shortcut = vi.fn();
    render(
      <div onKeyDown={shortcut}>
        <Input
          aria-label="Text"
          onKeyDown={(event) => {
            if (event.key === 'Enter') submit();
          }}
        />
      </div>,
    );
    const field = query<HTMLInputElement>('input');
    act(() => field.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true })));
    expect(key(field, 'Enter').defaultPrevented).toBe(true);
    key(field, 'k', { ctrlKey: true });
    expect(submit).not.toHaveBeenCalled();
    expect(shortcut).not.toHaveBeenCalled();
    act(() => field.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true })));
    key(field, 'Enter');
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it('also respects native isComposing and the legacy IME keyCode', () => {
    const handler = vi.fn();
    render(<Input aria-label="Text" onKeyDown={handler} />);
    const field = query('input');
    key(field, 'Enter', { isComposing: true });
    key(field, 'Enter', { keyCode: 229 });
    expect(handler).not.toHaveBeenCalled();
  });
  it('keeps input focus, adopts suggestions and direct-add, ignores composing Enter', () => {
    const selected = vi.fn();
    const add = vi.fn();
    const items = [{ id: 'one', text: 'hair', translation: '头发', count: '1' }];
    render(
      <Autocomplete
        value="hair"
        onChange={() => {}}
        label="Tags"
        items={items}
        onSelect={selected}
        directAdd={{ label: 'Add', onSelect: add }}
      />,
    );
    const field = query<HTMLInputElement>('input');
    focus(field);
    expect(document.activeElement).toBe(field);
    key(field, 'Enter', { isComposing: true });
    expect(selected).not.toHaveBeenCalled();
    key(field, 'Enter');
    expect(selected).toHaveBeenCalledWith(items[0]);
    expect(document.activeElement).toBe(field);
    key(field, 'ArrowDown');
    key(field, 'Enter');
    expect(add).toHaveBeenCalledTimes(1);
    key(field, 'ArrowDown');
    key(field, 'Escape');
    expect(field.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('Feedback', () => {
  it.each(['timeout', 'action', 'replacement'])(
    'keeps only the latest background notice behind an action until %s',
    (dismissal) => {
      vi.useFakeTimers();
      const undo = vi.fn();
      function Fixture() {
        const notify = useNotifications();
        return (
          <>
            <Button
              onClick={() => {
                notify({ text: 'Moved', duration: 100, action: { label: 'Undo', onClick: undo } });
                notify({ text: 'Old update', source: 'background' });
                notify({ text: 'Latest update', source: 'background', duration: 100 });
              }}
            >
              Notify
            </Button>
            <Button onClick={() => notify({ text: 'Copied', duration: 100 })}>Copy</Button>
          </>
        );
      }
      render(
        <NotificationProvider>
          <Fixture />
        </NotificationProvider>,
      );
      click(button('Notify'));
      expect(query('[role="status"]').textContent).toBe('MovedUndo');
      if (dismissal === 'action') {
        click(button('Undo'));
        expect(undo).toHaveBeenCalledOnce();
      } else {
        if (dismissal === 'replacement') {
          click(button('Copy'));
          expect(query('[role="status"]').textContent).toBe('Copied');
        }
        act(() => vi.advanceTimersByTime(100));
      }
      expect(query('[role="status"]').textContent).toBe('Latest update');
      act(() => vi.advanceTimersByTime(100));
      expect(query('[role="status"]').textContent).toBe('');
    },
  );
  it('background replaces a plain notice and action callbacks can publish a new notice', () => {
    function Fixture() {
      const notify = useNotifications();
      return (
        <>
          <Button
            onClick={() => {
              notify({ text: 'Copied' });
              notify({ text: 'Update', source: 'background' });
            }}
          >
            Notify
          </Button>
          <Button
            onClick={() =>
              notify({
                text: 'Moved',
                action: {
                  label: 'Undo',
                  onClick: () => notify({ text: 'Restored' }),
                },
              })
            }
          >
            Move
          </Button>
        </>
      );
    }
    render(
      <NotificationProvider>
        <Fixture />
      </NotificationProvider>,
    );
    click(button('Notify'));
    expect(query('[role="status"]').textContent).toBe('Update');
    click(button('Move'));
    click(button('Undo'));
    expect(query('[role="status"]').textContent).toBe('Restored');
  });
  it('notification pauses remaining lifetime while hovered and focused', () => {
    vi.useFakeTimers();
    const dismiss = vi.fn();
    render(
      <Notification
        notice={{
          id: 1,
          text: 'Saved',
          duration: 1000,
          action: { label: 'Undo', onClick: () => {} },
        }}
        onDismiss={dismiss}
      />,
    );
    act(() => vi.advanceTimersByTime(400));
    pointer(query('.nps-toast'), 'pointerover');
    act(() => vi.advanceTimersByTime(4000));
    expect(dismiss).not.toHaveBeenCalled();
    focus(button('Undo'));
    pointer(query('.nps-toast'), 'pointerout');
    act(() => vi.advanceTimersByTime(4000));
    expect(dismiss).not.toHaveBeenCalled();
    act(() => button('Undo').blur());
    act(() => vi.advanceTimersByTime(599));
    expect(dismiss).not.toHaveBeenCalled();
    act(() => vi.advanceTimersByTime(1));
    expect(dismiss).toHaveBeenCalledTimes(1);
  });
  it('replaces consecutive notifications at one polite live region without taking focus', () => {
    vi.useFakeTimers();
    function Fixture() {
      const notify = useNotifications();
      return (
        <Button
          onClick={() => {
            notify({ text: 'First', duration: 100 });
            notify({ text: 'Second', duration: 100 });
          }}
        >
          Notify
        </Button>
      );
    }
    render(
      <NotificationProvider>
        <Fixture />
      </NotificationProvider>,
    );
    focus(button('Notify'));
    click(button('Notify'));
    expect(query('[role="status"]').textContent).toBe('Second');
    expect(document.activeElement).toBe(button('Notify'));
    act(() => vi.advanceTimersByTime(100));
    expect(query('[role="status"]').textContent).toBe('');
  });
  it('replaces the previous notice with undo without restoring stale notices after acting', () => {
    const undo = vi.fn();
    function Fixture() {
      const notify = useNotifications();
      return (
        <Button
          onClick={() => {
            notify({ text: 'Saved' });
            notify({ text: 'Moved', action: { label: 'Undo', onClick: undo } });
          }}
        >
          Notify
        </Button>
      );
    }
    render(
      <NotificationProvider>
        <Fixture />
      </NotificationProvider>,
    );
    focus(button('Notify'));
    click(button('Notify'));
    expect(query('[role="status"]').textContent).toBe('MovedUndo');
    expect(document.activeElement).toBe(button('Notify'));
    click(button('Undo'));
    expect(undo).toHaveBeenCalledOnce();
    expect(query('[role="status"]').textContent).toBe('');
  });
  it('replaces a paused notice and gives its replacement a fresh lifetime', () => {
    vi.useFakeTimers();
    function Fixture() {
      const notify = useNotifications();
      return (
        <>
          <Button onClick={() => notify({ text: 'First', duration: 100 })}>First</Button>
          <Button onClick={() => notify({ text: 'Second', duration: 100 })}>Second</Button>
        </>
      );
    }
    render(
      <NotificationProvider>
        <Fixture />
      </NotificationProvider>,
    );
    click(button('First'));
    act(() => vi.advanceTimersByTime(80));
    pointer(query('.nps-toast'), 'pointerover');
    click(button('Second'));
    expect(query('[role="status"]').textContent).toBe('Second');
    act(() => vi.advanceTimersByTime(1000));
    expect(query('[role="status"]').textContent).toBe('Second');
    pointer(query('.nps-toast'), 'pointerout');
    act(() => vi.advanceTimersByTime(99));
    expect(query('[role="status"]').textContent).toBe('Second');
    act(() => vi.advanceTimersByTime(1));
    expect(query('[role="status"]').textContent).toBe('');
  });
  it('tooltip delays hover, opens for keyboard focus and hides on scroll/press', () => {
    vi.useFakeTimers();
    render(
      <Tooltip text="Reason">
        <Button>Trigger</Button>
      </Tooltip>,
    );
    pointer(button('Trigger'), 'pointerover');
    act(() => vi.advanceTimersByTime(499));
    expect(host.querySelector('[role="tooltip"]')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(query('[role="tooltip"]').textContent).toBe('Reason');
    act(() => window.dispatchEvent(new Event('scroll')));
    expect(host.querySelector('[role="tooltip"]')).toBeNull();
    focus(button('Trigger'));
    expect(button('Trigger').getAttribute('aria-describedby')).toBe(query('[role="tooltip"]').id);
    pointer(button('Trigger'), 'pointerdown');
    expect(host.querySelector('[role="tooltip"]')).toBeNull();
  });
  it('disabled buttons remain focusable and loading prevents activation', () => {
    const action = vi.fn();
    render(
      <Button disabled disabledReason="Reason" onClick={action}>
        Disabled
      </Button>,
    );
    focus(button('Disabled'));
    click(button('Disabled'));
    expect(action).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(button('Disabled'));
    expect(query('[role="tooltip"]').textContent).toBe('Reason');
    render(
      <Button loading onClick={action}>
        Loading
      </Button>,
    );
    click(button('Loading'));
    expect(action).not.toHaveBeenCalled();
    expect(button('Loading').getAttribute('aria-busy')).toBe('true');
  });
  it('shares tooltip warmth, restores dwell after leaving and preserves existing descriptions', () => {
    vi.useFakeTimers();
    render(
      <>
        <Button tip="First" aria-describedby="help">
          A
        </Button>
        <Button tip="Second">B</Button>
      </>,
    );
    pointer(button('A'), 'pointerover');
    act(() => vi.advanceTimersByTime(500));
    expect(query('[role="tooltip"]').textContent).toBe('First');
    expect(button('A').getAttribute('aria-describedby')).toContain('help');
    pointer(button('B'), 'pointerover');
    expect(query('[role="tooltip"]').textContent).toBe('Second');
    expect(button('A').getAttribute('aria-describedby')).toBe('help');
    pointer(button('B'), 'pointerout');
    act(() => vi.advanceTimersByTime(300));
    pointer(button('A'), 'pointerover');
    expect(host.querySelector('[role="tooltip"]')).toBeNull();
    act(() => vi.advanceTimersByTime(499));
    expect(host.querySelector('[role="tooltip"]')).toBeNull();
    act(() => vi.advanceTimersByTime(1));
    expect(query('[role="tooltip"]').textContent).toBe('First');
    key(button('A'), 'Escape');
    expect(host.querySelector('[role="tooltip"]')).toBeNull();
    expect(button('A').getAttribute('aria-describedby')).toBe('help');
  });
  it('exposes clamped progress and keeps the selection slot mounted', () => {
    render(
      <>
        <Progress label="Progress" value={110} />
        <SelectionBar visible={false} label="Selection">
          <Button>Copy</Button>
        </SelectionBar>
      </>,
    );
    expect(query('[role="progressbar"]').getAttribute('aria-valuenow')).toBe('100');
    expect(query('.nps-selection').hidden).toBe(true);
    expect(query('.nps-selection-slot')).toBeDefined();
  });
});

describe('Panel, placement and platform', () => {
  it('resizer keyboard clamps and double click restores the supplied default', () => {
    function Fixture() {
      const [width, setWidth] = useState(200);
      return (
        <ResizablePanel
          label="Panel"
          width={width}
          min={100}
          max={210}
          defaultWidth={150}
          onWidthChange={setWidth}
        >
          Content
        </ResizablePanel>
      );
    }
    render(<Fixture />);
    const separator = query('[role="separator"]');
    // happy-dom does not load the imported CSS token sheet.
    separator.style.setProperty('--split-step', '16px');
    key(separator, 'ArrowRight');
    key(separator, 'ArrowRight');
    expect(separator.getAttribute('aria-valuenow')).toBe('210');
    key(separator, 'Home');
    expect(separator.getAttribute('aria-valuenow')).toBe('100');
    act(() => separator.dispatchEvent(new MouseEvent('dblclick', { bubbles: true })));
    expect(separator.getAttribute('aria-valuenow')).toBe('150');
    key(separator, 'ArrowLeft');
    expect(separator.getAttribute('aria-valuenow')).toBe('134');
    key(separator, 'ArrowRight', { shiftKey: true });
    expect(separator.getAttribute('aria-valuenow')).toBe('198');
  });
  it('flips layers at right and bottom edges and clamps oversized geometry', () => {
    const layer = document.createElement('div');
    vi.spyOn(layer, 'offsetWidth', 'get').mockReturnValue(200);
    vi.spyOn(layer, 'offsetHeight', 'get').mockReturnValue(100);
    placeLayer(layer, new DOMRect(innerWidth - 20, innerHeight - 20, 10, 10), true);
    expect(parseFloat(layer.style.left)).toBe(innerWidth - 220);
    expect(parseFloat(layer.style.top)).toBe(innerHeight - 120);
    vi.spyOn(layer, 'offsetWidth', 'get').mockReturnValue(innerWidth + 10);
    vi.spyOn(layer, 'offsetHeight', 'get').mockReturnValue(innerHeight + 10);
    placeLayer(layer, new DOMRect(-10, -10, 0, 0));
    expect(layer.style.left).toBe('0px');
    expect(layer.style.top).toBe('0px');
  });
  it('keeps long lists on one side of their trigger and remeasures after repositioning', () => {
    const layer = document.createElement('div');
    vi.spyOn(layer, 'offsetWidth', 'get').mockReturnValue(200);
    vi.spyOn(layer, 'scrollHeight', 'get').mockReturnValue(innerHeight * 2);
    vi.spyOn(layer, 'offsetHeight', 'get').mockImplementation(() =>
      Math.min(innerHeight, parseFloat(layer.style.maxHeight) || innerHeight),
    );
    for (const y of [innerHeight * 0.75, innerHeight * 0.25]) {
      const anchor = new DOMRect(30, y, 160, 30);
      placeLayer(layer, anchor);
      const top = parseFloat(layer.style.top);
      const height = parseFloat(layer.style.maxHeight);
      expect(top >= anchor.bottom || top + height <= anchor.top).toBe(true);
      expect(height).toBe(Math.max(anchor.top, innerHeight - anchor.bottom));
    }
  });
  it.each([
    ['windows', 'Ctrl K'],
    ['macos', '⌘ K'],
  ] as const)('centralizes %s shortcut labels', (platform, expected) => {
    render(
      <ThemeProvider platform={platform} theme="dark" motion="off">
        <Shortcut keys={['Mod', 'K']} />
      </ThemeProvider>,
    );
    expect(query('kbd').textContent).toBe(expected);
    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(document.documentElement.dataset.motion).toBe('off');
  });
  it.each(['full', 'system', 'off'] as const)(
    'follows live system theme and respects %s motion priority',
    (motion) => {
      const dark = new EventTarget() as MediaQueryList;
      const reduced = new EventTarget() as MediaQueryList;
      Object.defineProperty(dark, 'matches', { value: false, writable: true });
      Object.defineProperty(reduced, 'matches', { value: false, writable: true });
      vi.spyOn(globalThis, 'matchMedia').mockImplementation((query) =>
        query.includes('color-scheme') ? dark : reduced,
      );
      render(
        <ThemeProvider theme="system" motion={motion}>
          Content
        </ThemeProvider>,
      );
      expect(document.documentElement.dataset.theme).toBe('light');
      expect(document.documentElement.dataset.motion).toBe(motion === 'off' ? 'off' : 'full');
      Object.assign(dark, { matches: true });
      act(() => dark.dispatchEvent(new Event('change')));
      expect(document.documentElement.dataset.theme).toBe('dark');
      Object.assign(reduced, { matches: true });
      act(() => reduced.dispatchEvent(new Event('change')));
      expect(document.documentElement.dataset.motion).toBe(motion === 'full' ? 'full' : 'off');
      Object.assign(reduced, { matches: false });
      act(() => reduced.dispatchEvent(new Event('change')));
      expect(document.documentElement.dataset.motion).toBe(motion === 'off' ? 'off' : 'full');
    },
  );
  it('switches and checkboxes expose accessible names and checked state', () => {
    const change = vi.fn();
    render(
      <>
        <Switch checked label="Switch" onChange={change} />
        <Checkbox checked={false} label="Check" onChange={change} />
      </>,
    );
    expect(query('[role="switch"]').getAttribute('aria-checked')).toBe('true');
    click(query('[role="checkbox"]'));
    expect(change).toHaveBeenCalledWith(true);
  });
});

it('exposes partial checkbox selection and selects the remaining items', () => {
  const changed = vi.fn();
  render(<Checkbox label="Partial" checked={false} mixed onChange={changed} />);
  const checkbox = query<HTMLButtonElement>('[role="checkbox"]');
  expect(checkbox.getAttribute('aria-checked')).toBe('mixed');
  click(checkbox);
  expect(changed).toHaveBeenCalledWith(true);
});
