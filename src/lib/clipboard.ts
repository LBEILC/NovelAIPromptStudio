/** Browser previews use the browser API; desktop reads and writes share one IPC boundary. */
export const writeClipboardText = (text: string): Promise<void> =>
  window.studio ? window.studio.writeClipboardText(text) : navigator.clipboard.writeText(text);
export const readClipboardText = (): Promise<string> =>
  window.studio ? window.studio.readClipboardText() : navigator.clipboard.readText();
