// The injected dialog keeps failure choices testable without native windows.
export async function confirmUnsavedClose(showMessageBox, error) {
  const { response } = await showMessageBox({
    type: 'warning',
    title: '没能保存工作台',
    message: `最后的修改没能保存：${error instanceof Error ? error.message : String(error)}`,
    buttons: ['仍然退出', '取消'],
    defaultId: 1,
    cancelId: 1,
    noLink: true,
  });
  return response === 0;
}

export function createQuitHandler(options) {
  let pending;
  return () => {
    if (!pending) {
      pending = (async () => {
        try {
          await options.prepare();
        } catch (error) {
          options.error(error);
          if (options.sessionEnding() || !(await options.confirm(error))) {
            options.cancel();
            return;
          }
        }
        options.quit();
      })().finally(() => {
        pending = undefined;
      });
    }
    return pending;
  };
}

// Keep close decisions separate from Electron so every exit path can be tested.
export function installWindowClose(window, options) {
  let prepared = false;
  let saving;
  const choose = async (action, remember = false) => {
    if (remember) options.preferences.saveProductivitySettings({ closeAction: action });
    if (action === 'quit') {
      options.quit();
      return;
    }
    if (!saving) {
      saving = options
        .prepare(window)
        .catch(options.error)
        .then(() => {
          if (options.isQuitting() || window.isDestroyed()) return;
          window.hide();
        })
        .finally(() => {
          saving = undefined;
        });
    }
    await saving;
  };
  window.on('close', (event) => {
    if (prepared || options.isQuitting()) return;
    event.preventDefault();
    if (options.platform === 'win32') {
      const action = options.preferences.productivitySettings().closeAction;
      if (action === 'ask') options.request(window);
      else void choose(action).catch(options.error);
    } else if (!saving) {
      saving = options
        .prepare(window)
        .then(
          () => true,
          async (error) => {
            options.error(error);
            const accepted = await options.confirm(error);
            if (!accepted) {
              window.show();
              window.focus();
            }
            return accepted;
          },
        )
        .then((accepted) => {
          if (!accepted || window.isDestroyed()) return;
          prepared = true;
          window.close();
        })
        .catch(options.error)
        .finally(() => {
          saving = undefined;
        });
    }
  });
  if (options.platform === 'win32') {
    // Never preventDefault on Windows session termination. Start the normal
    // flush immediately; the OS may still end the process before it completes.
    window.on('query-session-end', options.sessionEnd || options.quit);
    window.on('session-end', options.sessionEnd || options.quit);
  }
  return { choose };
}
