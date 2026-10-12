# 品牌标志

NovelAI Prompt Studio 的标志是一对花括号，中间一个实心方块：括号代表 Prompt，方块代表括号里的那张图。

## 文件

| 路径 | 内容 |
|---|---|
| `logo/master-symbol.svg` | 标志的母版。界面里的标题栏、关于页用它 |
| `logo/master-symbol-small.svg` | 加粗的小尺寸版本，小于 20 像素时用，应用图标也用它 |
| `logo/symbol-empty.svg` | 空状态用的变体：括号相同，中间是虚线方块，表示"括号里还没有图" |
| `logo/master-wordmark.svg`、`master-lockup-*.svg`、`master-primary.svg` | 字标，以及标志和字标的横排、竖排组合 |
| `logo/full-color*.svg`、`one-color-*.svg` | 全彩和单色的成品，各有浅色底和深色底的版本 |
| `logo/favicon-*.svg` | 16、32、48 像素的小图标 |
| `logo/app-icon.svg`、`app-icon-512.png` | 应用图标：朱砂色圆角方块，白色的括号和方块 |
| `fonts.md` | 三种字体的来源与授权 |

应用图标的源文件是仓库根目录的 `public/app-icon.svg`（这里的 `logo/app-icon.svg` 是同一份）。修改后运行 `npm run icons:generate`，会重新生成 `build/icons/` 下各平台各尺寸的图标。

## 要点

- **颜色**：朱砂 `#D4351C`，白纸 `#FBFBFA`，墨色 `#1C1C1C`。在界面里朱砂只用在很少的地方：标志里的方块、"当前这一张"的标记。
- **字体**：标题 Newsreader，界面和中文 MiSans，Tag 与数字 IBM Plex Mono。
- **界面里出现标志的地方一律引用这里的路径**，不用字体里的花括号去拼：两者的括号形状和间距不一样。
- 产品界面的设计令牌在 `design/tokens.css`。
