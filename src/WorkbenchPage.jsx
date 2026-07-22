import LobeAlert from '@lobehub/ui/es/Alert/index';
import LobeButton from '@lobehub/ui/es/Button/index';
import LobeEmpty from '@lobehub/ui/es/Empty/index';
import PromptOverview from './PromptOverview.jsx';
import Icon from './components/Icon.jsx';
import { countPromptTags } from './lib/promptStructure.js';

function mediaUrl(filePath) {
  return filePath ? `novelai-media://file?path=${encodeURIComponent(filePath)}` : '';
}

function WorkbenchVibes({ vibes, onCopy }) {
  if (!vibes?.length) return <div className="workbench-vibe-empty"><Icon name="info" size={15}/><span>图片中没有可恢复的 Vibe 编码</span></div>;
  return <section className="workbench-vibes" aria-label="图片中的 Vibe">
    <header><div><span>VIBE METADATA</span><strong>检测到 {vibes.length} 个 Vibe</strong></div><small>只读解析，不在这里调整强度</small></header>
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
      <span className="workbench-kicker">WORKBENCH / 01</span>
      <h1>拖入图片，<br/>直接编辑 Tag</h1>
      <p>读取 NovelAI 图片中的 Prompt 与 Vibe。图片只用于当前工作台，不会保存到图片库。</p>
      <LobeButton disabled={loading} icon={<Icon name="image"/>} onClick={onChooseImage} size="large" type="primary">{loading ? '正在读取…' : '选择 NovelAI 图片'}</LobeButton>
      <small>PNG · JPG · WEBP　一次处理一张图片</small>
      {error && <LobeAlert className="workbench-empty-error" message={error} type="error" variant="outlined"/>}
    </div>
    <div className="workbench-empty-visual" aria-hidden="true"><div className="workbench-drop-frame"><Icon name="upload" size={34}/><span>DROP IMAGE</span><i/></div></div>
  </main>;

  const project = session.project;
  return <main className="workbench-page workbench-active-page">
    <header className="workbench-header">
      <div><span className="workbench-kicker">WORKBENCH / 01</span><h1>{project.name}</h1><p>{countPromptTags(project)} 个 Tag · 工作台草稿不会修改原图或图片库</p></div>
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
          mode="workbench"
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

