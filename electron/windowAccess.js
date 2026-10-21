// Window identity is registered by the main process, never inferred from a URL.
const trayContents = new WeakSet();
const trayCommands = new Set([
  'tray.menu-size',
  'tray.action',
  'account.get',
  'settings.appearance.get',
]);
export function registerTrayContents(contents) {
  trayContents.add(contents);
}
export function isTrayContents(contents) {
  return trayContents.has(contents);
}
export function allowsWindowCommand(contents, name) {
  return !isTrayContents(contents) || trayCommands.has(name);
}
export function sendWindowEvent(window, event) {
  if (window.isDestroyed() || window.webContents.isDestroyed()) return;
  if (isTrayContents(window.webContents) && !['generation', 'tray-menu-open'].includes(event.type))
    return;
  window.webContents.send('studio:command-event', event);
}
