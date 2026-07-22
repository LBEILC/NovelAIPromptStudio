import LobeAlert from '@lobehub/ui/es/Alert/index';
import LobeButton from '@lobehub/ui/es/Button/index';
import PromptOverview from './PromptOverview.jsx';
import Icon from './components/Icon.jsx';
import { countPromptTags } from './lib/promptStructure.js';

function mediaUrl(filePath) {
  return filePath ? `novelai-media://file?path=${encodeURIComponent(filePath)}` : '';
}

function WorkbenchVibes({ vibes, onCopy }) {
  if (!vibes?.length) return <div className="workbench-vibe-empty"><Icon name="info" size={15}/><span>没有检测到 Vibe</span></div>;
  return <section className="workbench-vibes" aria-label="图片中的 Vibe">
    <header><strong>Vibe</strong><small>{vibes.length} 个</small></header>
    <div className="workbench-vibe-list">
      {vibes.map((vibe, index) => <div className="workbench-vibe-row" key={vibe.id || index}>
        <div><strong>{vibe.name || `Vibe ${index + 1}`}</strong><small>原图强度 {Number(vibe.strength ?? .6).toFixed(2)} · Information {vibe.information_extracted == null ? '未知' : Number(vibe.information_extracted).toFixed(2)}</small></div>
        <LobeButton icon={<Icon name="copy" size={13}/>} onClick={() => onCopy(vibe)} size="small">复制编码</LobeButton>
      </div>)}
    </div>
  </section>;
}

export default function WorkbenchPage({
  error,
  focusScopeKey,
  focusTagId,
  loading,
  onChooseImage,
  onCopyPrompt,
  onCopyText,
  onCopyVibe,
  onNotify,
  onReset,
  onTagContextMenu,
  onTranslateTags,
  onUpdateProject,
  session,
}) {
  if (!session) return <main className="workbench-page workbench-empty-page">
    <div className="workbench-empty-copy">
      <h1>编辑图片中的 Tag</h1>
      <p>拖入 NovelAI 图片，或从本地选择一张图片。</p>
      <LobeButton disabled={loading} icon={<Icon name="image"/>} onClick={onChooseImage} size="large" type="primary">{loading ? '正在读取…' : '选择图片'}</LobeButton>
      <small>PNG、JPG、WEBP</small>
      {error && <LobeAlert className="workbench-empty-error" message={error} type="error" variant="outlined"/>}
    </div>
    <div className="workbench-empty-visual" aria-hidden="true"><div className="workbench-drop-frame"><Icon name="upload" size={30}/><span>拖放图片到这里</span></div></div>
  </main>;

  const project = session.project;
  return <main className="workbench-page workbench-active-page">
    <header className="workbench-header">
      <div className="workbench-header-copy"><h1>工作台</h1><p title={project.name}>{project.name}<span> · {countPromptTags(project)} 个 Tag</span></p></div>
      <div className="workbench-header-actions">
        <LobeButton disabled={loading} icon={<Icon name="image" size={14}/>} onClick={onChooseImage}>{loading ? '读取中…' : '更换图片'}</LobeButton>
        <LobeButton icon={<Icon name="refresh" size={14}/>} onClick={onReset}>恢复原图</LobeButton>
        <LobeButton icon={<Icon name="copy" size={14}/>} onClick={onCopyPrompt} type="primary">复制 Prompt</LobeButton>
      </div>
    </header>
    {error && <LobeAlert className="workbench-inline-error" message={error} type="error" variant="outlined"/>}
    <div className="workbench-body">
      <aside className="workbench-source-panel">
        <figure><img src={mediaUrl(project.image_path)} alt={project.name}/><figcaption><strong>{project.name}</strong><span>{project.metadata?.width || '—'} × {project.metadata?.height || '—'}</span></figcaption></figure>
        <WorkbenchVibes onCopy={onCopyVibe} vibes={project.vibes || []}/>
      </aside>
      <section className="workbench-editor-panel">
        <PromptOverview
          focusScopeKey={focusScopeKey}
          focusTagId={focusTagId}
          onCopyText={onCopyText}
          onNotify={onNotify}
          onTagContextMenu={onTagContextMenu}
          onTranslateTags={onTranslateTags}
          project={project}
          updateProject={onUpdateProject}
        />
      </section>
    </div>
  </main>;
}
