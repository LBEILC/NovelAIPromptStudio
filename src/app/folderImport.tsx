// 导入文件夹（doc/design.md 2.29，1.7.0）：扫描（进度在底部浮条，可以取消）→ 预览对话框里挑文件夹 → 后台导入。
// 入口：导入按钮的菜单、Ctrl Shift I、把文件夹拖进图片库、首次引导。
import { useCallback, useEffect, useState } from 'react';
import { invokeUI } from '../lib/commands';
import { assessDroppedFiles } from '../lib/importDrop.js';
import { isImportActive } from '../lib/importProgress.js';
import type { DroppedFiles } from '../shared/ipc';
import type { FolderScan } from '../shared/types';
import type { useLibraryLoading } from './library';
import { studio } from './shared';
import type { useAppState } from './state';

/** 拖进来的只有一项、名字没有扩展名：当成文件夹，交给主进程确认（不是文件夹时它会说） */
const folderLike = (files: DroppedFiles) => {
  const list = Array.from(files || []);
  return list.length === 1 && !/\.[a-z0-9]{1,5}$/i.test(String(list[0]?.name || ''));
};
export const assessGalleryDrop = (files: DroppedFiles) =>
  folderLike(files)
    ? { count: 1, valid: true, label: '文件夹', pendingDetails: false }
    : assessDroppedFiles(files);

export function useFolderImport({
  setPage,
  setGalleryView,
  setActiveCollectionId,
  setImportProgress,
  importProgress,
  archiveImport,
  reloadLibrary,
  reloadCollections,
  notify,
  showToast,
  page,
  dropHandlerRef,
}: Pick<
  ReturnType<typeof useAppState> & ReturnType<typeof useLibraryLoading>,
  | 'setPage'
  | 'setGalleryView'
  | 'setActiveCollectionId'
  | 'setImportProgress'
  | 'importProgress'
  | 'archiveImport'
  | 'reloadLibrary'
  | 'reloadCollections'
  | 'notify'
  | 'showToast'
  | 'page'
  | 'dropHandlerRef'
>) {
  const [folderScan, setFolderScan] = useState<FolderScan | null>(null);
  const busy = !!archiveImport || !!folderScan || isImportActive(importProgress);

  const importFolder = useCallback(
    async (path?: string) => {
      if (busy) return;
      setPage('gallery');
      try {
        const r = await invokeUI('import.folder.scan', path ? { path } : {});
        if (!('ok' in r)) return;
        if (!r.ok) throw new Error(r.error);
        if (!r.folders.some((f) => f.imageCount)) {
          notify({ text: '这个文件夹里没有 PNG、JPG、WEBP 图片' });
          void invokeUI('import.cancel', { id: r.sessionId });
          return;
        }
        setFolderScan(r);
      } catch (e) {
        showToast(e instanceof Error ? e.message : String(e), 'error');
      } finally {
        setImportProgress(null);
      }
    },
    [busy, notify, setImportProgress, setPage, showToast],
  );

  const cancelFolderImport = useCallback(() => {
    const id = folderScan?.sessionId;
    setFolderScan(null);
    if (id) void invokeUI('import.cancel', { id });
  }, [folderScan]);

  const commitFolderImport = useCallback(
    async (folderIds: string[], skipNoMetadata: boolean) => {
      const scan = folderScan;
      if (!scan) return;
      setFolderScan(null);
      setImportProgress({ phase: 'preparing', processed: 0, total: 0, current: '准备导入' });
      try {
        const r = await invokeUI('import.folder.commit', {
          sessionId: scan.sessionId,
          folderIds,
          skipNoMetadata,
        });
        if (!r.ok) throw new Error(r.error);
        await Promise.all([reloadLibrary('all'), reloadCollections()]);
        const into = r.imported + r.existing + r.restored;
        const cols = r.collectionsCreated + r.collectionsMerged;
        notify({
          tone: r.errors.length && !into ? 'error' : 'success',
          text: [
            r.canceled ? `已取消，取消前导入了 ${into} 张` : `已导入 ${into} 张`,
            cols ? `放进 ${cols} 个收藏集` : '',
            r.restored ? `${r.restored} 张从回收站移回` : '',
            r.errors.length ? `${r.errors.length} 张读不了` : '',
          ]
            .filter(Boolean)
            .join('，'),
          ...(into && !r.canceled
            ? {
                action: {
                  label: '查看',
                  onClick: () => {
                    setPage('gallery');
                    setGalleryView('all');
                    setActiveCollectionId('');
                  },
                },
              }
            : {}),
        });
      } catch (e) {
        showToast(e instanceof Error ? e.message : String(e), 'error');
      } finally {
        setImportProgress(null);
      }
    },
    [
      folderScan,
      notify,
      reloadCollections,
      reloadLibrary,
      setActiveCollectionId,
      setGalleryView,
      setImportProgress,
      setPage,
      showToast,
    ],
  );

  // 图片库里拖进一个文件夹就导入它；其余照旧（这个钩子在工作台的之后调用，所以这里的赋值算数）
  if (page === 'gallery') {
    const files = dropHandlerRef.current;
    if (files && !(files as { folder?: boolean }).folder) {
      const wrapped = (dropped: DroppedFiles) =>
        folderLike(dropped) ? void importFolder(studio.pathsForFiles(dropped)[0]) : files(dropped);
      dropHandlerRef.current = Object.assign(wrapped, { folder: true });
    }
  }

  useEffect(() => {
    const keydown = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || !e.shiftKey || e.key.toLowerCase() !== 'i') return;
      if (page !== 'gallery') return;
      e.preventDefault();
      void importFolder();
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }, [importFolder, page]);

  return { folderScan, importFolder, cancelFolderImport, commitFolderImport };
}
