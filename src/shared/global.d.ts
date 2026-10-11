import type { StudioApi } from './ipc';

declare global {
  interface Window {
    studio?: StudioApi;
  }
}
