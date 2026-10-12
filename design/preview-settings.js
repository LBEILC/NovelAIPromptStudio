// 界面稿（第三部分）：设置的全部分页。把前面的"设置 · 外观""设置 · 账号"两页合并成一个可以点侧栏切换的"设置"页。
// 地址参数：preview.html?page=set&sub=dict
for (const k of ['acct']) { const i = PAGES.findIndex(([p]) => p === k); if (i >= 0) PAGES.splice(i, 1); }
PAGES.find(([p]) => p === 'set')[1] = '设置';
GEN_ONLY.delete('acct');
S.sub = 'look';

const SET_PAGES = [['look', '外观', false, 'contrast-2-line'], ['lib', '图片库', false, 'hard-drive-2-line'], ['acct', 'NovelAI 账号', true, 'key-2-line'], ['ai', 'AI 服务', false, 'translate-2'], ['dict', '翻译词典', false, 'book-2-line'], ['agent', 'Agent 接入', true, 'terminal-box-line'], ['about', '关于与更新', false, 'information-line']];
const lookView = VIEWS.set;   // 复用已经写好的"外观"和"账号"内容，只取右边的内容区
const acctView = VIEWS.acct;
const inner = (html) => html.slice(html.indexOf('<div class="set">'), html.lastIndexOf('</div></div></div></div>') + 6);
const cat = (zh, c) => `<span class="cdot" style="background:var(--cat-${c})"></span>${zh}`;

const SET_BODY = {
  look: () => inner(lookView()),
  acct: () => inner(acctView()).replace(/<h2>Agent 接入[\s\S]*$/, '</div>'),
  agent: () => { const h = inner(acctView()); return '<div class="set">' + h.slice(h.indexOf('<h2>Agent 接入')); },

  lib: () => `<div class="set">
    <h2>图片库</h2><div class="help">导入的图片、缩略图和导出的 Vibe 文件都存在这里。</div>
    <div class="setcol"><div>图片存放位置</div><div class="path">D:\\Pictures\\NovelAI Prompt Studio\\assets</div>
      <small>159 张图片 · 占用 412 MB</small>
      <div class="row"><button class="btn sm">打开文件夹</button><button class="btn sm">更改位置</button></div>
      <small>更改位置会把现有文件移过去。复制并校验完成之前，原来的文件不会被删除。</small></div>
    <div class="setcol"><div>正在移动到新位置</div><div class="progress"><i style="width:64%"></i></div>
      <small>已复制 102 / 159 个文件 · 可以继续使用，移动完成前不要关闭软件</small></div>
    <h2>数据与备份</h2>
    <div class="setrow"><div>数据库<small class="path">C:\\Users\\…\\NovelAI Prompt Studio\\data\\studio.sqlite</small></div><button class="btn sm">打开文件夹</button></div>
    <div class="setrow"><div>升级前的备份<small>软件在升级数据格式之前自动留下的一份副本 · 2026-10-11</small></div><button class="btn quiet sm">在文件夹中显示</button></div>
    <div class="setrow"><div>回收站<small>2 张图片 · 永久删除后无法恢复</small></div><button class="btn line-danger sm">清空回收站</button></div>
  </div>`,

  ai: () => `<div class="set">
    <h2>AI 服务</h2><div class="help">用来补全内置词典没有的 Tag 翻译和分类、翻译段落。不配置也能使用软件的其他功能。</div>
    <div class="setcol"><div>服务地址</div><span class="field mono">https://api.example.com/v1</span><small>任何兼容 OpenAI 接口格式的服务</small></div>
    <div class="setcol"><div>API Key</div><div class="row"><span class="field sm mono">已保存 ••••••••</span><button class="btn sm">更换</button></div><small>只存在系统的安全存储里，软件不会以明文保存</small></div>
    <div class="setcol"><div>模型</div><div class="row"><span class="field sm" style="min-width:240px">claude-haiku-5-5${ic('arrow-down-s-line')}</span><button class="btn quiet sm">重新读取模型列表</button></div></div>
    <div class="setfoot"><button class="btn">测试连接</button><span class="banner ok" style="padding:4px 10px">连接正常 · 0.8 秒</span><span class="sp"></span><button class="btn ink">保存</button></div>
    <h2>提示词</h2><div class="help">软件会在后面固定附加输出格式、数量和顺序的要求，这里只写翻译和分类的规则。</div>
    <div class="setcol"><div>翻译规则</div><div class="area">把 Danbooru 风格的英文 Tag 翻译成简体中文。保留角色名和作品名的通用译名；画师名不翻译。</div></div>
    <div class="setcol"><div>分类规则</div><div class="area">按十个分类归类：画师年代、角色组成、身份物种、外貌身体、服装配饰、动作表情、环境背景、镜头光影、风格质量、未分类。</div></div>
    <div class="setfoot"><button class="btn quiet">恢复默认</button></div>
  </div>`,

  dict: () => {
    const rows = [
      ['long copper hair', '铜色长发', ['外貌身体', 'body'], '内置词典', ''],
      ['side braid', '侧辫', ['外貌身体', 'body'], '内置词典', ''],
      ['artist:konya_karasue', '画师', ['画师年代', 'artist-era'], '本地规则', 'row-on'],
      ['transparent umbrella', '透明雨伞', ['服装配饰', 'clothing'], 'AI', 'row-on'],
      ['cinematic composition', '电影感构图', ['镜头光影', 'composition'], '你改过', ''],
      ['shu (arknights)', '', ['未分类', 'unsorted'], '还没有翻译', ''],
      ['wet pavement', '湿漉漉的路面', ['环境背景', 'environment'], 'AI', ''],
    ];
    return `<div style="display:flex;flex-direction:column;height:100%;min-height:0">
    <div class="set" style="padding-bottom:10px;max-width:none"><h2>翻译词典</h2><div class="help">这里是软件记住的 Tag 译文和分类。修改只影响显示，不会改动图片里保存的 Prompt。</div></div>
    <div class="tbl-bar"><span class="field sm grow">${ic('search-line')}<span class="ph">搜索 Tag 或译文</span></span>
      <span class="field sm">全部分类${ic('arrow-down-s-line')}</span><span class="field sm">全部来源${ic('arrow-down-s-line')}</span><span class="muted mono">2,378 条</span></div>
    <div class="tbl">
      <div class="th"><span class="check"></span></div><div class="th">Tag</div><div class="th">译文</div><div class="th">分类</div><div class="th">来源</div><div class="th"></div>
      ${rows.map(([en, zh, [cz, cc], src, cls]) => `<div class="${cls}"><span class="check ${cls ? 'on' : ''}">${cls ? ic('check-line') : ''}</span></div><div class="${cls}"><span class="en">${en}</span></div>
        <div class="${cls}">${zh || '<span class="muted">点击填写</span>'}</div><div class="${cls}">${cat(cz, cc)}</div><div class="${cls}"><span class="src">${src}</span></div><div class="${cls}"><button class="btn quiet sm">删除</button></div>`).join('')}
    </div>
    <div style="padding:14px var(--sp-5);display:flex;justify-content:center"><span class="selbar"><span class="n">已选 2 条</span><button class="btn quiet sm">设置分类</button><button class="btn danger sm">删除</button><button class="btn quiet sm">取消</button></span></div>
    </div>`;
  },

  about: () => `<div class="set">
    <div class="about-head"><span class="about-mark">${LOGO_SVG}</span><div><div class="about-name">NovelAI Prompt Studio</div><div class="muted mono">版本 1.0.0</div></div></div>
    <div class="help">非官方工具，与 NovelAI 没有隶属关系。</div>
    <h2>更新</h2>
    <div class="setrow"><div>自动检查更新<small>启动稳定后检查一次，不会自动安装</small></div><span class="switch on"></span></div>
    <div class="setrow"><div>发现新版本 1.0.1<small>已下载完成 · 重启后安装，工作台里的标签和草稿会保留</small></div><span class="row"><button class="btn quiet sm">更新说明</button><button class="btn ink sm">重启并安装</button></span></div>
    <h2>快捷键</h2>
    <div class="help">macOS 上 Ctrl 对应 Command。在输入框里，Ctrl V 仍然是普通的粘贴。</div>
    ${[['打开图片；在图片库里是导入', ['Ctrl', 'I']], ['从剪贴板打开或导入图片', ['Ctrl', 'V']], ['聚焦搜索框', ['Ctrl', 'K']],
       ['下一个 / 上一个标签', ['Ctrl', 'Tab'], ['Ctrl', 'Shift', 'Tab']], ['关闭当前标签', ['Ctrl', 'W']],
       ['移动当前 Tag', ['Alt', '方向键']], ['在一摞图片里切换', ['←'], ['→']]]
      .map(([t, ...ks]) => `<div class="setrow"><div>${t}</div><span class="row">${ks.map((k) => k.map((x) => `<span class="kbd">${x}</span>`).join('')).join('<span class="muted">/</span>')}</span></div>`).join('')}
    <h2>数据与隐私</h2>
    <div class="setrow"><div>图片和图库数据只存在这台电脑上<small>位置见"图片库"那一页。软件不会把图片上传到任何地方</small></div></div>
    <div class="setrow"><div>只在这几种情况下联网<small>检查更新（可以关掉）；你配置了 AI 服务并点了翻译、分类或段落的 AI 按钮时，把这几个 Tag 或这一段文字发给你配置的服务，不发图片；点"报告问题"时在浏览器里打开 GitHub</small></div></div>
    <div class="setrow"><div>AI 服务的密钥加密保存在本机<small>诊断信息和报告问题都不会带上它</small></div></div>
    <h2>反馈与支持</h2>
    <div class="setrow"><div>报告问题或提出建议<small>会在浏览器里打开 GitHub，不会自动附带任何数据</small></div><span class="row"><button class="btn sm">报告问题</button><button class="btn sm">提出建议</button></span></div>
    <div class="setrow"><div>诊断信息<small>只包含软件版本和操作系统，不包含图片、Prompt 和路径</small></div><button class="btn quiet sm">复制</button></div>
    <h2>字体与开源组件</h2>
    <div class="setrow"><div>界面字体 MiSans · 段落字体 Newsreader · 等宽字体 IBM Plex Mono<small>内置 Tag 词典来自 DanbooruSearchOnline</small></div><button class="btn quiet sm">查看声明</button></div>
  </div>`,
};

VIEWS.set = () => {
  const items = SET_PAGES.filter(([, , g]) => gen() || !g);
  if (!items.some(([k]) => k === S.sub)) S.sub = 'look';
  const full = S.sub === 'dict';
  return `${titlebar('')}<div class="body">
    <div class="side">${items.map(([k, t, , i]) => `<div class="it ${k === S.sub ? 'on' : ''}" data-sub="${k}">${ic(i)}${t}</div>`).join('')}</div>
    <div class="col" style="flex:1 1 0;background:var(--surface)">${full ? SET_BODY.dict() : `<div class="scroll">${SET_BODY[S.sub]()}</div>`}</div></div>`;
};
delete VIEWS.acct;

Object.assign(NOTES, {
  set: ['点左边的侧栏可以切换设置的各个分页。',
        '图片库：除了存放位置，还把数据库位置、升级前的备份和回收站放在一起，"我的数据在哪、怎么备份"一页看完。',
        'AI 服务：这一块是一张表单，有明确的"保存"，因为"测试连接"要用还没保存的值。其余设置都是改了立刻生效。',
        '翻译词典：原来叫"Tag 缓存"，是按 Tag 芯片排列的；现在改成表格，一行一条，方便成批查看和修正。',
        '关于：有"非官方工具"的声明，以及字体的署名（MiSans 的授权要求在软件里注明）。',
        '1.0 不做帮助中心（2026-10-12）。原来帮助中心里真正有用的两块挪到这里：快捷键列表，以及"数据存在哪、什么时候联网"的说明。其余的引导放在用的地方：空状态、悬停提示、Tag 提示。'],
});

document.getElementById('win').addEventListener('click', (e) => {
  const it = e.target.closest('[data-sub]');
  if (it) { S.sub = it.dataset.sub; render(); }
});
for (const [k, v] of new URLSearchParams(location.search)) if (k in S) S[k] = v;
render();
