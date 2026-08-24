import { Button as LobeButton, Modal as LobeModal } from '@lobehub/ui/base-ui';
import { Popover, PopoverGroup } from '@lobehub/ui';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { archiveImportNameParts, reconcileArchiveImportSelection, selectableArchiveEntries, toggleArchiveImportSelection } from '../lib/archiveImport.js';
import { isTextEditingTarget } from '../lib/contextMenu.js';
import { mediaUrl } from '../lib/imageStage.js';
import { encodeMarqueeKey } from '../lib/marqueeSelection.js';
import GalleryImageHoverPreview from './GalleryImageHoverPreview.jsx';
import { MarqueeSelectionOverlay, useMarqueeSelection } from './MarqueeSelection.jsx';
import SelectionMark from './SelectionMark.jsx';
import Icon from './Icon.jsx';

const ARCHIVE_HOVER_POSITIONER_STYLES = { root: { pointerEvents: 'none' } };
const ARCHIVE_IMPORT_MODAL_Z_INDEX = 1200;
const ARCHIVE_IMPORT_MARQUEE_Z_INDEX = 1202;
const ARCHIVE_IMPORT_PREVIEW_Z_INDEX = 1203;

function ArchiveImportHoverPreview({ entry }) {
  const { name, folder } = archiveImportNameParts(entry.fileName);
  return <GalleryImageHoverPreview
    height={entry.previewHeight}
    src={mediaUrl(entry.previewPath)}
    width={entry.previewWidth}
  >
    <div className="gallery-card-hover-meta">
      <span>{entry.previewWidth || '—'} × {entry.previewHeight || '—'} · ZIP 预览</span>
      <span>{folder || name}</span>
    </div>
  </GalleryImageHoverPreview>;
}

const ArchiveImportCard = memo(function ArchiveImportCard({ entry, onToggle, selected }) {
  const { name, folder } = archiveImportNameParts(entry.fileName);
  const unavailable = Boolean(entry.previewError);
  const card = <article
    className={`archive-import-card ${selected ? 'selected' : ''} ${unavailable ? 'unavailable' : ''}`}
    data-marquee-key={unavailable ? undefined : encodeMarqueeKey(entry.id)}
    title={entry.previewError || undefined}
  >
    <button
      aria-label={unavailable ? `${name} 无法预览或导入` : selected ? `取消选择 ${name}` : `选择 ${name}`}
      aria-pressed={unavailable ? undefined : selected}
      className="archive-import-card-main"
      disabled={unavailable}
      onClick={(event) => onToggle(entry.id, event)}
      type="button"
    >
      <span className="archive-import-thumbnail">
        {entry.previewPath
          ? <img alt="" decoding="async" draggable="false" loading="lazy" src={mediaUrl(entry.previewPath)}/>
          : entry.previewError
            ? <span className="archive-import-thumbnail-error"><Icon name="warning" size={22}/></span>
            : <span aria-hidden="true" className="archive-import-thumbnail-loading"/>}
        <span aria-hidden="true" className="archive-import-hover-name">
          <strong>{name}</strong>
          {folder && <small>{folder}</small>}
        </span>
      </span>
    </button>
    {!unavailable && <button
      aria-label={selected ? `取消选择 ${name}` : `选择 ${name}`}
      className="archive-import-card-select"
      onClick={(event) => { event.stopPropagation(); onToggle(entry.id, event); }}
      type="button"
    ><SelectionMark className="archive-import-selection-mark" selected={selected}/></button>}
  </article>;
  return <Popover
    content={entry.previewPath
      ? <ArchiveImportHoverPreview entry={entry}/>
      : <span aria-hidden="true"/>}
    disabled={!entry.previewPath}
    placement="rightTop"
    styles={ARCHIVE_HOVER_POSITIONER_STYLES}
    trigger="hover"
  >{card}</Popover>;
});

export default function ArchiveImportModal({ importSession, onCancel, onImport }) {
  const entries = importSession?.entries || [];
  const [selectedIds, setSelectedIds] = useState(() => selectableArchiveEntries(entries).map((entry) => entry.id));
  const containerRef = useRef(null);
  const anchorRef = useRef('');
  const entriesRef = useRef(entries);
  const sessionIdRef = useRef('');
  const selectableEntries = useMemo(() => selectableArchiveEntries(entries), [entries]);
  const selectableIds = useMemo(() => selectableEntries.map((entry) => entry.id), [selectableEntries]);
  const activeSelectedIds = useMemo(() => reconcileArchiveImportSelection(entries, selectedIds), [entries, selectedIds]);
  entriesRef.current = entries;

  useEffect(() => {
    const sessionId = importSession?.sessionId || '';
    if (!sessionId || sessionIdRef.current === sessionId) return;
    sessionIdRef.current = sessionId;
    const ids = selectableArchiveEntries(importSession.entries).map((entry) => entry.id);
    setSelectedIds(ids);
    anchorRef.current = '';
  }, [importSession]);

  useEffect(() => {
    if (!importSession) return undefined;
    const selectAll = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'a' || isTextEditingTarget(event.target)) return;
      event.preventDefault();
      setSelectedIds(selectableIds);
      anchorRef.current = selectableIds.at(-1) || '';
    };
    window.addEventListener('keydown', selectAll);
    return () => window.removeEventListener('keydown', selectAll);
  }, [importSession, selectableIds]);

  const marqueeSelection = useMarqueeSelection({
    containerRef,
    enabled: Boolean(importSession && selectableEntries.length),
    onSelectionChange: (ids) => {
      setSelectedIds(ids);
      anchorRef.current = ids.at(-1) || '';
    },
    selectedKeys: activeSelectedIds,
  });

  const toggleEntry = useCallback((entryId, event) => {
    const modifiers = { shiftKey: Boolean(event.shiftKey) };
    setSelectedIds((current) => {
      const reconciled = reconcileArchiveImportSelection(entriesRef.current, current);
      const next = toggleArchiveImportSelection(entriesRef.current, reconciled, entryId, modifiers, anchorRef.current);
      anchorRef.current = next.anchorId;
      return next.selectedIds;
    });
  }, []);

  if (!importSession) return null;
  const selectedSet = new Set(activeSelectedIds);
  const failedCount = entries.filter((entry) => entry.previewError).length;
  const totalImportCount = activeSelectedIds.length + (importSession.directImageCount || 0);
  const previewCopy = importSession.previewComplete
    ? importSession.previewError ? '部分预览未完成' : '预览已就绪'
    : `正在生成预览 ${importSession.previewCompleted || 0} / ${entries.length}`;

  return <LobeModal
    cancelText="取消导入"
    destroyOnHidden
    draggable={false}
    height="min(760px, calc(100vh - 48px))"
    maskClosable
    okButtonProps={{ disabled: totalImportCount === 0 }}
    okText={`导入 ${totalImportCount} 张`}
    onCancel={onCancel}
    onOk={() => onImport(activeSelectedIds)}
    open
    styles={{ body: { minHeight: 0, overflow: 'hidden', padding: 0 } }}
    title="选择要导入的图片"
    width="min(980px, calc(100vw - 48px))"
    zIndex={ARCHIVE_IMPORT_MODAL_Z_INDEX}
  >
    <div className="archive-import-dialog">
      <div className="archive-import-toolbar">
        <div className="archive-import-summary" aria-live="polite">
          <strong>已选 {activeSelectedIds.length} / {selectableEntries.length} 张 ZIP 图片</strong>
          <span>{previewCopy}{importSession.directImageCount ? ` · 另有 ${importSession.directImageCount} 张外部图片将同时导入` : ''}</span>
        </div>
        <div className="archive-import-selection-actions">
          <LobeButton disabled={activeSelectedIds.length === selectableEntries.length} onClick={() => { setSelectedIds(selectableIds); anchorRef.current = selectableIds.at(-1) || ''; }} size="small">全选</LobeButton>
          <LobeButton disabled={!activeSelectedIds.length} onClick={() => { setSelectedIds([]); anchorRef.current = ''; }} size="small" type="text">清空</LobeButton>
        </div>
      </div>
      {(failedCount > 0 || importSession.problemCount > 0 || importSession.previewError) && <div className="archive-import-warning" role="status">
        <Icon name="warning" size={15}/>
        <span>{failedCount ? `${failedCount} 张图片无法读取，已从选择中排除。` : ''}{importSession.problemCount ? `另有 ${importSession.problemCount} 个文件无法准备，导入结果中会说明。` : ''}{importSession.previewError ? ` ${importSession.previewError}` : ''}</span>
      </div>}
      <PopoverGroup
        closeDelay={0}
        openDelay={80}
        placement="rightTop"
        trigger="hover"
        zIndex={ARCHIVE_IMPORT_PREVIEW_Z_INDEX}
      >
        <div className="archive-import-scroll" onDragStart={(event) => event.preventDefault()} ref={containerRef} {...marqueeSelection.handlers}>
          {importSession.archives.map((archive) => {
            const archiveEntries = entries.filter((entry) => entry.archiveId === archive.id);
            const archiveSelected = archiveEntries.filter((entry) => selectedSet.has(entry.id)).length;
            return <section className="archive-import-source" key={archive.id}>
              <header>
                <strong title={archive.name}>{archive.name}</strong>
                <span>{archiveSelected} / {archiveEntries.filter((entry) => !entry.previewError).length}</span>
              </header>
              <div className="archive-import-grid">
                {archiveEntries.map((entry) => <ArchiveImportCard entry={entry} key={entry.id} onToggle={toggleEntry} selected={selectedSet.has(entry.id)}/>)}
              </div>
            </section>;
          })}
        </div>
      </PopoverGroup>
      <div className="archive-import-hint">单击选择 · Shift 连选 · Ctrl/Cmd 切换 · 拖动框选 · 悬停预览</div>
      <MarqueeSelectionOverlay rect={marqueeSelection.rect} zIndex={ARCHIVE_IMPORT_MARQUEE_Z_INDEX}/>
    </div>
  </LobeModal>;
}
