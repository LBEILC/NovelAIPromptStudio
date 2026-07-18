# NovelAI Prompt Studio

本地优先的 NovelAI Diffusion V4/V4.5 创作资产管理器。第一阶段包括：

- 批量图片导入、缩略图与本地素材库
- PNG NovelAI metadata 读取
- 结构化 Prompt Tag、数字权重、分类、翻译与备注
- OpenAI 兼容 API 配置、模型列表、连通测试与 AI 批量翻译
- 独立保存多个 Vibe Transfer 参考图和参数
- Prompt 版本快照与一键复制
- SQLite 本地数据库及全文字段搜索

## 平台支持

项目以 Windows 和 macOS 为一等支持平台，并尽量保持 Linux 兼容。共享的 npm 脚本和开发工具不得依赖某个系统独有的 Shell 语法；涉及窗口、快捷键、文件路径、安全存储或打包的改动，需要在对应系统上验证。

Windows 与 macOS 两端 Codex 需要协作时，使用 `coordination/` 目录进行交接。只有必须由另一平台执行或验证的事项才写入该目录。

## 开发

```bash
npm install
npm run dev
```

## 校验与构建

```bash
npm test
npm run build
```

应用数据写入 Electron 的 `userData` 目录，数据库文件为 `data/studio.sqlite`，图片和缩略图位于 `assets/`。原始导入文件不会被修改。

AI 翻译配置支持任意 OpenAI-compatible Base URL。API Key 由 Electron 主进程使用系统安全存储加密，渲染页面无法读取明文。外部服务必须使用 HTTPS；Ollama、LM Studio 等本地服务可使用 `localhost` HTTP 地址。
