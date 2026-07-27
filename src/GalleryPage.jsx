import { ActionIcon, DraggablePanel as LobeDraggablePanel, Empty as LobeEmpty, SearchBar as LobeSearchBar } from '@lobehub/ui';
import { Button as LobeButton, Input as LobeInput, Segmented, Select as LobeSelect, SplitButton } from '@lobehub/ui/base-ui';
import { useEffect, useRef, useState } from 'react';
import Icon from './components/Icon.jsx';
import ImageStage, { mediaUrl } from './components/ImageStage.jsx';
import SelectionMark from './components/SelectionMark.jsx';
import { countPromptTags, formatPositivePromptForCopy } from './lib/promptStructure.js';
import { isTextEditingTarget } from './lib/contextMenu.js';

function formatDate(value) {
  if (!value) return '未知时间';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));
}

function ImportButton({ importing, onImport, onImportClipboard }) {
  return <SplitButton loading={importing} type="primary">
    <SplitButton.Main icon={<Icon name="plus"/>} onClick={onImport}>
      {importing ? '正在导入…' : '导入图片'}
    </SplitButton.Main>
    <SplitButton.Menu
      aria-label="其他导入方式"
      items={[{ key: 'clipboard', label: '从剪贴板导入', onClick: onImportClipboard }]}
      placement="bottomRight"
    />
  </SplitButton>;
}

function BatchToolbar({ view, selectedGroups, selectedImages, onFavorite, onTrash, onRestore, onPermanentDelete, onClear }) {
  if (!selectedGroups) return null;
  return <div className="gallery-selection-bar">
    <span>已选 <b>{selectedGroups}</b> 组 · <b>{selectedImages}</b> 张图片</span>
    {view === 'trash' ? <>
      <LobeButton icon={<Icon name="restore" size={14}/>} onClick={onRestore} size="small">恢复</LobeButton>
      <LobeButton danger icon={<Icon name="trash" size={14}/>} onClick={onPermanentDelete} size="small">永久删除</LobeButton>
    </> : <>
      <LobeButton icon={<Icon name="star" size={14}/>} onClick={() => onFavorite(true)} size="small">收藏</LobeButton>
      <LobeButton onClick={() => onFavorite(false)} size="small">取消收藏</LobeButton>
      <LobeButton danger icon={<Icon name="trash" size={14}/>} onClick={onTrash} size="small" type="fill">移入回收站</LobeButton>
    </>}
    <LobeButton onClick={onClear} size="small" type="text">取消选择</LobeButton>
  </div>;
}

function GalleryCard({ active, group, selected, onPreview, onSelect, onContextMenu }) {
  const project = group.cover;
  const stackMembers = group.members.filter((member) => member.id !== project.id).slice(0, 2);
  return <article className={`gallery-card ${active ? 'active' : ''} ${selected ? 'selected' : ''} ${group.count > 1 ? 'grouped' : ''}`}>
    <button
      className="gallery-card-main"
      onClick={(event) => selected || event.ctrlKey || event.metaKey || event.shiftKey ? onSelect(event) : onPreview()}
      onContextMenu={onContextMenu}
      type="button"
    >
      <span className="gallery-card-image">
        {stackMembers.map((member, index) => <img
          alt=""
          aria-hidden="true"
          className={`gallery-card-stack gallery-card-stack-${index + 1}`}
          key={member.id}
          loading="lazy"
          src={mediaUrl(member.thumbnail_path || member.image_path)}
        />)}
        <img alt="" loading="lazy" src={mediaUrl(project.thumbnail_path || project.image_path)}/>
        {group.count > 1 && <span className="gallery-group-count">{group.count} 张</span>}
      </span>
      <span className="gallery-card-copy">
        <strong title={project.name}>{project.name}</strong>
        <small>{countPromptTags(project)} Tags · {project.metadata?.width || '—'} × {project.metadata?.height || '—'}</small>
      </span>
    </button>
    <button
      aria-label={selected ? `取消选择 ${project.name}` : `选择 ${project.name}`}
      className="gallery-card-select"
      onClick={(event) => { event.stopPropagation(); onSelect(event); }}
      type="button"
    ><SelectionMark selected={selected}/></button>
  </article>;
}

export default function GalleryPage({
  groups,
  query,
  sort,
  view,
  previewGroup,
  preview,
  importing,
  selectedGroupIds,
  selectedImageCount,
  onClearSelection,
  onEmptyTrash,
  onFavorite,
  onImport,
  onImportClipboard,
  onNavigatePreview,
  onOpenWorkbench,
  onPreview,
  onProjectContextMenu,
  onWorkspaceContextMenu,
  onQueryChange,
  onRename,
  onRestore,
  onPermanentDelete,
  onReveal,
  onSetCover,
  onSelectAll,
  onSortChange,
  onToggleSelect,
  onTrash,
  onViewChange,
  onCopyImage,
  onDownloadImage,
}) {
  const [previewExpanded, setPreviewExpanded] = useState(Boolean(preview));
  const [previewPanelWidth, setPreviewPanelWidth] = useState();
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const renameTargetRef = useRef('');

  useEffect(() => {
    setPreviewExpanded(Boolean(preview));
    const requestedRename = Boolean(preview && renameTargetRef.current === preview.id);
    renameTargetRef.current = '';
    setRenaming(requestedRename);
    setNameDraft(preview?.name || '');
  }, [preview?.id]);

  useEffect(() => {
    const handleKey = (event) => {
      if (!previewGroup || isTextEditingTarget(event.target) || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      onNavigatePreview(event.key === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onNavigatePreview, previewGroup]);

  const memberIndex = previewGroup?.members.findIndex((project) => project.id === preview?.id) ?? -1;
  const saveName = async () => {
    if (await onRename(preview, nameDraft)) setRenaming(false);
  };
  const requestRename = (group) => {
    const project = group.cover;
    setPreviewExpanded(true);
    if (preview?.id === project.id) {
      setNameDraft(project.name || '');
      setRenaming(true);
      return;
    }
    renameTargetRef.current = project.id;
    onPreview(group);
  };

  return <main className="gallery-page">
    <header className="workspace-page-header">
      <h1>图片库</h1>
      <ImportButton importing={importing} onImport={onImport} onImportClipboard={onImportClipboard}/>
    </header>
    <div className="gallery-toolbar">
      <Segmented
        aria-label="图片库视图"
        onChange={onViewChange}
        options={[{ label: '全部', value: 'all' }, { label: '收藏', value: 'favorites' }, { label: '回收站', value: 'trash' }]}
        size="small"
        value={view}
      />
      <LobeSearchBar className="gallery-search" onInputChange={onQueryChange} placeholder="搜索文件名、Tag 或译名" value={query}/>
      <LobeSelect aria-label="图片排序" className="gallery-sort" onChange={onSortChange} options={[
        { label: '最近导入', value: 'recent' },
        { label: '最早导入', value: 'oldest' },
        { label: '按名称', value: 'name' },
      ]} value={sort}/>
      <span className="gallery-count">{groups.length} 组 · {groups.reduce((count, group) => count + group.count, 0)} 张</span>
      <LobeButton disabled={!groups.length} onClick={onSelectAll} size="small" type="text">全选当前结果</LobeButton>
      {view === 'trash' && <LobeButton danger disabled={!groups.length} onClick={onEmptyTrash} size="small">清空回收站</LobeButton>}
    </div>
    <BatchToolbar
      onClear={onClearSelection}
      onFavorite={onFavorite}
      onPermanentDelete={onPermanentDelete}
      onRestore={onRestore}
      onTrash={onTrash}
      selectedGroups={selectedGroupIds.length}
      selectedImages={selectedImageCount}
      view={view}
    />
    <div className="gallery-workspace">
      <section
        className="gallery-grid-scroll"
        onContextMenu={(event) => {
          if (event.target.closest('.gallery-card')) return;
          onWorkspaceContextMenu(event);
        }}
      >
        {groups.length ? <div className="gallery-grid">
          {groups.map((group) => <GalleryCard
            active={previewGroup?.id === group.id}
            group={group}
            key={group.id}
            onContextMenu={(event) => onProjectContextMenu(event, group, () => requestRename(group))}
            onPreview={() => { setPreviewExpanded(true); onPreview(group); }}
            onSelect={(event) => onToggleSelect(group, event)}
            selected={selectedGroupIds.includes(group.id)}
          />)}
        </div> : <LobeEmpty
          className="gallery-empty"
          description={query ? '换一个关键词试试。' : view === 'trash' ? '移入回收站的图片会显示在这里。' : '拖入图片，或点击右上角导入。'}
          image={<Icon name="image" size={30}/>}
          title={query ? '没有匹配的图片' : view === 'favorites' ? '还没有收藏图片' : view === 'trash' ? '回收站为空' : '图片库还是空的'}
        />}
      </section>
      <LobeDraggablePanel
        className="gallery-preview-shell"
        classNames={{ content: 'workspace-side-panel-content' }}
        defaultSize={{ width: '28vw' }}
        expand={previewExpanded}
        maxWidth={560}
        minWidth={340}
        onExpandChange={setPreviewExpanded}
        onSizeChange={(_delta, size) => setPreviewPanelWidth(size?.width)}
        placement="right"
        showHandleHighlight
        size={previewPanelWidth ? { height: '100%', width: previewPanelWidth } : undefined}
      >
        {preview && <LobeDraggablePanel.Body className="gallery-preview">
          <header>
            {renaming ? <div className="gallery-rename">
              <LobeInput
                autoFocus
                maxLength={160}
                onChange={(event) => setNameDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') saveName();
                  if (event.key === 'Escape') setRenaming(false);
                }}
                size="small"
                value={nameDraft}
              />
              <LobeButton onClick={saveName} size="small" type="primary">保存</LobeButton>
              <LobeButton onClick={() => setRenaming(false)} size="small" type="text">取消</LobeButton>
            </div> : <h2 onDoubleClick={() => view !== 'trash' && setRenaming(true)} title={preview.name}>{preview.name}</h2>}
          </header>
          <ImageStage
            alt={preview.name}
            className="gallery-preview-stage"
            filePath={preview.image_path}
            toolbarAddon={<>
              <ActionIcon icon={<Icon name="copy" size={16}/>} onClick={() => onCopyImage(preview)} title="复制图片"/>
              <ActionIcon icon={<Icon name="download" size={16}/>} onClick={() => onDownloadImage(preview)} title="下载图片"/>
            </>}
          >
            {previewGroup?.count > 1 && <>
              <ActionIcon className="gallery-stage-nav previous" icon={<Icon name="previous"/>} onClick={() => onNavigatePreview(-1)} title="上一张"/>
              <span className="gallery-stage-position">{memberIndex + 1} / {previewGroup.count}</span>
              <ActionIcon className="gallery-stage-nav next" icon={<Icon name="next"/>} onClick={() => onNavigatePreview(1)} title="下一张"/>
            </>}
          </ImageStage>
          <div className="gallery-preview-meta"><span>{preview.metadata?.width || '—'} × {preview.metadata?.height || '—'}</span><span>{countPromptTags(preview)} Tags</span><span>{formatDate(preview.created_at)}</span></div>
          <div className="gallery-preview-prompt"><span>原始 Prompt</span><p>{formatPositivePromptForCopy(preview) || '没有检测到 Prompt'}</p></div>
          <div className="gallery-preview-actions">
            {view !== 'trash' && <LobeButton className="gallery-preview-action-wide" icon={<Icon name="edit" size={14}/>} onClick={() => onOpenWorkbench(preview)} type="primary">在工作台编辑</LobeButton>}
            <LobeButton icon={<Icon name="star" size={14}/>} onClick={() => onFavorite(!preview.is_favorite, [preview.id])}>{preview.is_favorite ? '取消收藏' : '收藏'}</LobeButton>
            <LobeButton icon={<Icon name="folder" size={14}/>} onClick={() => onReveal(preview)}>在文件夹中显示</LobeButton>
            {view !== 'trash' && <LobeButton onClick={() => setRenaming(true)}>重命名</LobeButton>}
            {previewGroup?.count > 1 && previewGroup.cover.id !== preview.id && view !== 'trash' && <LobeButton onClick={() => onSetCover(previewGroup, preview)}>设为头图</LobeButton>}
            {view === 'trash'
              ? <><LobeButton icon={<Icon name="restore" size={14}/>} onClick={() => onRestore([preview.id])}>恢复当前图片</LobeButton><LobeButton danger icon={<Icon name="trash" size={14}/>} onClick={() => onPermanentDelete([preview.id])}>永久删除当前图片</LobeButton></>
              : <LobeButton className="gallery-preview-action-wide" danger icon={<Icon name="trash" size={14}/>} onClick={() => onTrash([preview.id], 'detail')} type="fill">删除当前图片</LobeButton>}
          </div>
        </LobeDraggablePanel.Body>}
      </LobeDraggablePanel>
    </div>
  </main>;
}
