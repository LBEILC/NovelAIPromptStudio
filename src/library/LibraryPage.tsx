import { LibraryRename } from './Rename';
import { useEffect, useMemo, useState } from 'react';
import { Button, EmptyState, EmptyMark, Progress, ResizablePanel } from '../ui';
import { useLibraryDetail } from '../state/libraryDetail';
import { GALLERY_CARD_SIZE_KEY } from '../lib/galleryLayout.js';
import { GALLERY_PREVIEW_PANEL_WIDTH_KEY } from '../lib/panelLayout.js';
import { DEFAULT_GALLERY_FILTERS } from '../lib/galleryFilters.js';
import { LibrarySidebar } from './Sidebar';
import { LibraryToolbar } from './Toolbar';
import { LibraryGrid } from './Grid';
import { LibraryDetail } from './Detail';
import { LibraryViewer } from './Viewer';
import { CollectionPicker } from './Collections';
import { fallbackRatio, rowHeightFromLegacyWidth } from './layout';
import type { LibraryProps } from './types';
import type { LibraryCardCacheProgress } from '../shared/ipc';
import type { ImportProgress } from '../shared/types';
import './library.css';

function token(name: string) {
  return parseFloat(getComputedStyle(document.documentElement).getPropertyValue(name));
}
function stored(key: string) {
  try {
    return Number(localStorage.getItem(key)) || null;
  } catch {
    return null;
  }
}
function persist(key: string, value: number) {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* Keep session preferences usable. */
  }
}

export default function LibraryPage(
  p: LibraryProps & {
    cacheProgress?: LibraryCardCacheProgress | null;
    importProgress?: ImportProgress | null;
    onCancelImport: () => void;
    dragState?: { active: boolean; valid: boolean };
  },
) {
  const [rowHeight, setRowHeight] = useState(() => {
    const legacy = stored(GALLERY_CARD_SIZE_KEY);
    return legacy ? rowHeightFromLegacyWidth(legacy) : token('--thumb-row');
  });
  const [panelWidth, setPanelWidth] = useState(
    () => stored(GALLERY_PREVIEW_PANEL_WIDTH_KEY) || token('--detail-w'),
  );
  const [renaming, setRenaming] = useState(false);
  const [viewer, setViewer] = useState(false);
  const { detail, error } = useLibraryDetail(p.preview?.id || '', p.preview);
  const ids = useMemo(
    () =>
      p.groups
        .filter((group) => p.selectedGroupIds.includes(group.id))
        .flatMap((group) => group.members.map((member) => member.id)),
    [p.groups, p.selectedGroupIds],
  );
  useEffect(() => {
    if (!p.preview && p.groups.length && !p.loading) p.onPreview(p.groups[0]);
  }, [p.preview, p.groups, p.loading]);
  const empty = !p.loading && !p.groups.length;
  const noImages = empty && !(p.allCount ?? p.filterCacheSource.length) && p.view !== 'trash';
  const busyImport =
    p.importProgress && ['preparing', 'importing'].includes(p.importProgress.phase);
  return (
    <div
      className="library-page"
      data-library-page
      data-library-updating={p.updating || undefined}
      onKeyDown={(event) => {
        if ((event.target as HTMLElement).closest('input, textarea, [contenteditable=true]'))
          return;
        if (event.key === 'Escape') p.onClearSelection();
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a') {
          event.preventDefault();
          p.onSelectAll();
        }
      }}
    >
      <LibrarySidebar p={p} />
      <main className="library-middle">
        {(!noImages || !!p.activeCollection) && (
          <LibraryToolbar
            p={p}
            rowHeight={rowHeight}
            onRowHeight={(height) => {
              setRowHeight(height);
              persist(GALLERY_CARD_SIZE_KEY, height * fallbackRatio);
            }}
          />
        )}
        {p.cacheProgress ? (
          <div className="library-cache">
            <b>
              正在整理图片库 {p.cacheProgress.completed.toLocaleString()} /{' '}
              {p.cacheProgress.total.toLocaleString()}
            </b>
            <Progress
              label="正在整理图片库"
              value={p.cacheProgress.completed}
              max={p.cacheProgress.total}
            />
            <span className="library-help">只在升级后第一次打开时需要</span>
          </div>
        ) : empty ? (
          <div className="library-empty">
            <EmptyState
              graphic={noImages ? <EmptyMark /> : null}
              title={noImages ? '图片库里还没有图片' : '没有符合条件的图片'}
              description={
                noImages
                  ? '把图片或 NovelAI 导出的 ZIP 拖到这里。软件会复制一份保存，并读出每张图的 Prompt 和参数。'
                  : `图片库里有 ${p.allCount ?? p.filterCacheSource.length} 张图片，但没有一张同时满足现在的搜索和筛选。`
              }
              actions={
                noImages ? (
                  <>
                    <Button variant="ink" onClick={p.onImport}>
                      导入图片
                    </Button>
                    <Button onClick={p.onImportClipboard}>从剪贴板导入</Button>
                  </>
                ) : (
                  <Button onClick={() => p.onFiltersChange(DEFAULT_GALLERY_FILTERS)}>
                    清除搜索和筛选
                  </Button>
                )
              }
              fine={noImages ? '导入不会修改或移动你原来的文件。' : undefined}
            />
          </div>
        ) : (
          <LibraryGrid
            p={p}
            rowHeight={rowHeight}
            onRowHeight={(height) => {
              setRowHeight(height);
              persist(GALLERY_CARD_SIZE_KEY, height * fallbackRatio);
            }}
            onViewer={() => setViewer(true)}
          />
        )}
        {error && <div role="alert">{error}</div>}
        {ids.length > 0 && (
          <div className="library-dock">
            <div className="library-selection-bar" aria-label="多选操作条">
              <span>
                已选 {p.selectedGroupIds.length} 组 · {ids.length} 张
              </span>
              {p.view === 'trash' ? (
                <>
                  <Button variant="quiet" size="small" onClick={() => p.onRestore(ids)}>
                    <i className="ri-arrow-go-back-line" />
                    恢复
                  </Button>
                  <Button variant="danger" size="small" onClick={() => p.onPermanentDelete(ids)}>
                    永久删除
                  </Button>
                </>
              ) : (
                <>
                  <CollectionPicker p={p} ids={ids} />
                  <Button size="small" variant="quiet" onClick={() => setRenaming(true)}>
                    <i className="ri-edit-line" />
                    起名
                  </Button>
                  {p.activeCollection?.kind === 'manual' && (
                    <Button
                      size="small"
                      variant="quiet"
                      onClick={() =>
                        p.onCollectionProjectsChange(p.activeCollection!.id, ids, 'remove')
                      }
                    >
                      移出这个收藏集
                    </Button>
                  )}
                  <Button size="small" variant="danger" onClick={() => p.onTrash(ids)}>
                    移入回收站
                  </Button>
                </>
              )}
              <Button size="small" variant="quiet" onClick={p.onClearSelection}>
                取消
              </Button>
            </div>
          </div>
        )}
        {busyImport && p.importProgress && (
          <div className="library-dock">
            <div className="library-job">
              <div className="library-job-top">
                <b>
                  正在导入 {p.importProgress.processed || 0} / {p.importProgress.total || 0}
                </b>
                <Button variant="quiet" size="small" onClick={p.onCancelImport}>
                  取消剩下的
                </Button>
              </div>
              <Progress
                label="导入进度"
                value={p.importProgress.processed || 0}
                max={p.importProgress.total || 0}
              />
              <span className="library-help">
                已跳过 {'duplicates' in p.importProgress ? p.importProgress.duplicates : 0}{' '}
                张图片库里已经有的图片
              </span>
            </div>
          </div>
        )}
        {p.dragState?.active && (
          <div className="library-drop">
            {p.dragState.valid ? '松开后导入图片库' : '只能导入 PNG、JPG、WEBP 图片和 ZIP'}
          </div>
        )}
      </main>
      {!empty && (
        <ResizablePanel
          edge="left"
          label="详情栏宽度"
          width={panelWidth}
          defaultWidth={token('--detail-w')}
          min={token('--popover-w')}
          max={token('--prompt-w')}
          onWidthChange={(width) => {
            setPanelWidth(width);
            persist(GALLERY_PREVIEW_PANEL_WIDTH_KEY, width);
          }}
        >
          <LibraryDetail p={p} detail={detail} onViewer={() => setViewer(true)} />
        </ResizablePanel>
      )}
      <LibraryRename open={renaming} p={p} ids={ids} onClose={() => setRenaming(false)} />
      {viewer && (
        <LibraryViewer
          p={p}
          onClose={() => {
            setViewer(false);
            requestAnimationFrame(() =>
              document.querySelector<HTMLElement>('.library-card.current')?.focus(),
            );
          }}
        />
      )}
    </div>
  );
}
