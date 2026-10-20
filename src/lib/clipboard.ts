import { invokeUI } from './commands';
/** Browser previews use the browser API; desktop reads and writes share one IPC boundary. */
export const writeClipboardText = (text: string): Promise<void> =>
  window.studio
    ? invokeUI('clipboard.write-text', { text: text })
    : navigator.clipboard.writeText(text);
export const readClipboardText = (): Promise<string> =>
  window.studio ? invokeUI('clipboard.read-text', {}) : navigator.clipboard.readText();
