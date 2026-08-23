import { useMemo, useState } from 'react';
import { Button as LobeButton, Input as LobeInput, Segmented as LobeSegmented } from '@lobehub/ui/base-ui';
import Icon from './Icon.jsx';

const PROJECT_URL = 'https://github.com/LBEILC/NovelAIPromptStudio/';
const REPORT_URL = `${PROJECT_URL}issues/new?labels=bug&title=%5B%E9%97%AE%E9%A2%98%5D%20`;
const SUGGEST_URL = `${PROJECT_URL}issues/new?labels=enhancement&title=%5B%E5%BB%BA%E8%AE%AE%5D%20`;

function WorkbenchFlowDemo() {
  return <div aria-hidden="true" className="help-flow-demo">
    <div className="help-demo-image"><Icon name="image" size={22}/><span>NovelAI 图片</span></div>
    <span className="help-flow-arrow">→</span>
    <div className="help-demo-prompt">
      <span>Prompt</span>
      <div><i>1girl</i><i>blue eyes</i><i>city night</i></div>
    </div>
    <span className="help-flow-arrow">→</span>
    <div className="help-demo-copy"><Icon name="copy" size={16}/><span>复制</span></div>
  </div>;
}

function PromptScopeDemo() {
  const [kind, setKind] = useState('prompt');
  const [scope, setScope] = useState('base');
  const tags = kind === 'undesired'
    ? scope === 'base' ? ['lowres', 'blurry'] : ['bad hands', 'extra fingers']
    : scope === 'base' ? ['masterpiece', 'cinematic lighting'] : ['silver hair', 'blue eyes'];

  return <div className="help-scope-demo">
    <div className="help-scope-controls">
      <LobeSegmented aria-label="演示 Prompt 类型" options={[{ label: 'Prompt', value: 'prompt' }, { label: 'Undesired', value: 'undesired' }]} size="small" value={kind} onChange={setKind}/>
      <LobeSegmented aria-label="演示 Prompt 范围" options={[{ label: 'Base', value: 'base' }, { label: 'Character', value: 'character' }]} size="small" value={scope} onChange={setScope}/>
    </div>
    <div className={`help-demo-tags${kind === 'undesired' ? ' undesired' : ''}`}>
      {tags.map((tag) => <span key={tag}>{tag}</span>)}
    </div>
    <small>这里使用演示数据，不会修改当前工作台。</small>
  </div>;
}

function MarqueeDemo() {
  return <div aria-hidden="true" className="help-marquee-demo">
    {['1girl', 'solo', 'looking at viewer', 'upper body', 'soft light', 'outdoors'].map((tag) => <span key={tag}>{tag}</span>)}
    <i className="help-marquee-box"/>
    <i className="help-marquee-cursor"/>
  </div>;
}

function GalleryDemo() {
  return <div aria-hidden="true" className="help-gallery-demo">
    {[0, 1, 2, 3].map((item) => <div className={item < 2 ? 'selected' : ''} key={item}>
      <span>{item < 2 && <Icon name="check" size={12}/>}</span>
      <i/>
      <small>{item === 0 ? '构图参考' : item === 1 ? '夜景角色' : item === 2 ? '服装设计' : '光影练习'}</small>
    </div>)}
  </div>;
}

const TOPICS = [
  {
    id: 'start',
    icon: 'book',
    title: '快速开始',
    summary: '打开图片，找到并复制 Prompt',
    keywords: '开始 打开 图片 粘贴 prompt tag 复制',
    content: <>
      <p>把 NovelAI 图片拖入工作台，或使用“打开图片”和粘贴快捷键。应用会读取图片中的生成信息，不会修改原图。</p>
      <ol className="help-steps">
        <li><span>1</span><div><strong>打开图片</strong><small>拖入 PNG、JPEG 或 WebP，也可以从剪贴板粘贴。</small></div></li>
        <li><span>2</span><div><strong>找到目标 Tag</strong><small>切换 Prompt 范围、搜索或分类视图缩小结果。</small></div></li>
        <li><span>3</span><div><strong>编辑或复制</strong><small>点击 Tag 编辑；复制操作会遵循当前筛选和选择状态。</small></div></li>
      </ol>
      <WorkbenchFlowDemo/>
    </>,
  },
  {
    id: 'scope',
    icon: 'layers',
    title: '理解 Prompt 范围',
    summary: '区分 Prompt、Undesired、Base 与 Character',
    keywords: 'prompt undesired base character 作用域 正向 负向 角色',
    content: <>
      <p><strong>Prompt / Undesired</strong> 决定查看正向还是负向内容；<strong>Base / Character</strong> 决定查看基础画面还是角色范围。它们是两个独立维度。</p>
      <PromptScopeDemo/>
    </>,
  },
  {
    id: 'selection',
    icon: 'tags',
    title: '选择与批量操作',
    summary: '框选、追加选择和右键操作',
    keywords: '框选 多选 批量 右键 tag 移动 分类 删除',
    content: <>
      <p>在 Tag 空白处拖动可以框选多个 Tag。按住 Ctrl（Windows）或 Command（macOS）可以追加或反选；右键已选内容可以复制、翻译、分类、移动或删除。</p>
      <MarqueeDemo/>
      <p className="help-note"><Icon name="info" size={15}/>不使用右键时，也可以通过多选工具栏完成核心批量操作。</p>
    </>,
  },
  {
    id: 'gallery',
    icon: 'library',
    title: '整理图片库',
    summary: '导入、分组、收藏和筛选图片',
    keywords: '图库 图片库 导入 分组 收藏集 筛选 回收站 缩放',
    content: <>
      <p>导入图片后，可以按生成关系分组、加入普通或智能收藏集，并使用搜索和筛选快速定位作品。框选图片后，批量工具栏会提供可用操作。</p>
      <GalleryDemo/>
      <p>在图库网格中按住 Ctrl（Windows）或 Command（macOS）并滚动滚轮，可以调整缩略图大小；移入图片组可以浏览组内内容。</p>
    </>,
  },
  {
    id: 'shortcuts',
    icon: 'keyboard',
    title: '快捷操作',
    summary: '工作台和图库的常用快捷键',
    keywords: '快捷键 keyboard ctrl command tab 打开 粘贴 搜索 关闭',
    content: <>
      <p>下列快捷键中的 Ctrl 在 macOS 上对应 Command。</p>
      <dl className="help-shortcuts">
        <div><dt><kbd>Ctrl</kbd><span>+</span><kbd>I</kbd></dt><dd>在工作台打开图片；在图库导入图片</dd></div>
        <div><dt><kbd>Ctrl</kbd><span>+</span><kbd>V</kbd></dt><dd>从剪贴板打开或导入图片</dd></div>
        <div><dt><kbd>Ctrl</kbd><span>+</span><kbd>K</kbd></dt><dd>聚焦图库搜索</dd></div>
        <div><dt><kbd>Ctrl</kbd><span>+</span><kbd>Tab</kbd></dt><dd>切换工作台标签；按住 Shift 反向切换</dd></div>
        <div><dt><kbd>Ctrl</kbd><span>+</span><kbd>W</kbd></dt><dd>关闭当前工作台标签</dd></div>
      </dl>
    </>,
  },
  {
    id: 'data',
    icon: 'database',
    title: '数据与隐私',
    summary: '了解本地数据、AI 服务和文件安全',
    keywords: '数据 隐私 本地 api key ai 安全 原图 资源库',
    content: <>
      <ul className="help-facts">
        <li><Icon name="check" size={15}/><span><strong>工作台读取原图</strong>打开到工作台不会自动修改原图或写入图库。</span></li>
        <li><Icon name="check" size={15}/><span><strong>图库数据保存在本地</strong>资源位置可以在“资源库”中查看和更改。</span></li>
        <li><Icon name="check" size={15}/><span><strong>AI 服务由你配置</strong>只有发起翻译或分类时，相关 Tag 才会发送到配置的服务。</span></li>
        <li><Icon name="check" size={15}/><span><strong>API Key 使用系统安全存储</strong>安全存储不可用时，应用不会退回明文保存。</span></li>
      </ul>
    </>,
  },
];

function platformLabel(platform) {
  if (platform === 'darwin') return 'macOS';
  if (platform === 'win32') return 'Windows';
  if (platform === 'linux') return 'Linux';
  return platform || '未知平台';
}

export default function HelpCenter({ currentVersion = '—', platform = '', showToast, studio }) {
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState('start');
  const filteredTopics = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return TOPICS;
    return TOPICS.filter((topic) => `${topic.title} ${topic.summary} ${topic.keywords}`.toLocaleLowerCase().includes(normalized));
  }, [query]);
  const activeTopic = filteredTopics.find((topic) => topic.id === activeId) || filteredTopics[0];

  const openProjectLink = async (url) => {
    try {
      const result = await studio.openReleasePage(url);
      if (!result?.ok) showToast?.(result?.error || '无法打开浏览器');
    } catch (error) {
      showToast?.(error instanceof Error ? error.message : String(error));
    }
  };

  const copyDiagnostics = async () => {
    const text = [`NovelAI Prompt Studio v${currentVersion}`, `平台：${platformLabel(platform)}`].join('\n');
    try {
      await navigator.clipboard.writeText(text);
      showToast?.('诊断信息已复制');
    } catch {
      showToast?.('无法复制诊断信息');
    }
  };

  return <>
    <header className="settings-heading help-heading">
      <div><h2>帮助与反馈</h2><p>按任务查找操作方法，内容与当前版本一起提供。</p></div>
      <LobeInput aria-label="搜索帮助" onChange={(event) => setQuery(event.target.value)} placeholder="搜索操作、功能或快捷键" value={query}/>
    </header>
    <div className="help-center">
      <nav aria-label="帮助主题" className="help-topic-list">
        <span>{query ? `${filteredTopics.length} 个结果` : '使用指南'}</span>
        {filteredTopics.map((topic) => <button
          aria-current={activeTopic?.id === topic.id ? 'page' : undefined}
          className={activeTopic?.id === topic.id ? 'active' : ''}
          key={topic.id}
          onClick={() => setActiveId(topic.id)}
          type="button"
        >
          <Icon name={topic.icon} size={18}/>
          <span><strong>{topic.title}</strong><small>{topic.summary}</small></span>
          <Icon name="next" size={15}/>
        </button>)}
        {!filteredTopics.length && <div className="help-no-results"><Icon name="search" size={20}/><strong>没有找到相关内容</strong><small>尝试搜索“框选”“Prompt”或“快捷键”。</small></div>}
      </nav>
      {activeTopic && <article className="help-article" key={activeTopic.id}>
        <header><Icon name={activeTopic.icon} size={20}/><h3>{activeTopic.title}</h3><p>{activeTopic.summary}</p></header>
        <div className="help-article-body">{activeTopic.content}</div>
      </article>}
    </div>
    <section className="help-feedback" aria-labelledby="help-feedback-title">
      <div><span>支持</span><h3 id="help-feedback-title">没有解决你的问题？</h3><p>可以在 GitHub 报告问题或提出建议。提交前复制诊断信息，有助于确认应用版本和平台。</p></div>
      <div className="help-feedback-actions">
        <LobeButton icon={<Icon name="copy" size={14}/>} onClick={copyDiagnostics}>复制诊断信息</LobeButton>
        <LobeButton icon={<Icon name="externalLink" size={14}/>} onClick={() => openProjectLink(REPORT_URL)}>报告问题</LobeButton>
        <LobeButton icon={<Icon name="externalLink" size={14}/>} onClick={() => openProjectLink(SUGGEST_URL)}>提出建议</LobeButton>
      </div>
    </section>
  </>;
}
