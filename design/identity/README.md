# 视觉识别：括号里的图

用户 2026-10-11 在三套方案里选定了 B。三套的对比见 `source/board.png`。

**核心想法**：Prompt 的花括号里放着一张图。括号是文字，朱红的方块是图，也像盖在纸上的一方印。它由现有的 `{N}` 标志演变而来：保留花括号，去掉字母 N。

## 这里有什么

| 路径 | 内容 |
|---|---|
| `guidelines.pdf` | 13 页的规范手册：想法、标志、各种版本与最小尺寸、色底与错误用法、颜色、字体、应用、深色模式、对比度 |
| `logo/` | 标志的矢量文件。`master-*.svg` 是母版；`full-color`、`one-color-*` 是成品；`favicon-*` 和 `app-icon-512` 是小尺寸与应用图标 |
| `tokens/` | 由配色导出的颜色变量（`tokens.css`）、色卡页（`swatches.html`）和字体变量 |
| `fonts.md` | 三种字体的来源与授权 |
| `source/` | 生成这一切的源文件：简报、方案定义、配色、生成脚本 |

## 要点

- **标志**：花括号加实心方块。最小使用尺寸 20 像素；更小时使用加粗的 `master-symbol-small.svg`。
- **颜色**：朱砂 `#D4351C`，白纸 `#FBFBFA`，墨色 `#1C1C1C`。朱砂的明度居中，不适合做大面积的文字底色。
- **字体**：标题 Newsreader，正文 MiSans VF，Tag 与数字 IBM Plex Mono。Newsreader 和 IBM Plex Mono 没有中文字形，中文一律由 MiSans 承担。

## 和产品界面的关系

`tokens/tokens.css` 是工具按通用网页的 16 个角色导出的，**不是产品界面的设计令牌**。产品的令牌在 `design/tokens.css`（尚未建立），由设计负责人以这里的品牌色和字体为起点另行设计，包括表面层级、选中态、Tag 分类色等这里没有的内容。

## 已知的局限

- 生成工具的字库不含中文字体。三套方案对比时，中文覆盖是单独用 MiSans 验证的。
- 手册的 PDF 里，MiSans 是以轮廓形式嵌入的（工具报告的 `pdf-type3-font`），不影响阅读。
- 字标里写的是全名 "NovelAI Prompt Studio"，NovelAI 是第三方的商标。是否在字标里只写 "Prompt Studio"，待用户决定。

## 怎么重新生成

需要安装 `brand-identity` 技能和 `uv`。把 MiSans VF 放到 `design/brand/local-fonts/MiSansVF.ttf`（不进 git），在 `design/brand/` 下重建工作目录后运行 `source/` 里的两个脚本，再执行技能的 `build` 和 `kit`。MiSans 的授权不允许单独分发字体文件，所以仓库里不包含它。
