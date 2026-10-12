# 自动化验收

`npm run verify:app` 构建正式页面，在新的临时数据目录中启动真实 Electron，操作界面、断言结果并截图。数据、复制、键盘等行为只执行一次；外观断言在相同业务状态下通过 `nativeTheme` 切换实际系统主题，检查浅色和深色，不改 DOM 主题属性或 React 状态。之后关闭整个进程，用同一目录重启两次，验证偏好、数据及恢复默认提示词的持久化。`npm run verify:packaged` 构建未签名目录包并实际启动包内可执行文件，检查数据库、演示图片、页面和随包字体。`npm run screenshots:app` 保留原来的固定场景截图用途。

普通结果位于 `.codex-runs/acceptance/`，减少动态效果、慢速 4 倍、慢速 6 倍分别使用 `acceptance-reduced/`、`acceptance-slow-4/`、`acceptance-slow-6/`，目录包使用 `acceptance-packaged/`。`manifest.json` 汇总每条中文标签、分类、主题范围 `themeScope`、实际主题、结果和耗时；`light/` 是主运行目录，其中同时保存深浅截图及 `checks-0.json`、`checks-1.json`、`checks-2.json`。断言失败或操作超时使命令失败。等待超时会立即保存 `timeout-阶段-序号.png` 和同名 JSON（分类、上一条通过的断言、当前操作、控制元素角色/名称/可见性/禁用状态），不采集输入值或完整页面正文。渲染器不可响应时会记录诊断采集失败原因。产物由 Windows/macOS CI 上传，不提交进 Git；尚未执行的截图或打包步骤没有产物时，上传步骤跳过。

## 执行范围与慢机器模式

```sh
npm run verify:app
npm run verify:app -- --slow=4
npm run verify:app -- --category="图片库·起名" --slow=6
npm run verify:app -- --reduced-motion
npm run verify:app -- --category="图片库" --slow=6
npm run verify:app -- --category="图片库·复制" --slow=6
npm run verify:app -- --category="设置·AI 服务" --slow=4
npm run verify:app -- --category="设置" --timing=record
npm run verify:app -- --category="基础组件" --timing=strict
npm run verify:app -- --reduced-motion --category="减少动态效果"
```

可选分类：`全部`、`图片库`、`图片库·起名`、`图片库·复制`、`图片库·导入`、`图片库·收尾`、`设置`、`设置·AI 服务`、`基础组件`、`卡片缓存`、`外壳`、`外壳·快捷键`、`动效`、`诊断`、`诊断·渲染器`。分类运行只执行单进程的相关场景：AI 服务不导入图库或词典；复制回归只导入原全套倒序先检查的最后一张演示图，并先打开一个工作台标签，覆盖已有菜单随页面隐藏/显示的情况；收尾分类只执行模型别名、智能规则和清空说明等 012a 检查；组件展示页只在全套和组件分类构建。全套复制仍逐字比较全部 14 张演示图及各自排除内容。持久化的两次进程重启只在全套执行。分类输出在相应模式目录名后追加分类，防止覆盖全套清单。

`--slow` 只接受 1、4、6。慢模式在页面加载前设置 CDP `Emulation.setCPUThrottlingRate`；受临时 Profile 校验保护的主进程 IPC 注册器，在图库、工作台、数据库、词典及偏好等磁盘相关请求前增加 `40 × 倍数` 毫秒延迟，随后仍执行原处理器并返回真实结果。临时 Profile 内的异步文件 `open/readFile/writeFile/copyFile/rename` 每次额外等待 `10 × (倍数 − 1)` 毫秒，其他路径不受影响；取消导入的控制请求不加磁盘延迟。它模拟响应时序差距，不是物理磁盘或整个主进程 CPU 的性能模拟，也不会人为阻塞主进程事件循环。普通运行不安装延迟。页面重载仍保留 CPU 限速。

导入取消场景在第一批 25 张提交后，通过真实文件读取的暂停点稳定保留进行中的状态，拍完深浅截图、点击取消并确认请求经过主进程后放行；无论成功或失败都恢复原文件读取接口。不替换文件字节、导入器结果、数据库数据或取消逻辑，也不依赖截图必须比整个导入更快。

界面反馈的 200 ms / 100 ms 基准不变，慢模式分别折算为 `200 × 倍数` / `100 × 倍数`。动效检查从实际点击开始计时，检查有效模式及 CSS 过渡；真实偏好保存另用有上限的等待检查，不把诊断读取本身的磁盘延迟算进界面反馈。`--category="动效"` 可独立执行这组检查。普通条件等待 12 秒、渲染求值 15 秒；慢模式按倍数增加但最多 60 秒。超时信息含实际等待时间和上限。`h.click`、`h.input` 先等控件可操作，图片切换等待目标 ID；页面刷新通过 `h.reload()` 等待新文档完成，不用旧文档上尚未消失的元素判定成功。

`npm run verify:app -- --category="诊断"` 故意等待一个永远不成立的条件；`--category="诊断·渲染器"` 故意求值一个不会完成的 Promise。两者预期退出码为 1，用于核验超时清单、截图和结构摘要；不属于成功验收，也不加入常规 CI。

## 交付前验证频率

改动界面或验收脚本的任务，本机全套普通模式一次、慢机器模式一次（默认 4 倍）、减少动态效果一次。修偶发失败的任务，额外把对应的最小分类在 6 倍慢模式下运行 10 次。每次使用新的临时 Profile，并保留各次清单与耗时。不要要求全套连续多次；碰到与当前任务无关的失败记入汇报，不为它重跑全套。

任务说明指定了分类或次数时，以任务说明为准，不额外运行全套，也不为无关失败重跑。慢机器模式只在本机复现时序问题，CI 拒绝 `--slow=4/6`。

CI 先执行 `prepare-fonts`，恢复或下载并校验固定 SHA-256 的 MiSans 缓存，再并行执行下面的作业。各作业只依赖字体准备，彼此不依赖，各自安装依赖和构建，不传递构建产物。

| 作业 | 平台与 Node | 内容与证据 |
| --- | --- | --- |
| `check` | Windows、macOS × Node 22、24 | `npm ci`、格式、类型、单元测试、生产构建；Node 24 加 `audit:ui`，上传 `check-ui-audit-*` |
| `acceptance` | Windows、macOS，Node 24 | `verify:app` 普通全套，上传 `acceptance-checks-*` |
| `reduced-motion` | Windows、macOS，Node 24 | 减少动态效果分类与延迟 AI 设置读取，上传 `reduced-motion-checks-*` |
| `packaged` | Windows、macOS，Node 24 | `verify:packaged`、`verify:fonts:package`、SQLite 主进程探针，上传 `packaged-acceptance-*`、`packaged-fonts-*`、`packaged-sqlite-probe-*` |
| `screenshots` | Windows，Node 24 | `screenshots:app`、`screenshots:ui`，上传 `screenshots-app-*`、`screenshots-ui-*` |

产物名还包含平台和 Node 版本；断言失败时仍上传已有证据。原先随组件截图上传的 `production-files.json` 改由产生它的 `check` 作业上传。实际字体绘制、基础组件键盘和对话框断言、打包字体仍由两个平台覆盖。组件截图脚本中的 Chromium 原生语义探针只在 Windows 执行。

安装包检查仅验证打包程序身份、包内页面、临时用户路径、SQLite 和演示图库、sharp/libvips 实际处理图片、三种随包字体在两套主题中的实际绘制；同时保留网络与剪贴板隔离检查。不执行卡片缓存压力、计时、主题连续切换和导航行为检查。这些行为断言仍在普通界面验收里执行，发版的 `--packaged --existing-package` 使用相同的轻量检查。

卡片缓存分类默认每批建立 25 行，每批仍让出主进程事件循环。调度参数只从通过临时目录校验的验收模式注入；正常启动和安装包验收不启用。末尾进度在报告源头暂存，待列表回复、渲染器取消监听后显式释放，继续通过真实 IPC/preload 发送，不替换 `performance.now` 或 `webContents.send`。`NPS_ACCEPTANCE_CARD_TIMING=slow` 使用每批 1 行，`fast` 使用每批 25 行，`normal` 使用产品原本的 12 ms / 最多 25 行策略；三者保留相同的并发、响应、单调进度和完整列表断言，受控模式另检查批次大小。

偶发失败时先查看失败作业的日志和对应产物，只重跑失败作业：

```sh
gh run view <id> --log-failed
gh run rerun <id> --failed
```

GitHub 页面也可选择 “Re-run failed jobs”。已经成功的作业无需重跑；若代码需要修复，推送修复后创建新运行，旧运行重跑仍使用原提交。没有加入失败自动重试。目标为整轮 6 分钟以内、单作业重跑 4 分钟以内；实际远端耗时需在推送后检查，不能用本地耗时代替。

减少动态效果使用 `--reduced-motion --category="减少动态效果"`，单进程运行外壳（含动效组合）、基础组件、设置版式、词典滚动条及 AI 服务（保留 `NPS_ACCEPTANCE_SLOW_AI_READ=1` 的延迟读取验证），以及图库的“关闭动效”和“导入与永久删除·关闭动效”场景。图库正常动效那一轮、起名、复制、收尾、工作台、快捷键、词典数据操作、存储管理、关于与更新及持久化重启不在此子集中重复；普通全套中的这些检查保持。设置外观中的动效选择由外壳的动效场景覆盖。

## 计时策略

`checkSoon` 将行为和计时分别记录：行为必须在普通等待上限内完成（通常 12 秒，慢模式折算且最多 60 秒），缺失行为、求值错误和操作超时始终失败。计时仍从原来的操作起点测量，保留 100/200 ms 等期限，慢模式按倍数折算。词典细条的页面内部计时及卡片缓存响应也使用相同策略。

本机默认严格，计时超限会失败；`CI` 环境变量为真时默认只记录（空值、`0`、`false` 视为假），计时超限标记“计时：超过期限”，不算失败。`--timing=record` 或 `--timing=strict` 可显式覆盖默认策略，不会放宽行为等待上限。

每条计时写入检查记录的 `timing` 字段；总清单另含 `timings` 表，列出期限 `deadlineMs`、实测 `elapsedMs`、是否超限 `exceeded`、是否超过两倍 `overDouble` 和策略。日志也输出相同汇总，超过期限两倍的项目排在最前。没有完成的测量以 `null` 保留并判失败，不伪造耗时。

`--category="诊断·计时"` 在隔离的真实渲染器内安排约 50 ms 后完成的反馈，期限为 1 ms：配合 `--timing=record` 应成功，配合 `--timing=strict` 应仅因计时失败。此诊断不加入常规 CI；不能把启动失败误认为严格计时验证成功。

单个 Electron 进程的总预算独立于单项等待：普通模式最多 10 分钟，慢模式按倍数折算但最多 30 分钟。每 25 条断言及每次失败都会原子保存 `checks-progress-阶段.json`；如果进程被总预算中止，runner 将最近保存的结果与“未输出完整清单”的失败合并，而不会显示为成功。两次保存之间尚未落盘的检查可能丢失；强制退出无法再采集退出瞬间的新截图，已有截图和超时诊断仍会上传。

## 给后续任务添加断言

在 `electron/acceptance/` 对应场景模块增加操作与检查，从 `run.js` 接入新场景即可。使用 `h.category('中文分类')`、`h.click()`、`h.input()`、`h.key()`、`h.select()` 操作实际页面；异步变化先 `await h.wait('布尔表达式', '中文等待标签')`，再 `await h.check('中文验收标签', '布尔表达式')`。主进程状态可用 `h.check('标签', () => 布尔值)` 检查，严格要求结果为 `true`。完成关键状态后调用 `h.screenshot('文件名')`。

每条 `h.check` 第四个参数、`h.checkSoon` 第六个参数必须标出主题范围：`'once'` 表示数据、键盘、复制内容等行为；`'both'` 表示颜色、布局、字体或无法确定与主题无关的断言，省略时保守地按 `both`。外观检查读取同一个状态在另一主题的表现，不重复触发写入、复制、删除等动作；反馈期限只测交互本身。`h.font` 在两主题下分别通过 CDP 读取实际字体，`h.screenshot` 同状态拍两张。检查固定主题按钮和原生标题栏令牌的外壳场景显式各跑一遍，其余场景使用产品已有的“跟随系统”。

```js
await h.section('翻译词典');
await h.input('[aria-label="搜索 Tag 或译文"]', '验收译文');
await h.wait('document.querySelectorAll(".settings-table tbody tr").length > 0', '词典查询完成');
await h.check(
  '搜索译文仅显示匹配条目',
  '[...document.querySelectorAll(".settings-table tbody tr")].every(row => row.cells[2].textContent.includes("验收译文"))',
  undefined,
  'once',
);
await h.screenshot('dictionary-search');
```

优先使用可访问名称和现有结构；确需稳定定位时，只给产品元素加不影响行为与外观的标记。不要在验收器里替换 React 状态、业务 IPC 或渲染器 API 来制造成功。仅测试夹具准备可直接使用数据库接口。

原生对话框的预定响应写入主进程 `doubles.selections` / `doubles.messages` 队列；未预定的调用直接失败。外部打开请求检查 `doubles.calls`。AI 使用 runner 启动的回环 HTTP 服务，可通过 `/control/success`、`/control/fail`、`/control/timeout` 切换响应；不会使用真实账户。更新检查仅在验收模式返回固定发布信息。除回环测试服务外的 HTTP 请求会被阻止并使隔离断言失败。

`h.key()` 派发 DOM 键盘事件，平台修饰键在快捷键场景中取 Ctrl/Cmd。需要浏览器默认行为的 Tab、Esc、Space，以及原生 range 和指针捕获，使用 Chromium CDP 输入管线；它们只作用于当前 `webContents`，不是操作系统鼠标键盘模拟。整轮减少动态效果使用进程级 `force-prefers-reduced-motion` 开关，动效组合断言另用 CDP 媒体仿真并及时恢复；系统主题用 `nativeTheme`，窗口状态用 `BrowserWindow`。`h.font()` 等待字体和布局完成后，用 `CSS.getPlatformFontsForNode` 检查实际绘制字体。

持久化检查放入后续进程阶段，并与前一阶段保存的期望值比较。必须保留整进程重启，不能用刷新页面代替。安全存储不可用时，用 `h.uncovered('相关检查', '本平台的具体原因')` 明确记录；普通失败不得改成未覆盖或静默跳过。

剪贴板使用 Electron 的真实接口，标准文本、HTML、RTF、书签、图片一起保存恢复；存在 Electron 无法完整恢复的私有格式时，脚本在任何写入前停止。不要与另一个使用剪贴板的验收实例同时运行。脚本不读取日常 Profile，结束后只删除自己创建的临时目录。

不能通过这些接口验证的原生标题栏拖动、窗口按钮实际色彩、原生文件选择器、操作系统级快捷键和读屏软件实际播报，列入任务报告的“自动化没覆盖”，不再生成手动验证文档。
