// 界面稿（第五部分）：工作台的各个状态。依赖 preview.js、preview-pages.js、preview-library.js。
// 地址参数：preview.html?page=wb&sub=edit
const WB_STATES = [['home', '默认'], ['edit', '编辑 Tag'], ['add', '添加 Tag'], ['select', '多选'], ['negsel', '只选了排除内容'], ['prose', '编辑段落'],
  ['block', '块的操作'], ['raw', '编辑原始文本'], ['filter', '搜索与筛选'], ['view', '显示方式'], ['copy', '复制菜单'], ['chars', '角色'],
  ['unsaved', '未存入图片库'], ['missing', '图片不见了'], ['tabs', '很多标签']];
const wbState = () => (WB_STATES.some(([k]) => k === S.sub) ? S.sub : 'home');
const ib = (icon, label, cls = '') => `<button class="btn quiet sm icon ${cls}" aria-label="${label}" title="${label}">${ic(icon)}</button>`;
const secActs = (extra = '') => `<span class="acts">${extra}${ib('file-copy-line', '复制这一节')}${ib('more-line', '更多')}</span>`;
const blkActs = () => `<span class="acts">${ib('more-line', '这一块的操作')}</span>`;
const ghost = () => `<span class="tag ghost">${ic('add-line')}输入中文或英文</span>`;

// Prompt 栏顶部。filters：生效的条件数；open：哪个浮层开着
function wbHead({ filters = 0, open = '', query = '' } = {}) {
  const tabs = gen() ? [['p', 'Prompt'], ['a', '参数'], ['r', '参考']] : [['p', 'Prompt']];
  return `<div class="col-h"><div class="seg">${tabs.map(([k, t]) => `<button class="${k === 'p' ? 'on' : ''}">${t}</button>`).join('')}</div>
    <span class="field sm grow ${query ? 'is-focus' : ''}" title="搜索 Tag 或译名">${ic('search-line')}${query ? `<span>${query}</span>` : '<span class="ph">搜索 Tag</span>'}<span class="sp"></span>${query ? ic('close-line') : '<span class="kbd">Ctrl K</span>'}</span>
    <button class="btn quiet sm ${filters || open === 'view' ? 'on' : ''}">${ic('equalizer-line')}显示${filters ? `<span class="cnt">${filters}</span>` : ''}</button><button class="btn quiet sm">AI</button></div>`;
}

// 底栏。label：复制按钮上的字；open：复制菜单开着
function wbBar(label = '复制 Prompt', open = false) {
  return `<div class="bar">${gen() ? `<span class="label">Seed</span><span class="field sm mono">${ic('shuffle-line')}随机</span><span class="label">张数</span><span class="field sm mono">1</span>` : ''}
    <span class="sp"></span><span class="split"><button class="btn">${ic('file-copy-line')}${label}</button><button class="btn ${open ? 'is-hover' : ''}" aria-label="其他复制方式">${ic('arrow-down-s-line')}</button></span>
    ${gen() ? '<span class="cost"><b>0 Anlas</b><span>用量 +1%</span></span><button class="btn seal">生成</button>' : ''}</div>`;
}

// 图片舞台。save：saved 已存 / unsaved 未存；dirty：Prompt 改过；missing：图片不见了
function wbStage({ save = 'saved', dirty = false, missing = false } = {}) {
  const keep = save === 'saved' ? `<span class="saved">${ic('check-line')}已存入图片库</span>` : `<button class="btn sm keep">${ic('inbox-archive-line')}存入图片库</button>`;
  return `<div class="col stage">
    ${missing ? `<div style="padding:var(--sp-4) var(--sp-6) 0"><div class="banner warn">${ic('alert-line')}这张图片已被移动或删除。Prompt 还在，可以继续编辑和复制；关闭这个标签不影响其他标签。</div></div>` : ''}
    <div class="canvas">${missing ? `<div class="empty" style="padding:0"><span class="mark">${LOGO_EMPTY_SVG}</span><p>无法显示图片</p></div>` : `<img src="${IMG('雨后候车亭-02')}" alt="当前图片">`}</div>
    <div class="caption"><b>雨后候车亭-02</b>
      <span class="meta mono">832 × 1216 · V5 · ${gen() ? 'High · ' : ''}28 步 · 引导 5 · Seed 1506844432</span>
      ${dirty ? `<span class="dirty-line">Prompt 已经和原图不一样<button class="btn quiet sm">${ic('arrow-go-back-line')}还原成原图的 Prompt</button></span>` : ''}</div>
    <div class="stage-acts">${keep}
      <button class="btn quiet sm">${ic('folder-open-line')}在文件夹中显示</button><button class="btn quiet sm">${ic('file-copy-line')}复制图片</button><button class="btn quiet sm">${ic('download-2-line')}另存为</button></div>
  </div>`;
}

// 一个 Tag 块。mode 决定演示哪种状态
function wbStyleBlock(mode = '') {
  const input = mode === 'add' ? `<span class="tag input">铜色<span class="caret"></span></span>` : ghost();
  return `<div class="blk ${mode === 'block' ? 'on' : ''}"><div class="blk-h"><span class="label">TAG 块 · 风格与画师 · 8 个</span>${blkActs()}</div><div class="tags">
    ${tag('artist:konya_karasue', '画师', 'artist-era', '1.0')}${tag('artist:yoneyama_mai', '画师', 'artist-era', '1.3', mode === 'edit' ? 'editing' : '')}${tag('artist:deyui', '画师', 'artist-era', '0.8')}
    ${tag('year 2026 ::', '多余的 :: 结束符', 'artist-era', '', 'warn')}${tag('cinematic composition', '电影感构图', 'composition', '2')}${tag('soft studio lighting', '柔和的棚拍光', 'style')}
    ${tag('flat color', '平涂', 'style', '−2')}${tag('detailed skin texture', '细腻的皮肤质感', 'body')}${input}</div>
    ${mode === 'add' ? '<div class="help">回车添加。用逗号或换行可以一次添加多个；输入中文会找对应的英文 Tag。</div>' : ''}</div>`;
}
const wbProse = () => `<div class="blk"><div class="blk-h"><span class="label">段落 · 构图</span>${blkActs()}</div>
  <p class="prose">A vertical full illustration of a girl waiting at a bus shelter just after the rain. She stands slightly right of centre, the transparent umbrella tilted toward the viewer, while the wet pavement mirrors the pale sky.</p>
  <p class="trans">竖幅全身插画：雨刚停，女孩在候车亭下等车。她站在画面中间偏右，透明的伞朝观看者倾斜，湿漉漉的路面映着淡色的天空。</p></div>`;
const wbProseEdit = () => `<div class="blk on"><div class="blk-h"><span class="label">段落 · 构图 · 编辑中</span></div><div class="editor">
  <div class="area prose-edit">A vertical full illustration of a girl waiting at a bus shelter just after the rain. She stands slightly right of centre, the transparent umbrella tilted toward the viewer, while the wet pavement mirrors the pale sky.</div>
  <div class="swap"><button class="btn quiet sm">${ic('arrow-down-line')}译成中文</button><button class="btn quiet sm">${ic('arrow-up-line')}按中文改写英文</button><span class="help">发给 NovelAI 的是上面的英文</span></div>
  <div class="area is-focus">竖幅全身插画：雨刚停，女孩在候车亭下等车。她站在画面中间偏右，透明的伞朝观看者倾斜，湿漉漉的路面映着淡色的天空，远处有一辆公交车正在驶来<span class="caret"></span></div>
  <div class="foot"><span class="help">改了中文还没有改写英文</span><span class="sp"></span><button class="btn quiet sm">取消</button><button class="btn ink sm">完成</button></div></div></div>`;
const wbSubject = (picked = []) => `<div class="blk"><div class="blk-h"><span class="label">TAG 块 · 主体 · 4 个</span>${blkActs()}</div><div class="tags">
  ${tag('1girl', '1 名女孩', 'subject')}${tag('solo', '单人', 'subject')}${tag('long copper hair', '铜色长发', 'body', '', picked.includes(2) ? 'sel' : '')}${tag('side braid', '侧辫', 'body', '', picked.includes(3) ? 'sel' : '')}${ghost()}</div></div>`;
const wbNegative = (open, picked = false) => open
  ? `<div class="sec-h"><i class="ri-arrow-down-s-line chev"></i>排除内容<span class="muted">3 个 Tag</span>${secActs()}</div>
     <div class="auto">${ic('information-line')}NovelAI 的排除预设 Heavy 另外加了 21 个 Tag，复制时默认不包含<button class="btn quiet sm">显示</button></div>
     <div class="blk"><div class="tags">${tag('lowres', '低分辨率', 'style', '', picked ? 'sel' : '')}${tag('artistic error', '绘画错误', 'style', '', picked ? 'sel' : '')}${tag('film grain', '胶片颗粒', 'style', '', picked ? 'sel' : '')}${ghost()}</div></div>`
  : `<div class="sec-h"><i class="ri-arrow-right-s-line chev"></i>排除内容<span class="muted">3 个 Tag · 预设 Heavy 另有 21 个</span>${secActs()}</div>`;

function wbDoc(st) {
  const base = `<div class="sec-h">基础 Prompt<span class="muted">3 块</span>${secActs()}</div>`;
  if (st === 'raw') return `<div class="doc">${base.replace('3 块', '编辑原始文本')}
    <div class="editor" style="padding:var(--sp-2) 0 var(--sp-3)"><div class="area raw is-focus">1.0::artist:konya_karasue::, 1.3::artist:yoneyama_mai::, 0.8::artist:deyui::, year 2026 ::, 2::cinematic composition::, soft studio lighting, -2::flat color::, detailed skin texture

A vertical full illustration of a girl waiting at a bus shelter just after the rain. She stands slightly right of centre, the transparent umbrella tilted toward the viewer, while the wet pavement mirrors the pale sky.

1girl, solo, long copper hair, side braid<span class="caret"></span></div>
      <div class="foot"><span class="help">空一行就是新的一块。保存后重新分块，译文和分类会保留。</span><span class="sp"></span><button class="btn quiet sm">取消</button><button class="btn ink sm">保存</button></div></div>
    <div class="sec-h">角色<span class="muted">暂无</span><span class="acts"><button class="btn quiet sm">${ic('add-line')}添加角色</button></span></div>${wbNegative(false)}</div>`;
  if (st === 'chars') return `<div class="doc selectable">
    <div class="sec-h"><i class="ri-arrow-right-s-line chev"></i>基础 Prompt<span class="muted">3 块 · 13 个 Tag</span>${secActs()}</div>
    <div class="sec-h">角色<span class="muted">2 个</span><span class="acts"><button class="btn quiet sm">${ic('add-line')}添加角色</button></span></div>
    <div class="sec-h" style="padding-top:var(--sp-2)"><i class="ri-arrow-down-s-line chev"></i><span class="field sm is-focus" style="width:var(--char-name-w)">Rossi</span><span class="muted">回车保存</span>${secActs(gen() ? '<button class="btn quiet sm">位置 C3</button>' : '')}</div>
    <div class="blk"><div class="blk-h"><span class="label">TAG 块 · 5 个</span>${blkActs()}</div><div class="tags">${tag('girl', '女孩', 'subject')}${tag('long copper hair', '铜色长发', 'body')}${tag('side braid', '侧辫', 'body')}${tag('teal eyes', '蓝绿色眼睛', 'body')}${tag('cardigan', '开衫', 'clothing')}${ghost()}</div></div>
    <div class="sec-h" style="padding-top:var(--sp-1)"><i class="ri-arrow-right-s-line chev"></i>Rossi 的排除内容<span class="muted">暂无</span></div>
    <div class="sec-h" style="padding-top:var(--sp-2)"><i class="ri-arrow-right-s-line chev"></i>角色 2<span class="muted">1 块 · 4 个 Tag</span>${secActs()}</div>
    ${wbNegative(false)}</div>`;
  if (st === 'negsel') return `<div class="doc selectable">
    <div class="sec-h"><i class="ri-arrow-right-s-line chev"></i>基础 Prompt<span class="muted">3 块 · 13 个 Tag</span>${secActs()}</div>
    <div class="sec-h">角色<span class="muted">暂无 · 添加后可以分别写每个角色</span><span class="acts"><button class="btn quiet sm">${ic('add-line')}添加角色</button></span></div>
    ${wbNegative(true, true)}</div>`;
  const style = wbStyleBlock(st);
  const prose = st === 'prose' ? wbProseEdit() : wbProse();
  const between = st === 'block' ? `<div class="blk-add">${ic('add-line')}在这里加一块</div>` : '';
  const subject = wbSubject(st === 'select' ? [2, 3] : []);
  return `<div class="doc selectable">${base}${style}${between}${prose}${subject}
    <div class="sec-h">角色<span class="muted">暂无 · 添加后可以分别写每个角色</span><span class="acts"><button class="btn quiet sm">${ic('add-line')}添加角色</button></span></div>
    ${wbNegative(false)}</div>`;
}

function wbFiltered() {
  return `<div class="chips">${chip('搜索', 'hair', true)}${chip('只看', '正向内容')}${chip('分类', '外貌身体')}<button class="btn quiet sm">清除</button><span class="sp"></span><span class="help">复制的内容跟着筛选变</span></div>
    <div class="scroll"><div class="doc selectable"><div class="sec-h">基础 Prompt<span class="muted">2 个符合，共 13 个</span>${secActs()}</div>
      <div class="blk"><div class="blk-h"><span class="label">TAG 块 · 主体 · 2 个符合</span></div><div class="tags">${tag('1girl', '1 名女孩', 'subject', '', 'dim')}${tag('solo', '单人', 'subject', '', 'dim')}${tag('long copper hair', '铜色长发', 'body')}${tag('side braid', '侧辫', 'body', '', 'dim')}${tag('hair ribbon', '发带', 'body')}</div></div>
      <div class="help" style="padding:var(--sp-3) 0">另外 2 块里没有符合的内容，已经收起。</div></div></div>`;
}

const wbEdit = () => `<div class="popover float" style="top:150px;left:60px">
  <div class="frow"><span class="label">Tag</span><span class="field sm mono is-focus">artist:yoneyama_mai</span></div>
  <div class="frow"><span class="label">译文</span><span class="field sm">米山舞（画师）</span></div>
  <div class="frow"><span class="label">分类</span><span class="field sm"><span class="cdot" style="background:var(--cat-artist-era)"></span>画师年代${ic('arrow-down-s-line')}</span></div>
  <div class="frow"><span class="label">权重</span><span class="row"><span class="stepper"><span>${ic('subtract-line')}</span><b>1.30</b><span>${ic('add-line')}</span></span><span class="help">1 是普通权重</span></span></div>
  <div class="row" style="justify-content:space-between;margin-top:2px"><span class="row"><button class="btn danger sm">删除</button><button class="btn quiet sm">翻译与分类</button></span><span class="row"><button class="btn quiet sm">取消</button><button class="btn ink sm">完成</button></span></div></div>`;
const wbComplete = () => `<div class="menu float" style="top:262px;left:150px;min-width:var(--complete-min-w)"><div class="mi on"><span class="en">copper hair</span><span class="zh">铜色头发</span><span class="k">3.2k</span></div><div class="mi"><span class="en">long copper hair</span><span class="zh">铜色长发</span><span class="k">410</span></div>
  <div class="mi"><span class="en">copper eyes</span><span class="zh">铜色眼睛</span><span class="k">96</span></div><hr><div class="mi"><span class="zh">直接添加"铜色"</span><span class="k">Enter</span></div></div>`;
const wbBlockMenu = () => `<div class="menu float" style="top:92px;right:16px"><div class="mi on">转为段落</div><div class="mi">翻译与分类这一块</div><div class="mi">复制这一块</div><hr>
  <div class="mi">上移<span class="k">Alt ↑</span></div><div class="mi">下移<span class="k">Alt ↓</span></div><div class="mi ${gen() ? '' : 'off'}">存为常用块</div><hr><div class="mi danger">删除这一块</div></div>`;
const wbViewPop = () => `<div class="popover wide float" style="top:43px;right:52px">
  <div class="frow"><span class="label">语言</span>${opts(['原文', '译文', '对照'], 2)}</div>
  <div class="frow"><span class="label">排列</span>${opts(['按块', '按分类'], 0)}</div>
  <div class="frow"><span class="label">只看</span>${opts(['全部', '正向内容', '排除内容'], 0)}</div>
  <div class="frow top"><span class="label">分类</span><div class="catrow">${[['画师年代', 'artist-era', 4], ['角色组成', 'subject', 2], ['外貌身体', 'body', 3], ['镜头光影', 'composition', 1], ['风格质量', 'style', 5], ['未分类', 'unsorted', 1]].map(([zh, c, n], i) => `<span class="opt ${i === 2 ? 'on' : ''}"><span class="cdot" style="background:var(--cat-${c})"></span>${zh}<span class="n">${n}</span></span>`).join('')}</div></div>
  <div class="foot"><button class="btn quiet sm">清除筛选</button><span class="sp"></span><span class="help">语言和排列会记住，筛选不会</span></div></div>`;
const wbCopyMenu = () => `<div class="menu float" style="bottom:calc(var(--bar-h) - var(--sp-2));right:${gen() ? 150 : 16}px;min-width:var(--menu-wide-min-w)">
  <div class="mi on">复制全部 Prompt<span class="k">52 个 Tag · 1 段</span></div><div class="mi">复制全部 Prompt，含 NovelAI 自动加的 5 个</div><div class="mi">复制全部排除内容<span class="k">3 个 Tag</span></div><hr>
  <div class="mi">只复制基础 Prompt</div><div class="mi off">有角色时，这里列出每个角色</div></div>`;
const wbSelbar = (neg) => `<div class="dock"><span class="selbar"><span class="n">已选 ${neg ? '3 个排除 Tag' : '2 个 Tag'}</span><button class="btn quiet sm">复制</button><button class="btn quiet sm">移动到${ic('arrow-down-s-line')}</button><button class="btn quiet sm">翻译与分类</button><button class="btn danger sm">删除</button><button class="btn quiet sm">取消</button></span></div>`;

function wbTitlebar(st) {
  if (st !== 'tabs') return titlebar('wb');
  const items = [['夜间书店-01', '', 'wide'], ['雨后候车亭-02', '雨后候车亭', ''], ['玻璃花房-02', '', ''], ['海边写生-01', '', 'wide'], ['夜间书店-03', '书店 · 夜', ''], ['玻璃花房-04', '', 'square'],
    ['海边写生-02', '', 'wide'], ['夜间书店-02', '', ''], ['玻璃花房-01', '', ''], ['海边写生-03', '海边', 'wide'], ['雨后候车亭-04', '', ''], ['玻璃花房-03', '', '']];
  const tabs = `<span class="tb-sep"></span>${ib('arrow-left-s-line', '向前')}<div class="tabs clip">${items.map(([p, name, shape], i) => `<button class="tab ${name ? '' : 'bare'} ${i === 1 ? 'on' : ''} ${i === 4 ? 'lift' : ''}">${i === 1 ? '<span class="cur"></span>' : ''}<img class="${shape}" src="${IMG(p)}" alt="">${name}${i === 1 ? '<span class="dirty" title="Prompt 已修改"></span>' : ''}</button>`).join('')}</div>${ib('arrow-right-s-line', '向后')}<button class="tab add" aria-label="打开图片">${ic('add-line')}</button>`;
  return titlebar('wb').replace(/<span class="tb-sep"><\/span><div class="tabs">[\s\S]*?<\/div><span class="sp">/, `${tabs}<span class="sp">`);
}

VIEWS.wb = () => {
  const st = wbState();
  const stage = wbStage({ save: st === 'unsaved' ? 'unsaved' : 'saved', dirty: ['prose', 'raw', 'unsaved', 'add'].includes(st), missing: st === 'missing' });
  let head = wbHead(), mid = `<div class="scroll">${wbDoc(st)}</div>`, bar = wbBar(), float = '', over = '';
  if (st === 'edit') float = wbEdit();
  if (st === 'add') float = wbComplete();
  if (st === 'select') { bar = wbBar('复制选中的 · 2'); float = wbSelbar(false); }
  if (st === 'negsel') { bar = wbBar('复制排除内容 · 3'); float = wbSelbar(true); }
  if (st === 'block') float = wbBlockMenu();
  if (st === 'filter') { head = wbHead({ filters: 2, query: 'hair' }); mid = wbFiltered(); bar = wbBar('复制可见的 · 2'); }
  if (st === 'view') { head = wbHead({ open: 'view' }); float = wbViewPop(); }
  if (st === 'copy') { bar = wbBar('复制 Prompt', true); float = wbCopyMenu(); }
  if (st === 'tabs') over = `<div class="menu float" style="top:calc(var(--titlebar-h) - var(--sp-1));left:${gen() ? 560 : 500}px"><div class="mi on">关闭<span class="k">Ctrl W</span></div><div class="mi">关闭其他标签</div><div class="mi">关闭右边的标签</div><hr><div class="mi">在图片库里显示</div></div>`;
  return `${wbTitlebar(st)}<div class="body wb-body">${versions()}${stage}
    <div class="col prompt">${head}${mid}${float}${bar}</div>${over}</div>`;
};

Object.assign(NOTES, {
  wb: ['上面"工作台的状态"可以切换这一页的各个状态。把"看到哪一期"切到 1.0，版本栏、参数页签、Seed 和生成都会消失。',
       '每一节（基础 Prompt、每个角色、排除内容）的标题右边都有"复制这一节"和"更多"。"更多"里有编辑原始文本、全部翻译与分类。',
       '每一块的标题右边是这一块的操作：Tag 块和段落互相转换、上移下移、复制、删除。转换只是换一种看法，文字本身不变，改过的类型会记住。',
       '点一个 Tag 就是编辑它；点虚线框输入新的 Tag，输入中文会找对应的英文 Tag。拖动 Tag 可以换位置，也可以拖到别的块或别的节。',
       '段落是上下两栏：上面英文，下面中文，哪边都可以改，用中间的按钮让 AI 把另一边跟上。发给 NovelAI 的永远是英文那一栏。',
       '复制按钮上的字跟着当前的情况变：平时是"复制 Prompt"，选了 Tag 是"复制选中的"，筛选后是"复制可见的"，只选了排除内容就是"复制排除内容"。',
       'NovelAI 自动加的质量 Tag 和排除预设收成一行说明，默认不显示、复制时也不包含。',
       '图片下面：还没存进图片库的图有一个"存入图片库"按钮；Prompt 改过之后多出一行"还原成原图的 Prompt"。'],
});

const wbGroup = document.createElement('div');
wbGroup.className = 'pv-group';
wbGroup.innerHTML = '<span>工作台的状态</span><div class="seg" id="pv-wb" style="flex-wrap:wrap;gap:4px 14px"></div>';
document.querySelector('.pv-bar').appendChild(wbGroup);
const renderLib = render;
render = function () {
  renderLib();
  wbGroup.hidden = S.page !== 'wb';
  if (S.page === 'wb') seg('pv-wb', WB_STATES, wbState(), 'sub');
};
for (const [k, v] of new URLSearchParams(location.search)) if (k in S) S[k] = v;
render();
