import { useState } from 'react';
import type { ImageProject, WorkbenchSource } from '../shared/types';
import { normalizeWorkbenchViewState } from '../lib/workbenchSession.js';

export interface WorkbenchTab {
  id: string;
  identity: string;
  displayName: string;
  source: WorkbenchSource;
  project: ImageProject | null;
  originalProject: ImageProject | null;
  viewState: ReturnType<typeof normalizeWorkbenchViewState>;
  updatedAt: string;
  error: string;
}
export interface WorkbenchSession {
  version: number;
  tabs: WorkbenchTab[];
  activeTabId: string;
}
export function useWorkbenchState() {
  const [workbenchSession, setWorkbenchSession] = useState<WorkbenchSession>({
    version: 2,
    tabs: [],
    activeTabId: '',
  });
  const [workbenchSessionReady, setWorkbenchSessionReady] = useState(false);
  const [workbenchLoading, setWorkbenchLoading] = useState(false);
  const [workbenchError, setWorkbenchError] = useState('');
  const [workbenchFocus, setWorkbenchFocus] = useState<{ scopeKey: string; tagId: string | null }>({
    scopeKey: 'base:prompt',
    tagId: null,
  });
  return {
    workbenchSession,
    setWorkbenchSession,
    workbenchSessionReady,
    setWorkbenchSessionReady,
    workbenchLoading,
    setWorkbenchLoading,
    workbenchError,
    setWorkbenchError,
    workbenchFocus,
    setWorkbenchFocus,
  };
}
