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

function HelpSection({ children, title }) {
  return <section className="help-section"><h4>{title}</h4>{children}</section>;
}

function HelpSteps({ items }) {
  return <ol className="help-steps">{items.map((item, index) => <li key={item.title}>
    <span>{index + 1}</span><div><strong>{item.title}</strong><small>{item.detail}</small></div>
  </li>)}</ol>;
}

function HelpFacts({ items }) {
  return <ul className="help-facts">{items.map((item) => <li key={item.title}>
    <Icon name="check" size={15}/><span><strong>{item.title}</strong>{item.detail}</span>
  </li>)}</ul>;
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
          <p>复制结果由当前 Prompt 类型、作用域、搜索与分类筛选共同决定。复制前先确认自己需要的是完整复现、单个角色，还是当前筛选后的一小部分。</p>
          <HelpSteps items={[
            { title: '选择 Prompt 类型', detail: 'Prompt 是正向内容；Undesired 是负向内容。主复制操作不会把 Undesired 混入正向结果。' },
            { title: '选择 Base 或 Character', detail: 'Base 描述基础画面；Character 分别保存每个角色自己的 Prompt。' },
            { title: '缩小可见范围', detail: '切换结构或分类视图，并结合搜索、分类、语言显示和多选得到目标 Tag。' },
            { title: '核对复制菜单', detail: '主按钮复制当前可见正向 Prompt；菜单提供全部、完整 Base、指定 Character 和包含自动 Tag 的原始范围。' },
          ]}/>
          <HelpFacts items={[
            { title: '保留 NovelAI 语法', detail: '复制会保留原始 Tag、顺序、权重、花括号、换行和作用域。' },
            { title: '译文只用于阅读', detail: '切换到译文或对照显示不会把中文译文写入生成用 Prompt。' },
            { title: '多选只复制选中内容', detail: '选中 Tag 后使用对应批量复制，可以得到精确的局部结果。' },
          ]}/>
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
          <HelpSection title="如何理解四个组合">
            <HelpFacts items={[
              { title: 'Base Prompt', detail: '描述构图、场景、画面质量与所有角色共享的内容。' },
              { title: 'Character Prompt', detail: '保存单个角色的外观、服装、姿势等内容；不同角色可以独立查看和命名。' },
              { title: 'Base Undesired', detail: '针对整个画面的负向内容。' },
              { title: 'Character Undesired', detail: '只属于某个角色的负向内容。' },
            ]}/>
          </HelpSection>
          <p className="help-note"><Icon name="info" size={15}/>应用会标记能够确认的 NovelAI 自动质量词或 UC 预设。普通复制可以排除它们，完整复现时可以显式复制包含自动 Tag 的原始内容。</p>
        </>,
      },
      {
        id: 'edit-and-fidelity',
        icon: 'edit',
        title: '编辑与原文保真',
        summary: '修改 Tag，同时保留可复用的原始语法',
        keywords: '编辑 添加 删除 排序 权重 原始文本 raw v5 text 引号 换行 vibe 恢复原图',
        content: <>
          <p>工作台中的修改只保存在当前标签草稿，不会写回图片 metadata。可以编辑 Tag 文本、权重和分类，也可以添加、删除、排序或在作用域之间移动 Tag。</p>
          <HelpSection title="结构化编辑与原始文本">
            <p>结构视图适合逐个整理 Tag；原始文本适合检查完整语法。两种视图会尽量同步，解析失败时保留原始文本，避免因为结构化失败丢失内容。</p>
          </HelpSection>
          <HelpSection title="复制时保留什么">
            <HelpFacts items={[
              { title: '权重与顺序', detail: '花括号、数值权重、Tag 顺序和作用域按原始 Prompt 保留。' },
              { title: 'V5 文本', detail: '自然语言段落、引号中的逗号和多行 Text: 内容不会被压成普通逗号列表。' },
              { title: 'Vibe 数据', detail: '可以识别并导出可恢复的 .naiv4vibe；应用不提供 Vibe 强度编辑或本地效果预览。' },
            ]}/>
          </HelpSection>
          <p className="help-note"><Icon name="info" size={15}/>“恢复原图”只清除当前标签的 Prompt 草稿并重新采用图片内容，不会修改图片文件，也不会影响其他标签。</p>
        </>,
      },
      {
        id: 'selection',
        icon: 'tags',
        title: '选择与批量操作',
        summary: '框选、追加选择和移动 Tag',
        keywords: '框选 多选 批量 右键 ctrl command shift tag 移动 分类 删除 翻译 alt 方向键',
        content: <>
          <p>需要同时处理多个 Tag 时，可以从空白处拖出框选区域。普通框选替换当前选择；按住 Ctrl（Windows）或 Command（macOS）可以切换选中状态，按住 Shift 可以追加。</p>
          <MarqueeDemo/>
          <HelpSection title="选中后可以做什么">
            <HelpFacts items={[
              { title: '复制与翻译', detail: '只处理当前选中的 Tag，不影响未选内容。' },
              { title: '设置分类', detail: '把选中 Tag 统一设为人物、服装、构图等分类，并允许以后修正。' },
              { title: '移动作用域', detail: '把 Tag 移到 Base、指定 Character 或相应的 Undesired 范围。' },
              { title: '删除', detail: '只从当前工作台草稿移除选中 Tag，不修改原始图片。' },
            ]}/>
          </HelpSection>
          <p className="help-note"><Icon name="info" size={15}/>右键菜单和顶部多选工具栏提供相同的核心批量路径；不用右键也能完成操作。键盘聚焦 Tag 后，可用 Alt + 方向键调整顺序。</p>
        </>,
      },
      {
        id: 'tabs-and-drafts',
        icon: 'image',
        title: '标签、草稿与恢复',
        summary: '同时处理多张图片并安全恢复会话',
        keywords: '标签 多图 草稿 修改 重启 恢复 关闭 排序 ctrl command tab w session',
        content: <>
          <p>每张打开的图片都有独立标签、来源、Prompt 草稿和修改状态。应用会保存标签顺序、当前标签和草稿，完整退出并重新启动后可以继续工作。</p>
          <HelpFacts items={[
            { title: '重复来源会复用标签', detail: '再次打开同一个文件或同一张图片库图片时，会优先回到已有标签。' },
            { title: '已修改标签会明确标记', detail: '修改 Prompt 后，标签和工作台标题会显示修改状态。' },
            { title: '关闭前保护草稿', detail: '关闭已修改标签时会要求确认；丢弃只影响该标签。' },
            { title: '源文件仍然独立', detail: '草稿恢复不等于写回图片；外部图片被移动或删除时，标签可能提示来源不可用。' },
          ]}/>
          <HelpSection title="常用操作">
            <p>拖动顶部缩略图可以调整标签顺序；使用 Ctrl/Cmd + Tab 前进、Ctrl/Cmd + Shift + Tab 后退，使用 Ctrl/Cmd + W 关闭当前标签。</p>
          </HelpSection>
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
          <p>图片库接受 PNG、JPG、JPEG、WebP 和 NovelAI 导出的 ZIP。可以通过文件选择、拖放或剪贴板导入；成功后，应用在资源目录中保存自己的副本和缩略图。</p>
          <GalleryDemo/>
          <HelpSection title="重复图片如何处理">
            <p>内容完全相同的图片会被跳过，不会生成第二份副本。导入数量少于选择数量时，先检查是否存在重复项，而不是立即重新导入。</p>
          </HelpSection>
          <HelpSection title="选择分组方式">
            <HelpFacts items={[
              { title: '全部分开', detail: '每张图片独立显示，不做 Prompt 归组。' },
              { title: '完整 Prompt', detail: '角色、位置与完整 Prompt 相同时归为一组，适合整理仅 Seed 等结果参数不同的图片。' },
              { title: '基础 Prompt', detail: '忽略角色 Prompt 与位置，按 Base 内容归组。' },
              { title: '相似 Prompt', detail: '按 Base Tag 相似度归组，可以调整最低相似度，并决定是否跨 Vibe 合并。' },
            ]}/>
          </HelpSection>
        </>,
      },
      {
        id: 'gallery-find',
        icon: 'filter',
        title: '搜索、筛选与收藏集',
        summary: '快速找到一组可复用的图片',
        keywords: '搜索 筛选 文件名 tag 译名 模型 vibe 日期 包含 排除 收藏集 智能收藏集 规则',
        content: <>
          <p>搜索可以匹配文件名、原始 Tag 和译名。高级筛选可以组合包含或排除 Tag、模型、Vibe 和导入日期；筛选发生在分组之前，因此图片组里不会混入不符合条件的成员。</p>
          <HelpSection title="组合多个条件">
            <HelpFacts items={[
              { title: '不同筛选维度使用“并且”', detail: '例如“指定模型 + 最近 30 天”要求两项都满足。' },
              { title: '同一字段可以多选', detail: '多个模型或 Vibe 在字段内部按“任意一个”匹配。' },
              { title: '排除条件优先', detail: '被排除 Tag 命中的图片不会因为其他条件再次出现。' },
            ]}/>
          </HelpSection>
          <HelpSection title="普通与智能收藏集">
            <p><strong>普通收藏集</strong>由你手动加入或移除图片；<strong>智能收藏集</strong>保存当前搜索与筛选规则，新导入且符合规则的图片会自动出现。编辑智能收藏集时，应用会把保存的规则重新加载到图库筛选器供你预览。</p>
          </HelpSection>
        </>,
      },
      {
        id: 'gallery-batch',
        icon: 'tags',
        title: '组内浏览与批量范围',
        summary: '确认当前图片、图片组和选择范围',
        keywords: '图片组 组内 浏览 悬停 单击 双击 详情 多选 框选 ctrl command shift 批量 缩略图 缩放',
        content: <>
          <p>图片卡可能代表一张图片，也可能代表一个自动分组。把指针移过图片组可以浏览成员；单击打开当前成员详情，双击把同一成员送入工作台。</p>
          <HelpFacts items={[
            { title: '批量选择以图片组为单位', detail: '框选、Ctrl/Cmd 增减选择或 Shift 范围选择后，批量收藏、加入收藏集和移入回收站会作用于当前显示的整组。' },
            { title: '详情操作只针对当前图片', detail: '详情侧栏中的重命名、复制、下载、设为头图等操作以当前浏览成员为准。' },
            { title: '固定头图仅属于精确组', detail: '只有完整 Prompt 且不跨 Vibe 的精确分组允许持久选择头图。' },
          ]}/>
          <HelpSection title="调整图库密度">
            <p>使用工具栏滑块调整缩略图大小；也可以在图库上按住 Ctrl（Windows）或 Command（macOS）滚动。普通滚轮仍然滚动页面，不会改变应用缩放比例。</p>
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
          <p>普通删除只把应用管理副本移入应用内部回收站。最初导入的外部文件不受影响；从工作台打开的外部图片也不会因为图库操作被删除。</p>
          <HelpSteps items={[
            { title: '先移入回收站', detail: '项目会从普通图库和收藏集中隐藏，但仍可恢复。' },
            { title: '在回收站确认范围', detail: '可以恢复单项或选中项；永久删除和清空回收站都会再次确认。' },
            { title: '永久删除应用副本', detail: '只清理经过验证、位于应用资源目录中的图片副本、缩略图和相关资源。' },
          ]}/>
          <HelpSection title="迁移资源位置">
            <p>在设置的“资源库”中选择新的空目录。应用会先复制并校验资源，再切换位置；失败时保留旧目录和可恢复备份。迁移期间不要手动移动或删除源目录。</p>
          </HelpSection>
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
          <HelpFacts items={[
            { title: '工作台只读原图', detail: '打开图片不会修改 metadata、覆盖文件或自动写入图片库。' },
            { title: '图片库管理本地副本', detail: '图片、缩略图、索引、收藏集和回收站状态保存在本机资源目录。' },
            { title: '离线词典优先，AI 只负责补全', detail: '应用先使用用户修正、DSO 内置词典、Danbooru 画师验证与本地规则；只有仍未完成且已配置模型的 Tag 才会发送到你的服务。' },
            { title: 'API Key 使用系统安全存储', detail: '安全存储不可用时，应用不会退回明文保存。' },
          ]}/>
          <HelpSection title="哪些操作不需要网络">
            <p>解析图片、编辑与复制 Prompt、DSO 精确命中的翻译和本地分类、图片库管理以及本帮助内容都可以离线完成。检查更新、GitHub 反馈、DSO 未收录名称的 Danbooru 画师验证，以及需要远程模型补全的 Tag 才会访问网络。</p>
          </HelpSection>
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
          <dl className="help-troubleshooting">
            <div><dt>图片能打开，但没有 Prompt</dt><dd>截图、社交平台下载、JPG/WebP 转码或网页“复制图片”可能已经移除 metadata。优先使用 NovelAI 原始导出的 PNG；应用无法从纯像素还原已经丢失的 Prompt。</dd></div>
            <div><dt>按 Ctrl/Cmd + V 没有打开图片</dt><dd>文本框获得焦点时，粘贴会保留为普通文本操作。先退出文本编辑，或使用“打开图片 / 导入图片”按钮选择原文件。</dd></div>
            <div><dt>导入数量少于选择数量</dt><dd>内容完全相同的图片会自动跳过。检查导入结果提示和现有图片，再决定是否需要重新导入。</dd></div>
            <div><dt>翻译或分类没有完成</dt><dd>DSO 未收录的 General Tag 可能没有可靠分类；名称也可能需要 Danbooru 验证。需要 AI 补全时，请在“AI 服务”中检查配置并测试连接。失败不会影响本地 Prompt 编辑和图片库，未完成的 Tag 可以稍后重试或手动修正。</dd></div>
            <div><dt>工作台提示图片来源不可用</dt><dd>外部文件可能被移动、重命名或删除。重新打开当前文件；如果来源是图片库，请确认资源位置仍可访问且迁移已经完成。</dd></div>
            <div><dt>搜索后看不到图片组中的某些成员</dt><dd>这是预期行为：搜索和筛选先作用于单张图片，再进行分组，不符合条件的成员不会留在结果组中。</dd></div>
          </dl>
        </>,
      },
      {
        id: 'feedback',
        icon: 'help',
        title: '诊断信息与反馈',
        summary: '提交可复现、且不泄露隐私的问题',
        keywords: '反馈 报告问题 建议 github issue 诊断 版本 平台 隐私 复现',
        content: <>
          <p>帮助内容没有解决问题时，可以在页面底部打开官方 GitHub 问题或建议入口。应用只负责打开并预填标题，不会自动提交任何内容。</p>
          <HelpSteps items={[
            { title: '复制诊断信息', detail: '只复制当前应用版本和操作系统平台，不包含路径、Prompt、API 地址、凭据或日志。' },
            { title: '描述复现步骤', detail: '写明所在页面、执行顺序、预期结果和实际结果；如果问题只在某个主题或窗口宽度出现，也请注明。' },
            { title: '检查附件', detail: '截图前遮住文件名、Prompt、路径和服务配置；不要上传包含 API Key 的设置画面。' },
            { title: '选择问题或建议', detail: '功能异常使用“报告问题”，体验改进或新需求使用“提出建议”。' },
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
