# NovelAI Prompt Studio

本地优先的 NovelAI 图片与 Prompt 管理桌面应用：把生成的图片拖进工作台，恢复、整理、翻译、分类并复制 Prompt Tag，也可以存进本地图片库。产品边界见 `doc/product-boundary.md`。

技术栈：Electron + React + Vite，测试用 vitest。Windows 和 macOS 都是一等平台。

项目正在做一次整体重构（类型检查、数据层、界面全部重新设计），阶段和进度见 `doc/rebuild-plan.md`。

## 角色

| 角色 | 负责什么 | 角色文档 |
|---|---|---|
| 设计负责人 | 方向与范围、产品结构与流程（UX）、视觉识别（VI）、界面与交互设计、设计令牌、界面文案、任务说明、验收 | `doc/roles/design.md` |
| 工程负责人 | 主进程、数据层、IPC、类型、构建与打包、按定稿实现界面与组件、测试、验收工具、修 bug | `doc/roles/engineering.md` |

开工前你会被告知自己的角色，然后去读对应的角色文档。不要因为自己是哪个模型就推断角色；没被告知时先问用户。

## 共同规则

- 和用户交流用中文。代码注释的语言跟随所在文件已有的风格。
- 只 `git add` 具体文件，不用 `git add -A` / `git add .`。提交时在命令末尾列出路径：`git commit -m "…" -- <文件1> <文件2>`；新文件先 `git add` 再这样提交。
- 提交信息用中文写一句话：工程提交加 `[工程]` 前缀，设计提交加 `[设计]` 前缀。
- 只做任务说明范围内的事，不做无关改动。新增依赖要在汇报里说明理由，并优先选发布超过 7 天的版本。
- **重构期间的界面约定**：新写或迁移后的界面不再使用 `@lobehub/ui`，颜色、字号、间距、圆角、动效只从 `design/tokens.css` 取。`.agents/skills/lobe-ui-frontend/` 和 `doc/lobe-visual-language.md` 只适用于还没迁移的旧界面；它们与 `doc/design.md`、`design/` 冲突时，以后者为准。
- 开发和测试不碰用户日常使用的图库数据。需要真实数据时用独立的演示环境（`--profile=demo`，见 `doc/demo-profile.md`）或临时目录。
- 调用外部程序时，参数用数组传，不拼 shell 命令字符串。
- `node_modules/`、构建产物、`.codex-runs/`、日志都不进 git。

## 文件归属

| 文件 | 归属 |
|---|---|
| `doc/design.md`、`doc/rebuild-plan.md`、`doc/product-boundary.md`、`doc/roles/`、`doc/specs/` | 设计 |
| `design/`（设计令牌、界面稿、图标源文件） | 设计 |
| 界面文案、应用图标与品牌素材、README 的产品介绍与截图取向 | 设计 |
| `src/`、`electron/`、`scripts/`、测试、`package.json`、构建与打包配置 | 工程 |
| `coordination/`、`doc/manual-verification-*.md`、`doc/release-guide.md` | 谁做的改动谁写 |

`design/tokens.css` 是设计令牌的唯一来源，产品代码直接引用它，不复制、不另起一套变量。

## 文档地图

- 重构计划：`doc/rebuild-plan.md`
- 产品边界：`doc/product-boundary.md`
- 设计文档：`doc/design.md`，设计令牌与界面稿在 `design/`（重构阶段 2 建立）
- 任务说明：`doc/specs/NNN-简述.md`，索引在 `doc/specs/README.md`
- 角色：`doc/roles/`
- 文档总索引：`doc/README.md`

## Platform support

NovelAI Prompt Studio is a cross-platform desktop application. Windows and macOS are both first-class development and release targets. Keep Linux compatibility where practical.

- Do not introduce platform-specific shell syntax into shared npm scripts.
- Use Node.js or cross-platform CLI arguments for shared automation.
- Treat filesystem paths, keyboard modifiers, window chrome, secure storage, and packaging as platform-sensitive code.
- Run `npm ci`, `npm test`, and `npm run build` only when the task makes explicit code changes, including source code, test code, shared scripts, build configuration, or dependency manifests. Do not run these commands for documentation-only changes, content or media asset changes, Skill/plugin installation, repository inspection, or other read-only/non-code operations.
- Startup, window behavior, shortcuts, file dialogs, and secure storage must be verified on the affected operating system when they change. Unless the user explicitly requests computer use, follow the manual verification workflow below.

## Application verification

**Interactive behavior is verified by automated acceptance scripts, not by the user (user decision, 2026-10-11).** Do not write new `doc/manual-verification-*.md` documents and do not ask the user to perform verification steps.

- The acceptance harness launches the real application (built, not the dev server) in an isolated temporary profile with demo data, drives it from Electron's main process, and asserts the result of every step. This follows the approach of the user's other project DispatchDock (`app/src/main/shots.ts`): DOM-level actions through `webContents.executeJavaScript` (clicks, input and keyboard events, scrolling), Electron APIs for windows, menus and native theme, and the Chrome DevTools Protocol for emulation (for example `prefers-reduced-motion`) and for checking the fonts actually used.
- Every check has a readable label and a single boolean assertion; a failed check fails the command. Screenshots are taken from the same run for visual review.
- The harness runs in CI on Windows and macOS. A packaged-app check launches the unsigned packaged build once and verifies that it starts, opens the database and renders with the bundled fonts.
- Never touch the user's real data directory. Never simulate OS-level mouse or keyboard input, and do not use computer use, unless the user explicitly asks for it in the current task.
- What automation cannot cover (for example dragging the window by its title bar, native file dialogs, the actual colors of native window buttons, OS-level shortcuts outside the app window) is listed in the task report under "not covered by automation". It is not turned into a manual checklist. Problems found by users are handled through GitHub issues.
- Code changes still run the applicable non-GUI checks: format, typecheck, unit tests, production build.

## Cross-platform handoff

Read `coordination/README.md` before platform-sensitive work. Check the file for the other operating system for pending requests:

- Windows Codex writes requests that require macOS to `coordination/MACOS.md`.
- macOS Codex writes requests that require Windows to `coordination/WINDOWS.md`.

Only add a handoff when the work genuinely requires the other platform. Include the commit, exact action, expected result, and observed result. Mark completed items in place so both environments retain the history.

**macOS interactive verification is suspended (user decision, 2026-10-11).** Nobody is currently available to run manual checks on macOS. Until this note is removed:

- Do not add new macOS handoffs to `coordination/MACOS.md`, and do not block work or releases on the pending ones.
- macOS is covered by GitHub CI on a macOS runner instead (`.github/workflows/ci.yml`). When a change is platform-sensitive, make sure CI exercises it on macOS as far as an automated run can, and state in the report what CI cannot cover.
- Windows interactive verification still follows the manual verification workflow above.
- macOS problems that reach users are handled through GitHub issues.

Keep `coordination/MACOS.md` and `coordination/WINDOWS.md` focused on current actionable requests. Before archiving a completed item, record its final status and observed result. Periodically move completed, superseded, or consolidated entries into `coordination/archive/` without deleting their history; archived entries are not active requests.

## Delivery workflow

After completing a code change:

1. Run the relevant tests and production build.
2. Commit the completed change with a focused message, following the commit rules in 共同规则 above.
3. Push the current branch to its configured remote. Exception: when working as 工程负责人 on a dispatched task, commit but do not push; 设计负责人 pushes after acceptance.

Never force-push. If the push is rejected or requires work from the other operating system, record an actionable handoff in `coordination/` and report the blocker.
