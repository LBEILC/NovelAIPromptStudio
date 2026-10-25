import { ClipboardPaste, Copy, Redo2, Scissors, Undo2 } from 'lucide-react';
import { useEffect } from 'react';
import { invokeResult, invokeUI, onProgress } from '../lib/commands';
import { isTextEditingTarget } from '../lib/contextMenu.js';
import { isImportActive } from '../lib/importProgress.js';
import {
  createWorkbenchTab,
  LEGACY_WORKBENCH_SESSION_KEY,
  WORKBENCH_SESSION_KEY,
} from '../lib/workbenchSession.js';
import type { useLibraryLoading } from './library';
import { captureTextSelection, Editable, runTextEditAction, studio, TextAction } from './shared';
import type { useAppState } from './state';
export function useSessionEffects({
  workbenchConnection,
  reloadLibrary,
  reloadCollections,
  notificationTarget,
  showToast,
  hydrateProject,
  setWorkbenchSession,
  setWorkbenchSessionReady,
  setWorkbenchLoading,
  setWorkbenchError,
  workbenchSessionReady,
  workbenchSession,
  setImportProgress,
  setArchiveImport,
  archiveImport,
  openContextMenu,
}: Pick<
  ReturnType<typeof useAppState> & ReturnType<typeof useLibraryLoading>,
  | 'workbenchConnection'
  | 'reloadLibrary'
  | 'reloadCollections'
  | 'notificationTarget'
  | 'showToast'
  | 'hydrateProject'
  | 'setWorkbenchSession'
  | 'setWorkbenchSessionReady'
  | 'setWorkbenchLoading'
  | 'setWorkbenchError'
  | 'workbenchSessionReady'
  | 'workbenchSession'
  | 'setImportProgress'
  | 'setArchiveImport'
  | 'archiveImport'
  | 'openContextMenu'
>) {
  useEffect(() => {
    if (!workbenchConnection) return;
    const prepare = studio.onCommandPrepare(() => workbenchConnection.prepare());
    const events = studio.onCommandEvent((event) => {
      if (event.type !== 'workbench') return;
      const wasCurrent = event.tabId === workbenchConnection.current.activeTabId;
      workbenchConnection.receive(event);
      if (event.libraryChanged) {
        void reloadLibrary('all', 'background');
        void reloadLibrary('trash', 'background');
        void reloadCollections('background');
      }
      if (event.source === 'agent' && event.undoId && wasCurrent) {
        notificationTarget.current.notify({
          text: 'Agent 修改了提示词',
          tone: 'info',
          action: {
            label: '撤销',
            onClick: () => {
              void workbenchConnection
                .flush()
                .then(async () => {
                  const result = await studio.invoke('workbench.undo', { undoId: event.undoId! });
                  if (!result.ok) showToast(result.error.message, 'error');
                })
                .catch((error) => showToast(error.message, 'error'));
            },
          },
        });
      }
    });
    return () => {
      prepare();
      events();
    };
  }, [workbenchConnection, reloadLibrary, reloadCollections, showToast]);

  useEffect(() => {
    let active = true;
    const restore = async () => {
      if (window.studioScreenshot) {
        const tabs = await Promise.all(
          (window.studioScreenshot.workbenchPaths || []).map(async (filePath) => {
            const result = await invokeResult('image.read', { path: filePath });
            if (!result.ok) throw new Error(result.error);
            return createWorkbenchTab(hydrateProject(result.project), {
              source: { type: 'file', path: filePath },
            });
          }),
        );
        if (!active) return;
        if (workbenchConnection) {
          const initial = await studio.invoke('workbench.session', {});
          if (!initial.ok) throw new Error(initial.error.message);
          workbenchConnection.hydrate(initial.data);
        }
        setWorkbenchSession({ version: 2, tabs, activeTabId: tabs[0]?.id || '' });
        await workbenchConnection?.flush();
        setWorkbenchSessionReady(true);
        return;
      }
      if (!workbenchConnection) {
        setWorkbenchSessionReady(true);
        return;
      }
      const result = await studio.invoke('workbench.session', {
        legacyV2: window.localStorage.getItem(WORKBENCH_SESSION_KEY) || '',
        legacyV1: window.localStorage.getItem(LEGACY_WORKBENCH_SESSION_KEY) || '',
      });
      if (!result.ok) throw new Error(result.error.message);
      if (!active) return;
      workbenchConnection.hydrate(result.data);
      setWorkbenchLoading(false);
      setWorkbenchSessionReady(true);
    };
    restore().catch((error) => {
      if (active) {
        setWorkbenchError(error instanceof Error ? error.message : String(error));
        setWorkbenchLoading(false);
        setWorkbenchSessionReady(true);
      }
    });
    return () => {
      active = false;
    };
  }, [hydrateProject]);

  useEffect(() => {
    if (!workbenchSessionReady) return;
    const temporaryPaths = workbenchSession.tabs
      .filter((tab) => tab.source?.type === 'clipboard' && tab.source.path)
      .map((tab) => tab.source.path!);
    invokeUI('workbench.temp-sync', { paths: temporaryPaths });
  }, [workbenchSession, workbenchSessionReady]);

  useEffect(() => {
    const unsubscribe = onProgress('library:import-progress', (progress) =>
      setImportProgress(isImportActive(progress) ? progress : null),
    );
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onProgress('library:import-preview', (update) => {
      setArchiveImport((current) => {
        if (!current || current.sessionId !== update?.sessionId) return current;
        if (update.phase === 'preview') {
          return {
            ...current,
            previewCompleted: update.completed || 0,
            entries: current.entries.map((entry) =>
              entry.id === update.entryId
                ? {
                    ...entry,
                    previewHeight: update.previewHeight || 0,
                    previewPath: update.previewPath || '',
                    previewWidth: update.previewWidth || 0,
                    previewError: update.error || '',
                    duplicate: Boolean(update.duplicate),
                  }
                : entry,
            ),
          };
        }
        if (update.phase === 'complete') {
          return {
            ...current,
            previewComplete: true,
            previewCompleted: update.completed || 0,
            previewError: update.error || '',
          };
        }
        return current;
      });
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!archiveImport?.sessionId) return;
    invokeUI('import.previews', { sessionId: archiveImport.sessionId })
      .then((result) => {
        if (result?.ok) return;
        setArchiveImport((current) =>
          current?.sessionId === archiveImport.sessionId
            ? {
                ...current,
                previewComplete: true,
                previewError: result?.error || '打开压缩包预览失败',
              }
            : current,
        );
      })
      .catch((error) => {
        setArchiveImport((current) =>
          current?.sessionId === archiveImport.sessionId
            ? {
                ...current,
                previewComplete: true,
                previewError: error instanceof Error ? error.message : String(error),
              }
            : current,
        );
      });
  }, [archiveImport?.sessionId]);

  useEffect(() => {
    const timer = window.setTimeout(async () => {
      const settings = await invokeUI('settings.productivity.get', {}).catch(() => null);
      if (!settings?.autoCheckUpdates) return;
      const result = await invokeUI('updates.check', {}).catch(() => null);
      if (result?.ok && result.hasUpdate)
        notificationTarget.current.notify({
          text: `发现新版本 v${result.latestVersion}，可在“关于与更新”中查看`,
          source: 'background',
        });
    }, 6000);
    return () => window.clearTimeout(timer);
  }, [showToast]);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (event.defaultPrevented || !isTextEditingTarget(event.target)) return;
      const editable = (event.target as Element).closest<Editable>(
        'textarea, input, [contenteditable="true"]',
      )!;
      const selection = captureTextSelection(editable);
      const invoke = (action: TextAction) =>
        runTextEditAction(selection, action).catch(() => showToast('文本操作失败', 'error'));
      openContextMenu(event, [
        { key: 'undo', label: '撤销', icon: Undo2, onClick: () => invoke('undo') },
        { key: 'redo', label: '重做', icon: Redo2, onClick: () => invoke('redo') },
        { key: 'edit-divider', type: 'divider' },
        {
          key: 'cut',
          label: '剪切',
          icon: Scissors,
          disabled: !selection.hasSelection,
          onClick: () => invoke('cut'),
        },
        {
          key: 'copy',
          label: '复制',
          icon: Copy,
          disabled: !selection.hasSelection,
          onClick: () => invoke('copy'),
        },
        { key: 'paste', label: '粘贴', icon: ClipboardPaste, onClick: () => invoke('paste') },
        { key: 'selection-divider', type: 'divider' },
        { key: 'select-all', label: '全选', onClick: () => invoke('select-all') },
      ]);
    };
    document.addEventListener('contextmenu', handler);
    return () => document.removeEventListener('contextmenu', handler);
  }, [showToast]);
  return {};
}
