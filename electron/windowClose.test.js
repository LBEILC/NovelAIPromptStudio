import { EventEmitter } from 'node:events';
import { describe, it, expect, vi } from 'vitest';
import { installWindowClose, createQuitHandler, confirmUnsavedClose } from './windowClose.js';
function setup(platform = 'win32', action = 'ask') {
  const window = Object.assign(new EventEmitter(), {
    hide: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    close: vi.fn(),
    isDestroyed: () => false,
  });
  const options = {
    platform,
    preferences: {
      productivitySettings: () => ({ closeAction: action }),
      saveProductivitySettings: vi.fn(),
    },
    isQuitting: () => false,
    prepare: vi.fn(async () => {}),
    quit: vi.fn(),
    request: vi.fn(),
    error: vi.fn(),
    confirm: vi.fn(async () => false),
  };
  const controller = installWindowClose(window, options);
  const event = { preventDefault: vi.fn() };
  return { window, options, controller, event };
}
describe('window close lifecycle', () => {
  it('asks without hiding or saving; cancel requires no command', () => {
    const { window, options, event } = setup();
    window.emit('close', event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(options.request).toHaveBeenCalledWith(window);
    expect(options.prepare).not.toHaveBeenCalled();
    expect(window.hide).not.toHaveBeenCalled();
  });
  it('remembers before saving, hides only after saving, and coalesces repeated closes', async () => {
    const { window, options, controller } = setup();
    let release;
    options.prepare.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const first = controller.choose('tray', true);
    const second = controller.choose('tray');
    expect(options.preferences.saveProductivitySettings).toHaveBeenCalledWith({
      closeAction: 'tray',
    });
    expect(window.hide).not.toHaveBeenCalled();
    release();
    await Promise.all([first, second]);
    expect(options.prepare).toHaveBeenCalledOnce();
    expect(window.hide).toHaveBeenCalledOnce();
  });
  it('hides without a dialog when saving fails', async () => {
    const { window, options, controller } = setup();
    options.prepare.mockRejectedValue(Error('save failed'));
    await controller.choose('tray');
    expect(window.hide).toHaveBeenCalledOnce();
    expect(options.confirm).not.toHaveBeenCalled();
  });
  it('quit choice and remembered quit enter application quit without asking', async () => {
    const { window, options, controller, event } = setup('win32', 'quit');
    await controller.choose('quit', true);
    window.emit('close', event);
    expect(options.quit).toHaveBeenCalledTimes(2);
    expect(options.request).not.toHaveBeenCalled();
  });
  it.each(['application menu', 'shortcut', 'installer'])(
    'bypasses close choice during %s quit',
    () => {
      const { window, options, event } = setup();
      options.isQuitting = () => true;
      window.emit('close', event);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(options.request).not.toHaveBeenCalled();
    },
  );
  it.each(['query-session-end', 'session-end'])('starts quit without preventing %s', (name) => {
    const { window, options, event } = setup();
    window.emit(name, event);
    expect(options.quit).toHaveBeenCalledOnce();
    expect(event.preventDefault).not.toHaveBeenCalled();
  });
  it.each(['darwin', 'linux'])('preserves save then close on %s', async (platform) => {
    const { window, options, event } = setup(platform);
    window.emit('close', event);
    await vi.waitFor(() => expect(window.close).toHaveBeenCalledOnce());
    expect(options.prepare).toHaveBeenCalledOnce();
    expect(options.request).not.toHaveBeenCalled();
  });
});

describe('save failure decisions', () => {
  function quitSetup(response = 0) {
    const dialog = vi.fn(async () => ({ response }));
    const options = {
      prepare: vi.fn().mockRejectedValueOnce(Error('disk full')).mockResolvedValue(undefined),
      sessionEnding: () => false,
      confirm: (error) => confirmUnsavedClose(dialog, error),
      cancel: vi.fn(),
      quit: vi.fn(),
      error: vi.fn(),
    };
    return { options, dialog, run: createQuitHandler(options) };
  }
  it('exits after failure without flushing again, coalescing simultaneous requests', async () => {
    const { options, dialog, run } = quitSetup();
    await Promise.all([run(), run()]);
    expect(options.prepare).toHaveBeenCalledOnce();
    expect(options.quit).toHaveBeenCalledOnce();
    expect(dialog).toHaveBeenCalledExactlyOnceWith({
      type: 'warning',
      title: '没能保存工作台',
      message: '最后的修改没能保存：disk full',
      buttons: ['仍然退出', '取消'],
      defaultId: 1,
      cancelId: 1,
      noLink: true,
    });
  });
  it('cancels and allows the next quit to save successfully', async () => {
    const { options, run } = quitSetup(1);
    await run();
    expect(options.cancel).toHaveBeenCalledOnce();
    expect(options.quit).not.toHaveBeenCalled();
    await run();
    expect(options.prepare).toHaveBeenCalledTimes(2);
    expect(options.quit).toHaveBeenCalledOnce();
  });
  it('does not show a dialog on session termination', async () => {
    const { options, dialog, run } = quitSetup();
    options.sessionEnding = () => true;
    await run();
    expect(dialog).not.toHaveBeenCalled();
  });
  it.each([true, false])('macOS close failure respects the choice %s', async (accepted) => {
    const { window, options, event } = setup('darwin');
    options.prepare.mockRejectedValueOnce(Error('disk full'));
    options.confirm.mockResolvedValue(accepted);
    window.emit('close', event);
    await vi.waitFor(() => expect(accepted ? window.close : window.focus).toHaveBeenCalledOnce());
    expect(options.prepare).toHaveBeenCalledOnce();
    if (!accepted) {
      window.emit('close', event);
      await vi.waitFor(() => expect(window.close).toHaveBeenCalledOnce());
    }
  });
});
