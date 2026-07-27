<div align="center">
  <img src="./public/app-icon.svg" width="88" height="88" alt="NovelAI Prompt Studio 图标">

  <h1>NovelAI Prompt Studio</h1>

  <p><strong>把 NovelAI 图片里的 Prompt，变成真正好用的可视化工作流。</strong></p>
  <p>本地优先的 NovelAI Diffusion V4 / V4.5 Prompt 编辑工作台与图片库。</p>

  <p>
    <a href="https://github.com/LBEILC/NovelAIPromptStudio/releases/latest"><img src="https://img.shields.io/github/v/release/LBEILC/NovelAIPromptStudio?display_name=tag&style=flat-square&label=Release" alt="最新版本"></a>
    <a href="https://github.com/LBEILC/NovelAIPromptStudio/actions/workflows/release.yml"><img src="https://img.shields.io/github/actions/workflow/status/LBEILC/NovelAIPromptStudio/release.yml?style=flat-square&label=Build" alt="构建状态"></a>
    <img src="https://img.shields.io/badge/Windows%20%7C%20macOS-supported-4f9cf9?style=flat-square" alt="支持 Windows 和 macOS">
    <img src="https://img.shields.io/badge/local--first-privacy-34c759?style=flat-square" alt="本地优先">
  </p>

  <p>
    <a href="https://github.com/LBEILC/NovelAIPromptStudio/releases/latest"><strong>下载最新版</strong></a>
    ·
    <a href="#近期更新">近期更新</a>
    ·
    <a href="#快速开始">快速开始</a>
    ·
    <a href="#参与开发">参与开发</a>
  </p>
</div>

---

## 近期更新

NovelAI Prompt Studio 的 `0.2` 系列把高频的多图处理和图库管理能力带进了桌面应用：

- **多标签工作台**：一次打开多张图片，独立保留每张图的 Prompt 草稿；关闭应用后可恢复标签顺序、当前标签和编辑进度。
- **文件、拖放与剪贴板统一入口**：从文件打开、一次拖入多张图片，或直接读取剪贴板；工作台只打开，图片库才执行持久导入。
- **更精确的 Prompt 复制**：主按钮复制当前筛选后可见的正向 Prompt，下拉菜单可复制全部、完整 Base 或指定 Character Prompt，始终排除 Undesired Content。
- **同 Prompt 图片自动分组**：完整 Prompt 相同、仅 Seed 等结果属性不同的图片会折叠成图片组，可逐张浏览并指定头图。
- **完整的图片库管理**：新增收藏、重命名、范围多选、批量操作和回收站；普通删除可恢复，永久删除前会明确提示影响。
- **更实用的图片操作**：工作台和图片库均可复制可见图片、下载保留原格式与 metadata 的原图，并在文件夹中定位文件。
- **应用内更新**：可在“设置 → 关于与更新”检查、下载并安装 GitHub Release，也可关闭启动时自动检查。
- **更顺手的桌面体验**：记住最近使用的图片目录，统一大图预览与中文工具栏，并补充常用键盘快捷键。

## 不再被一整段 Prompt 淹没

NovelAI Prompt Studio 可以直接读取图片中的生成信息，把 Base Prompt、Character Prompt 和 Undesired Content 拆解成清晰的 Tag。你可以按区域、分类和关键词筛选，调整权重与顺序，编辑原始文本，再一键复制需要的 Prompt。

![NovelAI Prompt Studio 工作台：解析、分类和编辑图片中的 Prompt](./doc/screenshots/workbench.png)

### 为 Prompt 编辑而设计

- **结构化拆解**：识别 Base / Character Prompt 与 Undesired Content，保留权重、顺序和原始语法。
- **多图并行处理**：用标签页在多张图片之间切换，每个标签独立保存草稿、来源与修改状态。
- **高效整理**：搜索、分类筛选、拖拽排序、多选操作、批量添加与删除，一屏处理上百个 Tag。
- **AI 辅助理解**：通过你自己的 OpenAI-compatible 服务翻译并分类 Tag，结果缓存在本地，可继续手动修正。
- **所见即所得地复制**：复制当前可见 Prompt、全部 Prompt、完整 Base Prompt，或单独复制某个 Character Prompt。
- **Vibe 信息可见**：只读解析图片内嵌的 Vibe 信息，并可定位导出的 Vibe 文件。
- **随时回到起点**：编辑草稿自动保留，也可以一键恢复到原图中的 Prompt。

## 让生成记录变成可检索的图片库

批量导入散落的生成图片或 NovelAI 导出 ZIP，按文件名、Tag 或译名搜索。相同完整 Prompt 的结果会自动组成图片组，既保留每一张生成结果，又避免图库被相似卡片淹没。

![NovelAI Prompt Studio 图片库：浏览、搜索和预览 NovelAI 生成图片](./doc/screenshots/gallery.png)

- 支持拖放、文件选择或剪贴板导入 `PNG`、`JPG`、`JPEG`、`WEBP`，图片库还支持批量导入 `ZIP`。
- 按内容识别重复图片，避免图库越整理越乱。
- 自动生成缩略图，提供网格浏览、排序、详情预览、组内切换和原始 Prompt 查看。
- 支持收藏、重命名、`Ctrl/Cmd` 增减选择、`Shift` 范围选择及批量收藏或删除。
- 删除先进入应用内回收站，可恢复、永久删除或主动清空；不会删除最初导入的源文件。
- 大图预览支持缩放、旋转、翻转、复制和下载；下载会保留原始格式与 NovelAI metadata。

## 键盘快捷键

| 快捷键 | 工作台 | 图片库 |
| --- | --- | --- |
| `Ctrl/Cmd + I` | 打开图片 | 导入图片 |
| `Ctrl/Cmd + V` | 从剪贴板打开图片 | 从剪贴板导入图片 |
| `Ctrl/Cmd + W` | 关闭当前标签 | — |
| `Ctrl/Cmd + Tab` | 切换到下一个标签 | — |
| `Ctrl/Cmd + Shift + Tab` | 切换到上一个标签 | — |
| `Ctrl/Cmd + K` | — | 聚焦搜索框 |

在文本输入框中，`Ctrl/Cmd + V` 仍然执行普通文本粘贴。

## 本地优先，原图优先

你的图片、Prompt、Tag 字典和设置都保存在本机。工作台以只读方式打开源图，不会覆盖图片，也不会改写原始 metadata；只有主动导入图片库时，应用才会保存独立副本与缩略图。

AI 功能完全可选。启用翻译或分类时，只有相关 Tag 文本会发送到你配置的 OpenAI-compatible API；API Key 通过操作系统安全存储加密，前端页面无法读取明文。

## 快速开始

1. 前往 [Releases](https://github.com/LBEILC/NovelAIPromptStudio/releases/latest) 下载适合系统的安装包。
2. 启动应用，将一张 NovelAI 图片拖入工作台。
3. 筛选、翻译、分类或调整 Tag，然后点击 **复制 Prompt**。

| 平台 | 安装包 |
| --- | --- |
| Windows x64 | `NovelAI Prompt Studio-Setup-*-x64.exe` |
| macOS Apple Silicon | `NovelAI-Prompt-Studio-*-arm64.dmg` |
| macOS Intel | `NovelAI-Prompt-Studio-*-x64.dmg` |

> [!NOTE]
> 当前安装包尚未进行代码签名，Windows 或 macOS 可能显示安全提示。请只从本仓库的 Releases 页面下载。

如果图片不包含可识别的 NovelAI metadata，仍可在应用中查看图片，但不会自动获得完整的 Prompt 信息。应用主要面向 NovelAI Diffusion V4 / V4.5 图片。

## 你可能关心

<details>
<summary><strong>会修改我的原图吗？</strong></summary>

不会。工作台只读取源图；图片库保存的是独立副本。从图片库移除项目也不会删除原始文件。
</details>

<details>
<summary><strong>必须配置 AI 服务才能使用吗？</strong></summary>

不需要。Prompt 解析、筛选、编辑、复制和图片库都可以独立使用。AI 服务仅用于可选的 Tag 翻译与分类。
</details>

<details>
<summary><strong>为什么从剪贴板打开后没有 Prompt？</strong></summary>

应用会优先读取剪贴板中的原始本地图片文件，以保留 metadata；但网页“复制图片”、截图工具和许多位图复制操作通常只提供像素，NovelAI Prompt metadata 已经丢失。这类图片仍可正常打开或导入。
</details>

<details>
<summary><strong>数据保存在哪里？</strong></summary>

数据写入 Electron 的系统 `userData` 目录。数据库位于 `data/studio.sqlite`，图片库副本和缩略图位于 `assets/`。资源库位置可在设置中迁移。
</details>

<details>
<summary><strong>这是 NovelAI 官方应用吗？</strong></summary>

不是。本项目是面向 NovelAI 工作流的第三方工具，与 NovelAI 或 Anlatan 没有隶属或背书关系。
</details>

## 参与开发

需要 [Node.js 22](https://nodejs.org/) 及 npm。

开始修改前，请先阅读[项目文档索引](./doc/README.md)和[项目协作约束](./AGENTS.md)。

```bash
git clone https://github.com/LBEILC/NovelAIPromptStudio.git
cd NovelAIPromptStudio
npm ci
npm run dev
```

常用命令：

```bash
npm test          # 运行测试
npm run build     # 构建前端
npm run package   # 生成当前平台安装包
```

Windows 与 macOS 是一等支持平台，并尽量保持 Linux 兼容。提交改动前请运行测试和生产构建；涉及窗口、快捷键、文件对话框、安全存储或打包的改动，还需要在对应操作系统上验证。

欢迎通过 [Issues](https://github.com/LBEILC/NovelAIPromptStudio/issues) 反馈问题或提出建议。

---

<div align="center">
  <sub>让 Prompt 回到创作流程里，而不是困在 metadata 里。</sub>
</div>
