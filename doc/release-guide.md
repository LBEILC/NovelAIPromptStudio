# 发版指南

本文说明 NovelAI Prompt Studio 当前的正式发版流程。仓库通过 [GitHub Actions](../.github/workflows/release.yml) 在 Windows 和 macOS runner 上构建安装包，并在版本标签推送后创建 GitHub Release。

## 发布流程

先把准备发布的代码提交到 `main`，更新 `package.json` 与 `package-lock.json` 中的版本号，完成本机测试和构建，再创建包含完整更新说明的 annotated tag。版本号提交和标签一起推送：`git push origin main refs/tags/vX.Y.Z`。发版不等 CI；日常 CI 是推送后的检查，不阻止发版。标签触发的工作流直接打包和发布。

## 发版前检查

1. 确认准备发布的功能和修复已经提交。
2. 确认工作区没有不应进入本次版本的改动：

   ```bash
   git status --short --branch
   ```

3. GPLv3 发布必须让安装包接收者能从同一 Release 获得对应源代码。确认待发布标签包含完整源码、锁文件、构建与打包脚本；如果安装包加入内置数据或经转换生成的资源，还要提交其许可证、固定的上游版本和生成脚本。GitHub 自动生成的 `Source code (zip)` 与 `Source code (tar.gz)` 将作为当前发布方式的源码入口。打包后还要确认应用资源目录包含根许可证 `LICENSE`、历史/第三方授权目录 `LICENSES/`，以及 `LICENSES/DanbooruSearchOnline/README.md` 和 `LICENSES/DanbooruSearchOnline/LICENSE`。

   内置 DSO 词典还必须通过固定源数据校验：

   ```bash
   npm run dso:verify
   ```

4. 查看上个版本以来的提交，作为更新说明的依据：

   ```bash
   git tag --sort=-version:refname --list "v*"
   git log <上一个标签>..HEAD --oneline
   ```

5. 根据变更范围选择版本号：

   - `patch`：兼容性修复，例如 `0.2.1` → `0.2.2`。
   - `minor`：向后兼容的新功能，例如 `0.2.1` → `0.3.0`。
   - `major`：包含明显不兼容变化，例如 `0.2.1` → `1.0.0`。
   - **版本号的每一位都不超过 9**：`1.9.x` 之后发 `2.0.0`，`1.2.9` 之后发 `1.3.0`。GitHub 的 Release 列表遇到两位数的版本号可能排错：`v0.10.0` 曾一直排在 `v1.0.3` 前面，2026-10-20 删掉了那个 Release（标签保留）。

## 1. 更新版本号

使用 npm 同时修改 `package.json` 和 `package-lock.json`，但暂时不要让 npm 自动创建标签：

```bash
npm version patch --no-git-tag-version
```

新功能版本使用 `minor`，不兼容版本使用 `major`。也可以明确指定目标版本：

```bash
npm version 0.3.0 --no-git-tag-version
```

检查两个文件中的版本是否一致：

```bash
node scripts/verify-release-tag.mjs v0.3.0
git diff -- package.json package-lock.json
```

标签必须严格为 `v` 加版本号。比如包版本是 `0.3.0`，标签只能是 `v0.3.0`，否则 Action 会停止。

## 2. 验证待发布代码

至少运行：

```bash
npm ci
npm test
npm run build
```

Windows 上执行 `npm ci` 前先确认没有本地 `npm run dev` 开发服务器在运行：Vite 会锁定 `node_modules` 中的原生绑定文件，导致 `npm ci` 删除重装时报 `EPERM` 或 `ENOTEMPTY`。中断的 `npm ci` 可能留下半删除的 `node_modules`，停止占用进程后重试通常即可恢复。

涉及桌面打包、主进程、原生依赖或自动更新时，还应在受影响的平台运行：

```bash
npm run package
```

窗口行为、快捷键、文件对话框、安全存储、安装和更新等平台相关功能，由 CI 在 Windows 和 macOS 上的自动化验收覆盖（见[自动化验收](./automated-acceptance.md)）；自动化覆盖不到的写进发布说明的已知问题。

## 3. 提交版本准备

只暂存本次发版所需文件，避免把无关的本地改动一起提交：

```bash
git add package.json package-lock.json
git commit -m "[工程] 准备 v0.3.0 发版" -- package.json package-lock.json
```

如果发版本身修改了工作流、文档或打包配置，也应明确加入同一个提交或单独提交，最后与标签一起推送 `main`。不要等待 main 的 CI 或字体缓存预热。

## 4. 编写 Release 更新说明

当前工作流使用 `gh release create --notes-from-tag`，因此 GitHub Release 正文来自 annotated tag 的消息，而不是普通提交信息，也不是 GitHub 自动生成的提交列表。

推荐按以下结构编写：

```markdown
## 重点更新

- 面向用户描述最重要的新能力。
- 说明行为或工作流发生了什么变化。

## 体验与修复

- 描述已修复的问题和交互改进。

## 下载指引

| 你的系统 | 下载文件 |
|---|---|
| Windows 10/11 x64 | [NovelAI-Prompt-Studio-Setup-<版本>-x64.exe](https://github.com/LBEILC/NovelAIPromptStudio/releases/download/v<版本>/NovelAI-Prompt-Studio-Setup-<版本>-x64.exe) |
| macOS Intel | [NovelAI-Prompt-Studio-<版本>-x64.dmg](https://github.com/LBEILC/NovelAIPromptStudio/releases/download/v<版本>/NovelAI-Prompt-Studio-<版本>-x64.dmg) |
| macOS Apple Silicon（M 系列芯片） | [NovelAI-Prompt-Studio-<版本>-arm64.dmg](https://github.com/LBEILC/NovelAIPromptStudio/releases/download/v<版本>/NovelAI-Prompt-Studio-<版本>-arm64.dmg) |

- `.zip`、`.blockmap`、`latest.yml`、`latest-mac.yml` 是应用内自动更新使用的文件，一般无需手动下载。
- 不确定芯片类型时，macOS 点左上角  →「关于本机」查看。

## 下载提示

- 当前安装包尚未签名，系统可能显示安全警告。
- 请只从本仓库 Releases 页面下载。

完整提交记录：https://github.com/LBEILC/NovelAIPromptStudio/compare/v<上一版本>...v<本版本>
```

模板说明：

- 把 `<版本>` 替换为实际版本号（如 `0.5.0`），`<上一版本>` 替换为上一个标签。
- 文件名来自 `package.json` 的 `build.win.artifactName`（`NovelAI-Prompt-Studio-Setup-<版本>-x64.exe`）和 `build.mac.artifactName`（`NovelAI-Prompt-Studio-<版本>-x64.dmg` / `-arm64.dmg`），与 GitHub Release 资产名必须完全一致；若打包配置改了命名，同步更新本表。
- 固定链接格式为 `https://github.com/LBEILC/NovelAIPromptStudio/releases/download/v<版本>/<资产名>`，Release 创建后即可点击跳转下载。
- 更新说明编写原则：

- **面向用户、按模块组织**：新功能按功能模块分组描述，写清关键交互（快捷键、手势等），例如「按住 Ctrl/⌘ 滚动滚轮缩放缩略图」。功能细节应核对实际实现，不能只看提交标题——功能可能藏在标题不含「feat」的提交里（如图库卡片双击打开工作台位于指针交互重构提交中）。
- **修复只列已发布版本的问题**：「体验与修复」只收录修复上一已发布版本问题的提交。新版本开发过程中引入并随即修复的问题不列入——这类修复通常紧跟在对应功能或重构提交之后，或修复对象（如新引入的动画系统）在上一版本中并不存在。判断时可用 `git show <上一标签>:<文件>` 确认修复对象在上一版本中是否存在，避免把开发过程写成用户可见的修复。

## 5. 创建并推送版本标签

### 方式 A：从临时说明文件创建（推荐）

先在仓库外或未跟踪的临时文件中写好说明，然后执行：

```bash
git tag -a v0.3.0 --cleanup=verbatim -F release-notes-v0.3.0.md
git show v0.3.0 --no-patch
git push origin main refs/tags/v0.3.0
```

`--cleanup=verbatim` 会保留 Markdown 中以 `#` 开头的标题；省略它时，Git 可能把标题当作注释清掉。确认标签创建成功后删除临时说明文件，不要误提交到仓库。

### 方式 B：通过多个消息参数创建

说明较短时，可以直接传入多段消息：

```bash
git tag -a v0.3.0 \
  -m "## 重点更新" \
  -m "- 新增某项用户可见能力。" \
  -m "## 体验与修复" \
  -m "- 修复某项问题。"
git show v0.3.0 --no-patch
git push origin main refs/tags/v0.3.0
```

以上续行符是 POSIX shell 示例；PowerShell 可将命令写成一行，或使用反引号续行。更推荐方式 A，避免不同 shell 的转义差异。

推送前务必用 `git show` 检查标签指向的提交、版本号和说明内容。不要用 lightweight tag；本项目需要 annotated tag 承载完整 Release 说明。

## 6. Action 会做什么

推送 `v*` 标签后，[`Package and release`](../.github/workflows/release.yml) 会：

1. 三个 `package` 作业直接并行启动，分别构建 Windows x64、macOS Intel、macOS Apple Silicon。各自安装依赖、校验标签与版本一致，恢复字体缓存；未命中时下载并校验，再构建打包。
2. 每个打包作业保留原生模块检查、启动真实打包程序的轻量验收、包内字体检查和更新元数据检查，不重复执行类型和单元测试。
3. `release` 只等待三个打包作业成功，合并两个 macOS 架构的更新元数据，校验产物，加入可用的 `release-notes.json` 并生成 `SHA256SUMS.txt`。
4. checkout 完整标签历史，读取 annotated tag 中的更新说明；只有标签推送事件才创建 GitHub Release 并上传全部附件，不再额外上传一份合并产物到 Actions。

当前发布产物包括：

- Windows x64 NSIS 安装程序、blockmap 和 `latest.yml`。
- macOS Intel 与 Apple Silicon 的 DMG。
- macOS Intel 与 Apple Silicon 的 ZIP、blockmap 和 `latest-mac.yml`。
- 所有上传文件的 SHA-256 校验清单。
- GitHub 根据发布标签自动提供的完整源码 ZIP 与 TAR.GZ；它们必须和安装包指向同一标签。

`workflow_dispatch` 可手动验证云端打包，但因为它不是标签事件，不会创建 GitHub Release。

```sh
gh workflow run release.yml --ref <待验证分支>
```

### MiSans 缓存与标签

CI 和发版使用完全相同的缓存键（版本与 SHA-256）、`.local/fonts/MiSansVF.ttf` 路径以及 `enableCrossOsArchive: true`。根据 [GitHub 缓存作用域规则](https://docs.github.com/en/actions/reference/workflows-and-actions/dependency-caching)，标签运行可以回退读取默认分支 `main` 的缓存，不能读取其他功能分支或其他标签的缓存；相同键还必须匹配缓存版本（路径和压缩方式）。

缓存只用于加速，不是发布前提。CI 的每个作业和发版的每个打包作业都会独立恢复缓存，未命中就运行 `npm run fonts` 从官方来源下载，随后运行 `npm run fonts:check` 并保存已校验的缓存。可以同时推送 main 和标签，无需等待 main 的 CI 或预热字体缓存。

## macOS 签名与公证

工作流会读取以下 GitHub Actions Secrets：

- `MAC_CSC_LINK`
- `MAC_CSC_KEY_PASSWORD`
- `APPLE_ID`
- `APPLE_APP_SPECIFIC_PASSWORD`
- `APPLE_TEAM_ID`

未配置这些凭据时可以生成未签名安装包，但 macOS 会显示安全警告，并只在应用内检查新版本、引导用户前往官方 Release 手动更新。配置凭据后，需要启用 macOS 自动更新能力，并在真实 macOS 环境验证签名、公证、Gatekeeper 和更新安装。

## 失败处理

### 标签与版本号不一致

修改 `package.json` 和 `package-lock.json`，提交后创建新的正确标签。不要强制移动已经推送的标签。

### 测试或打包失败

先检查失败作业日志与 CI 的对应证据，偶发基础设施失败只重跑失败的作业：

```sh
gh run view <id> --log-failed
gh run rerun <id> --failed
```

GitHub 页面上的 “Re-run failed jobs” 等价。一个平台打包失败不必重跑另两个已成功的平台；下游发布只等待三个打包作业成功。日常 CI 保留 Windows/macOS 的格式、类型、单测和构建检查，以及 Windows 三分片界面验收；截图仅手动触发。日常 CI 失败需修复，但不作为发版门槛。没有加入失败自动重试。

在 `main` 修复问题、重新验证并递增 patch 版本，然后创建新标签。正式标签一旦推送，应保留历史，不要 force-push。

### 工作流 run 立即失败且没有任何 job

说明工作流文件解析失败，GitHub 无法加载定义。已知原因：`secrets` context 不允许出现在 `if:` 条件中（引用未配置 secret 的 `env:` 值也可能把空字符串传给工具，例如 electron-builder 会把「存在但为空」的 `CSC_LINK` 当作相对文件路径解析）。修复工作流后提交推送 `main`，递增 patch 版本并推送新标签；工作流文件的修改不会对已推送的旧标签生效。

### Release job 找不到 annotated tag

发布 job 必须使用 `actions/checkout` 且设置 `fetch-depth: 0`，否则 `--notes-from-tag` 无法读取本地标签。当前工作流已经包含这项配置。

### 标签已推送但 Release 没有创建

如果修复需要修改工作流，旧 workflow run 仍使用旧标签所指向的工作流文件，单纯重跑不会获得 `main` 上的新配置。应提交修复、递增 patch 版本并推送新标签。不要删除或覆盖已公开的旧标签。

### Release 已创建但内容或附件不完整

先确认 Release 是否已公开、仓库是否启用了 immutable releases，以及附件是否可安全补充。无法无损修复时，发布新的 patch 版本，并在新说明中注明替代关系。

## 发版完成后的核对

1. GitHub Actions 所有 job 成功。
2. Release 标题、正文和版本号正确。
3. Windows、macOS Intel、macOS Apple Silicon 产物均存在。
4. `SHA256SUMS.txt` 存在，且与下载的当前平台安装包实测校验一致。
5. Release 自动生成的 `Source code (zip)` 与 `Source code (tar.gz)` 可以下载，并对应本次发布标签。
6. 下载并启动至少一个当前平台安装包。
7. Release 正文的「下载指引」链接可正常访问；链接或正文有误时可用 `gh release edit --notes-file` 无损修正，但下次发版仍以 annotated tag 说明为准。
8. 检查 README 的“最新版”链接能进入新 Release。


## 结构化更新说明

发版前可添加 `release-notes/<版本号>.json`（例如 `release-notes/1.2.0.json`）。发布流程校验后将它作为 `release-notes.json` 附件上传；没有此文件时继续发布，应用退回显示 Release 的 Markdown 说明。

```json
{
  "schema": "nps-release-notes/1",
  "version": "1.2.0",
  "date": "2026-10-20",
  "items": [
    { "kind": "new", "area": "gen", "title": "生成图片", "detail": "可以在工作台生成图片。", "highlight": true, "icon": "image" }
  ]
}
```

`version` 必须与发布版本一致，格式为三段数字；`date` 是有效的 YYYY-MM-DD 日期。`items` 每项必填 `kind`（new / improved / fixed）、`area`（wb / lib / gen / agent / set / app）、`title` 和 `detail`。标题不超过 16 个字符；标题和说明均不能为空，不含换行或 HTML 尖括号。可选 `highlight` 为布尔值，最多两项为 true；可选 `icon` 为 restart / image / folder / calendar / translate / speed / shield / sparkle / palette / terminal。

本机校验：`node scripts/prepare-release-notes.mjs 1.2.0`。校验失败会退出并报告字段；未找到文件时明确提示使用 Markdown。
