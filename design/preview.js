// 界面稿。页面内容是示意数据；图片取自仓库里的演示图。
const IMG = (name) => `../demo/promo-v090/final/${name}.png`;
const PAGES = [['wb', '工作台'], ['params', '更多参数'], ['ai', 'AI 提案'], ['lib', '图片库']];
// 只在含生成的期数里才有的页面
const GEN_ONLY = new Set(['params', 'ai']);
// 需要不限高度的页面（组件表）
const TALL = new Set();
const STAGES = [['1.0', '1.0'], ['1.2', '1.1 之后（含生成）']];
const THEMES = [['light', '浅色'], ['dark', '深色']];
const S = { page: 'wb', stage: '1.2', theme: 'light' };
// 可以用地址参数直接打开某个状态，例如 preview.html?page=lib&theme=dark&stage=1.0
for (const [k, v] of new URLSearchParams(location.search)) if (k in S) S[k] = v;
const gen = () => S.stage !== '1.0';
const ic = (name) => `<i class="ri-${name}" aria-hidden="true"></i>`;

const LOGO = `<span class="logo" aria-label="NovelAI Prompt Studio">${LOGO_SVG}</span>`;

function titlebar(cur) {
  const nav = [['wb', '工作台'], ['lib', '图片库'], ['assets', '素材']].filter(([k]) => k !== 'assets' || gen());
  const tabs = cur === 'wb' ? `<span class="tb-sep"></span><div class="tabs">
      <button class="tab bare" title="没有起名 · 10-11 14:02 导入"><img class="wide" src="${IMG('夜间书店-01')}" alt=""></button>
      <button class="tab on"><span class="cur"></span><img src="${IMG('雨后候车亭-02')}" alt="">雨后候车亭${gen() ? '<span class="n mono">3 版</span>' : ''}<span class="dirty" title="有未生成的改动"></span></button>
      <button class="tab bare" title="没有起名 · 10-10 21:40 导入"><img src="${IMG('玻璃花房-02')}" alt=""></button>
      <button class="tab add" aria-label="打开图片">${ic('add-line')}</button></div>` : '';
  return `<div class="tb">${LOGO}
    <div class="nav">${nav.map(([k, t]) => `<button ${k === cur ? 'aria-current="page"' : ''}>${t}</button>`).join('')}</div>
    ${tabs}<span class="sp"></span>
    <div class="tb-end">${gen() ? '<span class="field sm mono" title="Anlas 余额与用量">8,240 Anlas · 用量 12%</span>' : ''}<button class="btn quiet sm icon" aria-label="设置">${ic('settings-3-line')}</button></div>
    <div class="wc"><span>—</span><span>☐</span><span>✕</span></div></div>`;
}

function versions() {
  if (!gen()) return '';
  return `<div class="col versions"><div class="col-h"><span class="label">版本</span></div><div class="scroll">
    <div class="ver"><span class="what">原图</span><div class="ths"><span><img src="${IMG('雨后候车亭-01')}" alt=""></span></div></div>
    <div class="ver" data-d="1"><span class="what"><span class="mono"><span class="plus">+ rain</span> <span class="minus">− umbrella</span></span></span>
      <div class="ths"><span><img src="${IMG('雨后候车亭-03')}" alt=""></span><span><img src="${IMG('雨后候车亭-04')}" alt=""></span></div></div>
    <div class="ver on" data-d="2"><span class="what">改写了"构图"段落</span>
      <div class="ths"><span><img src="${IMG('雨后候车亭-01')}" alt=""></span><span class="is-cur"><img src="${IMG('雨后候车亭-02')}" alt=""></span></div></div>
    <div class="ver" data-d="1"><span class="what"><span class="mono"><span class="plus">+ night, neon lights</span></span></span>
      <div class="ths"><span><img src="${IMG('夜间书店-02')}" alt=""></span></div></div>
  </div></div>`;
}

function stage() {
  return `<div class="col stage">
    <div class="canvas"><img src="${IMG('雨后候车亭-02')}" alt="当前图片"></div>
    <div class="caption"><b>雨后候车亭-02</b>
      <span class="meta mono">832 × 1216 · V5 · High · 28 步 · 引导 5 · Seed 1506844432</span></div>
    <div class="stage-acts"><span class="saved">${ic('check-line')}已存入图片库</span>
      <button class="btn quiet sm">${ic('folder-open-line')}在文件夹中显示</button><button class="btn quiet sm">${ic('file-copy-line')}复制图片</button><button class="btn quiet sm">${ic('download-2-line')}下载</button></div>
  </div>`;
}

const tag = (en, zh, cat, w, cls = '') => `<span class="tag ${cls}"><span class="dot" style="background:var(--cat-${cat})"></span><span class="t"><span class="en">${en}</span>${zh ? `<span class="zh">${zh}</span>` : ''}</span>${w ? `<span class="w">${w}</span>` : ''}</span>`;

function promptHead(cur) {
  const tabs = gen() ? [['p', 'Prompt'], ['a', '参数'], ['r', '参考']] : [['p', 'Prompt']];
  return `<div class="col-h"><div class="seg">${tabs.map(([k, t]) => `<button class="${k === cur ? 'on' : ''}">${t}</button>`).join('')}</div>
    ${cur === 'p' ? `<span class="field sm grow" title="搜索 Tag 或译名">${ic('search-line')}<span class="ph">搜索 Tag</span><span class="sp"></span><span class="kbd">Ctrl K</span></span><button class="btn quiet sm">对照 · 按分类${ic('arrow-down-s-line')}</button><button class="btn quiet sm">AI</button>` : '<span class="sp"></span>'}</div>`;
}

function bar() {
  return `<div class="bar">${gen() ? `<span class="label">Seed</span><span class="field sm mono">${ic('shuffle-line')}随机</span><span class="label">张数</span><span class="field sm mono">1</span>` : ''}
    <span class="sp"></span><button class="btn">${ic('file-copy-line')}复制 Prompt</button>
    ${gen() ? '<span class="cost"><b>0 Anlas</b><span>用量 +1%</span></span><button class="btn seal">生成</button>' : ''}</div>`;
}

const styleBlock = `<div class="blk"><div class="blk-h"><span class="label">TAG 块 · 风格与画师 · 16 个</span>${gen() ? '<span class="act">存为常用</span>' : ''}</div><div class="tags">
  ${tag('artist:konya_karasue', '画师', 'artist-era', '1.0')}${tag('artist:yoneyama_mai', '画师', 'artist-era', '1.3')}${tag('artist:deyui', '画师', 'artist-era', '0.8')}
  ${tag('year 2026', '2026 年', 'artist-era', '2')}${tag('cinematic composition', '电影感构图', 'composition', '2')}${tag('soft studio lighting', '柔和的棚拍光', 'style')}
  ${tag('flat color', '平涂', 'style', '−2')}${tag('detailed skin texture', '细腻的皮肤质感', 'body')}<span class="tag ghost">${ic('add-line')}输入中文或英文</span></div></div>`;

function promptDoc() {
  return `<div class="doc selectable">
    <div class="sec-h">基础 Prompt<span class="muted">3 块</span></div>
    ${styleBlock}
    <div class="blk"><div class="blk-h"><span class="label">段落 · 构图</span>${gen() ? '<span class="act">转为 Tag</span>' : ''}</div>
      <p class="prose">A vertical full illustration of a girl waiting at a bus shelter just after the rain. She stands slightly right of centre, the transparent umbrella tilted toward the viewer, while the wet pavement mirrors the pale sky.</p>
      <p class="trans">竖幅全身插画：雨刚停，女孩在候车亭下等车。她站在画面中间偏右，透明的伞朝观看者倾斜，湿漉漉的路面映着淡色的天空。</p></div>
    <div class="blk"><div class="blk-h"><span class="label">TAG 块 · 主体 · 4 个</span></div><div class="tags">
      ${tag('1girl', '1 名女孩', 'subject')}${tag('solo', '单人', 'subject')}${tag('long copper hair', '铜色长发', 'body', '', 'sel')}${tag('side braid', '侧辫', 'body', '', 'sel')}</div></div>
    <div class="sec-h">角色<span class="muted">暂无 · 添加后可以分别写每个角色</span></div>
    <div class="sec-h">排除内容<span class="muted">预设 Heavy · 另有 12 个 Tag</span></div>
  </div>`;
}

const VIEWS = {
  wb: () => `${titlebar('wb')}<div class="body">${versions()}${stage()}
    <div class="col prompt">${promptHead('p')}<div class="scroll">${promptDoc()}</div>${bar()}</div></div>`,

  params: () => `${titlebar('wb')}<div class="body">${versions()}${stage()}
    <div class="col prompt">${promptHead('a')}<div class="scroll"><div class="doc">
      <div class="note">参数取自原图，改过的会标出来。没有列出的 38 项原样保留，可以在最下面查看。</div>
      <div class="sec-h">画面</div><div class="kv"><span>尺寸</span><span class="row"><span class="opt on mono">竖 832×1216</span><span class="opt mono">横 1216×832</span><span class="opt mono">方 1024×1024</span><span class="opt">自定义</span></span></div>
      <div class="sec-h">采样</div><div class="kv">
        <span>Effort</span><span class="row"><span class="opt on">High</span><span class="opt">Medium</span></span>
        <span>步数</span><span class="row"><span class="field sm mono">28</span></span>
        <span>引导强度</span><span class="row"><span class="field sm mono">5</span></span>
        <span>采样器</span><span class="row"><span class="field sm">Euler Ancestral</span></span></div>
      <div class="sec-h">提示词处理</div><div class="kv">
        <span>质量 Tag</span><span class="row"><span class="opt">Standard</span><span class="opt">Light</span><span class="opt on">None</span></span>
        <span>排除预设</span><span class="row"><span class="opt on">Heavy</span><span class="opt">Light</span><span class="opt">Human Focus</span><span class="opt">None</span></span></div>
      <div class="sec-h">角色位置<span class="muted">暂无角色</span></div><div class="posgrid">${Array.from({ length: 25 }, (_, i) => `<i class="${i === 12 ? 'on' : ''}"></i>`).join('')}</div>
      <div class="sec-h">原样保留的参数<span class="muted">38 项 · 点击查看</span></div>
    </div></div>${bar()}</div></div>`,

  ai: () => `${titlebar('wb')}<div class="body">${versions()}${stage()}
    <div class="col prompt">${promptHead('p')}<div class="scroll"><div class="doc">
      <div class="proposal"><b>AI 提案</b><span class="muted">拆分角色 · 3 处改动</span><span class="sp"></span><button class="btn quiet sm">逐项查看</button><button class="btn sm">放弃</button><button class="btn ink sm">接受</button></div>
      <div class="sec-h">基础 Prompt</div>
      ${styleBlock}
      <div class="blk gone"><div class="blk-h"><span class="label">TAG 块 · 主体 · 移到"角色 1"</span></div><div class="tags">
        ${tag('long copper hair', '铜色长发', 'body', '', 'gone')}${tag('side braid', '侧辫', 'body', '', 'gone')}${tag('teal eyes', '蓝绿色眼睛', 'body', '', 'gone')}</div></div>
      <div class="sec-h">角色 1<span class="muted">新建 · 位置由 AI 选择</span></div>
      <div class="blk new"><div class="blk-h"><span class="label">TAG 块 · 外貌 · 新建</span></div><div class="tags">
        ${tag('girl', '女孩', 'subject', '', 'new')}${tag('long copper hair', '铜色长发', 'body', '', 'new')}${tag('side braid', '侧辫', 'body', '', 'new')}${tag('teal eyes', '蓝绿色眼睛', 'body', '', 'new')}</div></div>
    </div></div>${bar()}</div></div>`,

  lib: () => {
    const pics = ['雨后候车亭-02', '夜间书店-01', '夜间书店-02', '玻璃花房-01', '海边写生-01', '玻璃花房-02', '玻璃花房-03', '夜间书店-03', '玻璃花房-04', '海边写生-02'];
    return `${titlebar('lib')}<div class="body">
    <div class="side">
      <div class="it on">${ic('image-2-line')}全部图片<span class="n">159</span></div>${gen() ? `<div class="it">${ic('history-line')}生成记录<span class="n">24</span></div>` : ''}
      <div class="lb label">收藏集</div><div class="it">${ic('folder-line')}本周精选<span class="n">4</span></div><div class="it">${ic('folder-line')}构图研究<span class="n">5</span></div>
      <div class="lb label">智能收藏集</div><div class="it">${ic('folder-settings-line')}最近 7 天<span class="n">31</span></div><div class="it">${ic('folder-settings-line')}V5<span class="n">34</span></div>
      <span class="sp"></span><div class="it">${ic('delete-bin-line')}回收站<span class="n">2</span></div></div>
    <div class="col" style="flex:1 1 0">
      <div class="col-h" style="padding:0 var(--sp-5)"><span class="field grow">${ic('search-line')}<span class="ph">搜索文件名、Tag、译名或段落里的词</span><span class="sp"></span><span class="kbd">Ctrl K</span></span>
        <button class="btn quiet">${ic('filter-3-line')}筛选</button><button class="btn quiet">${ic('layout-grid-line')}视图</button><button class="btn ink">${ic('add-line')}导入</button></div>
      <div class="scroll"><div class="grid">${pics.map((p, i) => `<div class="card ${i === 0 ? 'on' : ''}"><img src="${IMG(p)}" alt="">${i === 0 ? `<span class="stack">${gen() ? '3 版 · 6 张' : '4 张'}</span>` : i === 3 ? '<span class="stack">4 张</span>' : ''}</div>`).join('')}</div>
        <div class="label" style="padding:0 var(--sp-5) var(--sp-4)">142 组 · 159 张</div></div>
    </div>
    <div class="col detail"><div class="scroll">
      <div class="pic"><img src="${IMG('雨后候车亭-02')}" alt=""></div>
      <div class="caption" style="padding:10px 16px 0"><b>雨后候车亭-02</b><span class="meta mono">832 × 1216 · V5 · 2026-10-11</span></div>
      <div class="stage-acts" style="padding:4px 8px 0"><button class="btn quiet sm">${ic('folder-add-line')}加入收藏集</button><button class="btn quiet sm">${ic('edit-line')}重命名</button><button class="btn quiet sm icon" aria-label="在文件夹中显示">${ic('folder-open-line')}</button><span class="sp"></span><button class="btn danger sm icon" aria-label="删除">${ic('delete-bin-line')}</button></div>
      <div class="doc selectable" style="padding-top:0">
        <div class="blk"><div class="blk-h"><span class="label">TAG 块 · 风格与画师 · 16 个</span></div><div class="tags">${tag('artist:konya_karasue', '画师', 'artist-era', '1.0')}${tag('artist:yoneyama_mai', '画师', 'artist-era', '1.3')}<span class="tag ghost">还有 14 个</span></div></div>
        <div class="blk"><div class="blk-h"><span class="label">段落 · 构图</span></div>
          <p class="prose">A vertical full illustration of a girl waiting at a bus shelter just after the rain…</p>
          <p class="trans">竖幅全身插画：雨刚停，女孩在候车亭下等车…</p></div>
      </div></div>
      <div class="bar"><span class="sp"></span><button class="btn">${ic('file-copy-line')}复制 Prompt</button><button class="btn ink">在工作台打开</button></div>
    </div></div>`;
  },
};

const NOTES = {
  wb: ['界面本身没有颜色。朱砂只出现在三处：标志里的方块、"当前这一张"的标记（当前标签、当前图片）、"生成"按钮。',
       '三种字体各管一件事：界面和中文用 MiSans，Tag 和数字用等宽，成段的自然语言用衬线。一眼能分出哪块是 Tag、哪块是段落。',
       'Tag 的分类只用一个小圆点表示，不做彩色底，避免和图片抢颜色。选中的 Tag 用墨色边框加灰底。',
       '"复制 Prompt"是墨色描边按钮，"生成"是唯一的朱砂按钮。把"看到哪一期"切到 1.0，生成相关的内容都会消失。',
       '图片像一张放在纸上的照片：细微的投影，没有边框和底板。'],
  params: ['"参数"是右栏的第二个页签。选项用一排可选的小块表示，当前值是墨色边框。',
           'Effort、质量 Tag 预设、排除预设的档位来自 V5 调研的实测结果。'],
  ai: ['AI 给出的改动原位显示：红底加删除线是移走的，绿底是新增的。顶部一条提案栏，可以接受、放弃或逐项查看。',
       '"接受"用墨色按钮，不用朱砂。朱砂只留给"生成"。'],
  lib: ['当前选中的图片用朱砂细框标出，和工作台里的标记是同一种语言。',
        '详情栏里的 Prompt 和工作台是同一种显示方式。"删除"是绛红色的文字按钮，不是实心红底，避免和朱砂混淆。'],
};

function seg(id, items, cur, key) {
  const el = document.getElementById(id);
  el.innerHTML = items.map(([k, t]) => `<button data-k="${k}" class="${k === cur ? 'on' : ''}">${t}</button>`).join('');
  el.onclick = (e) => { const b = e.target.closest('button'); if (!b) return; S[key] = b.dataset.k; render(); };
}
function render() {
  document.documentElement.dataset.theme = S.theme;
  if (S.stage === '1.0' && GEN_ONLY.has(S.page)) S.page = 'wb';
  if (!VIEWS[S.page]) S.page = 'wb';
  seg('pv-page', S.stage === '1.0' ? PAGES.filter(([k]) => !GEN_ONLY.has(k)) : PAGES, S.page, 'page');
  seg('pv-stage', STAGES, S.stage, 'stage');
  seg('pv-theme', THEMES, S.theme, 'theme');
  document.getElementById('win').classList.toggle('tall', TALL.has(S.page));
  document.getElementById('win').innerHTML = VIEWS[S.page]();
  document.getElementById('pv-notes').innerHTML = `<h4>这一页的要点（讨论用，不是产品文案）</h4><ul>${NOTES[S.page].map((n) => `<li>${n}</li>`).join('')}</ul>`;
}
render();
