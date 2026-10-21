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
        .then(() => {
          if (options.isQuitting() || window.isDestroyed()) return;
          window.hide();
          options.notice();
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
        .then(() => {
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
    window.on('query-session-end', options.quit);
    window.on('session-end', options.quit);
  }
  return { choose };
}
