import { Accordion, AccordionItem, ActionIcon, DraggablePanel as LobeDraggablePanel, Empty as LobeEmpty, Highlighter, SearchBar as LobeSearchBar } from '@lobehub/ui';
import { Button as LobeButton, Input as LobeInput, Segmented, Select as LobeSelect, SplitButton } from '@lobehub/ui/base-ui';
import { useEffect, useRef, useState } from 'react';
import Icon, { getIconComponent } from './components/Icon.jsx';
import ImagePreviewToolbar from './components/ImagePreviewToolbar.jsx';
import ImageStage, { mediaUrl } from './components/ImageStage.jsx';
import SelectionMark from './components/SelectionMark.jsx';
import { galleryEmptyState } from './lib/gallery.js';
import { countPromptTags, positiveRawPromptScopes } from './lib/promptStructure.js';
import { isTextEditingTarget } from './lib/contextMenu.js';

function formatDate(value) {
  if (!value) return '未知时间';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));
}

function promptScopeTitle(scope) {
  if (scope.kind === 'base') return '基础 Prompt';
  const fallback = `角色 ${(scope.characterIndex ?? 0) + 1}`;
  const label = String(scope.character?.label || '').trim();
  return `${/^Character \d+$/i.test(label) || !label ? fallback : label} Prompt`;
}

function RawPromptSections({ project }) {
  const scopes = positiveRawPromptScopes(project);
  if (!scopes.length) return <div className="gallery-preview-prompt-empty">没有检测到 Prompt</div>;
  const baseScope = scopes.find((scope) => scope.kind === 'base');
  return <Accordion
    className="gallery-preview-prompt-accordion"
    defaultExpandedKeys={baseScope ? [baseScope.key] : [scopes[0].key]}
    gap={8}
    keepContentMounted={false}
  >
    {scopes.map((scope) => <AccordionItem
      classNames={{ content: 'gallery-preview-prompt-content', header: 'gallery-preview-prompt-header' }}
      itemKey={scope.key}
      key={scope.key}
      padding={0}
      title={<span className="gallery-preview-prompt-title"><strong>{promptScopeTitle(scope)}</strong><small>{scope.tags.length} Tags</small></span>}
      variant="outlined"
    >
      <Highlighter
        className="gallery-preview-prompt-code"
        copyable
        language="plaintext"
        showLanguage={false}
        variant="filled"
        wrap
      >{scope.raw_prompt}</Highlighter>
    </AccordionItem>)}
  </Accordion>;
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

export function BatchToolbar({ view, selectedGroups, selectedImages, onFavorite, onTrash, onRestore, onPermanentDelete, onClear }) {
  if (!selectedGroups) return null;
  return <div className="gallery-selection-bar">
    <span>已选 <b>{selectedGroups}</b> 组 · <b>{selectedImages}</b> 张图片</span>
    {view === 'trash' ? <>
      <LobeButton icon={<Icon name="restore" size={14}/>} onClick={() => onRestore()} size="small">恢复</LobeButton>
      <LobeButton danger icon={<Icon name="trash" size={14}/>} onClick={() => onPermanentDelete()} size="small">永久删除</LobeButton>
    </> : <>
      <LobeButton icon={<Icon name="star" size={14}/>} onClick={() => onFavorite(true)} size="small">收藏</LobeButton>
      <LobeButton onClick={() => onFavorite(false)} size="small">取消收藏</LobeButton>
      <LobeButton danger icon={<Icon name="trash" size={14}/>} onClick={() => onTrash()} size="small" type="fill">移入回收站</LobeButton>
    </>}
    <LobeButton onClick={() => onClear()} size="small" type="text">取消选择</LobeButton>
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
  const [previewPinned, setPreviewPinned] = useState(false);
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
  const emptyState = galleryEmptyState(view, query);
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
      <div className="gallery-sort">
        <LobeSelect aria-label="图片排序" onChange={onSortChange} options={[
          { label: '最近导入', value: 'recent' },
          { label: '最早导入', value: 'oldest' },
          { label: '按名称', value: 'name' },
        ]} value={sort}/>
      </div>
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
          description={emptyState.description}
          gap={6}
          icon={getIconComponent(emptyState.icon)}
          imageSize={38}
          justify="center"
          title={emptyState.title}
        />}
      </section>
      <LobeDraggablePanel
        className={`gallery-preview-shell ${previewPinned ? 'is-fixed' : 'is-floating'}`}
        classNames={{ content: 'workspace-side-panel-content' }}
        defaultSize={{ width: 'clamp(340px, 28vw, 560px)' }}
        expand={previewExpanded}
        maxWidth={560}
        minWidth={340}
        mode={previewPinned ? 'fixed' : 'float'}
        onExpandChange={setPreviewExpanded}
        onSizeChange={(_delta, size) => setPreviewPanelWidth(size?.width)}
        placement="right"
        showHandleHighlight
        stableLayout
        size={previewPanelWidth ? { height: '100%', width: previewPanelWidth } : undefined}
      >
        {preview && <LobeDraggablePanel.Body
          className={`gallery-preview ${view === 'trash' ? 'is-trash' : ''}`}
          style={{ display: 'grid', height: '100%', minHeight: 0, overflow: 'hidden', padding: 0 }}
        >
          <section className="gallery-preview-primary">
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
              <ActionIcon
                active={previewPinned}
                aria-label={previewPinned ? '取消固定预览面板' : '固定预览面板'}
                aria-pressed={previewPinned}
                className="gallery-preview-pin"
                icon={<Icon name={previewPinned ? 'pinOff' : 'pin'}/>}
                onClick={() => setPreviewPinned((pinned) => !pinned)}
                title={previewPinned ? '取消固定，浮动显示' : '固定为分栏'}
              />
            </header>
            <ImageStage
              alt={preview.name}
              className="gallery-preview-stage"
              filePath={preview.image_path}
              previewToolbar={(_originalNode, info) => <ImagePreviewToolbar
                info={info}
                onCopy={() => onCopyImage(preview)}
                onDownload={() => onDownloadImage(preview)}
              />}
            >
              {previewGroup?.count > 1 && <>
                <ActionIcon className="gallery-stage-nav previous" icon={<Icon name="previous"/>} onClick={() => onNavigatePreview(-1)} title="上一张"/>
                <span className="gallery-stage-position">{memberIndex + 1} / {previewGroup.count}</span>
                <ActionIcon className="gallery-stage-nav next" icon={<Icon name="next"/>} onClick={() => onNavigatePreview(1)} title="下一张"/>
              </>}
            </ImageStage>
            <div className="gallery-preview-meta"><span>{preview.metadata?.width || '—'} × {preview.metadata?.height || '—'}</span><span>{countPromptTags(preview)} Tags</span><span>{formatDate(preview.created_at)}</span></div>
          </section>
          <section className="gallery-preview-prompt" aria-label="原始 Prompt">
            <header><h3>原始 Prompt</h3></header>
            <RawPromptSections key={preview.id} project={preview}/>
          </section>
          <footer className="gallery-preview-actions">
            {view !== 'trash' && <LobeButton className="gallery-preview-action-wide" icon={<Icon name="edit" size={14}/>} onClick={() => onOpenWorkbench(preview)} type="primary">在工作台编辑</LobeButton>}
            <LobeButton icon={<Icon name="star" size={14}/>} onClick={() => onFavorite(!preview.is_favorite, [preview.id])}>{preview.is_favorite ? '取消收藏' : '收藏'}</LobeButton>
            <LobeButton icon={<Icon name="folder" size={14}/>} onClick={() => onReveal(preview)}>在文件夹中显示</LobeButton>
            {view !== 'trash' && <LobeButton onClick={() => setRenaming(true)}>重命名</LobeButton>}
            {previewGroup?.count > 1 && previewGroup.cover.id !== preview.id && view !== 'trash' && <LobeButton onClick={() => onSetCover(previewGroup, preview)}>设为头图</LobeButton>}
            {view === 'trash'
              ? <><LobeButton icon={<Icon name="restore" size={14}/>} onClick={() => onRestore([preview.id])}>恢复当前图片</LobeButton><LobeButton danger icon={<Icon name="trash" size={14}/>} onClick={() => onPermanentDelete([preview.id])}>永久删除当前图片</LobeButton></>
              : <LobeButton className="gallery-preview-action-wide" danger icon={<Icon name="trash" size={14}/>} onClick={() => onTrash([preview.id], 'detail')} type="fill">删除当前图片</LobeButton>}
          </footer>
        </LobeDraggablePanel.Body>}
      </LobeDraggablePanel>
    </div>
  </main>;
}
