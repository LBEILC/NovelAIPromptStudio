import { useMemo, useState } from 'react';
import { Button as LobeButton, Input as LobeInput } from '@lobehub/ui/base-ui';
import {
  CopyScopeDemo,
  DataFlowDemo,
  DiagnosticsDemo,
  FidelityDemo,
  GalleryFilterDemo,
  GalleryGroupingDemo,
  GalleryScopeDemo,
  PromptScopeDemo,
  SelectionBatchDemo,
  TabDraftDemo,
  TranslationCategoryDemo,
  TranslationResolutionPath,
  TrashLifecycleDemo,
  TroubleshootingDemo,
  WorkbenchFlowDemo,
} from './HelpDemos.jsx';
import Icon from './Icon.jsx';

const PROJECT_URL = 'https://github.com/LBEILC/NovelAIPromptStudio/';
const REPORT_URL = `${PROJECT_URL}issues/new?labels=bug&title=%5B%E9%97%AE%E9%A2%98%5D%20`;
const SUGGEST_URL = `${PROJECT_URL}issues/new?labels=enhancement&title=%5B%E5%BB%BA%E8%AE%AE%5D%20`;

function HelpSection({ children, title }) {
  return <section className="help-section"><h4>{title}</h4>{children}</section>;
}

function HelpSteps({ items }) {
  return <ol className="help-steps">{items.map((item, index) => <li key={item.title}>
    <span>{index + 1}</span><div><strong>{item.title}</strong><small>{item.detail}</small></div>
  </li>)}</ol>;
}

export const HELP_GROUPS = [
  {
    id: 'start',
    title: '开始使用',
    topics: [
      {
        id: 'quick-start',
        icon: 'book',
        title: '从一张图片开始',
        summary: '打开图片，找到并复制 Prompt',
        keywords: '开始 打开 拖入 粘贴 图片 prompt tag 复制 metadata 元数据',
        content: <>
          <p>适合第一次使用应用，或只想快速从一张 NovelAI 图片中取回 Prompt。工作台只读取图片与保存本地草稿，不会修改原图，也不会自动把图片写入图片库。</p>
          <HelpSteps items={[
            { title: '打开图片', detail: '拖入 PNG、JPG、JPEG 或 WebP，点击“打开图片”，也可以在非文本输入区域粘贴图片。' },
            { title: '确认 Prompt 结构', detail: '先查看 Prompt / Undesired，再在 Base 与 Character 之间切换，确认需要处理的范围。' },
            { title: '筛选或编辑 Tag', detail: '使用搜索、分类和显示语言缩小结果；需要时修改文本、权重、顺序或分类。' },
            { title: '复制需要的内容', detail: '主按钮复制当前可见的正向 Prompt；菜单中可以改为全部、Base、Character 或其他明确范围。' },
          ]}/>
          <WorkbenchFlowDemo/>
          <p className="help-note"><Icon name="info" size={15}/>如果图片能打开但没有 Prompt，通常是截图、转码或网页复制已经移除了 NovelAI metadata；请尝试原始导出图片。</p>
        </>,
      },
      {
        id: 'workbench-or-gallery',
        icon: 'library',
        title: '工作台还是图片库',
        summary: '理解打开与导入的区别',
        keywords: '工作台 图片库 图库 打开 导入 副本 原图 保存 删除 回收站',
        content: <>
          <p>两种入口都能读取图片，但用途和保存方式不同。只想临时查看或整理 Prompt 时使用工作台；希望以后搜索、收藏或再次打开时，再导入图片库。</p>
          <div className="help-table-wrap"><table className="help-table">
            <thead><tr><th scope="col">比较</th><th scope="col">打开到工作台</th><th scope="col">导入图片库</th></tr></thead>
            <tbody>
              <tr><th scope="row">主要用途</th><td>解析、编辑和复制 Prompt</td><td>长期保存、查找和重新打开图片</td></tr>
              <tr><th scope="row">文件处理</th><td>只读外部原图</td><td>在资源目录创建应用管理副本</td></tr>
              <tr><th scope="row">重启后</th><td>恢复标签、来源和 Prompt 草稿</td><td>保留图片、索引、收藏集和回收站状态</td></tr>
              <tr><th scope="row">移除影响</th><td>关闭标签只丢弃该标签草稿</td><td>删除只处理应用副本，不删除最初的外部文件</td></tr>
            </tbody>
          </table></div>
          <HelpSection title="在两处之间流转">
            <p>图片库中的任意图片都可以重新送入工作台。反过来，工作台打开的外部图片不会自动进入图片库；需要长期保存时，请在图片库中主动导入。</p>
          </HelpSection>
        </>,
      },
      {
        id: 'find-and-copy',
        icon: 'copy',
        title: '找到并复制 Prompt',
        summary: '确定范围、筛选结果并选择复制方式',
        keywords: '复制 可见 全部 base character selected 自动 tag 正向 负向 翻译 原文 范围',
        content: <>
          <p>切换内容、区域和分类，观察“当前可见”与正向复制结果如何同步变化。</p>
          <CopyScopeDemo/>
          <p className="help-note"><Icon name="info" size={15}/>主按钮复制当前可见的正向 Prompt；菜单仍可选择完整 Base、指定 Character 或包含自动 Tag 的原始范围。复制始终保留原始语法，不会混入译文。</p>
        </>,
      },
      {
        id: 'tabs-and-drafts',
        icon: 'image',
        title: '标签、草稿与恢复',
        summary: '同时处理多张图片并安全恢复会话',
        keywords: '标签 多图 草稿 修改 重启 恢复 关闭 排序 ctrl command tab w session',
        content: <>
          <p>切换下面四种状态，查看独立标签、修改标记、重启恢复和来源失效分别意味着什么。</p>
          <TabDraftDemo/>
          <HelpSection title="常用操作">
            <p>再次打开同一来源会优先复用已有标签。拖动缩略图可以排序；Ctrl/Cmd + Tab 切换标签，Ctrl/Cmd + W 关闭当前标签。关闭已修改标签时会要求确认。</p>
          </HelpSection>
        </>,
      },
    ],
  },
  {
    id: 'workbench',
    title: '工作台',
    topics: [
      {
        id: 'prompt-structure',
        icon: 'layers',
        title: '理解 Prompt 结构',
        summary: '区分 Prompt、Undesired、Base 与 Character',
        keywords: 'prompt undesired base character 作用域 正向 负向 角色 自动 tag v4 v4.5 v5',
        content: <>
          <p><strong>Prompt / Undesired</strong> 决定查看正向还是负向内容；<strong>Base / Character</strong> 决定查看基础画面还是角色范围。它们是两个独立维度，不是四种互斥模式。</p>
          <PromptScopeDemo/>
          <p className="help-note"><Icon name="info" size={15}/>应用会标记能够确认的 NovelAI 自动质量词或 UC 预设。普通复制可以排除它们，完整复现时可以显式复制包含自动 Tag 的原始内容。</p>
        </>,
      },
      {
        id: 'translation-and-categories',
        icon: 'spark',
        title: '翻译与分类 Tag',
        summary: '读懂分类视图，并整理当前需要的 Tag',
        keywords: '翻译 分类 tag 按分类 按结构 原文 译文 对照 DSO 离线 词典 Danbooru AI 补全 未分类 Tag 数据 缓存 手动 修正 可见 选中',
        content: <>
          <p>试着切换分组、语言和分类。按分类只重新组织当前显示，原来的 Base / Character 作用域不会改变。</p>
          <TranslationCategoryDemo/>
          <HelpSection title="从哪里得到结果">
            <TranslationResolutionPath/>
          </HelpSection>
          <p className="help-note"><Icon name="info" size={15}/>未识别内容可以保留为“未分类”或缺少译文，不影响编辑与复制。你可以右键或多选修正，也可以前往设置 → Tag 数据统一管理；删除其中的缓存不会删除工作台 Tag 或修改图片。</p>
        </>,
      },
      {
        id: 'edit-and-fidelity',
        icon: 'edit',
        title: '编辑与原文保真',
        summary: '修改 Tag，同时保留可复用的原始语法',
        keywords: '编辑 添加 删除 排序 权重 原始文本 raw v5 text 引号 换行 vibe 恢复原图',
        content: <>
          <p>在结构视图和原始文本之间切换，再调整演示 Tag 的顺序与权重。</p>
          <FidelityDemo/>
          <p className="help-note"><Icon name="info" size={15}/>工作台修改只保存在当前标签草稿，不写回图片 metadata。“恢复原图”只清除该标签草稿。Vibe 可以只读导出，不能在本地编辑强度或预览效果。</p>
        </>,
      },
      {
        id: 'selection',
        icon: 'tags',
        title: '选择与批量操作',
        summary: '框选、追加选择和移动 Tag',
        keywords: '框选 多选 批量 右键 ctrl command shift tag 移动 分类 删除 翻译 alt 方向键',
        content: <>
          <p>点击 Tag 增减选择，再试用批量工具栏；演示不会复制、移动或删除真实内容。</p>
          <SelectionBatchDemo/>
          <p className="help-note"><Icon name="info" size={15}/>空白处拖动可以框选；Ctrl（Windows）或 Command（macOS）切换选中，Shift 追加。右键菜单提供相同核心操作；键盘聚焦 Tag 后可用 Alt + 方向键排序。</p>
        </>,
      },
    ],
  },
  {
    id: 'gallery',
    title: '图片库',
    topics: [
      {
        id: 'gallery-import',
        icon: 'upload',
        title: '导入、去重与分组',
        summary: '保存图片，并按 Prompt 关系整理',
        keywords: '图库 导入 png jpg jpeg webp zip 拖放 剪贴板 重复 去重 分组 完整 基础 相似 vibe seed',
        content: <>
          <p>切换四种分组方式，观察相同的四张演示图片如何重新归组。</p>
          <GalleryGroupingDemo/>
          <p className="help-note"><Icon name="info" size={15}/>图片库接受 PNG、JPG、JPEG、WebP 和 NovelAI ZIP，并在资源目录保存应用副本。内容完全相同的图片会跳过，不会生成第二份副本。</p>
        </>,
      },
      {
        id: 'gallery-find',
        icon: 'filter',
        title: '搜索、筛选与收藏集',
        summary: '快速找到一组可复用的图片',
        keywords: '搜索 筛选 文件名 tag 译名 模型 vibe 日期 包含 排除 收藏集 智能收藏集 规则',
        content: <>
          <p>组合模型、包含 Tag、排除 Tag 和日期，观察结果数量；再切换智能收藏集查看规则保存后的区别。</p>
          <GalleryFilterDemo/>
          <p className="help-note"><Icon name="info" size={15}/>搜索还能匹配文件名、原始 Tag 和译名。普通收藏集保存手动成员；智能收藏集保存规则，并自动接收以后符合条件的新图片。</p>
        </>,
      },
      {
        id: 'gallery-batch',
        icon: 'tags',
        title: '组内浏览与批量范围',
        summary: '确认当前图片、图片组和选择范围',
        keywords: '图片组 组内 浏览 悬停 单击 双击 详情 多选 框选 ctrl command shift 批量 缩略图 缩放',
        content: <>
          <p>切换当前成员，再比较详情侧栏和批量工具栏的操作范围。</p>
          <GalleryScopeDemo/>
          <HelpSection title="调整图库密度">
            <p>工具栏滑块调整缩略图大小；也可以在图库上按住 Ctrl（Windows）或 Command（macOS）滚动。普通滚轮仍然滚动页面。固定头图只适用于完整 Prompt 且不跨 Vibe 的精确组。</p>
          </HelpSection>
        </>,
      },
      {
        id: 'gallery-trash',
        icon: 'trash',
        title: '回收站与资源位置',
        summary: '安全删除应用副本并迁移图库资源',
        keywords: '回收站 删除 恢复 永久删除 清空 外部原图 应用副本 资源位置 迁移 备份 文件夹',
        content: <>
          <p>沿着演示生命周期移动应用副本，或查看资源迁移的安全顺序。</p>
          <TrashLifecycleDemo/>
          <p className="help-note"><Icon name="info" size={15}/>永久删除和清空回收站都会再次确认。迁移时请选择新的空目录；失败会保留旧目录和可恢复备份，期间不要手动移动源目录。</p>
        </>,
      },
    ],
  },
  {
    id: 'reference',
    title: '参考与支持',
    topics: [
      {
        id: 'shortcuts',
        icon: 'keyboard',
        title: '快捷操作',
        summary: '工作台和图片库的常用快捷键',
        keywords: '快捷键 keyboard ctrl command cmd tab shift alt 打开 粘贴 搜索 关闭 排序',
        content: <>
          <p>下列快捷键中的 Ctrl 在 macOS 上对应 Command。在文本输入区域中，Ctrl/Cmd + V 仍然执行普通文本粘贴，不会被图片粘贴接管。</p>
          <dl className="help-shortcuts">
            <div><dt><kbd>Ctrl</kbd><span>+</span><kbd>I</kbd></dt><dd>在工作台打开图片；在图片库导入图片</dd></div>
            <div><dt><kbd>Ctrl</kbd><span>+</span><kbd>V</kbd></dt><dd>从剪贴板打开或导入图片</dd></div>
            <div><dt><kbd>Ctrl</kbd><span>+</span><kbd>K</kbd></dt><dd>在图片库聚焦搜索框</dd></div>
            <div><dt><kbd>Ctrl</kbd><span>+</span><kbd>Tab</kbd></dt><dd>切换到下一个工作台标签</dd></div>
            <div><dt><kbd>Ctrl</kbd><span>+</span><kbd>Shift</kbd><span>+</span><kbd>Tab</kbd></dt><dd>切换到上一个工作台标签</dd></div>
            <div><dt><kbd>Ctrl</kbd><span>+</span><kbd>W</kbd></dt><dd>关闭当前工作台标签</dd></div>
            <div><dt><kbd>Alt</kbd><span>+</span><kbd>方向键</kbd></dt><dd>键盘聚焦 Tag 后调整其顺序</dd></div>
            <div><dt><kbd>←</kbd><span>/</span><kbd>→</kbd></dt><dd>详情打开时切换图片组成员</dd></div>
          </dl>
        </>,
      },
      {
        id: 'data',
        icon: 'database',
        title: '数据、隐私与 AI',
        summary: '了解本地数据、联网边界和凭据安全',
        keywords: '数据 隐私 本地 api key ai dso danbooru 离线 词典 安全 原图 资源库 联网 翻译 分类 缓存 metadata',
        content: <>
          <p>切换常见操作，查看数据留在本机还是需要访问你明确配置的服务。</p>
          <DataFlowDemo/>
          <p className="help-note"><Icon name="info" size={15}/>诊断信息只包含应用版本和平台，不包含图片路径、Prompt、API 地址、API Key 或日志。</p>
        </>,
      },
      {
        id: 'troubleshooting',
        icon: 'warning',
        title: '常见问题与排查',
        summary: '从现象判断原因并找到下一步',
        keywords: '问题 排查 错误 没有 prompt metadata 剪贴板 导入 重复 ai 连接 来源不可用 更新',
        content: <>
          <p>先选择最接近的现象，再按“下一步”处理；切换选项不会检查或修改真实数据。</p>
          <TroubleshootingDemo/>
        </>,
      },
      {
        id: 'feedback',
        icon: 'help',
        title: '诊断信息与反馈',
        summary: '提交可复现、且不泄露隐私的问题',
        keywords: '反馈 报告问题 建议 github issue 诊断 版本 平台 隐私 复现',
        content: <>
          <p>先确认诊断信息包含什么，再准备复现步骤和经过检查的附件。</p>
          <DiagnosticsDemo/>
          <HelpSteps items={[
            { title: '描述复现步骤', detail: '写明页面、操作顺序、预期和实际结果。' },
            { title: '检查附件', detail: '遮住文件名、Prompt、路径和服务配置，尤其不要暴露 API Key。' },
            { title: '选择反馈类型', detail: '异常使用“报告问题”，体验改进或新需求使用“提出建议”。' },
          ]}/>
          <p className="help-note"><Icon name="info" size={15}/>反馈页面需要网络和系统浏览器。关闭浏览器不会影响应用中的图片、草稿或设置。</p>
        </>,
      },
    ],
  },
];

export const HELP_TOPICS = HELP_GROUPS.flatMap((group) => group.topics.map((topic) => ({ ...topic, groupId: group.id, groupTitle: group.title })));

export function filterHelpTopics(query = '') {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return HELP_TOPICS;
  return HELP_TOPICS.filter((topic) => `${topic.groupTitle} ${topic.title} ${topic.summary} ${topic.keywords}`.toLocaleLowerCase().includes(normalized));
}

function platformLabel(platform) {
  if (platform === 'darwin') return 'macOS';
  if (platform === 'win32') return 'Windows';
  if (platform === 'linux') return 'Linux';
  return platform || '未知平台';
}

export default function HelpCenter({ currentVersion = '—', platform = '', showToast, studio }) {
  const [query, setQuery] = useState('');
  const [activeId, setActiveId] = useState('quick-start');
  const filteredTopics = useMemo(() => filterHelpTopics(query), [query]);
  const filteredGroups = useMemo(() => HELP_GROUPS.map((group) => ({
    ...group,
    topics: filteredTopics.filter((topic) => topic.groupId === group.id),
  })).filter((group) => group.topics.length), [filteredTopics]);
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
        <span>{query ? `${filteredTopics.length} 个结果` : `${HELP_GROUPS.length} 组 · ${HELP_TOPICS.length} 篇`}</span>
        {filteredGroups.map((group) => <details
          className="help-topic-group"
          defaultOpen={Boolean(query) || group.id === activeTopic?.groupId}
          key={`${group.id}:${query ? 'search' : 'browse'}`}
        >
          <summary><span>{group.title}</span><small>{group.topics.length}</small><Icon name="next" size={14}/></summary>
          {group.topics.map((topic) => <button
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
        </details>)}
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
