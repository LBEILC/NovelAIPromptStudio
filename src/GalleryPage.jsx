import LobeButton from '@lobehub/ui/es/Button/index';
import LobeEmpty from '@lobehub/ui/es/Empty/index';
import LobeSearchBar from '@lobehub/ui/es/SearchBar/index';
import LobeSelect from '@lobehub/ui/es/Select/index';
import Icon from './components/Icon.jsx';
import { countPromptTags, formatPositivePromptForCopy } from './lib/promptStructure.js';

function mediaUrl(filePath) {
  return filePath ? `novelai-media://file?path=${encodeURIComponent(filePath)}` : '';
}

function formatDate(value) {
  if (!value) return '未知时间';
  return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value));
}

export default function GalleryPage({
  projects,
  query,
  sort,
  preview,
  importing,
  onImport,
  onOpenWorkbench,
  onPreview,
  onClosePreview,
  onQueryChange,
  onSortChange,
  onProjectContextMenu,
  onReveal,
  onRemove,
}) {
  return <main className={`gallery-page ${preview ? 'with-preview' : ''}`}>
    <header className="workspace-page-header">
      <div><span>IMAGE LIBRARY / 02</span><h1>图片库</h1><p>保存生成图，需要改 Tag 时送到工作台。</p></div>
      <LobeButton disabled={importing} icon={<Icon name="plus"/>} onClick={onImport} size="large" type="primary">{importing ? '正在导入…' : '导入图片'}</LobeButton>
    </header>
    <div className="gallery-toolbar">
      <LobeSearchBar className="gallery-search" onInputChange={onQueryChange} placeholder="搜索文件名、Tag 或译名" value={query}/>
      <LobeSelect aria-label="图片排序" onChange={onSortChange} options={[
        { label: '最近导入', value: 'recent' },
        { label: '最早导入', value: 'oldest' },
        { label: '按名称', value: 'name' },
      ]} value={sort}/>
      <span className="gallery-count">{projects.length} 张图片</span>
    </div>
    <div className="gallery-workspace">
      <section className="gallery-grid-scroll">
        {projects.length ? <div className="gallery-grid">
          {projects.map((project) => <button
            className={`gallery-card ${preview?.id === project.id ? 'active' : ''}`}
            key={project.id}
            onClick={() => onPreview(project)}
            onContextMenu={(event) => onProjectContextMenu(event, project)}
          >
            <span className="gallery-card-image"><img alt="" loading="lazy" src={mediaUrl(project.thumbnail_path || project.image_path)}/><i>在工作台编辑</i></span>
            <span className="gallery-card-copy"><strong title={project.name}>{project.name}</strong><small>{countPromptTags(project)} Tags · {project.metadata?.width || '—'} × {project.metadata?.height || '—'}</small></span>
          </button>)}
        </div> : <LobeEmpty className="gallery-empty" description={query ? '换一个关键词试试。' : '拖入图片，或点击右上角导入。'} image={<Icon name="image" size={30}/>} title={query ? '没有匹配的图片' : '图片库还是空的'}/>} 
      </section>
      {preview && <aside className="gallery-preview">
        <header><div><span>PREVIEW</span><h2>{preview.name}</h2></div><LobeButton aria-label="关闭预览" icon={<Icon name="close" size={15}/>} onClick={onClosePreview} size="small" type="text"/></header>
        <figure><img alt={preview.name} src={mediaUrl(preview.image_path)}/></figure>
        <div className="gallery-preview-meta"><span>{preview.metadata?.width || '—'} × {preview.metadata?.height || '—'}</span><span>{countPromptTags(preview)} Tags</span><span>{formatDate(preview.created_at)}</span></div>
        <div className="gallery-preview-prompt"><span>原始 Prompt</span><p>{formatPositivePromptForCopy(preview) || '没有检测到 Prompt'}</p></div>
        <div className="gallery-preview-actions">
          <LobeButton icon={<Icon name="edit" size={14}/>} onClick={() => onOpenWorkbench(preview)} type="primary">在工作台编辑</LobeButton>
          <LobeButton icon={<Icon name="folder" size={14}/>} onClick={() => onReveal(preview)}>在文件夹中显示</LobeButton>
          <LobeButton danger icon={<Icon name="trash" size={14}/>} onClick={() => onRemove(preview)}>从图片库移除</LobeButton>
        </div>
      </aside>}
    </div>
  </main>;
}
