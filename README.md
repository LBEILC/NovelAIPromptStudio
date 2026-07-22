# NovelAI Prompt Studio

本地优先的 NovelAI Diffusion V4/V4.5 Tag 编辑工作台与图片库，支持 Windows 和 macOS。

当前已完成两阶段重构计划的第一阶段：

- 默认进入工作台；拖入单张 PNG、JPG 或 WEBP 后直接解析并编辑 Tag
- 工作台图片不会保存到图片库，也不会修改原图 metadata
- 支持 Base/Character Prompt、Undesired Content、Tag 权重、排序与复制
- 保留 AI Tag 翻译、分类、本地缓存和 OpenAI-compatible API 设置
- 从图片 metadata 只读解析 Vibe，并可复制编码；不提供强度编辑
- 图片库拖入仍执行持久导入；点击或右键图片会在工作台中打开
- 工作台与图片库是仅有的两个业务页面，设置保留为底部辅助入口

第二阶段将继续删除旧 Tag/Vibe 资源库、分支、系列、实验、关系和对比的底层代码与数据接口。现有用户图片和旧数据在迁移完成前不会被静默删除。

详细范围与验收标准见[工作台与图片库两阶段重构计划](./doc/two-page-workbench-gallery-refactor-plan.md)。视觉实现继续遵循[Lobe 视觉层级与颜色语义规范](./doc/lobe-visual-language.md)。

## 平台支持

Windows 和 macOS 是一等支持平台，并尽量保持 Linux 兼容。共享 npm 脚本不得依赖单一平台的 Shell 语法；窗口、快捷键、文件路径、拖放、文件对话框和安全存储按平台分别验证。

## 开发

```bash
npm ci
npm run dev
```

## 校验与构建

```bash
npm test
npm run build
```

应用数据写入 Electron 的 `userData` 目录。图片库数据库位于 `data/studio.sqlite`，持久导入的图片和缩略图位于 `assets/`。工作台直接读取源图片路径，不会把图片复制到 `assets/`。

AI 翻译配置支持 OpenAI-compatible Base URL。API Key 由 Electron 主进程通过操作系统安全存储加密，渲染页面无法读取明文。
