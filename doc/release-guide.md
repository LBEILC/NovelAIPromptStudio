# 发版指南

本文说明 NovelAI Prompt Studio 当前的正式发版流程。仓库通过 [GitHub Actions](../.github/workflows/release.yml) 在 Windows 和 macOS runner 上构建安装包，并在版本标签推送后创建 GitHub Release。

## 一句话流程

先把准备发布的代码提交到 `main`，更新 `package.json` 与 `package-lock.json` 中的版本号，完成测试和构建，再创建一个包含完整更新说明的 annotated tag 并推送。推送 `v*` 标签后，GitHub Actions 会自动打包和发布。

## 发版前检查

1. 确认准备发布的功能和修复已经提交。
2. 确认工作区没有不应进入本次版本的改动：

   ```bash
   git status --short --branch
   ```

3. 查看上个版本以来的提交，作为更新说明的依据：

   ```bash
   git tag --sort=-version:refname --list "v*"
   git log <上一个标签>..HEAD --oneline
   ```

4. 根据变更范围选择版本号：

   - `patch`：兼容性修复，例如 `0.2.1` → `0.2.2`。
   - `minor`：向后兼容的新功能，例如 `0.2.1` → `0.3.0`。
   - `major`：包含明显不兼容变化，例如 `0.2.1` → `1.0.0`。

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

窗口行为、快捷键、文件对话框、安全存储、安装和更新等平台相关功能，需要在相应操作系统上实际验证。无法在另一平台完成的检查按 [跨平台协作说明](../coordination/README.md)记录。

## 3. 提交并推送版本准备

只暂存本次发版所需文件，避免把无关的本地改动一起提交：

```bash
git add package.json package-lock.json
git commit -m "chore: prepare v0.3.0 release"
git push origin main
```

如果发版本身修改了工作流、文档或打包配置，也应明确加入同一个提交或单独提交后先推送 `main`。

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
git push origin refs/tags/v0.3.0
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
git push origin refs/tags/v0.3.0
```

以上续行符是 POSIX shell 示例；PowerShell 可将命令写成一行，或使用反引号续行。更推荐方式 A，避免不同 shell 的转义差异。

推送前务必用 `git show` 检查标签指向的提交、版本号和说明内容。不要用 lightweight tag；本项目需要 annotated tag 承载完整 Release 说明。

## 6. Action 会做什么

推送 `v*` 标签后，[`Package and release`](../.github/workflows/release.yml) 会：

1. 在 Windows 和 macOS runner 上执行 `npm ci`、`npm test`。
2. 校验标签是否与 `package.json` 版本一致。
3. 构建 Windows x64 安装程序。
4. 在 macOS Intel runner 上同时构建 Intel 与 Apple Silicon 的 DMG、ZIP 和更新元数据。
5. 汇总产物并生成 `SHA256SUMS.txt`。
6. checkout 完整标签历史，读取 annotated tag 中的更新说明。
7. 创建 GitHub Release 并上传产物。

当前发布产物包括：

- Windows x64 NSIS 安装程序、blockmap 和 `latest.yml`。
- macOS Intel 与 Apple Silicon 的 DMG。
- macOS Intel 与 Apple Silicon 的 ZIP、blockmap 和 `latest-mac.yml`。
- 所有上传文件的 SHA-256 校验清单。

`workflow_dispatch` 可手动验证云端打包，但因为它不是标签事件，不会创建 GitHub Release。

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
5. 下载并启动至少一个当前平台安装包。
6. Release 正文的「下载指引」链接可正常访问；链接或正文有误时可用 `gh release edit --notes-file` 无损修正，但下次发版仍以 annotated tag 说明为准。
7. 检查 README 的“最新版”链接能进入新 Release。
8. 需要另一平台验证时，更新 `coordination/` 中对应记录。
