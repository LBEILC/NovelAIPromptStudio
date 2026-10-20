# NovelAI Prompt Studio

本地优先的 NovelAI 图片与 Prompt 管理桌面应用：把生成的图片拖进工作台，恢复、整理、翻译、分类并复制 Prompt Tag，也可以存进本地图片库。

技术栈：Electron + React + Vite + TypeScript，数据库用 `node:sqlite`，测试用 vitest。Windows 和 macOS 都是一等平台。

如果本机有 `doc/roles/` 目录（内部协作文档，不在公开仓库），开工前按你被告知的角色去读 `doc/roles/README.md` 和对应的角色文档；没被告知角色时先问用户。

## 共同规则

- 和用户交流用中文。代码注释的语言跟随所在文件已有的风格。
- 只 `git add` 具体文件，不用 `git add -A` / `git add .`。提交时在命令末尾列出路径：`git commit -m "…" -- <文件1> <文件2>`。提交信息用中文写一句话。
- 不在项目目录里执行 `git clean -x` / `git clean -X`：本机可能有被忽略但需要保留的文件。
- 界面不使用 `@lobehub/ui`，颜色、字号、间距、圆角、动效只从 `design/tokens.css` 取；它是设计令牌的唯一来源，不复制、不另起一套变量。
- 开发和测试不碰用户日常使用的图库数据。需要真实数据时用独立的演示环境（`--profile=demo`，见 `doc/demo-profile.md`）或临时目录。
- 调用外部程序时，参数用数组传，不拼 shell 命令字符串。
- `node_modules/`、构建产物、`.codex-runs/`、日志都不进 git。新增依赖优先选发布超过 7 天的版本。
- 不使用任何真实用户的 Prompt、图片或文件名作为测试数据（仓库是公开的）。

## Platform support

NovelAI Prompt Studio is a cross-platform desktop application. Windows and macOS are both first-class development and release targets. Keep Linux compatibility where practical.

- Do not introduce platform-specific shell syntax into shared npm scripts.
- Use Node.js or cross-platform CLI arguments for shared automation.
- Treat filesystem paths, keyboard modifiers, window chrome, secure storage, and packaging as platform-sensitive code.
- Run `npm ci`, `npm test`, and `npm run build` only when the task makes explicit code changes, including source code, test code, shared scripts, build configuration, or dependency manifests. Do not run these commands for documentation-only changes, content or media asset changes, or other read-only/non-code operations.

## Application verification

Interactive behavior is verified by automated acceptance scripts, not by manual checklists. See `doc/automated-acceptance.md`.

- The acceptance harness launches the real application (built, not the dev server) in an isolated temporary profile with demo data, drives it from Electron's main process, and asserts the result of every step: DOM-level actions through `webContents.executeJavaScript`, Electron APIs for windows, menus and native theme, and the Chrome DevTools Protocol for emulation and font checks.
- Every check has a readable label and a single boolean assertion; a failed check fails the command. Checks cover user-visible flows (final state only), data safety (delete, recycle bin, backup, migration), command and Agent permission boundaries, and that the packaged app starts. Visual details — hover and pressed states, focus rings, transitions and animation timing, pixel layout — are not asserted: the interactive prototype is the reference, and they are reviewed against it from the screenshots taken in each run.
- During a change, run only the affected categories locally; the full suite runs in CI on push.
- The harness runs in CI on Windows and macOS. A packaged-app check launches the unsigned packaged build and verifies that it starts, opens the database and renders with the bundled fonts.
- Never touch the user's real data directory. Never simulate OS-level mouse or keyboard input, and do not use computer use, unless the user explicitly asks for it in the current task.
- What automation cannot cover (dragging the window by its title bar, native file dialogs, native window button colors, OS-level shortcuts outside the app window) is listed in the task report. Problems found by users are handled through GitHub issues.
- Code changes still run the applicable non-GUI checks: format, typecheck, unit tests, production build.

## Delivery

After completing a code change, run the relevant tests and production build, then commit with a focused message. Never force-push.
