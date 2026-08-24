import { useState } from 'react';
import {
  Button as LobeButton,
  Input as LobeInput,
  Segmented as LobeSegmented,
  Select as LobeSelect,
  Slider as LobeSlider,
  Switch as LobeSwitch,
} from '@lobehub/ui/base-ui';
import Icon from './Icon.jsx';

function DemoControl({ children, label }) {
  return <div className="help-demo-control"><span>{label}</span>{children}</div>;
}

function DemoTag({ category = '', children, selected = false, subtitle = '' }) {
  return <span className={`help-demo-tag${category ? ` cat-${category}` : ''}${selected ? ' selected' : ''}`}>
    <strong>{children}</strong>{subtitle && <small>{subtitle}</small>}
  </span>;
}

function DemoStatus({ children, icon = 'info' }) {
  return <div aria-live="polite" className="help-demo-status"><Icon name={icon} size={14}/><span>{children}</span></div>;
}

export function WorkbenchFlowDemo() {
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

const SCOPE_DEMO = {
  'prompt:base': { description: '整个画面共享的正向内容', title: 'Base Prompt', tags: ['masterpiece', 'cinematic lighting'] },
  'prompt:character': { description: '只属于当前角色的正向内容', title: 'Character Prompt', tags: ['silver hair', 'blue eyes'] },
  'undesired:base': { description: '针对整个画面的负向内容', title: 'Base Undesired', tags: ['lowres', 'blurry'] },
  'undesired:character': { description: '只属于当前角色的负向内容', title: 'Character Undesired', tags: ['bad hands', 'extra fingers'] },
};

export function PromptScopeDemo() {
  const [kind, setKind] = useState('prompt');
  const [scope, setScope] = useState('base');
  const current = SCOPE_DEMO[`${kind}:${scope}`];

  return <div className="help-simulator help-scope-demo">
    <div className="help-demo-toolbar">
      <DemoControl label="内容类型"><LobeSegmented aria-label="演示 Prompt 类型" options={[{ label: 'Prompt', value: 'prompt' }, { label: 'Undesired', value: 'undesired' }]} size="small" value={kind} onChange={setKind}/></DemoControl>
      <DemoControl label="作用域"><LobeSegmented aria-label="演示 Prompt 范围" options={[{ label: 'Base', value: 'base' }, { label: 'Character', value: 'character' }]} size="small" value={scope} onChange={setScope}/></DemoControl>
    </div>
    <div className={`help-demo-stage${kind === 'undesired' ? ' undesired' : ''}`}>
      <header><strong>{current.title}</strong><span>{current.description}</span></header>
      <div className="help-demo-tags">{current.tags.map((tag) => <DemoTag key={tag}>{tag}</DemoTag>)}</div>
    </div>
    <DemoStatus>两个开关彼此独立；切换范围不会把正向与负向内容混在一起。</DemoStatus>
  </div>;
}

const COPY_DEMO_SCOPES = {
  'prompt:base': [
    { category: 'stylequality', tag: 'masterpiece' },
    { category: 'composition', tag: 'cinematic lighting' },
    { category: 'environment', tag: 'outdoors' },
  ],
  'prompt:character': [
    { category: 'subject', tag: '1girl' },
    { category: 'body', tag: 'silver hair' },
    { category: 'clothing', tag: 'school uniform' },
    { category: 'action', tag: 'smiling' },
  ],
  'undesired:base': [
    { category: 'stylequality', tag: 'lowres' },
    { category: 'stylequality', tag: 'blurry' },
  ],
  'undesired:character': [
    { category: 'body', tag: 'bad hands' },
    { category: 'body', tag: 'extra fingers' },
  ],
};

export function copyDemoResult(kind, scope, category = 'all') {
  return COPY_DEMO_SCOPES[`${kind}:${scope}`].filter((tag) => category === 'all' || tag.category === category);
}

export function CopyScopeDemo() {
  const [kind, setKind] = useState('prompt');
  const [scope, setScope] = useState('character');
  const [category, setCategory] = useState('all');
  const allTags = COPY_DEMO_SCOPES[`${kind}:${scope}`];
  const categories = [...new Set(allTags.map((tag) => tag.category))];
  const visibleTags = copyDemoResult(kind, scope, category);
  const labels = { action: '动作表情', body: '外貌身体', clothing: '服装配饰', composition: '镜头光影', environment: '环境背景', stylequality: '风格质量', subject: '角色组成' };

  const changeKind = (value) => { setKind(value); setCategory('all'); };
  const changeScope = (value) => { setScope(value); setCategory('all'); };

  return <div className="help-simulator help-copy-demo">
    <div className="help-demo-toolbar">
      <DemoControl label="查看内容"><LobeSegmented aria-label="复制演示内容类型" onChange={changeKind} options={[{ label: 'Prompt', value: 'prompt' }, { label: 'Undesired', value: 'undesired' }]} size="small" value={kind}/></DemoControl>
      <DemoControl label="查看区域"><LobeSegmented aria-label="复制演示作用域" onChange={changeScope} options={[{ label: 'Base', value: 'base' }, { label: 'Character 1', value: 'character' }]} size="small" value={scope}/></DemoControl>
    </div>
    <div aria-label="复制演示分类筛选" className="help-demo-filters">
      <button aria-pressed={category === 'all'} className={category === 'all' ? 'active' : ''} onClick={() => setCategory('all')} type="button">全部 <b>{allTags.length}</b></button>
      {categories.map((item) => <button aria-pressed={category === item} className={category === item ? 'active' : ''} key={item} onClick={() => setCategory(item)} type="button">{labels[item]} <b>{allTags.filter((tag) => tag.category === item).length}</b></button>)}
    </div>
    <div className="help-demo-stage">
      <header><strong>当前可见</strong><span>{visibleTags.length} 个 Tag</span></header>
      <div className="help-demo-tags">{visibleTags.map((tag) => <DemoTag category={tag.category} key={tag.tag}>{tag.tag}</DemoTag>)}</div>
    </div>
    <DemoStatus icon="copy">{kind === 'prompt' ? `正向复制结果：${visibleTags.map((tag) => tag.tag).join(', ') || '空'}` : '当前显示的是 Undesired，不会混入正向 Prompt 复制结果。'}</DemoStatus>
  </div>;
}

const TRANSLATION_DEMO_TAGS = [
  { category: '角色组成', categoryKey: 'subject', original: '1girl', scope: 'Character 1', source: 'DSO 离线', translation: '1个女孩' },
  { category: '外貌身体', categoryKey: 'body', original: 'blue hair', scope: 'Character 1', source: 'DSO 离线', translation: '蓝色头发' },
  { category: '服装配饰', categoryKey: 'clothing', original: 'school uniform', scope: 'Character 1', source: '用户修正', translation: '校服' },
  { category: '未分类', categoryKey: 'unsorted', original: 'custom visual motif', scope: 'Base Prompt', source: '等待补全', translation: '' },
];

export function TranslationCategoryDemo() {
  const [organized, setOrganized] = useState(true);
  const [viewMode, setViewMode] = useState('category');
  const [language, setLanguage] = useState('bilingual');
  const [category, setCategory] = useState('all');
  const resolvedTags = TRANSLATION_DEMO_TAGS.map((tag) => organized ? tag : { ...tag, category: '未分类', categoryKey: 'unsorted', source: '', translation: '' });
  const categoryOptions = organized
    ? [{ key: 'all', label: '全部' }, ...TRANSLATION_DEMO_TAGS.map((tag) => ({ key: tag.categoryKey, label: tag.category }))]
    : [{ key: 'all', label: '全部' }, { key: 'unsorted', label: '未分类' }];
  const visibleTags = resolvedTags.filter((tag) => category === 'all' || tag.categoryKey === category);
  const groupKey = viewMode === 'category' ? 'category' : 'scope';
  const groups = visibleTags.reduce((result, tag) => {
    const title = tag[groupKey];
    const current = result.find((group) => group.title === title);
    if (current) current.tags.push(tag);
    else result.push({ title, tags: [tag] });
    return result;
  }, []);

  const toggleOrganized = () => {
    if (organized) {
      setOrganized(false); setViewMode('structure'); setLanguage('original'); setCategory('all');
    } else {
      setOrganized(true); setViewMode('category'); setLanguage('bilingual');
    }
  };

  return <div className="help-translation-demo">
    <div className="help-translation-toolbar">
      <DemoControl label="总览分组"><LobeSegmented aria-label="翻译分类演示分组方式" onChange={setViewMode} options={[{ label: '按结构', value: 'structure' }, { label: '按分类', value: 'category' }]} size="small" value={viewMode}/></DemoControl>
      <DemoControl label="显示语言"><LobeSegmented aria-label="翻译分类演示显示语言" onChange={setLanguage} options={[{ label: '原文', value: 'original' }, { label: '翻译', value: 'translated' }, { label: '对照', value: 'bilingual' }]} size="small" value={language}/></DemoControl>
      <LobeButton aria-pressed={organized} icon={<Icon name="spark" size={14}/>} onClick={toggleOrganized} size="small" type={organized ? 'default' : 'primary'}>{organized ? '查看整理前' : `翻译与分类 ${visibleTags.length}`}</LobeButton>
    </div>
    <div aria-label="演示 Tag 分类筛选" className="help-translation-filters">
      {categoryOptions.map((option) => {
        const count = option.key === 'all' ? resolvedTags.length : resolvedTags.filter((tag) => tag.categoryKey === option.key).length;
        return <button aria-pressed={category === option.key} className={category === option.key ? 'active' : ''} key={option.key} onClick={() => setCategory(option.key)} type="button">{option.label} <b>{count}</b></button>;
      })}
    </div>
    <div aria-live="polite" className="help-translation-groups">
      {groups.map((group) => <section key={group.title}>
        <header><strong>{group.title}</strong><span>{group.tags.length}</span></header>
        <div className="help-translation-tags">
          {group.tags.map((tag) => <span className={`help-translation-tag cat-${tag.categoryKey}`} key={tag.original}>
            <span><strong>{language === 'translated' && tag.translation ? tag.translation : tag.original}</strong>{language === 'bilingual' && <small>{tag.translation || '等待补全译文'}</small>}</span>
            {organized && <small>{viewMode === 'structure' ? tag.category : tag.source}</small>}
          </span>)}
        </div>
      </section>)}
    </div>
    <footer><span><Icon name="filter" size={13}/>按钮只处理当前可见的 {visibleTags.length} 个 Tag</span><span><Icon name="copy" size={13}/>复制始终使用原始 Tag</span></footer>
  </div>;
}

export function TranslationResolutionPath() {
  return <ol aria-label="翻译与分类处理优先顺序" className="help-resolution-path">
    <li><span>1</span><strong>你的修正</strong><small>本地 · 最高优先</small></li>
    <li><span>2</span><strong>画师验证</strong><small>仅缺失名称 · 联网</small></li>
    <li><span>3</span><strong>DSO 词典</strong><small>精确命中 · 离线</small></li>
    <li><span>4</span><strong>本地规则</strong><small>继续推断 · 离线</small></li>
    <li><span>5</span><strong>可选 AI</strong><small>只补全剩余 Tag</small></li>
  </ol>;
}

export function FidelityDemo() {
  const [view, setView] = useState('structure');
  const [edited, setEdited] = useState(false);
  const tags = edited
    ? [{ tag: 'silver hair', weight: '1.20' }, { tag: '1girl', weight: '1.00' }, { tag: 'blue eyes', weight: '1.00' }]
    : [{ tag: '1girl', weight: '1.00' }, { tag: 'silver hair', weight: '1.00' }, { tag: 'blue eyes', weight: '1.00' }];
  const raw = edited
    ? '{silver hair}, 1girl, blue eyes,\nText: soft cinematic portrait'
    : '1girl, silver hair, blue eyes,\nText: soft cinematic portrait';

  return <div className="help-simulator help-fidelity-demo">
    <div className="help-demo-toolbar">
      <DemoControl label="编辑方式"><LobeSegmented aria-label="原文保真演示视图" onChange={setView} options={[{ label: '结构视图', value: 'structure' }, { label: '原始文本', value: 'raw' }]} size="small" value={view}/></DemoControl>
      <LobeButton aria-pressed={edited} icon={<Icon name={edited ? 'restore' : 'edit'} size={14}/>} onClick={() => setEdited((value) => !value)} size="small">{edited ? '恢复演示' : '调整顺序与权重'}</LobeButton>
    </div>
    <div className="help-demo-stage">
      {view === 'structure' ? <div className="help-fidelity-rows">{tags.map((tag, index) => <div key={tag.tag}><span>{index + 1}</span><strong>{tag.tag}</strong><small>权重 {tag.weight}</small></div>)}</div> : <pre>{raw}</pre>}
    </div>
    <DemoStatus icon="copy">复制结果始终保留 Tag 顺序、权重、换行以及完整的 Text: 内容。</DemoStatus>
  </div>;
}

const SELECTION_TAGS = ['1girl', 'solo', 'looking at viewer', 'upper body', 'soft light', 'outdoors'];

export function SelectionBatchDemo() {
  const [selected, setSelected] = useState(SELECTION_TAGS.slice(0, 3));
  const [result, setResult] = useState('已框选前三个 Tag');
  const [showMarquee, setShowMarquee] = useState(true);
  const toggle = (tag) => {
    setShowMarquee(false);
    setSelected((current) => current.includes(tag) ? current.filter((item) => item !== tag) : [...current, tag]);
  };
  const action = (label) => setResult(`${label}只会处理当前选中的 ${selected.length} 个 Tag`);

  return <div className="help-simulator help-selection-demo">
    <div aria-label="批量选择演示 Tag" className="help-selection-canvas">
      {SELECTION_TAGS.map((tag) => <button aria-pressed={selected.includes(tag)} className={selected.includes(tag) ? 'selected' : ''} key={tag} onClick={() => toggle(tag)} type="button">{tag}</button>)}
      {showMarquee && <i aria-hidden="true"/>}
    </div>
    <div className="help-selection-toolbar">
      <strong>已选 {selected.length}</strong>
      <LobeButton disabled={!selected.length} onClick={() => action('复制')} size="small">复制</LobeButton>
      <LobeButton disabled={!selected.length} onClick={() => action('翻译与分类')} size="small">翻译</LobeButton>
      <LobeButton disabled={!selected.length} onClick={() => action('设置分类')} size="small">分类</LobeButton>
      <LobeButton disabled={!selected.length} onClick={() => action('移动作用域')} size="small">移动</LobeButton>
      <LobeButton danger disabled={!selected.length} onClick={() => action('删除')} size="small">删除</LobeButton>
    </div>
    <DemoStatus>{result}</DemoStatus>
  </div>;
}

const TAB_STATES = {
  tabs: { active: 0, description: '每张图片拥有独立标签、来源和草稿。', dirty: [], missing: [] },
  draft: { active: 1, description: '修改只标记当前标签，不影响其他图片。', dirty: [1], missing: [] },
  restart: { active: 1, description: '完整退出后，标签顺序、当前标签和草稿都会恢复。', dirty: [1], missing: [] },
  missing: { active: 2, description: '来源失效会明确提示；本地草稿仍保留。', dirty: [1], missing: [2] },
};

export function TabDraftDemo() {
  const [state, setState] = useState('draft');
  const current = TAB_STATES[state];
  const tabs = ['构图参考.png', '角色草稿.png', '外部图片.png'];
  return <div className="help-simulator help-tab-demo">
    <div className="help-demo-toolbar"><DemoControl label="查看状态"><LobeSegmented aria-label="标签草稿演示状态" onChange={setState} options={[{ label: '多图标签', value: 'tabs' }, { label: '修改草稿', value: 'draft' }, { label: '重启恢复', value: 'restart' }, { label: '来源失效', value: 'missing' }]} size="small" value={state}/></DemoControl></div>
    <div className="help-demo-filmstrip">{tabs.map((tab, index) => <div className={`${current.active === index ? 'active' : ''}${current.missing.includes(index) ? ' missing' : ''}`} key={tab}><Icon name={current.missing.includes(index) ? 'warning' : 'image'} size={16}/><span>{tab}</span>{current.dirty.includes(index) && <b aria-label="已修改">●</b>}</div>)}</div>
    <DemoStatus icon={state === 'missing' ? 'warning' : 'restore'}>{current.description}</DemoStatus>
  </div>;
}

const GROUPING_IMAGES = [
  { name: '夜景角色 01', scene: 'night', vibe: 'Vibe A' },
  { name: '夜景角色 02', scene: 'station', vibe: 'Vibe B' },
  { name: '夜景角色 03', scene: 'library', vibe: 'Vibe A' },
  { name: '海边角色 01', scene: 'beach', vibe: 'Vibe A' },
];

const GALLERY_GROUPING_LABELS = {
  base: '基础 Prompt', full: '完整 Prompt', separate: '全部分开', similar: '相似 Prompt',
};

const GALLERY_GROUPING_DESCRIPTIONS = {
  base: '忽略角色 Prompt 与位置',
  full: '角色、位置与完整 Prompt 必须相同',
  separate: '每张图片独立显示',
  similar: '按基础 Prompt 的 Tag 相似度归组',
};

function HelpGalleryArtwork({ scene }) {
  return <svg aria-hidden="true" className={`help-gallery-art scene-${scene}`} viewBox="0 0 120 120">
    <rect className="help-art-sky" height="120" width="120"/>
    <circle className="help-art-light" cx={scene === 'beach' ? 92 : 24} cy={scene === 'night' ? 24 : 32} r="13"/>
    <path className="help-art-ground" d={scene === 'beach' ? 'M0 72 Q30 61 60 73 T120 70 V120 H0Z' : 'M0 78 L120 68 V120 H0Z'}/>
    <path className="help-art-figure" d="M63 35c9 0 15 8 15 18 0 7-3 11-6 15l9 34H43l9-34c-4-4-7-9-7-15 0-10 7-18 18-18Z"/>
    <path className="help-art-detail" d={scene === 'library' ? 'M9 18h25v53H9zm77 8h25v47H86z' : scene === 'station' ? 'M12 26h30v8H12zm4 11h22v37H16z' : 'M14 84h30m47-8h22'}/>
  </svg>;
}

function helpGalleryGroups(images, assignments) {
  return assignments.reduce((groups, assignment, index) => {
    const current = groups.find((group) => group.id === assignment);
    if (current) current.members.push(images[index]);
    else groups.push({ id: assignment, members: [images[index]] });
    return groups;
  }, []);
}

function HelpGalleryCard({ group, onSelect, selected }) {
  const cover = group.members[0];
  return <article className={`gallery-card help-gallery-card${group.members.length > 1 ? ' grouped' : ''}${selected ? ' selected' : ''}`}>
    <button aria-label={`${cover.name}${group.members.length > 1 ? `，共 ${group.members.length} 张` : ''}`} aria-pressed={selected} className="gallery-card-main" onClick={onSelect} type="button">
      <span className="gallery-card-image">
        {group.members.slice(1, 3).map((member, index) => <span aria-hidden="true" className={`gallery-card-stack gallery-card-stack-${index + 1}`} key={member.name}><HelpGalleryArtwork scene={member.scene}/></span>)}
        <span className="help-gallery-card-cover"><HelpGalleryArtwork scene={cover.scene}/></span>
        {group.members.length > 1 && <span className="gallery-group-count"><b>{group.members.length}</b><span> 张</span></span>}
        <span className="help-gallery-card-name">{cover.name}</span>
      </span>
    </button>
  </article>;
}

function HelpGalleryGrid({ groups }) {
  const [selected, setSelected] = useState('');
  return <div aria-label="演示图库结果" className="help-real-gallery-grid">{groups.map((group) => <HelpGalleryCard group={group} key={group.id} onSelect={() => setSelected(group.id)} selected={selected === group.id}/>)}</div>;
}

export function GalleryImportDemo() {
  const [source, setSource] = useState('image');
  const [imported, setImported] = useState(false);
  const items = source === 'image'
    ? [{ name: '雨后候车亭.png', scene: 'station' }]
    : [{ name: '夜景角色-01.png', scene: 'night' }, { name: '夜景角色-02.png', scene: 'library' }, { name: '海边角色-01.png', scene: 'beach' }];
  const changeSource = (value) => { setSource(value); setImported(false); };
  return <div className="help-simulator help-import-demo">
    <div className="help-demo-toolbar">
      <DemoControl label="选择导入内容"><LobeSegmented aria-label="图库导入演示内容" onChange={changeSource} options={[{ label: '单张图片', value: 'image' }, { label: 'NovelAI ZIP', value: 'zip' }]} size="small" value={source}/></DemoControl>
      <LobeButton icon={<Icon name="plus" size={14}/>} onClick={() => setImported(true)} size="small" type="primary">模拟导入</LobeButton>
    </div>
    <div className="help-import-body">
      <div className="help-import-source"><Icon name={source === 'image' ? 'image' : 'folder'} size={22}/><span><strong>{source === 'image' ? '雨后候车亭.png' : 'NovelAI 导出.zip'}</strong><small>{source === 'image' ? '读取一张图片及其 metadata' : '自动展开支持的图片，保留 ZIP 内文件名'}</small></span></div>
      <Icon aria-hidden="true" className="help-import-arrow" name="next" size={16}/>
      <div className="help-import-preview">{items.map((item) => <div key={item.name}><HelpGalleryArtwork scene={item.scene}/><span>{item.name}</span></div>)}</div>
    </div>
    <div className="help-import-steps"><span className={imported ? 'complete' : ''}>读取</span><span className={imported ? 'complete' : ''}>检查重复</span><span className={imported ? 'complete' : ''}>保存应用副本</span><span className={imported ? 'complete' : ''}>加入图库</span></div>
    <DemoStatus icon={imported ? 'check' : 'info'}>{imported ? `${items.length} 张演示图片已加入下方流程；外部原图没有被修改。` : '演示只模拟选择结果，不会打开文件窗口或写入真实图片库。'}</DemoStatus>
  </div>;
}

export function galleryGroupingAssignments(mode, similarity = 85, mergeVibe = false) {
  if (mode === 'separate') return ['A', 'B', 'C', 'D'];
  if (mode === 'full') return mergeVibe ? ['A', 'A', 'B', 'C'] : ['A', 'B', 'C', 'D'];
  if (mode === 'base') return mergeVibe ? ['A', 'A', 'A', 'B'] : ['A', 'B', 'A', 'C'];
  if (similarity >= 92) return ['A', 'B', 'C', 'D'];
  if (similarity >= 82) return mergeVibe ? ['A', 'A', 'A', 'B'] : ['A', 'B', 'A', 'C'];
  return mergeVibe ? ['A', 'A', 'A', 'A'] : ['A', 'B', 'A', 'C'];
}

export function GalleryGroupingDemo() {
  const [mode, setMode] = useState('base');
  const [similarity, setSimilarity] = useState(85);
  const [mergeVibe, setMergeVibe] = useState(false);
  const assignments = galleryGroupingAssignments(mode, similarity, mergeVibe);
  const groups = helpGalleryGroups(GROUPING_IMAGES, assignments);
  return <div className="help-simulator help-grouping-demo">
    <div className="help-real-gallery-toolbar"><LobeInput aria-label="演示图库搜索" placeholder="搜索文件名、Tag 或译名" readOnly/><LobeButton icon={<Icon name="layers" size={14}/>} size="small">分组：{GALLERY_GROUPING_LABELS[mode]}</LobeButton><span>{groups.length} 组 · 4 张</span></div>
    <div className="help-gallery-teaching-layout">
      <div className="help-real-gallery-surface"><HelpGalleryGrid groups={groups}/></div>
      <div className="gallery-grouping-panel help-grouping-panel-embedded">
        <strong className="gallery-grouping-heading">分组方式</strong>
        <div aria-label="图库分组演示方式" className="gallery-grouping-options" role="radiogroup">{['separate', 'full', 'base', 'similar'].map((scope) => {
          const selected = mode === scope;
          return <button aria-checked={selected} className={`gallery-grouping-option ${selected ? 'selected' : ''}`} key={scope} onClick={() => setMode(scope)} role="radio" type="button"><span aria-hidden="true" className="gallery-grouping-radio">{selected && <Icon name="check" size={11}/>}</span><span><strong>{GALLERY_GROUPING_LABELS[scope]}</strong><small>{GALLERY_GROUPING_DESCRIPTIONS[scope]}</small></span></button>;
        })}</div>
        {mode === 'similar' && <div className="gallery-similarity-control"><div><span>最低相似度</span><strong>{similarity}%</strong></div><LobeSlider aria-label="演示最低相似度" max={95} min={70} onChange={setSimilarity} step={5} value={similarity}/><div className="gallery-similarity-scale"><span>宽松</span><span>严格</span></div></div>}
        <div className="gallery-grouping-vibe-row"><div><strong>跨 Vibe 合并</strong><small>{mode === 'separate' ? '全部分开时不适用' : '允许不同 Vibe 进入同一组'}</small></div><LobeSwitch aria-label="演示跨 Vibe 合并" checked={mode !== 'separate' && mergeVibe} disabled={mode === 'separate'} onChange={setMergeVibe} size="small"/></div>
      </div>
    </div>
    <DemoStatus icon="library">右侧使用与图库相同的设置面板；左侧会真正合并卡片，并以堆叠和数量标记分组结果。</DemoStatus>
  </div>;
}

const FILTER_IMAGES = [
  { days: 4, model: 'v45', name: '蓝发夜景', scene: 'night', tags: ['blue hair', 'night'], vibe: 'vibe-a' },
  { days: 12, model: 'v45', name: '蓝发室内', scene: 'library', tags: ['blue hair', 'indoors'], vibe: 'vibe-a' },
  { days: 2, model: 'v4', name: '蓝发模糊图', scene: 'station', tags: ['blue hair', 'blurry'], vibe: 'none' },
  { days: 8, model: 'v45', name: '银发夜景', scene: 'night', tags: ['silver hair', 'night'], vibe: 'vibe-b' },
  { days: 48, model: 'v45', name: '早期蓝发图', scene: 'station', tags: ['blue hair', 'outdoors'], vibe: 'vibe-a' },
  { days: 3, model: 'v4', name: '海边角色', scene: 'beach', tags: ['blonde hair', 'beach'], vibe: 'none' },
];

export function filterGalleryDemoItems(filters) {
  return FILTER_IMAGES.filter((image) => {
    const query = filters.query?.trim().toLowerCase();
    if (query && ![image.name, ...image.tags].some((value) => value.toLowerCase().includes(query))) return false;
    if (filters.models?.length && !filters.models.includes(image.model)) return false;
    if (filters.vibes?.length && !filters.vibes.includes(image.vibe)) return false;
    if (filters.includeTags?.length) {
      const matches = filters.includeTags.map((tag) => image.tags.includes(tag));
      if (filters.tagMatch === 'any' ? !matches.some(Boolean) : !matches.every(Boolean)) return false;
    }
    if (filters.excludeTags?.some((tag) => image.tags.includes(tag))) return false;
    if (filters.datePreset === '30d' && image.days > 30) return false;
    return true;
  });
}

export function GalleryFilterDemo() {
  const [filters, setFilters] = useState({ datePreset: '30d', excludeTags: ['blurry'], includeTags: ['blue hair'], models: ['v45'], query: '', tagMatch: 'all', vibes: [] });
  const [smart, setSmart] = useState(false);
  const results = filterGalleryDemoItems(filters);
  const change = (patch) => { setSmart(false); setFilters((current) => ({ ...current, ...patch })); };
  const reset = () => change({ datePreset: 'all', excludeTags: [], includeTags: [], models: [], query: '', tagMatch: 'all', vibes: [] });
  const activeCount = [filters.includeTags.length, filters.excludeTags.length, filters.models.length, filters.vibes.length, filters.datePreset === 'all' ? 0 : 1].filter(Boolean).length;
  const tagOptions = [{ label: 'blue hair', value: 'blue hair' }, { label: 'night', value: 'night' }, { label: 'indoors', value: 'indoors' }, { label: 'blurry', value: 'blurry' }];
  return <div className="help-simulator help-filter-demo">
    <div className="help-real-gallery-toolbar"><LobeInput aria-label="图库搜索演示" onChange={(event) => change({ query: event.target.value })} placeholder="搜索文件名、Tag 或译名" value={filters.query}/><LobeButton aria-pressed={Boolean(activeCount)} className={activeCount ? 'gallery-filter-trigger active' : 'gallery-filter-trigger'} icon={<Icon name="filter" size={14}/>} size="small">筛选 · {activeCount}</LobeButton><span>{results.length} 组 · {results.length} 张</span></div>
    <div className="help-gallery-teaching-layout filter-layout">
      <div className="gallery-filter-panel help-filter-panel-embedded">
        <header className="gallery-filter-header"><div><strong>筛选图片</strong><small>不同筛选项之间同时满足</small></div><LobeButton disabled={!activeCount} onClick={reset} size="small" type="text">清除</LobeButton></header>
        <section className="gallery-filter-section"><div className="gallery-filter-label"><span>包含 Tag</span><LobeSegmented aria-label="包含 Tag 的匹配方式演示" onChange={(tagMatch) => change({ tagMatch })} options={[{ label: '全部', value: 'all' }, { label: '任意', value: 'any' }]} size="small" value={filters.tagMatch}/></div><LobeSelect aria-label="必须包含的 Tag 演示" mode="multiple" onChange={(includeTags) => change({ includeTags: Array.isArray(includeTags) ? includeTags : [] })} options={tagOptions} placeholder="选择 Tag" size="small" value={filters.includeTags}/></section>
        <section className="gallery-filter-section"><span className="gallery-filter-label">排除 Tag</span><LobeSelect aria-label="要排除的 Tag 演示" mode="multiple" onChange={(excludeTags) => change({ excludeTags: Array.isArray(excludeTags) ? excludeTags : [] })} options={tagOptions} placeholder="选择不想出现的 Tag" size="small" value={filters.excludeTags}/></section>
        <div className="gallery-filter-fields"><section className="gallery-filter-section"><span className="gallery-filter-label">模型</span><LobeSelect aria-label="生成模型演示" mode="multiple" onChange={(models) => change({ models: Array.isArray(models) ? models : [] })} options={[{ label: 'NAI v4.5', value: 'v45' }, { label: 'NAI v4', value: 'v4' }]} placeholder="不限模型" size="small" value={filters.models}/></section><section className="gallery-filter-section"><span className="gallery-filter-label">Vibe</span><LobeSelect aria-label="Vibe 演示" mode="multiple" onChange={(vibes) => change({ vibes: Array.isArray(vibes) ? vibes : [] })} options={[{ label: 'Vibe A', value: 'vibe-a' }, { label: 'Vibe B', value: 'vibe-b' }, { label: '无 Vibe', value: 'none' }]} placeholder="不限 Vibe" size="small" value={filters.vibes}/></section></div>
        <section className="gallery-filter-section"><span className="gallery-filter-label">导入时间</span><LobeSelect aria-label="导入时间演示" onChange={(datePreset) => change({ datePreset })} options={[{ label: '不限时间', value: 'all' }, { label: '最近 30 天', value: '30d' }]} size="small" value={filters.datePreset}/></section>
        <LobeButton icon={<Icon name={smart ? 'check' : 'spark'} size={14}/>} onClick={() => setSmart(true)} size="small">{smart ? '已保存演示规则' : '保存为智能收藏集'}</LobeButton>
      </div>
      <div className="help-real-gallery-surface"><HelpGalleryGrid groups={results.map((image, index) => ({ id: `${image.name}-${index}`, members: [image] }))}/></div>
    </div>
    <DemoStatus icon={smart ? 'star' : 'filter'}>{smart ? `已保存当前 ${activeCount} 项演示规则；以后符合条件的图片会自动进入。` : `右侧是筛选后的真实卡片形态；排除条件优先，并且筛选发生在自动分组之前。`}</DemoStatus>
  </div>;
}

const SCOPE_MEMBERS = ['夜景角色 01', '夜景角色 02', '夜景角色 03'];

export function GalleryScopeDemo() {
  const [member, setMember] = useState(0);
  const [actionScope, setActionScope] = useState('detail');
  return <div className="help-simulator help-gallery-scope-demo">
    <div className="help-demo-toolbar"><DemoControl label="操作位置"><LobeSegmented aria-label="图片组操作范围演示" onChange={setActionScope} options={[{ label: '详情侧栏', value: 'detail' }, { label: '批量工具栏', value: 'batch' }]} size="small" value={actionScope}/></DemoControl></div>
    <div className="help-gallery-members">
      <div className="help-gallery-group-card"><span>完整 Prompt 组 · 3 张</span><i/><strong>{SCOPE_MEMBERS[member]}</strong><small>移动指针浏览成员，单击查看详情</small></div>
      <div aria-label="演示图片组成员" className="help-gallery-member-list">{SCOPE_MEMBERS.map((name, index) => <button aria-pressed={member === index} className={member === index ? 'active' : ''} key={name} onClick={() => setMember(index)} type="button"><i/><span>{index + 1}</span></button>)}</div>
    </div>
    <DemoStatus icon={actionScope === 'detail' ? 'image' : 'tags'}>{actionScope === 'detail' ? `重命名、复制和下载只作用于当前成员“${SCOPE_MEMBERS[member]}”。` : '收藏、加入收藏集或移入回收站会作用于当前显示的整个图片组（3 张）。'}</DemoStatus>
  </div>;
}

export function TrashLifecycleDemo() {
  const [stage, setStage] = useState('gallery');
  const [confirming, setConfirming] = useState(false);
  const moveTo = (nextStage) => { setConfirming(false); setStage(nextStage); };
  const actions = {
    gallery: <LobeButton icon={<Icon name="trash" size={14}/>} onClick={() => moveTo('trash')} size="small">移入回收站</LobeButton>,
    trash: confirming
      ? <><LobeButton onClick={() => setConfirming(false)} size="small">取消</LobeButton><LobeButton danger icon={<Icon name="trash" size={14}/>} onClick={() => moveTo('deleted')} size="small">确认永久删除</LobeButton></>
      : <><LobeButton icon={<Icon name="restore" size={14}/>} onClick={() => moveTo('gallery')} size="small">恢复</LobeButton><LobeButton danger icon={<Icon name="trash" size={14}/>} onClick={() => setConfirming(true)} size="small">永久删除副本</LobeButton></>,
    deleted: <LobeButton icon={<Icon name="restore" size={14}/>} onClick={() => moveTo('gallery')} size="small">重置演示</LobeButton>,
  };
  const messages = {
    gallery: '应用副本位于图片库；外部原图仍独立存在。',
    trash: confirming ? '这是不可恢复的操作；只有再次确认后，演示副本才会永久删除。' : '应用副本暂时隐藏，但仍可恢复。永久删除前会再次确认。',
    deleted: '应用副本、缩略图和相关资源已从演示中移除；外部原图不受影响。',
  };
  return <div className="help-simulator help-trash-demo">
    <div className="help-trash-lifecycle">
      {['gallery', 'trash', 'deleted'].map((item, index) => <div className={stage === item ? 'active' : ''} key={item}><span>{index + 1}</span><Icon name={item === 'gallery' ? 'library' : 'trash'} size={17}/><strong>{item === 'gallery' ? '图片库' : item === 'trash' ? '回收站' : '永久删除'}</strong></div>)}
    </div>
    <div className="help-trash-actions">{actions[stage]}</div>
    <DemoStatus icon={stage === 'deleted' ? 'warning' : 'info'}>{messages[stage]}</DemoStatus>
    <div className="help-migration-flow"><strong>迁移资源位置</strong><span>复制到空目录</span><Icon name="next" size={14}/><span>校验完整性</span><Icon name="next" size={14}/><span>切换资源位置</span></div>
  </div>;
}

const DATA_FLOWS = {
  workbench: [
    { label: '外部原图', place: '只读' }, { label: 'Prompt 草稿', place: '本机' }, { label: '复制结果', place: '剪贴板' },
  ],
  gallery: [
    { label: '外部原图', place: '不修改' }, { label: '应用副本', place: '资源目录' }, { label: '索引与收藏集', place: '本机' },
  ],
  offline: [
    { label: '用户修正', place: '本机' }, { label: 'DSO 词典', place: '离线' }, { label: '本地规则', place: '离线' },
  ],
  ai: [
    { label: '未完成 Tag', place: '本机' }, { label: '配置的 AI 服务', place: '联网', network: true }, { label: '结果缓存', place: '本机' },
  ],
};

export function DataFlowDemo() {
  const [flow, setFlow] = useState('workbench');
  return <div className="help-simulator help-data-flow-demo">
    <div className="help-demo-toolbar"><DemoControl label="查看操作"><LobeSegmented aria-label="数据流演示操作" onChange={setFlow} options={[{ label: '打开到工作台', value: 'workbench' }, { label: '导入图片库', value: 'gallery' }, { label: '离线整理', value: 'offline' }, { label: 'AI 补全', value: 'ai' }]} size="small" value={flow}/></DemoControl></div>
    <div className="help-data-flow">{DATA_FLOWS[flow].map((node, index) => <span key={node.label}><span className={node.network ? 'network' : ''}><Icon name={node.network ? 'externalLink' : 'database'} size={16}/><strong>{node.label}</strong><small>{node.place}</small></span>{index < DATA_FLOWS[flow].length - 1 && <Icon name="next" size={14}/>}</span>)}</div>
    <div className="help-key-flow"><Icon name="settings" size={15}/><strong>API Key</strong><span>系统安全存储</span><span>渲染页面无法读取明文</span></div>
    <DemoStatus icon={flow === 'ai' ? 'externalLink' : 'database'}>{flow === 'ai' ? '只有离线方式仍未完成的 Tag 才会发送到你配置的服务。' : '这条路径不需要把 Prompt 或图片发送到远程服务。'}</DemoStatus>
  </div>;
}

const TROUBLESHOOTING_CASES = {
  metadata: { cause: '截图、转码或网页复制可能已经移除了 NovelAI metadata。', next: '改用 NovelAI 原始导出的 PNG；纯像素无法恢复已经丢失的 Prompt。' },
  paste: { cause: '文本框获得焦点时，Ctrl/Cmd + V 会保留为普通文本粘贴。', next: '先退出文本编辑，或使用“打开图片 / 导入图片”选择原文件。' },
  duplicates: { cause: '内容完全相同的图片会自动跳过。', next: '检查导入结果和现有图片，不需要重复导入。' },
  translation: { cause: 'DSO 可能未收录，或 General Tag 没有可靠分类。', next: '检查 AI 服务配置、稍后重试，或手动修正；Prompt 编辑不会受影响。' },
  source: { cause: '外部文件可能被移动、重命名或删除。', next: '重新打开文件；图片库来源还需确认资源位置可访问。' },
  grouping: { cause: '搜索与筛选先作用于单张图片，再进行自动分组。', next: '清除部分条件即可重新看到被过滤的组内成员。' },
};

export function TroubleshootingDemo() {
  const [issue, setIssue] = useState('metadata');
  const current = TROUBLESHOOTING_CASES[issue];
  const options = [
    { label: '图片没有 Prompt', value: 'metadata' }, { label: '粘贴没有打开图片', value: 'paste' },
    { label: '导入数量变少', value: 'duplicates' }, { label: '翻译分类未完成', value: 'translation' },
    { label: '图片来源不可用', value: 'source' }, { label: '组内成员消失', value: 'grouping' },
  ];
  return <div className="help-simulator help-troubleshooting-demo">
    <div className="help-demo-toolbar"><DemoControl label="选择遇到的现象"><LobeSelect aria-label="常见问题现象" onChange={setIssue} options={options} value={issue}/></DemoControl></div>
    <dl><div><dt>可能原因</dt><dd>{current.cause}</dd></div><div><dt>下一步</dt><dd>{current.next}</dd></div></dl>
  </div>;
}

export function DiagnosticsDemo() {
  const [copied, setCopied] = useState(false);
  return <div className="help-simulator help-diagnostics-demo">
    <div className="help-diagnostics-columns">
      <section><header><Icon name="check" size={15}/><strong>诊断信息包含</strong></header><span>当前应用版本号</span><span>当前系统平台</span></section>
      <section><header><Icon name="close" size={15}/><strong>绝不会自动包含</strong></header><span>图片路径与 Prompt</span><span>API 地址、API Key 与日志</span></section>
    </div>
    <div className="help-diagnostics-action"><LobeButton icon={<Icon name="copy" size={14}/>} onClick={() => setCopied(true)} size="small">演示复制诊断信息</LobeButton><span aria-live="polite">{copied ? '演示完成：只复制左侧两项' : '不会写入真实剪贴板'}</span></div>
  </div>;
}
