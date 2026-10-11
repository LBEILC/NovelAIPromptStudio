// 界面稿（第四部分）：图片库的各个状态。依赖 preview.js 和 preview-pages.js。
// 地址参数：preview.html?page=lib&sub=filter
const LIB_STATES = [['home', '默认'], ['group', '一组图片'], ['filter', '筛选'], ['view', '视图'], ['select', '多选'], ['collect', '加入收藏集'], ['smart', '智能收藏集'],
  ['import', '导入'], ['zip', '导入 ZIP'], ['drop', '拖入'], ['viewer', '大图'], ['trash', '回收站'], ['purge', '永久删除'], ['empty', '空图片库'], ['nomatch', '没有结果']];
const LIB_PICS = ['雨后候车亭-02', '夜间书店-01', '夜间书店-02', '玻璃花房-01', '海边写生-01', '玻璃花房-02', '玻璃花房-03', '夜间书店-03', '玻璃花房-04', '海边写生-02'];
const libState = () => (LIB_STATES.some(([k]) => k === S.sub) ? S.sub : 'home');
const chk = (on) => `<span class="check ${on ? 'on' : ''}">${on ? ic('check-line') : ''}</span>`;
const miniTag = (t) => `<span class="mini-tag">${t}${ic('close-line')}</span>`;
const chip = (k, v, mono) => `<span class="chip">${k}<b class="${mono ? 'mono' : ''}">${v}</b>${ic('close-line')}</span>`;
const fsel = (text) => `<span class="field sm" style="width:100%">${text}<span class="sp"></span>${ic('arrow-down-s-line')}</span>`;

// 侧栏。cur：当前选中的一项；edit：正在新建收藏集
function libSide(cur = 'all', edit = false) {
  const it = (k, icon, name, n) => `<div class="it ${k === cur ? 'on' : ''}">${ic(icon)}${name}<span class="n">${n}</span></div>`;
  return `<div class="side">
    ${it('all', 'image-2-line', '全部图片', 159)}${gen() ? it('gen', 'history-line', '生成记录', 24) : ''}
    <div class="lb label">收藏集<button class="btn quiet sm icon" aria-label="新建收藏集">${ic('add-line')}</button></div>
    ${it('c1', 'folder-line', '本周精选', 4)}${it('c2', 'folder-line', '构图研究', 5)}
    ${edit ? `<div class="it edit">${ic('folder-line')}<span>雨天</span></div>` : ''}
    <div class="lb label">智能收藏集</div>
    ${it('s1', 'folder-settings-line', '最近 7 天', 31)}${it('s2', 'folder-settings-line', 'V5', 34)}
    <span class="sp"></span>${it('trash', 'delete-bin-line', '回收站', 2)}</div>`;
}

// 工具栏。filters：生效的筛选条件数
function libTools(filters = 0, open = '') {
  return `<div class="col-h tools"><span class="field grow">${ic('search-line')}<span class="ph">搜索文件名、Tag、译名或段落里的词</span><span class="sp"></span><span class="kbd">Ctrl K</span></span>
    <button class="btn quiet ${filters || open === 'filter' ? 'on' : ''}">${ic('filter-3-line')}筛选${filters ? `<span class="cnt">${filters}</span>` : ''}</button>
    <button class="btn quiet ${open === 'view' ? 'on' : ''}">${ic('layout-grid-line')}视图</button>
    <span class="row" style="gap:var(--bw)"><button class="btn ink" style="border-radius:var(--r-ctl) 0 0 var(--r-ctl)">${ic('add-line')}导入</button><button class="btn ink" style="border-radius:0 var(--r-ctl) var(--r-ctl) 0;padding:0 var(--sp-1)" aria-label="其他导入方式">${ic('arrow-down-s-line')}</button></span></div>`;
}

// 网格。picked：多选选中的序号；names：显示文件名；stacks：哪几张是一摞
function libGrid({ pics = LIB_PICS, on = 0, picked = null, dim = [], count = '142 组 · 159 张', flat = false } = {}) {
  const stacks = flat ? {} : { 0: gen() ? '3 版 · 6 张' : '4 张', 3: '4 张' };
  return `<div class="scroll"><div class="grid">${pics.map((p, i) => `<div class="card ${i === on ? 'on' : ''} ${picked && picked.includes(i) ? 'picked' : ''} ${dim.includes(i) ? 'dim' : ''}">
      <img src="${IMG(p)}" alt="">${picked ? `<span class="check pick">${picked.includes(i) ? ic('check-line') : ''}</span>` : ''}${stacks[LIB_PICS.indexOf(p)] ? `<span class="stack">${stacks[LIB_PICS.indexOf(p)]}</span>` : ''}</div>`).join('')}</div>
    <div class="label count">${count}</div></div>`;
}

// 详情栏里的只读 Prompt，显示方式和工作台相同
function libDoc() {
  return `<div class="doc selectable" style="padding-top:0">
    <div class="sec-h">基础 Prompt<span class="muted">4 块</span></div>
    <div class="blk"><div class="blk-h"><span class="label">TAG 块 · 风格与画师 · 16 个</span></div><div class="tags">${tag('artist:konya_karasue', '画师', 'artist-era', '1.0')}${tag('artist:yoneyama_mai', '画师', 'artist-era', '1.3')}<span class="tag ghost">还有 14 个</span></div></div>
    <div class="blk"><div class="blk-h"><span class="label">段落 · 构图</span></div>
      <p class="prose">A vertical full illustration of a girl waiting at a bus shelter just after the rain…</p>
      <p class="trans">竖幅全身插画：雨刚停，女孩在候车亭下等车…</p></div>
    <div class="blk"><div class="blk-h"><span class="label">TAG 块 · 3 个</span></div><div class="tags">${tag('1girl', '一个女孩', 'subject')}${tag('solo', '单人', 'subject')}${tag('rain', '雨', 'environment')}</div></div>
    <div class="sec-h">${ic('arrow-right-s-line')}排除内容<span class="muted">24 个 Tag</span></div>
  </div>`;
}

// 详情栏。mode：one 单张，group 一组，multi 多选，trash 回收站
function libDetail(mode = 'one', open = '') {
  if (mode === 'multi') return `<div class="col detail"><div class="sum">
      <div class="fan"><img src="${IMG('雨后候车亭-02')}" alt=""><img src="${IMG('夜间书店-02')}" alt=""><img src="${IMG('玻璃花房-02')}" alt=""></div>
      <b>已选 3 组 · 6 张</b><span class="help">选中一张时，这里显示它的 Prompt。</span></div></div>`;
  const strip = mode === 'group' ? `<div class="strip"><span class="cover"><img src="${IMG('雨后候车亭-01')}" alt=""></span><img class="is-cur" src="${IMG('雨后候车亭-02')}" alt=""><img src="${IMG('雨后候车亭-03')}" alt=""><img src="${IMG('雨后候车亭-04')}" alt=""><span class="label mono">2 / 4</span></div>` : '';
  const acts = mode === 'trash'
    ? `<button class="btn quiet sm">${ic('arrow-go-back-line')}恢复</button><span class="sp"></span><button class="btn danger sm">永久删除</button>`
    : `<button class="btn quiet sm ${open === 'collect' ? 'is-hover' : ''}">${ic('folder-add-line')}加入收藏集</button><button class="btn quiet sm">${ic('edit-line')}重命名</button>${mode === 'group' ? `<button class="btn quiet sm">${ic('image-line')}设为封面</button>` : ''}<button class="btn quiet sm icon" aria-label="在文件夹中显示">${ic('folder-open-line')}</button><span class="sp"></span><button class="btn danger sm icon" aria-label="移入回收站">${ic('delete-bin-line')}</button>`;
  return `<div class="col detail"><div class="scroll">
      <div class="pic"><img src="${IMG('雨后候车亭-02')}" alt=""></div>${strip}
      <div class="caption" style="padding:10px 16px 0"><b>雨后候车亭-02</b><span class="meta mono">832 × 1216 · V5</span><span class="meta mono">28 步 · 引导 5 · Seed 2890417553</span><span class="meta">${mode === 'trash' ? '2026-10-09 移入回收站' : '2026-10-11 导入'}</span></div>
      <div class="stage-acts" style="padding:4px 8px 0">${acts}</div>
      ${libDoc()}</div>
      <div class="bar"><span class="sp"></span><button class="btn">${ic('file-copy-line')}复制 Prompt</button>${mode === 'trash' ? '' : '<button class="btn ink">在工作台打开</button>'}</div>
    </div>`;
}

const libFilter = (foot) => `<div class="popover wide float" style="top:43px;right:211px">
  <div class="frow top"><span class="label">包含</span><div class="col" style="gap:var(--sp-2)"><span class="row">${miniTag('rain')}${miniTag('umbrella')}<span class="field sm grow"><span class="ph">输入 Tag 或译名</span></span></span>${opts(['全部都有', '有任意一个'], 0)}</div></div>
  <div class="frow top"><span class="label">排除</span><span class="row">${miniTag('1boy')}<span class="field sm grow"><span class="ph">输入 Tag 或译名</span></span></span></div>
  <div class="frow"><span class="label">模型</span>${fsel('V5')}</div>
  <div class="frow"><span class="label">Vibe</span>${fsel('不限')}</div>
  <div class="frow top"><span class="label">时间</span><div class="col" style="gap:var(--sp-2)">${fsel('自定义范围')}<span class="row"><span class="field sm mono">2026-09-01</span><span class="muted">至</span><span class="field sm mono">2026-10-11</span></span></div></div>
  <div class="foot">${foot}</div></div>`;

const libView = () => `<div class="popover wide float" style="top:43px;right:129px">
  <div class="frow"><span class="label">大小</span><span class="row"><span class="slider"><i style="width:22%"></i><b style="left:22%"></b></span><span class="mono muted">128</span></span></div>
  <div class="frow"><span class="label">排序</span>${fsel('最近导入的在前')}</div>
  <div class="frow top"><span class="label">合并</span><div class="col" style="gap:var(--sp-2)">${opts(['不合并', 'Prompt 完全相同', '基础 Prompt 相同', 'Prompt 相似'], 3)}
    <span class="help">基础 Prompt 的 Tag 足够接近的图片叠成一摞，不看角色 Prompt 和位置。</span></div></div>
  <div class="frow"><span class="label">相似度</span><span class="row"><span class="slider"><i style="width:60%"></i><b style="left:60%"></b></span><span class="mono muted">85%</span></span></div>
  <div class="row" style="justify-content:space-between"><span>Vibe 不同的也合并</span><span class="switch"></span></div></div>`;

const libCollect = () => `<div class="popover float" style="top:372px;right:28px;gap:var(--sp-2)">
  <h6>加入收藏集</h6>
  <div><div class="pickrow on">${chk(true)}本周精选<span class="n">4</span></div><div class="pickrow">${chk(false)}构图研究<span class="n">5</span></div></div>
  <span class="row" style="flex-wrap:nowrap"><span class="field sm grow is-focus">雨天</span><button class="btn sm">新建并加入</button></span>
  <span class="help">一张图片可以放进多个收藏集。智能收藏集按规则自动收图，不能手动加入。</span></div>`;

const libViewer = () => `<div class="viewer">
  <div class="top"><b>雨后候车亭-02</b><span class="label mono">832 × 1216 · 2 / 4</span><span class="sp"></span><button class="btn quiet sm">${ic('close-line')}关闭<span class="kbd">Esc</span></button></div>
  <div class="canvas"><span class="nav prev" aria-label="上一张">${ic('arrow-left-s-line')}</span><img src="${IMG('雨后候车亭-02')}" alt=""><span class="nav next" aria-label="下一张">${ic('arrow-right-s-line')}</span></div>
  <div class="foot">
    <div class="strip"><img src="${IMG('雨后候车亭-01')}" alt=""><img class="is-cur" src="${IMG('雨后候车亭-02')}" alt=""><img src="${IMG('雨后候车亭-03')}" alt=""><img src="${IMG('雨后候车亭-04')}" alt=""></div>
    <span class="selbar tools-bar"><button class="btn quiet sm icon" aria-label="缩小">${ic('zoom-out-line')}</button><button class="btn quiet sm mono">100%</button><button class="btn quiet sm icon" aria-label="放大">${ic('zoom-in-line')}</button><span class="sep"></span>
      <button class="btn quiet sm icon" aria-label="向左旋转">${ic('anticlockwise-line')}</button><button class="btn quiet sm icon" aria-label="向右旋转">${ic('clockwise-line')}</button><button class="btn quiet sm icon" aria-label="左右翻转">${ic('flip-horizontal-line')}</button><span class="sep"></span>
      <button class="btn quiet sm">${ic('file-copy-line')}复制图片</button><button class="btn quiet sm">${ic('download-line')}另存为</button><span class="sep"></span><button class="btn quiet sm">在工作台打开</button></span>
  </div></div>`;

const libZip = () => `<div class="scrim"><div class="dialog" style="width:calc(var(--dialog-w) + var(--popover-w))">
  <h3>选择要导入的图片</h3><p>NovelAI-2026-10-11.zip 里有 12 张图片，其中 2 张已经在图片库里。</p>
  <div class="row" style="justify-content:space-between;margin:var(--sp-4) 0 var(--sp-2)"><span class="label">已选 8 / 10 张</span><span class="row"><button class="btn quiet sm">全选</button><button class="btn quiet sm">全不选</button></span></div>
  <div class="grid lib" style="padding:0;grid-template-columns:repeat(6,1fr);gap:var(--sp-2)">${LIB_PICS.concat(['海边写生-03', '雨后候车亭-03']).map((p, i) => `<div class="card ${i > 9 ? 'dim' : i === 3 || i === 7 ? '' : 'picked'}"><img src="${IMG(p)}" alt="">${i > 9 ? '<span class="stack">已有</span>' : `<span class="check pick">${i === 3 || i === 7 ? '' : ic('check-line')}</span>`}</div>`).join('')}</div>
  <div class="acts"><button class="btn">取消</button><button class="btn ink">导入 8 张</button></div></div></div>`;

const libPurge = () => `<div class="scrim"><div class="dialog"><h3>永久删除这 2 张图片？</h3>
  <p>会删除图片库里保存的这 2 份副本和它们的记录，删除后无法恢复。你导入时用的原文件不受影响。</p>
  <div class="acts"><button class="btn is-focus">取消</button><button class="btn line-danger">永久删除</button></div></div></div>`;

const libEmpty = (kind) => kind === 'empty'
  ? `<div class="empty"><span class="mark">{<i></i>}</span><h3>图片库里还没有图片</h3>
      <p>把图片或 NovelAI 导出的 ZIP 拖到这里。软件会复制一份保存，并读出每张图的 Prompt 和参数。</p>
      <div class="acts"><button class="btn ink">导入图片</button><button class="btn">从剪贴板导入</button><span class="kbd" style="align-self:center">Ctrl V</span></div>
      <p class="fine">导入不会修改或移动你原来的文件。</p></div>`
  : `<div class="empty"><h3>没有符合条件的图片</h3><p>图片库里有 159 张图片，但没有一张同时满足现在的搜索和筛选。</p>
      <div class="acts"><button class="btn">清除搜索和筛选</button></div></div>`;

VIEWS.lib = () => {
  const st = libState();
  const filterChips = `<div class="chips">${chip('包含', 'rain', true)}${chip('包含', 'umbrella', true)}${chip('排除', '1boy', true)}${chip('模型', 'V5')}${chip('时间', '2026-09-01 至 2026-10-11')}<button class="btn quiet sm">清除</button></div>`;
  const few = LIB_PICS.slice(0, 4);
  let side = libSide('all'), tools = libTools(), mid = libGrid(), detail = libDetail('one'), over = '', inGrid = '';
  if (st === 'group') detail = libDetail('group');
  if (st === 'filter') { tools = libTools(5, 'filter'); mid = filterChips + libGrid({ pics: few, count: '4 组 · 7 张，共 159 张' }); inGrid = libFilter('<button class="btn quiet sm">清除</button><span class="sp"></span><button class="btn sm">存为智能收藏集</button>'); }
  if (st === 'view') { tools = libTools(0, 'view'); inGrid = libView(); }
  if (st === 'select') { mid = libGrid({ on: -1, picked: [0, 2, 5] }); detail = libDetail('multi');
    inGrid = `<div class="dock"><span class="selbar"><span class="n">已选 3 组 · 6 张</span><button class="btn quiet sm">加入收藏集</button><button class="btn danger sm">移入回收站</button><button class="btn quiet sm">取消</button></span></div>`; }
  if (st === 'collect') { side = libSide('all'); detail = libDetail('one', 'collect'); over = libCollect(); }
  if (st === 'smart') { side = libSide('s2');
    mid = `<div class="chips"><span class="label">规则</span>${chip('模型', 'V5')}<span class="sp"></span><button class="btn quiet sm">编辑规则</button><button class="btn quiet sm">重命名</button><button class="btn danger sm">删除收藏集</button></div>` + libGrid({ count: '29 组 · 34 张' }); }
  if (st === 'import') { mid = libGrid({ dim: [0, 1] });
    inGrid = `<div class="menu float" style="top:43px;right:20px"><div class="mi on">选择图片或 ZIP…</div><div class="mi">从剪贴板导入<span class="k">Ctrl V</span></div></div>
      <div class="dock"><div class="job"><div class="top"><span class="spin"></span><b>正在导入 37 / 120</b><span class="sp"></span><button class="btn quiet sm">取消剩下的</button></div><div class="progress"><i style="width:31%;background:var(--text)"></i></div><small>已跳过 4 张图片库里已经有的图片</small></div></div>`; }
  if (st === 'zip') over = libZip();
  if (st === 'drop') inGrid = `<div class="dropzone">松开后导入图片库 · 12 个文件</div>`;
  if (st === 'viewer') over = libViewer();
  if (st === 'trash' || st === 'purge') { side = libSide('trash'); tools = libTools().replace(/<span class="row" style="gap:var\(--bw\)">[\s\S]*<\/span><\/div>$/, '</div>');
    mid = `<div class="chips"><span class="help">回收站里的图片不会自动清理。永久删除只删除图片库里保存的副本。</span></div>` + libGrid({ pics: ['雨后候车亭-02', '海边写生-03'], count: '2 张', flat: true }); detail = libDetail('trash'); }
  if (st === 'purge') over = libPurge();
  if (st === 'empty') { side = libSide('all').replace(/<span class="n">\d+<\/span>/g, '<span class="n">0</span>'); mid = libEmpty('empty'); detail = ''; tools = ''; }
  if (st === 'nomatch') { tools = libTools(2); mid = `<div class="chips">${chip('包含', 'snow', true)}${chip('模型', 'V4.5')}<button class="btn quiet sm">清除</button></div>` + libEmpty('nomatch'); detail = ''; }
  return `${titlebar('lib')}<div class="body lib">${side}<div class="col grid-col">${tools}${mid}${inGrid}</div>${detail}${over}</div>`;
};

Object.assign(NOTES, {
  lib: ['上面"图片库的状态"可以切换这一页的各个状态。',
        '单击选中，详情栏显示它；双击或按 Enter 在工作台打开；按空格看大图。原来的"鼠标悬停弹出大图"去掉了，因为详情栏一直在。',
        '两种外框：朱砂是"当前这一张"，墨色加勾是"多选选中的"。Ctrl 或 Shift 加单击、拖动框选、Ctrl A 进入多选，Esc 退出。',
        '一摞图片选中后，详情栏的图片下面出现一排小图，可以逐张看、换封面；下面带一条线的是封面。',
        '筛选生效后，按钮变成墨色描边并带数字，条件一条一条列在工具栏下面，可以单独去掉。智能收藏集就是存下来的一组筛选条件。',
        '"视图"里的"合并"就是原来的"自动分组方式"，四个选项的含义不变。',
        '大图盖住标题栏以下的整个窗口，底色和页面一样，不用黑色遮罩。',
        '"删除"分两步：详情栏和多选条里的是"移入回收站"，可以撤销；"永久删除"只在回收站里，并且要确认。'],
});

// 在预览外框里加一组"图片库的状态"切换，只在图片库这一页出现
const libGroup = document.createElement('div');
libGroup.className = 'pv-group';
libGroup.innerHTML = '<span>图片库的状态</span><div class="seg" id="pv-lib" style="flex-wrap:wrap;gap:4px 14px"></div>';
document.querySelector('.pv-bar').appendChild(libGroup);
const renderBase = render;
render = function () {
  renderBase();
  libGroup.hidden = S.page !== 'lib';
  if (S.page === 'lib') seg('pv-lib', LIB_STATES, libState(), 'sub');
};
for (const [k, v] of new URLSearchParams(location.search)) if (k in S) S[k] = v;
render();
