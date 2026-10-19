import { useState, useRef, useEffect } from 'react';
import { WorkbenchConnection } from '../lib/workbenchConnection';
import type { CommandSession } from '../shared/commands';
export type {
  CommandTab as WorkbenchTab,
  CommandSession as WorkbenchSession,
} from '../shared/commands';
export function useWorkbenchState() {
  const [workbenchSession, publishSession] = useState<CommandSession>({
    version: 2,
    tabs: [],
    activeTabId: '',
  });
  const [workbenchSessionReady, setWorkbenchSessionReady] = useState(false);
  const [workbenchLoading, setWorkbenchLoading] = useState(false);
  const [workbenchError, setWorkbenchError] = useState('');
  const connection = useRef<WorkbenchConnection | null>(null);
  if (!connection.current && window.studio?.invoke)
    connection.current = new WorkbenchConnection(
      window.studio.invoke,
      publishSession,
      setWorkbenchError,
    );
  const setWorkbenchSession = (
    next: CommandSession | ((previous: CommandSession) => CommandSession),
  ) => {
    if (connection.current) connection.current.update(next);
    else publishSession(next);
  };
  useEffect(() => () => connection.current?.dispose(), []);
  const [workbenchFocus, setWorkbenchFocus] = useState<{ scopeKey: string; tagId: string | null }>({
    scopeKey: 'base:prompt',
    tagId: null,
  });
  return {
    workbenchSession,
    setWorkbenchSession,
    workbenchConnection: connection.current,
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
