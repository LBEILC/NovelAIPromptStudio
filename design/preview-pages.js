// 界面稿（第二部分）：素材、设置、空状态、组件表。依赖 preview.js 里的 titlebar、tag、IMG、gen、VIEWS、NOTES、PAGES、render。
PAGES.push(['assets', '素材'], ['set', '设置 · 外观'], ['acct', '设置 · 账号'], ['empty', '空状态'], ['comps', '组件']);
GEN_ONLY.add('assets').add('acct');
TALL.add('comps');

const setNav = (cur) => {
  const items = [['外观', 'set'], ['图片库', ''], ['NovelAI 账号', 'acct'], ['AI 服务', ''], ['翻译词典', ''], ['Agent 接入', 'agent'], ['关于与更新', '']]
    .filter(([, k]) => gen() || (k !== 'acct' && k !== 'agent'));
  return `<div class="side">${items.map(([t, k]) => `<div class="it ${k === cur ? 'on' : ''}">${t}</div>`).join('')}</div>`;
};
const sel = (text, cls = '') => `<span class="field sm ${cls}" style="min-width:150px">${text}${ic('arrow-down-s-line')}</span>`;
const opts = (items, on) => `<span class="row">${items.map((t, i) => `<span class="opt ${i === on ? 'on' : ''}">${t}</span>`).join('')}</span>`;

VIEWS.assets = () => `${titlebar('assets')}<div class="body">
  <div class="side"><div class="it on">${ic('layout-row-line')}常用块<span class="n">6</span></div><div class="it">${ic('user-3-line')}角色<span class="n">9</span></div><div class="it">${ic('palette-line')}Vibe<span class="n">10</span></div>
    <span class="sp"></span><div class="help" style="padding:0 10px 4px">Vibe 目前只能用在 V4.5 上</div></div>
  <div class="col" style="flex:1 1 0;background:var(--surface)">
    <div class="col-h" style="padding:0 var(--sp-5);border-bottom:1px solid var(--divider)"><span class="field grow">${ic('search-line')}<span class="ph">搜索常用块</span></span><button class="btn">${ic('add-line')}新建</button></div>
    <div class="scroll">
      <div class="arow"><div class="top"><b>常用画师组合</b><span class="label">TAG 块 · 风格与画师 · 16 个 · 用在 31 张图里</span>
        <span class="acts"><button class="btn quiet sm">插入到当前 Prompt</button><button class="btn quiet sm">重命名</button><button class="btn danger sm">删除</button></span></div>
        <div class="tags">${tag('artist:konya_karasue', '画师', 'artist-era', '1.0')}${tag('artist:yoneyama_mai', '画师', 'artist-era', '1.3')}${tag('artist:deyui', '画师', 'artist-era', '0.8')}${tag('year 2026', '2026 年', 'artist-era', '2')}<span class="tag ghost">还有 12 个</span></div></div>
      <div class="arow"><div class="top"><b>电影感打光</b><span class="label">TAG 块 · 风格 · 5 个 · 用在 12 张图里</span></div>
        <div class="tags">${tag('cinematic composition', '电影感构图', 'composition', '2')}${tag('soft studio lighting', '柔和的棚拍光', 'style')}${tag('high-quality rendering', '高质量渲染', 'style', '5')}<span class="tag ghost">还有 2 个</span></div></div>
      <div class="arow"><div class="top"><b>四格漫画页</b><span class="label">段落 · 分镜 · 用在 3 张图里</span></div>
        <p class="prose">Panel 1: small upper right panel, close-up of her hands. Panel 2: small upper left panel, her face turning toward the window…</p></div>
      <div class="arow"><div class="top"><b>常用排除内容</b><span class="label">TAG 块 · 排除 · 24 个 · 用在 58 张图里</span></div>
        <div class="tags">${tag('lowres', '低分辨率', 'style')}${tag('artistic error', '绘画错误', 'style')}${tag('film grain', '胶片颗粒', 'style')}<span class="tag ghost">还有 21 个</span></div></div>
    </div></div></div>`;

VIEWS.set = () => `${titlebar('')}<div class="body">${setNav('set')}
  <div class="col" style="flex:1 1 0;background:var(--surface)"><div class="scroll"><div class="set">
    <h2>外观</h2><div class="help">更改会立刻应用到整个界面。</div>
    <div class="setrow"><div>主题</div>${opts(['跟随系统', '浅色', '深色'], 1)}</div>
    <div class="setrow"><div>界面字体<small>用于界面和中文</small></div>${sel('MiSans（内置）')}</div>
    <div class="setrow"><div>等宽字体<small>用于 Tag、权重和参数</small></div>${sel('IBM Plex Mono（内置）')}</div>
    <div class="setrow"><div>段落字体<small>用于成段的自然语言</small></div>${sel('Newsreader（内置）')}</div>
    <div class="setrow"><div>动效<small>关闭后，所有位置变化都立刻完成</small></div>${opts(['完整', '跟随系统', '关闭'], 1)}</div>
    <h2>Prompt 的显示</h2>
    <div class="setrow"><div>默认显示<small>打开一张图时先看到什么</small></div>${opts(['原文', '译文', '对照'], 2)}</div>
    <div class="setrow"><div>自动翻译新出现的 Tag 和段落<small>优先使用内置词典；词典没有的才交给 AI 服务</small></div><span class="switch on"></span></div>
  </div></div></div></div>`;

VIEWS.acct = () => `${titlebar('')}<div class="body">${setNav('acct')}
  <div class="col" style="flex:1 1 0;background:var(--surface)"><div class="scroll"><div class="set">
    <h2>NovelAI 账号</h2><div class="help">这里通过你自己的账号调用 NovelAI。本软件是非官方工具，与 NovelAI 没有隶属关系。</div>
    <div class="setrow"><div>持久令牌<small>在 NovelAI 的账号设置里创建。只存在系统的安全存储里，软件不会以明文保存</small></div><span class="row"><span class="field sm mono">已保存 ••••••••</span><button class="btn sm">更换</button></span></div>
    <div class="setrow"><div>余额与用量<small>每次生成前都会显示这次要花多少</small></div><span class="row"><span class="mono">8,240 Anlas · 用量 12%</span><button class="btn quiet sm">刷新</button></span></div>
    <div class="setrow"><div>无人值守连续生成<small>默认关闭。请求仍然一张接一张地发；打开前会先说明风险</small></div><span class="switch"></span></div>
    <h2>Agent 接入</h2><div class="help">让 Claude Code、Codex 等 Agent 读写 Prompt、搜索图片库和生成图片。</div>
    <div class="setrow"><div>命令行工具与技能<small>已安装到 Claude Code · 版本 1.1.0</small></div><span class="row"><button class="btn sm">安装到其他 Agent</button></span></div>
    <div class="setrow"><div>Agent 生成的方式<small>默认由 Agent 排好队，你点一下确认后再发出</small></div>${opts(['排队后由我确认', '直接生成'], 0)}</div>
    <div class="setrow"><div>Agent 花费上限<small>默认不启用。可以设置单次和单日最多花多少 Anlas</small></div><span class="switch"></span></div>
  </div></div></div></div>`;

VIEWS.empty = () => `${titlebar('wb').replace(/<span class="tb-sep">[\s\S]*?<\/div><span class="sp">/, '<span class="sp">')}<div class="body">
  <div class="col" style="flex:1 1 0"><div class="empty">
    <span class="mark">{<i></i>}</span>
    <h3>把一张 NovelAI 图片拖到这里</h3>
    <p>软件会读出它的 Prompt 和参数。可以同时打开多张，每张一个标签。</p>
    <div class="acts"><button class="btn ink">打开图片</button><button class="btn">从剪贴板打开</button><span class="kbd" style="align-self:center">Ctrl V</span></div>
    <p class="fine">打开图片不会修改原图，也不会自动存进图片库。</p>
  </div></div></div>`;

VIEWS.comps = () => `<div class="sheet">
  <section><h5>按钮</h5>
    <div class="r"><span class="cap">默认</span><button class="btn">复制 Prompt</button><button class="btn is-hover">悬停</button><button class="btn is-focus">焦点</button><button class="btn is-off">不可用</button></div>
    <div class="r"><span class="cap">墨色</span><button class="btn ink">在工作台打开</button><button class="btn ink is-hover">悬停</button><button class="btn ink"><span class="spin"></span>导入中</button></div>
    <div class="r"><span class="cap">朱砂</span><button class="btn seal">生成</button><button class="btn seal is-hover">悬停</button><button class="btn seal"><span class="spin"></span>生成中 2/4</button><span class="help">整个界面只有"生成"用它</span></div>
    <div class="r"><span class="cap">安静</span><button class="btn quiet">筛选</button><button class="btn quiet is-hover">悬停</button><button class="btn quiet sm">小号</button></div>
    <div class="r"><span class="cap">危险</span><button class="btn danger">删除</button><button class="btn line-danger">丢弃并关闭</button><span class="help">只用文字或描边，不用实心红底</span></div>
  </section>
  <section><h5>输入与选择</h5>
    <div class="r"><span class="cap">输入框</span><span class="field" style="width:170px"><span class="ph">角色名称</span></span><span class="field is-focus" style="width:120px">黍</span></div>
    <div class="r"><span class="cap">出错</span><span class="field is-error" style="width:170px"></span><span class="help err">角色名称不能为空</span></div>
    <div class="r"><span class="cap">下拉</span>${sel('Euler Ancestral')}<span class="stepper"><span>${ic('subtract-line')}</span><b>1.20</b><span>${ic('add-line')}</span></span></div>
    <div class="r"><span class="cap">选项</span>${opts(['原文', '译文', '对照'], 2)}</div>
    <div class="r"><span class="cap">页签</span><div class="seg"><button class="on">Prompt</button><button>参数</button><button>参考</button></div></div>
    <div class="r"><span class="cap">开关</span><span class="switch"></span><span class="switch on"></span><span class="check"></span><span class="check on">${ic('check-line')}</span></div>
    <div class="r"><span class="cap">滑块</span><span class="slider"><i style="width:62%"></i><b style="left:62%"></b></span><span class="mono muted">0.62</span></div>
  </section>
  <section class="wide"><h5>Tag 的各种状态</h5>
    <div class="r">${tag('long hair', '长发', 'body')}${tag('悬停', '', 'body', '', 'is-hover')}${tag('long hair', '选中', 'body', '', 'sel')}${tag('long hair', '有权重', 'body', '1.40')}${tag('flat color', '负权重', 'style', '−2')}
      <span class="tag"><span class="dot" style="background:var(--cat-unsorted)"></span><span class="t"><span class="en">shu (arknights)</span><span class="zh wait">翻译中…</span></span></span>
      ${tag('year 2026 ::', '多余的 :: 结束符', 'artist-era', '', 'warn')}${tag('rain', '新增', 'environment', '', 'new')}${tag('umbrella', '移走', 'clothing', '', 'gone')}${tag('solo', '被筛选隐藏', 'subject', '', 'dim')}${tag('side braid', '拖动中', 'body', '', 'lift')}<span class="tag ghost">${ic('add-line')}输入中文或英文</span></div>
    <div class="r"><span class="cap">分类色</span>${[['画师年代', 'artist-era'], ['角色组成', 'subject'], ['身份物种', 'identity'], ['外貌身体', 'body'], ['服装配饰', 'clothing'], ['动作表情', 'action'], ['环境背景', 'environment'], ['镜头光影', 'composition'], ['风格质量', 'style'], ['未分类', 'unsorted']].map(([zh, c]) => tag(zh, '', c)).join('')}</div>
  </section>
  <section><h5>右键菜单与 Tag 提示</h5><div class="stack">
    <div class="menu"><div class="mi on">编辑<span class="k">Enter</span></div><div class="mi">复制 Tag<span class="k">Ctrl C</span></div><div class="mi">复制 Tag（含权重）</div><div class="mi">复制译文</div><hr>
      <div class="mi">移动到<span class="k">${ic('arrow-right-s-line')}</span></div><div class="mi">翻译与分类</div><div class="mi off">存为常用块</div><hr><div class="mi danger">删除<span class="k">Del</span></div></div>
    <div class="menu" style="min-width:250px"><div class="mi on"><span class="en">copper hair</span><span class="zh">铜色头发</span><span class="k">3.2k</span></div><div class="mi"><span class="en">long copper hair</span><span class="zh">铜色长发</span><span class="k">410</span></div>
      <div class="mi"><span class="en">copper eyes</span><span class="zh">铜色眼睛</span><span class="k">96</span></div><hr><div class="mi"><span class="zh">直接添加"铜色"</span><span class="k">Enter</span></div></div>
  </div></section>
  <section><h5>编辑一个 Tag</h5>
    <div class="popover"><div class="frow"><span class="label">Tag</span><span class="field sm mono is-focus">long copper hair</span></div>
      <div class="frow"><span class="label">译文</span><span class="field sm">铜色长发</span></div>
      <div class="frow"><span class="label">分类</span><span class="field sm"><span class="dot" style="width:5px;height:5px;border-radius:50%;background:var(--cat-body)"></span>外貌身体${ic('arrow-down-s-line')}</span></div>
      <div class="frow"><span class="label">权重</span><span class="row"><span class="stepper"><span>${ic('subtract-line')}</span><b>1.20</b><span>${ic('add-line')}</span></span><span class="help">1 是普通权重</span></span></div>
      <div class="row" style="justify-content:space-between;margin-top:2px"><button class="btn danger sm">删除</button><span class="row"><button class="btn quiet sm">取消</button><button class="btn ink sm">完成</button></span></div></div>
  </section>
  <section><h5>对话框</h5><div class="stack">
    <div class="dialog"><h3>关闭已修改的标签？</h3><p>关闭后会丢弃这个标签里还没生成的改动，其他标签不受影响。图片文件本身不会被修改。</p>
      <div class="acts"><button class="btn is-focus">取消</button><button class="btn line-danger">丢弃并关闭</button></div></div>
  </div></section>
  <section><h5>风险提示</h5>
    <div class="dialog"><h3>打开无人值守连续生成？</h3><p>打开后，软件会按队列一张接一张地生成，中间不需要你操作。NovelAI 的接口说明里写着：</p>
      <p class="quote">"all generation requests must be initiated by a human action"</p>
      <p>这样使用是否符合它的服务条款，由你自行判断并承担后果。</p>
      <div class="acts"><button class="btn is-focus">取消</button><button class="btn ink">我了解，打开</button></div></div>
  </section>
  <section><h5>通知、提示与多选操作条</h5>
    <div class="r"><span class="toast plain">已复制 52 个 Tag</span><span class="toast">已移入回收站<button>撤销</button></span></div>
    <div class="r"><span class="tip">复制当前筛选后可见的正向 Prompt</span><span class="tip">Ctrl K</span></div>
    <div class="r"><span class="selbar"><span class="n">已选 3 个 Tag</span><button class="btn quiet sm">复制</button><button class="btn quiet sm">移动到</button><button class="btn quiet sm">翻译与分类</button><button class="btn danger sm">删除</button><button class="btn quiet sm">取消</button></span></div>
  </section>
  <section><h5>状态横幅与生成进度</h5>
    <div class="r"><div class="banner info" style="flex:1">${ic('information-line')}这张图里没有检测到 Vibe。</div></div>
    <div class="r"><div class="banner warn" style="flex:1">${ic('alert-line')}这张图片已被移动或删除。可以关闭这个标签，其他标签不受影响。</div></div>
    <div class="r"><div class="banner danger" style="flex:1">${ic('error-warning-line')}没有生成：Anlas 余额不足。<span class="sp"></span><button class="btn quiet sm" style="color:inherit">查看余额</button></div></div>
    <div class="r" style="display:block"><div class="row" style="justify-content:space-between;margin-bottom:6px"><span>正在生成第 2 张，共 4 张</span><button class="btn quiet sm">取消剩下的</button></div><div class="progress"><i style="width:38%"></i></div></div>
  </section>
</div>`;

Object.assign(NOTES, {
  assets: ['常用块按行排列，不做卡片。每一行就是一个可以直接插入的块，显示方式和 Prompt 里一样。',
           'Vibe 旁边注明目前只能用在 V4.5 上，这是调研的结论。'],
  set: ['设置用一行一项的列表，不做卡片。开关、选项、下拉都在这一页出现了。',
        '三种字体各有一项，说明它们分别用在哪里。'],
  acct: ['两处告知都在这一页：页面顶部的"非官方工具"声明，以及"无人值守"开关旁的说明。',
         'Agent 生成的方式默认是"排队后由我确认"；花费上限默认不启用。'],
  empty: ['空工作台只说三件事：把图拖进来、还能怎么打开、这样做不会改动什么。',
          '中间的图形是标志的空心版：括号里还没有图。'],
  comps: ['这是全部基础组件和它们的状态，实现时逐个对照。',
          '风险提示里引用的那句话是 NovelAI 接口说明的原文。',
          '图标用 Remix Icon 的线条风格，只在帮助扫读或代替文字节省空间的地方用。"生成"和"AI"按钮不加图标。',
          '分类色做过测量：任意两种的色差都在 15 以上；色觉障碍下无法全部分清，所以分类同时有文字。'],
});
// 这些页面是后加进来的，地址参数要在它们注册之后再读一次
for (const [k, v] of new URLSearchParams(location.search)) if (k in S) S[k] = v;
render();
