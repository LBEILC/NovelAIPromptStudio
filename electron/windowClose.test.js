import { EventEmitter } from 'node:events';
import { describe, it, expect, vi } from 'vitest';
import { installWindowClose } from './windowClose.js';
function setup(platform = 'win32', action = 'ask') {
  const window = Object.assign(new EventEmitter(), {
    hide: vi.fn(),
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
  it('does not hide when saving fails', async () => {
    const { window, options, controller } = setup();
    options.prepare.mockRejectedValue(Error('save failed'));
    await expect(controller.choose('tray')).rejects.toThrow('save failed');
    expect(window.hide).not.toHaveBeenCalled();
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
