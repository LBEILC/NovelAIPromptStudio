import { Activity } from 'react';
import GalleryPage from '../gallery/GalleryPage';
import { FolderImport } from '../gallery/FolderImport';
import { ZipImport } from '../gallery/ZipImport';
import { Confirm } from '../kit/dialog';
import { ContextMenu } from '../kit/menu';
import { writeClipboardText } from '../lib/clipboard';
import { invokeUI } from '../lib/commands';
import { writeActiveGalleryCollection } from '../lib/galleryCollections.js';
import { DEFAULT_GALLERY_FILTERS } from '../lib/galleryFilters.js';
import { isImportActive } from '../lib/importProgress.js';
import {
  normalizeWorkbenchViewState,
  reorderWorkbenchTabs,
  updateWorkbenchTab,
} from '../lib/workbenchSession.js';
import { MaterialsPage } from '../materials/Materials';
import SettingsPage from '../settings/SettingsPage';
import type { CommandTab } from '../shared/commands';
import type { ImageProject, LibraryCard } from '../shared/types';
import { CloseAsk } from '../shell/CloseAsk';
import { GenerationStatus } from '../shell/GenerationStatus';
import { Onboarding } from '../shell/Onboarding';
import { Spotlight } from '../kit/spotlight';
import { NewsCard } from '../shell/News';
import { openChangelog } from '../settings/About';
import { Titlebar } from '../shell/Titlebar';
import { WorkbenchTabs } from '../workbench/Tabs';
import WorkbenchPage from '../workbench/WorkbenchPage';
import type { useAppActions } from './actions';
import type { useWorkbenchAnnotations } from './annotations';
import type { useFolderImport } from './folderImport';
import type { useGalleryActions } from './galleryActions';
import type { useLibraryLoading } from './library';
import type { useGallerySelection } from './selection';
import { ImportExperience, studio } from './shared';
import type { useAppState } from './state';
import type { useWorkbenchActions } from './workbench';
export function renderApp({
  setPage,
  page,
  setWorkbenchSession,
  workbenchSession,
  closeTab,
  openWorkbenchPath,
  newBlankWork,
  openClipboardWorkbenchImage,
  setGalleryView,
  setGalleryFilters,
  setPreviewProjectId,
  pageShown,
  pageClass,
  setMaterialTarget,
  setMenuDestination,
  workbenchConnection,
  workbenchError,
  workbenchFocus,
  workbenchLoading,
  showToast,
  requestConfirmation,
  resetWorkbench,
  activeTab,
  reloadLibrary,
  translateWorkbenchTags,
  updateWorkbenchProject,
  cacheProgress,
  projectsByView,
  detachedRecords,
  importProgress,
  dragState,
  activeCollection,
  galleryCollectionsWithCounts,
  galleryContentKey,
  editingSmartCollection,
  deferredGalleryComputation,
  collectionScopedProjects,
  effectiveGalleryFilters,
  renameCollectionId,
  galleryGrouping,
  visibleGroups,
  libraryLoading,
  projects,
  similarGroupingState,
  setSelectedGroupIds,
  createGalleryCollection,
  deleteGalleryCollection,
  updateGalleryCollectionProjects,
  renameGalleryCollection,
  cancelSmartCollectionRulesEdit,
  beginSmartCollectionRulesEdit,
  saveSmartCollectionRules,
  selectGalleryCollection,
  updateGalleryGrouping,
  updateGalleryFilters,
  emptyTrash,
  importImages,
  permanentDelete,
  previewGalleryGroup,
  renameProject,
  renameProjects,
  restoreProjects,
  putBackDetached,
  discardDetached,
  lastSelectedGroupRef,
  setSort,
  toggleGroupSelection,
  moveToTrash,
  setActiveCollectionId,
  setEditingSmartCollectionId,
  setPreviewGroupId,
  preview,
  previewGroup,
  galleryFilters,
  selectedGroupIds,
  selectedProjectIds,
  sort,
  galleryUpdating,
  galleryView,
  materialTarget,
  menuDestination,
  installDownloadedUpdate,
  archiveImport,
  cancelArchiveImport,
  commitArchiveImport,
  onboarding,
  news,
  finishOnboarding,
  confirmation,
  resolveConfirmation,
  contextMenu,
  setContextMenu,
  folder,
}: { folder: ReturnType<typeof useFolderImport> } & Pick<
  ReturnType<typeof useAppState> &
    ReturnType<typeof useLibraryLoading> &
    ReturnType<typeof useWorkbenchActions> &
    ReturnType<typeof useGallerySelection> &
    ReturnType<typeof useWorkbenchAnnotations> &
    ReturnType<typeof useGalleryActions> &
    ReturnType<typeof useAppActions>,
  | 'setPage'
  | 'page'
  | 'setWorkbenchSession'
  | 'workbenchSession'
  | 'closeTab'
  | 'openWorkbenchPath'
  | 'newBlankWork'
  | 'openClipboardWorkbenchImage'
  | 'setGalleryView'
  | 'setGalleryFilters'
  | 'setPreviewProjectId'
  | 'pageShown'
  | 'pageClass'
  | 'setMaterialTarget'
  | 'setMenuDestination'
  | 'workbenchConnection'
  | 'workbenchError'
  | 'workbenchFocus'
  | 'workbenchLoading'
  | 'showToast'
  | 'requestConfirmation'
  | 'resetWorkbench'
  | 'activeTab'
  | 'reloadLibrary'
  | 'translateWorkbenchTags'
  | 'updateWorkbenchProject'
  | 'cacheProgress'
  | 'projectsByView'
  | 'detachedRecords'
  | 'importProgress'
  | 'dragState'
  | 'activeCollection'
  | 'galleryCollectionsWithCounts'
  | 'galleryContentKey'
  | 'editingSmartCollection'
  | 'deferredGalleryComputation'
  | 'collectionScopedProjects'
  | 'effectiveGalleryFilters'
  | 'renameCollectionId'
  | 'galleryGrouping'
  | 'visibleGroups'
  | 'libraryLoading'
  | 'projects'
  | 'similarGroupingState'
  | 'setSelectedGroupIds'
  | 'createGalleryCollection'
  | 'deleteGalleryCollection'
  | 'updateGalleryCollectionProjects'
  | 'renameGalleryCollection'
  | 'cancelSmartCollectionRulesEdit'
  | 'beginSmartCollectionRulesEdit'
  | 'saveSmartCollectionRules'
  | 'selectGalleryCollection'
  | 'updateGalleryGrouping'
  | 'updateGalleryFilters'
  | 'emptyTrash'
  | 'importImages'
  | 'permanentDelete'
  | 'previewGalleryGroup'
  | 'renameProject'
  | 'renameProjects'
  | 'restoreProjects'
  | 'putBackDetached'
  | 'discardDetached'
  | 'lastSelectedGroupRef'
  | 'setSort'
  | 'toggleGroupSelection'
  | 'moveToTrash'
  | 'setActiveCollectionId'
  | 'setEditingSmartCollectionId'
  | 'setPreviewGroupId'
  | 'preview'
  | 'previewGroup'
  | 'galleryFilters'
  | 'selectedGroupIds'
  | 'selectedProjectIds'
  | 'sort'
  | 'galleryUpdating'
  | 'galleryView'
  | 'materialTarget'
  | 'menuDestination'
  | 'installDownloadedUpdate'
  | 'archiveImport'
  | 'cancelArchiveImport'
  | 'commitArchiveImport'
  | 'onboarding'
  | 'news'
  | 'finishOnboarding'
  | 'confirmation'
  | 'resolveConfirmation'
  | 'contextMenu'
  | 'setContextMenu'
>) {
  // 功能一览的"去看看"、新功能卡片的"去试试"、引导各页的按钮（doc/design.md 2.36）
  const goTo = (target: string) => {
    if (target.startsWith('settings:')) {
      setMenuDestination({ section: target.slice(9) });
      setPage('settings');
    } else setPage(target as 'workbench' | 'gallery' | 'materials');
  };
  return (
    <>
      <Titlebar
        onNavigate={setPage}
        page={page}
        status={
          <GenerationStatus
            onOpen={(id) => {
              setWorkbenchSession((current) => ({ ...current, activeTabId: id }));
              setPage('workbench');
            }}
            onConfigure={() => goTo('settings:novelai')}
          />
        }
      >
        {page === 'workbench' && (
          <WorkbenchTabs
            session={workbenchSession}
            onActivateTab={(id) =>
              setWorkbenchSession((current) => ({ ...current, activeTabId: id }))
            }
            onCloseTab={closeTab}
            onReorderTab={(id, target) =>
              setWorkbenchSession((current) => reorderWorkbenchTabs(current, id, target))
            }
            onChooseImage={() => openWorkbenchPath()}
            onNewBlank={newBlankWork}
            onOpenClipboard={() => openClipboardWorkbenchImage()}
            onBrowseLibrary={() => setPage('gallery')}
            onShowLibrary={(tab) => {
              setGalleryView('all');
              setGalleryFilters({ ...DEFAULT_GALLERY_FILTERS, query: tab.project?.name || '' });
              setPreviewProjectId(tab.source.projectId!);
              setPage('gallery');
            }}
          />
        )}
      </Titlebar>
      <div className="swap pages">
        <Activity mode={pageShown('workbench')}>
          <div className={pageClass('workbench')} data-enter="fade">
            <WorkbenchPage
              onBrowseLibrary={() => setPage('gallery')}
              onShowMaterials={(kind = 'block', id) => {
                setMaterialTarget((t) => ({ kind, id, n: t.n + 1 }));
                setPage('materials');
              }}
              onConfigureGeneration={() => {
                setMenuDestination({ section: 'novelai' });
                setPage('settings');
              }}
              beforeGeneration={() => workbenchConnection?.flush() || Promise.resolve()}
              error={workbenchError}
              focusScopeKey={workbenchFocus.scopeKey}
              focusTagId={workbenchFocus.tagId}
              loading={workbenchLoading}
              onActivateTab={(id) =>
                setWorkbenchSession((current) => ({ ...current, activeTabId: id }))
              }
              onChooseImage={() => openWorkbenchPath()}
              onNewBlank={newBlankWork}
              onClipboardImage={openClipboardWorkbenchImage}
              onCloseTab={closeTab}
              onCopyImage={async (project) => {
                const result = await invokeUI('image.copy', { path: project.image_path });
                showToast(
                  result?.ok ? '已复制图片' : result?.error || '复制图片失败',
                  result?.ok ? 'success' : 'error',
                );
              }}
              onCopyText={async (
                text,
                count,
                selected,
                ignored = 0,
                label = '',
                automaticIgnored = 0,
              ) => {
                if (!text) return;
                await writeClipboardText(text);
                const ignoredLabels = [
                  ignored ? `${ignored} 个负面 Tag` : '',
                  automaticIgnored ? `${automaticIgnored} 个 NovelAI 自动 Tag` : '',
                ].filter(Boolean);
                const copiedLabel = label ? ` ${label}` : selected ? '选中的 Tag' : '可见的 Tag';
                showToast(
                  `${count ? `已复制 ${count} 个${copiedLabel}` : `已复制${label || '提示词'}`}${ignoredLabels.length ? `，忽略 ${ignoredLabels.join('、')}` : ''}`,
                );
              }}
              onConfirm={requestConfirmation}
              onDownloadImage={async (project) => {
                const result = await invokeUI('image.save-as', {
                  path: project.image_path,
                  name: project.name,
                });
                if (!('canceled' in result && result.canceled))
                  showToast(
                    result?.ok ? '已下载原图' : result?.error || '下载原图失败',
                    result?.ok ? 'success' : 'error',
                  );
              }}
              onNotify={showToast}
              onReset={resetWorkbench}
              onReveal={() =>
                activeTab?.project &&
                invokeUI('file.reveal', { path: activeTab.project.image_path })
              }
              onSaveLibrary={async () => {
                if (!activeTab?.project) return;
                const tabId = activeTab.id;
                await workbenchConnection?.flush();
                const commandResult = await studio.invoke('workbench.save-to-library', { tabId });
                const result = commandResult.ok
                  ? { ok: true as const, project: commandResult.data.project }
                  : { ok: false as const, error: commandResult.error.message };
                if (!result.ok) {
                  showToast(result.error, 'error');
                  return;
                }
                setWorkbenchSession((current) =>
                  updateWorkbenchTab(current, tabId, (tab: CommandTab) => ({
                    ...tab,
                    source: {
                      ...tab.source,
                      type: 'library',
                      projectId: result.project.id,
                      path: result.project.image_path,
                    },
                    project: {
                      ...tab.project,
                      id: result.project.id,
                      image_path: result.project.image_path,
                      thumbnail_path: result.project.thumbnail_path,
                    },
                  })),
                );
                await reloadLibrary('all');
                showToast('已存入图片库');
              }}
              onReorderTab={(tabId, targetTabId) =>
                setWorkbenchSession((current) => reorderWorkbenchTabs(current, tabId, targetTabId))
              }
              onRevealVibe={async (vibe) => {
                const result = await invokeUI('file.reveal', { vibe: vibe });
                showToast(
                  result?.ok ? '已在文件夹中显示 Vibe 文件' : result?.error || '生成 Vibe 文件失败',
                  result?.ok ? 'success' : 'error',
                );
              }}
              onTranslateTags={translateWorkbenchTags}
              onUpdateProject={updateWorkbenchProject}
              onUpdateViewState={(tabId, viewState) =>
                setWorkbenchSession((current) =>
                  updateWorkbenchTab(current, tabId, (tab: CommandTab) => ({
                    ...tab,
                    viewState: normalizeWorkbenchViewState(viewState),
                  })),
                )
              }
              session={workbenchSession}
            />
          </div>
        </Activity>
        <Activity mode={pageShown('gallery')}>
          <div className={pageClass('gallery')} data-enter="fade">
            <GalleryPage
              cacheProgress={cacheProgress}
              allCount={projectsByView.all.length}
              trashCount={projectsByView.trash.length + detachedRecords.length}
              importProgress={importProgress}
              onCancelImport={() =>
                importProgress?.batchId && invokeUI('import.cancel', { id: importProgress.batchId })
              }
              dragState={dragState}
              activeCollection={activeCollection}
              collections={galleryCollectionsWithCounts}
              contentKey={galleryContentKey}
              editingSmartCollection={editingSmartCollection}
              filterCacheSource={deferredGalleryComputation.projects}
              filterProjects={collectionScopedProjects}
              filterScopeKey={`${deferredGalleryComputation.view}:${deferredGalleryComputation.activeCollection?.id || 'all'}:${deferredGalleryComputation.activeCollection?.updated_at || ''}`}
              filters={effectiveGalleryFilters}
              renameCollectionId={renameCollectionId}
              grouping={galleryGrouping}
              groups={visibleGroups}
              importing={isImportActive(importProgress)}
              loading={
                (libraryLoading && !projects.length) ||
                (deferredGalleryComputation.grouping.promptScope === 'similar' &&
                  similarGroupingState.loading &&
                  !similarGroupingState.groups.length)
              }
              onClearSelection={() => setSelectedGroupIds([])}
              onCollectionCreate={createGalleryCollection}
              onCollectionDelete={deleteGalleryCollection}
              onCollectionProjectsChange={updateGalleryCollectionProjects}
              onCollectionRename={renameGalleryCollection}
              onCollectionRulesCancel={cancelSmartCollectionRulesEdit}
              onCollectionRulesEdit={beginSmartCollectionRulesEdit}
              onCollectionRulesSave={saveSmartCollectionRules}
              onCollectionSelect={selectGalleryCollection}
              onCopyImage={async (project) => {
                const result = await invokeUI('image.copy', { id: project.id });
                showToast(
                  result?.ok ? '已复制图片' : result?.error || '复制图片失败',
                  result?.ok ? 'success' : 'error',
                );
              }}
              onDownloadImage={async (project) => {
                const result = await invokeUI('image.save-as', { id: project.id });
                if (!('canceled' in result && result.canceled))
                  showToast(
                    result?.ok ? '已下载原图' : result?.error || '下载原图失败',
                    result?.ok ? 'success' : 'error',
                  );
              }}
              onGroupingChange={updateGalleryGrouping}
              onFiltersChange={updateGalleryFilters}
              onEmptyTrash={emptyTrash}
              onImport={() => importImages()}
              onImportClipboard={() => importImages(null, true)}
              onImportFolder={() => void folder.importFolder()}
              onUseAsBase={
                activeTab
                  ? (project) =>
                      void invokeUI('reference.set-base', {
                        tabId: activeTab.id,
                        imageId: project.id,
                      })
                        .then(() => showToast('已放进当前标签页的底图，生成时按它出图'))
                        .catch((error) => showToast(error.message, 'error'))
                  : undefined
              }
              onOpenAsNewWork={(project) =>
                void workbenchConnection
                  ?.prepare()
                  .then(() => invokeUI('work.open-from-image', { imageId: project.id }))
                  .then(() => {
                    setPage('workbench');
                    showToast('已作为新作品打开');
                  })
                  .catch((error) => showToast(error.message, 'error'))
              }
              onOpenWorkbench={(project, group) =>
                openWorkbenchPath(
                  (project as Pick<LibraryCard, 'id' | 'image_path'>).image_path,
                  {
                    type: 'library',
                    projectId: project.id,
                    path: (project as Pick<LibraryCard, 'id' | 'image_path'>).image_path,
                  },
                  // 从作品组打开时回到这个作品（1.5.6）
                  group?.id?.startsWith('work:') ? { workId: group.id.slice(5) } : {},
                )
              }
              onPermanentDelete={permanentDelete}
              onPreview={previewGalleryGroup}
              onQueryChange={(query) => updateGalleryFilters({ query })}
              onRename={renameProject}
              onRenameMany={renameProjects}
              onRestore={restoreProjects}
              onPutBack={putBackDetached}
              onDiscardDetached={discardDetached}
              onReveal={(project) => invokeUI('file.reveal', { path: project.image_path })}
              onSelectionChange={(groupIds) => {
                setSelectedGroupIds(groupIds);
                lastSelectedGroupRef.current = groupIds.at(-1) || '';
              }}
              onSelectAll={() => setSelectedGroupIds(visibleGroups.map((group) => group.id))}
              onSortChange={setSort}
              onToggleSelect={toggleGroupSelection}
              onTrash={moveToTrash}
              onViewChange={(view) => {
                writeActiveGalleryCollection(globalThis.localStorage, '');
                setActiveCollectionId('');
                setEditingSmartCollectionId('');
                setGalleryView(view);
                setSelectedGroupIds([]);
                setPreviewGroupId('');
                setPreviewProjectId('');
              }}
              preview={preview}
              previewGroup={previewGroup}
              query={galleryFilters.query}
              selectedGroupIds={selectedGroupIds}
              selectedImageCount={selectedProjectIds.length}
              sort={sort}
              updating={galleryUpdating}
              view={galleryView}
            />
          </div>
        </Activity>
        <Activity mode={pageShown('materials')}>
          <div className={pageClass('materials')} data-enter="fade">
            <MaterialsPage
              target={materialTarget}
              onShowImage={(id) => {
                selectGalleryCollection('');
                setGalleryView('all');
                setGalleryFilters(DEFAULT_GALLERY_FILTERS);
                setPreviewProjectId(id);
                setPage('gallery');
              }}
            />
          </div>
        </Activity>
        <Activity mode={pageShown('settings')}>
          <div className={pageClass('settings')} data-enter="fade">
            <SettingsPage
              onAccountSaved={() => setPage('workbench')}
              menuDestination={menuDestination}
              onFindTag={(tag) => {
                selectGalleryCollection('');
                setGalleryFilters({ ...DEFAULT_GALLERY_FILTERS, query: tag });
                setPage('gallery');
              }}
              onEmptyTrash={emptyTrash}
              onGo={goTo}
              onInstallUpdate={installDownloadedUpdate}
              onLibraryChange={async () => {
                const [images, trash] = await Promise.all([
                  reloadLibrary('all'),
                  reloadLibrary('trash'),
                ]);
                const paths = new Map([...images, ...trash].map((image) => [image.id, image]));
                setWorkbenchSession((session) => ({
                  ...session,
                  tabs: session.tabs.map((tab) => {
                    const image = tab.source.type === 'library' && paths.get(tab.source.projectId!);
                    if (!image) return tab;
                    const update = (project: ImageProject | null) =>
                      project && {
                        ...project,
                        image_path: image.image_path,
                        thumbnail_path: image.thumbnail_path,
                      };
                    return {
                      ...tab,
                      source: { ...tab.source, path: image.image_path },
                      project: update(tab.project),
                      originalProject: update(tab.originalProject),
                    };
                  }),
                }));
              }}
            />
          </div>
        </Activity>
      </div>
      {page !== 'gallery' && (
        <ImportExperience
          dragState={dragState}
          onCancel={() =>
            importProgress?.batchId && invokeUI('import.cancel', { id: importProgress.batchId })
          }
          progress={importProgress}
          target={page}
        />
      )}
      <ZipImport
        importSession={archiveImport}
        key={archiveImport?.sessionId || 'archive-import'}
        onCancel={cancelArchiveImport}
        onImport={commitArchiveImport}
      />
      <FolderImport
        scan={folder.folderScan}
        onCancel={folder.cancelFolderImport}
        onImport={(ids, skip) => void folder.commitFolderImport(ids, skip)}
      />

      <CloseAsk />

      <Onboarding
        open={onboarding}
        onClose={finishOnboarding}
        onAction={(action) => {
          if (action === 'recover') void openWorkbenchPath();
          else if (action === 'folder') void folder.importFolder();
          else
            goTo(
              {
                tidy: 'settings:tags',
                token: 'settings:novelai',
                fix: 'workbench',
                agent: 'settings:agent',
                help: 'settings:help',
              }[action],
            );
        }}
      />
      <Spotlight />
      <NewsCard
        news={news}
        onClose={finishOnboarding}
        onGo={goTo}
        onChangelog={() => {
          openChangelog();
          goTo('settings:updates');
        }}
      />

      <Confirm
        options={
          confirmation
            ? {
                title: confirmation.title || '',
                body: confirmation.message,
                tail: confirmation.detail,
                ok: confirmation.okText || '确定',
                danger: Boolean(confirmation.danger),
              }
            : null
        }
        onAnswer={resolveConfirmation}
      />
      <ContextMenu
        at={contextMenu?.at || null}
        items={contextMenu?.items || []}
        onClose={() => setContextMenu(null)}
      />
    </>
  );
}
