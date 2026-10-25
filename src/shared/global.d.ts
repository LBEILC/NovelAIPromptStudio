import type { StudioApi } from './ipc';

declare global {
  interface Window {
    studio?: StudioApi;
    studioScreenshot?: {
      section?: string;
      page?: import('../shell/Titlebar').Page;
      view?: string;
      name?: string;
      selectedProjectId?: string;
      workbenchPaths?: string[];
      reportError: (message: string) => void;
    };
  }
}
