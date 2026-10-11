import type { StudioApi } from './ipc';

declare global {
  interface Window {
    studio?: StudioApi;
    studioScreenshot?: { section?: string; reportError: (message: string) => void };
  }
}
