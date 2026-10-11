# 自动化验收

`npm run verify:app` 构建正式页面，按浅色、深色依次在各自新的临时数据目录中启动真实 Electron，操作界面、断言结果并截图；每套主题随后关闭整个进程，用同一目录重启两次，验证偏好、数据及恢复默认提示词的持久化。`npm run verify:packaged` 构建未签名目录包并实际启动包内可执行文件，检查数据库、演示图片、页面和随包字体。`npm run screenshots:app` 保留原来的固定场景截图用途。

结果分别位于 `.codex-runs/acceptance/` 和 `.codex-runs/acceptance-packaged/`。`manifest.json` 汇总每条中文标签、分类、结果、截图文件和耗时；应用验收的 `light/`、`dark/` 子目录下，`checks-0.json`、`checks-1.json`、`checks-2.json` 保存各进程的结果。断言失败或操作超时使命令失败，并保留页面文字上下文及失败截图。这些产物由 Windows/macOS CI 上传，不提交进 Git。

## 给后续任务添加断言

在 `electron/acceptance/` 对应场景模块增加操作与检查，从 `run.js` 接入新场景即可。使用 `h.category('中文分类')`、`h.click()`、`h.input()`、`h.key()`、`h.select()` 操作实际页面；异步变化先 `await h.wait('布尔表达式', '中文等待标签')`，再 `await h.check('中文验收标签', '布尔表达式')`。主进程状态可用 `h.check('标签', () => 布尔值)` 检查，严格要求结果为 `true`。完成关键状态后调用 `h.screenshot('文件名')`。

```js
await h.section('翻译词典');
await h.input('[aria-label="搜索 Tag 或译文"]', '验收译文');
await h.wait('document.querySelectorAll(".settings-table tbody tr").length > 0', '词典查询完成');
await h.check(
  '搜索译文仅显示匹配条目',
  '[...document.querySelectorAll(".settings-table tbody tr")].every(row => row.cells[2].textContent.includes("验收译文"))',
);
await h.screenshot('dictionary-search');
```

优先使用可访问名称和现有结构；确需稳定定位时，只给产品元素加不影响行为与外观的标记。不要在验收器里替换 React 状态、业务 IPC 或渲染器 API 来制造成功。仅测试夹具准备可直接使用数据库接口。

原生对话框的预定响应写入主进程 `doubles.selections` / `doubles.messages` 队列；未预定的调用直接失败。外部打开请求检查 `doubles.calls`。AI 使用 runner 启动的回环 HTTP 服务，可通过 `/control/success`、`/control/fail`、`/control/timeout` 切换响应；不会使用真实账户。更新检查仅在验收模式返回固定发布信息。除回环测试服务外的 HTTP 请求会被阻止并使隔离断言失败。

`h.key()` 派发 DOM 键盘事件，平台修饰键在快捷键场景中取 Ctrl/Cmd。需要浏览器默认行为的 Tab、Esc、Space，以及原生 range 和指针捕获，使用 Chromium CDP 输入管线；它们只作用于当前 `webContents`，不是操作系统鼠标键盘模拟。减少动态效果用 CDP 媒体仿真，系统主题用 `nativeTheme`，窗口状态用 `BrowserWindow`。`h.font()` 等待字体和布局完成后，用 `CSS.getPlatformFontsForNode` 检查实际绘制字体。

持久化检查放入后续进程阶段，并与前一阶段保存的期望值比较。必须保留整进程重启，不能用刷新页面代替。安全存储不可用时，用 `h.uncovered('相关检查', '本平台的具体原因')` 明确记录；普通失败不得改成未覆盖或静默跳过。

剪贴板使用 Electron 的真实接口，标准文本、HTML、RTF、书签、图片一起保存恢复；存在 Electron 无法完整恢复的私有格式时，脚本在任何写入前停止。不要与另一个使用剪贴板的验收实例同时运行。脚本不读取日常 Profile，结束后只删除自己创建的临时目录。

不能通过这些接口验证的原生标题栏拖动、窗口按钮实际色彩、原生文件选择器、操作系统级快捷键和读屏软件实际播报，列入任务报告的“自动化没覆盖”，不再生成手动验证文档。
