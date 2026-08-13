import { Alert as LobeAlert, DraggablePanel as LobeDraggablePanel, Popover, PopoverGroup } from '@lobehub/ui';
import { Button as LobeButton, showContextMenu, SplitButton, Tabs } from '@lobehub/ui/base-ui';
import { useCallback, useMemo, useState } from 'react';
import PromptOverview from './PromptOverview.jsx';
import Icon from './components/Icon.jsx';
import ImagePreviewToolbar from './components/ImagePreviewToolbar.jsx';
import ImageStage, { mediaUrl } from './components/ImageStage.jsx';
import {
  panelStorage,
  panelWidthForViewport,
  readPanelWidth,
  WORKBENCH_SOURCE_PANEL_WIDTH_KEY,
  writePanelWidth,
} from './lib/panelLayout.js';
import { fitTabPreviewCanvas } from './lib/imagePreview.js';
import { countPromptTags, formatPositivePromptForCopy, positivePromptCopyOptions } from './lib/promptStructure.js';
import { activeWorkbenchCopyContext, activeWorkbenchTab, scopeWorkbenchCopyContext, workbenchTabHasChanges } from './lib/workbenchSession.js';

function WorkbenchVibes({ vibes, onReveal }) {
  if (!vibes?.length) return <div className="workbench-vibe-empty"><Icon name="info" size={15}/><span>没有检测到 Vibe</span></div>;
  return <section className="workbench-vibes" aria-label="图片中的 Vibe">
    <header><strong>Vibe</strong><small>{vibes.length} 个</small></header>
    <div className="workbench-vibe-list">
      {vibes.map((vibe, index) => <div className="workbench-vibe-row" key={vibe.id || index}>
        <div><strong>{vibe.name || `Vibe ${index + 1}`}</strong><small>原图强度 {Number(vibe.strength ?? .6).toFixed(2)} · Information {vibe.information_extracted == null ? '未知' : Number(vibe.information_extracted).toFixed(2)}</small></div>
        <LobeButton icon={<Icon name="folder" size={13}/>} onClick={() => onReveal(vibe)} size="small">在文件夹中显示</LobeButton>
      </div>)}
    </div>
  </section>;
}

function ImageOpenButton({ loading, onChooseImage, onClipboardImage, primary = false, large = false }) {
  return <SplitButton loading={loading} size={large ? 'large' : 'middle'} type={primary ? 'primary' : 'default'}>
    <SplitButton.Main icon={<Icon name="image" size={14}/>} onClick={onChooseImage}>
      {loading ? '正在读取…' : '打开图片'}
    </SplitButton.Main>
    <SplitButton.Menu
      aria-label="其他打开方式"
      items={[{ key: 'clipboard', label: '从剪贴板打开', onClick: onClipboardImage }]}
      placement="bottomRight"
    />
  </SplitButton>;
}

function WorkbenchTabPreview({ tab }) {
  const project = tab.project;
  const filePath = project?.image_path || tab.source?.path || '';
  const width = Number(project?.metadata?.width || 0);
  const height = Number(project?.metadata?.height || 0);
  const previewCanvas = fitTabPreviewCanvas(width, height);
  const dirty = workbenchTabHasChanges(tab);
  const detail = project
    ? `${width && height ? `${width} × ${height} · ` : ''}${countPromptTags(project)} 个 Tag${dirty ? ' · 有未保存修改' : ''}`
    : tab.error || '图片源不可用';

  return <div
    className="workbench-tab-preview"
    style={{
      '--workbench-tab-preview-ratio': `${previewCanvas.width} / ${previewCanvas.height}`,
      '--workbench-tab-preview-width': `${previewCanvas.width}px`,
    }}
  >
    <div className="workbench-tab-preview-media">
      {project && filePath
        ? <img alt="" loading="lazy" src={mediaUrl(filePath)}/>
        : <div className="workbench-tab-preview-unavailable"><Icon name="image" size={24}/><span>无法预览图片</span></div>}
    </div>
    <div className="workbench-tab-preview-copy">
      <strong>{tab.displayName || project?.name || '未命名图片'}</strong>
      <span>{detail}</span>
    </div>
  </div>;
}

function WorkbenchTabLabel({ tab, onClose }) {
  const dirty = workbenchTabHasChanges(tab);
  return <Popover
    content={<WorkbenchTabPreview tab={tab}/>}
    placement="bottomLeft"
    trigger="hover"
  >
    <span
      className="workbench-tab-label"
      onAuxClick={(event) => { if (event.button === 1) onClose(tab.id); }}
      onContextMenu={(event) => {
        event.preventDefault();
        event.stopPropagation();
        showContextMenu([{ key: 'close-tab', label: '关闭标签', onClick: () => onClose(tab.id) }]);
      }}
    >
      {dirty && <span aria-label="有未处理修改" className="workbench-tab-dirty"/>}
      <span className="workbench-tab-title">{tab.displayName || tab.project?.name || '未命名图片'}</span>
      <span
        aria-label={`关闭 ${tab.displayName || '标签'}`}
        className="workbench-tab-close"
        onClick={(event) => { event.preventDefault(); event.stopPropagation(); onClose(tab.id); }}
        onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); }}
        role="button"
      >×</span>
    </span>
  </Popover>;
}

export default function WorkbenchPage({
  error,
  focusScopeKey,
  focusTagId,
  loading,
  onActivateTab,
  onChooseImage,
  onClipboardImage,
  onCloseTab,
  onCopyImage,
  onCopyText,
  onDownloadImage,
  onRevealVibe,
  onNotify,
  onReset,
  onTagContextMenu,
  onTranslateTags,
  onUpdateProject,
  onUpdateViewState,
  session,
}) {
  const [sourcePanelWidth, setSourcePanelWidth] = useState(() => readPanelWidth(
    panelStorage(),
    WORKBENCH_SOURCE_PANEL_WIDTH_KEY,
    panelWidthForViewport(globalThis.innerWidth, .34, 280, 560),
    280,
    560,
  ));
  const [copyContextState, setCopyContextState] = useState({ tabId: '', text: '', count: 0 });
  const tab = activeWorkbenchTab(session);
  const project = tab?.project;
  const activeTabId = tab?.id || '';
  const copyContext = activeWorkbenchCopyContext(copyContextState, activeTabId);
  const updateCopyContext = useCallback((context) => {
    setCopyContextState(scopeWorkbenchCopyContext(context, activeTabId));
  }, [activeTabId]);

  const copyOptions = useMemo(() => project ? positivePromptCopyOptions(project) : [], [project]);
  const copyItems = useMemo(() => project ? [
    {
      key: 'all',
      label: '复制全部 Prompt',
      disabled: !formatPositivePromptForCopy(project),
      onClick: () => onCopyText(formatPositivePromptForCopy(project), copyOptions.reduce((count, item) => count + item.count, 0), false, 0, '全部 Prompt'),
    },
    { key: 'copy-divider', type: 'divider' },
    ...copyOptions.map((option) => ({
      key: option.key,
      label: option.label,
      disabled: !option.text,
      onClick: () => onCopyText(option.text, option.count, false, 0, option.label.replace(/^复制/, '')),
    })),
  ] : [], [copyOptions, onCopyText, project]);

  if (!tab) return <main className="workbench-page workbench-empty-page">
    <div className="workbench-empty-copy">
      <h1>编辑图片中的 Tag</h1>
      <p>拖入 NovelAI 图片，或从本地与剪贴板打开图片。</p>
      <ImageOpenButton large loading={loading} onChooseImage={onChooseImage} onClipboardImage={onClipboardImage} primary/>
      <small>PNG、JPG、WEBP</small>
      {error && <LobeAlert className="workbench-empty-error" message={error} type="error" variant="outlined"/>}
    </div>
    <div className="workbench-empty-visual" aria-hidden="true"><div className="workbench-drop-frame"><Icon name="upload" size={30}/><span>拖放图片到这里</span></div></div>
  </main>;

  return <main className="workbench-page workbench-active-page">
    <header className="workbench-header">
      <div className="workbench-header-copy"><h1>工作台</h1><p title={project?.name || tab.displayName}>{project ? `${project.name} · ${countPromptTags(project)} 个 Tag` : tab.displayName}</p></div>
      <div className="workbench-header-actions">
        <ImageOpenButton loading={loading} onChooseImage={onChooseImage} onClipboardImage={onClipboardImage}/>
        {project && <LobeButton icon={<Icon name="refresh" size={14}/>} onClick={onReset}>恢复原图</LobeButton>}
        {project && <SplitButton type="primary">
          <SplitButton.Main disabled={!copyContext.count} icon={<Icon name="copy" size={14}/>} onClick={() => onCopyText(copyContext.text, copyContext.count, false, 0, '可见 Prompt')}>
            复制可见 Prompt{copyContext.count ? ` · ${copyContext.count}` : ''}
          </SplitButton.Main>
          <SplitButton.Menu aria-label="其他 Prompt 复制方式" items={copyItems} placement="bottomRight"/>
        </SplitButton>}
      </div>
    </header>
    <div className="workbench-tabs-scroll">
      <PopoverGroup closeDelay={120} openDelay={450} placement="bottomLeft" trigger="hover">
        <Tabs
          activeKey={session.activeTabId}
          className="workbench-tabs"
          classNames={{
            indicator: 'workbench-tabs-indicator',
            list: 'workbench-tabs-list',
            tab: 'workbench-tab',
          }}
          items={session.tabs.map((item) => ({ key: item.id, label: <WorkbenchTabLabel onClose={onCloseTab} tab={item}/> }))}
          onChange={onActivateTab}
          size="small"
          variant="rounded"
        />
      </PopoverGroup>
    </div>
    {(error || tab.error) && <LobeAlert className="workbench-inline-error" message={tab.error || error} type="error" variant="outlined"/>}
    {project ? <div className="workbench-body">
      <LobeDraggablePanel
        className="workbench-source-shell"
        classNames={{ content: 'workspace-side-panel-content' }}
        defaultSize={{ width: 'clamp(280px, 34vw, 560px)' }}
        maxWidth={560}
        minWidth={280}
        onSizeChange={(_delta, size) => {
          const width = writePanelWidth(panelStorage(), WORKBENCH_SOURCE_PANEL_WIDTH_KEY, size?.width, 280, 560);
          if (width !== undefined) setSourcePanelWidth(width);
        }}
        placement="left"
        showHandleHighlight
        stableLayout
        size={{ height: '100%', width: sourcePanelWidth }}
      >
        <LobeDraggablePanel.Body className="workbench-source-panel">
          <figure>
            <ImageStage
              alt={project.name}
              className="workbench-image-stage"
              filePath={project.image_path}
              previewToolbar={(_originalNode, info) => <ImagePreviewToolbar
                info={info}
                onCopy={() => onCopyImage(project)}
                onDownload={() => onDownloadImage(project)}
              />}
            />
            <figcaption><strong>{project.name}</strong><span>{project.metadata?.width || '—'} × {project.metadata?.height || '—'}</span></figcaption>
          </figure>
          <WorkbenchVibes onReveal={onRevealVibe} vibes={project.vibes || []}/>
        </LobeDraggablePanel.Body>
      </LobeDraggablePanel>
      <section className="workbench-editor-panel">
        <PromptOverview
          focusScopeKey={focusScopeKey}
          focusTagId={focusTagId}
          onCopyContextChange={updateCopyContext}
          onCopyText={onCopyText}
          onNotify={onNotify}
          onTagContextMenu={onTagContextMenu}
          onTranslateTags={onTranslateTags}
          project={project}
          updateProject={onUpdateProject}
          viewState={tab.viewState}
          onViewStateChange={(viewState) => onUpdateViewState(tab.id, viewState)}
        />
      </section>
    </div> : <div className="workbench-tab-error"><strong>图片源不可用</strong><span>{tab.error || '该图片已被移动或删除，可以关闭此标签后继续使用其他标签。'}</span></div>}
  </main>;
}
