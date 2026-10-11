# NovelAI V5 界面与接口调研

调研日期：2026-10-11。范围：任务 002；只读调查，不执行生成、编码参考图、增强、放大、变体或导演工具转换。

## 摘要

V5 Full 的 High/Medium 两种 Effort 对应不同参数面板；Medium 固定 14 步、Euler Ancestral，不能编辑 UC 或 Rescale。【界面实测】`08-advanced-expanded.jpg`、`09-medium.jpg`；【官方文档】[Effort][effort]。
V5 保留独立角色提示词和位置控制，官方上限为 22 个角色。【界面实测】`15-character-added.jpg`、`17-position-grid.jpg`；【官方文档】[多角色][characters]。
当前 V5 主面板未提供 Vibe Transfer、Precise Reference；切换 V4.5 后出现。【界面实测】`01-v5-initial.jpg`、`10-v45.jpg`。
公开接口有 ZIP、JSON 和 SSE 返回形式；真实图片元数据不能逐字段原样充当请求体。【官方文档】[API schema][api]；字段差异见 D。
V5 的 Opus 免 Anlas 生成另受 usage 限制。【官方文档】[FAQ][faq]。
全程未提交收费操作，开始与结束时页面 Anlas 余额：一致。【界面实测】本次浏览器观察；不记录余额数字。

## 未查到的内容

- 新账号或清空偏好后的全部默认值；本次已有浏览器保存值不能当作默认值。
- 自定义尺寸的服务端最大边长、最大面积及所有组合约束；输入框只暴露最小值和步长。
- V5 的独立「变体」入口、参数及收费规则；生成结果工具栏没有实际生成样本供核验。
- D 表标为「未查到」的内部元数据字段、V5 hint 整数枚举、模型哈希算法、签名格式、`quality_boost` 与前端质量预设的映射。
- PAT 的细粒度权限范围、有效期；具体并发数、每分钟限额、完整 Anlas 公式。
- 官方 Tag 服务底层词库来源、V5 补全实时响应形状；公开 schema 的 `tags` 类型存在疑点。
- 一小时前历史图片的可重复点击次数：新建调研标签页没有该历史，不生成样本、不读取用户其他标签页。
- V5 Curated 全部控件是否与 Full 相同、各工具实际生成效果。本文不以文档或可见入口代替执行验证。

## 证据与读取约定

【界面实测】浏览器访问 `https://novelai.net/image`。先检查 Desktop 内置浏览器，未登录；随后通过 Edge 的 extension 后端新开 agent 标签页，沿用已有登录，不认领用户标签页。界面为中英混合，主检查对象是 V5 完整版 High，另对照 V5 Full Medium 和 V4.5 完整版。截图均在仓库 `.codex-runs/novelai-v5/`，不进入 Git。

【界面实测】页面存在名为 Better NovelAI 的非官方扩展区。其翻译、批量生成、权重按钮和设置不计入 NovelAI 官方控件清单（截图中可见该扩展）。本文的点击数按官方控件计算。证据：`01-v5-initial.jpg`、`10-v45.jpg`。

表中的「观察值」只表示本次进入页面或打开控件时的状态。「默认未查到」表示未通过新账号或官方说明确认出厂值；按钮、入口的默认值记作不适用。范围来自控件的 DOM 属性时，会明确指出，不能据此保证服务端接受该范围的所有组合。

## A. V5 下的界面清单

### A1. 主生成页

以下每行的截图是该控件的定位证据；数值范围还结合了同一控件的 DOM 读取。无文字图标保留「无文字」说明，不虚构原文名称。

| 面板 | 原文名称／控件 | 类型、选项或范围 | 默认／观察值 | 来源 |
|---|---|---|---|---|
| 顶栏 | 上传图片图标（无文字） | 按钮；打开文件选择，随后出现图片用途／元数据对话框 | 不适用 | 【界面实测】`01-v5-initial.jpg`、`20-import-metadata.jpg` |
| 顶栏 | Anlas | 余额显示，无输入 | 不记录个人值 | 【界面实测】`01-v5-initial.jpg` |
| 顶栏 | 菜单 | 按钮；可到导演工具、分词器、使用文档等 | 不适用；账号子项不展开核验 | 【界面实测】生成页菜单观察；`01-v5-initial.jpg` 定位菜单入口 |
| 模型 | 选择模型 | 下拉；顺序见 A2 | 默认未查到；观察为 V5 完整版 | 【界面实测】`02-models.jpg` |
| 模式 | 动漫 / Furry | 模式切换按钮 | 默认未查到；观察为动漫 | 【界面实测】`01-v5-initial.jpg`；【官方文档】[模型][models] |
| Effort | Medium / High | 两个互斥按钮；仅 V5 Full 及其 inpainting 提供 Medium | 默认未查到；观察为 High | 【界面实测】`01-v5-initial.jpg`、`09-medium.jpg`；【官方文档】[Effort][effort] |
| 提示词 | 提示词 | 多行富文本输入；语法与长度见 B | 默认未查到；已有保存文本，不复制进本文 | 【界面实测】`01-v5-initial.jpg` |
| 提示词 | 右上两个无文字图标 | 按钮；截图可定位，图标各自完整行为未实测 | 不适用 | 【界面实测】`01-v5-initial.jpg`；相关 Random Prompt、Chunks 见 B |
| 提示词 | 输入区底部容量条 | token 占用指示；不是精确数字读数 | 随文本变化 | 【界面实测】`03-quality.jpg`；【官方文档】[Basics][basics] |
| 提示词 | 透明背景 | 开关按钮 | 默认未查到；未切换 | 【界面实测】`03-quality.jpg` |
| 提示词 | Quality Tags / 品质预设 | 下拉：Standard、Light、None | 文档称默认启用，但未明确当前默认是哪档；观察为 None | 【界面实测】`03-quality.jpg`；【官方文档】[质量 Tag][quality] |
| 负面提示词 | 负面提示词 | 多行输入，旁有无文字图标按钮（完整行为未查到） | 默认未查到；High 显示，Medium 隐藏 | 【界面实测】`04-uc.jpg`、`09-medium.jpg` |
| 负面提示词 | UC Preset / 负面提示词预设 | Heavy、Light、Furry Focus、Human Focus、None | 默认未查到；观察为 None | 【界面实测】`04-uc.jpg` |
| 角色提示词 | + | 按钮；展开 Female、Male、其他选项 | 无角色为本次初始状态；默认未查到 | 【界面实测】`14-character.jpg` |
| 角色卡 | 角色名 | 文本输入 | 新增角色可命名；名称默认未查到 | 【界面实测】`15-character-added.jpg` |
| 角色卡 | 启用勾选、上移、下移、删除、折叠图标 | 复选框与按钮 | 新增卡启用；列表边界限制移动 | 【界面实测】`15-character-added.jpg` |
| 角色卡 | 提示词 / 负面提示词 | 页签及各自多行编辑器 | Female 新卡带 `girl,`；其他类型未逐项创建 | 【界面实测】`15-character-added.jpg` |
| 角色位置 | AI 选择 / 自定义、位置图标 | 模式切换；自定义进入位置画布 | 新角色观察为 AI 选择 | 【界面实测】`16-character-position.jpg` |
| 位置画布 | 角色圆点、Show Grid、Finish Editing Positions | 自由位置操作区、网格开关、完成按钮 | 实测打开，未拖动圆点；坐标范围由公开请求结构补充，见 D | 【界面实测】`17-position-grid.jpg` |
| 参考图像 | 图生图 | 图片入口；加载后出现预览、Inpaint、其他图标、删除 | 未加载时无参考图 | 【界面实测】`01-v5-initial.jpg`、`20-import-metadata.jpg`、`22-inpaint.jpg` |
| 图生图 | Strength | 数值框＋滑块，DOM 0.01–0.99，步长 0.01 | 加载演示图时为 0.7；出厂默认未查到 | 【界面实测】加载流程，`20-import-metadata.jpg` 定位；【官方文档】[Strength & Noise][strength] |
| 图生图 | Noise | 数值框＋滑块，DOM 0–0.99，步长 0.01 | 加载时为 0；出厂默认未查到 | 【界面实测】同上；截图未完整覆盖这两个滑块，范围来自 DOM |
| 图像设置 | 宽 / 高 | 数值框；DOM 最小 64、步长 64，无 max 属性 | 观察为 832×1216；最大值未查到 | 【界面实测】`05-size-categories.jpg`，预设补充见 C |
| 图像设置 | 交换宽度和高度 | × 按钮 | 不适用 | 【界面实测】`05-size-categories.jpg` |
| 图像设置 | 选择分辨率类别 | Normal、Large、Wallpaper、Small、自定义 | 默认未查到；观察为 Normal | 【界面实测】`05-size-categories.jpg` |
| 图像设置 | 横向、竖向、方形（无文字图标） | 三个预设按钮；Wallpaper 方形禁用 | 不适用 | 【界面实测】`05-size-categories.jpg`，C 的逐项 DOM 读取 |
| 图像设置 | 图片数量 | 1、2、3、4 按钮 | 默认未查到；观察为 1 | 【界面实测】`07-advanced.jpg` |
| AI Settings | reset settings、折叠图标 | 按钮；未触发重置 | 不适用 | 【界面实测】`07-advanced.jpg` |
| AI Settings | 步数 | 数值框＋滑块，DOM 1–50，步长 1 | 观察为 28；官方 FAQ 当前默认为 23；两者不等同 | 【界面实测】`07-advanced.jpg`；【官方文档】[FAQ][faq] |
| AI Settings | Prompt Guidance | 数值框＋滑块，DOM 0–10，步长 0.1 | 默认未查到；观察为 5 | 【界面实测】`07-advanced.jpg` |
| AI Settings | 种子 / Enter a seed | 数值输入；Clear 清空；DOM 未给 min/max | 默认未查到；输入固定数和清空均已验证并恢复 | 【界面实测】`07-advanced.jpg` 定位；【官方文档】[Seed][seed] |
| AI Settings | 选择采样器 | 下拉，六项见下一段 | 默认未查到；观察为 Euler Ancestral | 【界面实测】`06-samplers.jpg` |
| AI Settings | Advanced Settings | 展开按钮 | 不适用 | 【界面实测】`07-advanced.jpg`、`08-advanced-expanded.jpg` |
| Advanced Settings | Prompt Guidance Rescale | 数值框＋滑块，DOM 0–1，步长 0.02 | 默认未查到；观察为 0.3 | 【界面实测】`08-advanced-expanded.jpg` |
| 底部 | 生成 N 张图片 … Anlas | 提交按钮，文字含张数及本次费用 | 动态值；未点击 | 【界面实测】`07-advanced.jpg` |
| 中央空状态 | 快速开始／快速入门图库、图片缩略图 | 示例图片入口，可复制提示词；未点击示例 | 不适用 | 【界面实测】`01-v5-initial.jpg` |
| 右侧 | 历史记录 / 收起历史记录 | 历史侧栏开关；本次会话无生成历史 | 不适用 | 【界面实测】`01-v5-initial.jpg`；有结果时的控件见 C |

【界面实测】采样器顺序：Euler Ancestral、Euler、DPM++ 2S Ancestral、DPM++ 2M SDE、DPM++ 2M、DPM++ SDE。证据：`06-samplers.jpg`。

### A2. 模型下拉顺序

【界面实测】`02-models.jpg`，自上而下：V5 精选版、V5 完整版、V4.5 精选版、V4.5 完整版、V4 精选版、V4 完整版、动漫 V3、兽人 V3。官方模型文档页首仍写六个模型，但该页正文和实测列表已包含 V5；这里按当前下拉记录。[官方模型页][models]。

### A3. V5 与 V4.5 差异

| 项目 | V5 Full High | V5 Full Medium | V4.5 Full | 来源 |
|---|---|---|---|---|
| Effort | High / Medium | 同左 | 无此组 | 【界面实测】`01-v5-initial.jpg`、`09-medium.jpg`、`10-v45.jpg` |
| UC 编辑与预设 | 有 | 隐藏 | 有；同五档名称 | 【界面实测】`04-uc.jpg`、`09-medium.jpg`、`12-v45-uc.jpg` |
| 质量预设 | Standard / Light / None | 同组质量设置 | Standard / None | 【界面实测】`03-quality.jpg`、`09-medium.jpg`、`11-v45-quality.jpg` |
| 步数／采样器 | 1–50／六项 | 隐藏；固定 14／Euler Ancestral | 本次范围与六项列表相同 | 【界面实测】`06-samplers.jpg`、`09-medium.jpg`、`10-v45.jpg`；【官方文档】[Effort][effort] |
| Guidance / Rescale | 0–10 / 0–1 | Guidance 可调，Rescale 隐藏 | 0–10 / 0–1 | 【界面实测】`08-advanced-expanded.jpg`、`09-medium.jpg`、`10-v45.jpg` |
| 透明背景 | 有 | 有 | 未显示 | 【界面实测】`03-quality.jpg`、`09-medium.jpg`、`11-v45-quality.jpg` |
| Vibe / Precise Reference | 未提供主面板入口 | 未提供 | 两项出现 | 【界面实测】`01-v5-initial.jpg`、`09-medium.jpg`、`10-v45.jpg` |
| Variety+ | 未显示 | 未显示 | 开关 | 【界面实测】`08-advanced-expanded.jpg`、`10-v45.jpg` |
| Noise Schedule | 未显示 | 未显示 | karras (recommended)、exponential、polyexponential | 【界面实测】`13-v45-noise.jpg` |
| 角色数／位置 | 最多 22，自由位置 | 官方未单列另一上限 | 最多 6，5×5 网格 | 【官方文档】[多角色][characters]；【界面实测】`17-position-grid.jpg` |

【界面实测】切换模型后会显示各模型已保存的数值，所以没有把不同 Guidance、Seed 等观察值解释成模型默认值变化。证据：`08-advanced-expanded.jpg`、`10-v45.jpg`。

### A4. 图片导入与局部重绘子界面

| 界面 | 控件原文与类型 | 选项／观察状态／限制 | 来源 |
|---|---|---|---|
| 图片用途对话框 | 图生图、Vibe Transfer、Precise Reference | 三个按钮；V5 时也能在通用对话框看到，不代表模型支持后两项 | 【界面实测】`20-import-metadata.jpg` |
| 元数据导入 | 提示词、负面提示词、Characters、设置、种子 | 复选框，本次均勾选；Append、Clean Imports 未勾选 | 【界面实测】`20-import-metadata.jpg` |
| 元数据导入 | Import Metadata、× | 导入／关闭按钮；未点击导入，避免覆盖已有文本 | 【界面实测】`20-import-metadata.jpg` |
| Inpaint 画布 | Pen Size、Square Brush | 数值／滑块 4–50 步长 1，观察为 4；方笔刷未选 | 【界面实测】`22-inpaint.jpg` 及 DOM |
| Inpaint 画布 | 画笔、橡皮、填充、Focused Area Selection、调色板、清空、调整尺寸、撤销、重做、图层图标 | 工具按钮；未绘画、未执行清空或尺寸变更 | 【界面实测】`22-inpaint.jpg`、`23-focused-inpaint.jpg` |
| Focused Area Selection | Minimum Context Area | 滑块 32–96，步长 8；观察为 96 | 【界面实测】`23-focused-inpaint.jpg` 及 DOM |
| Inpaint 画布 | Download Canvas as PNG、Save & Close、× | 下载、保存返回、关闭；本次用 × 退出 | 【界面实测】`22-inpaint.jpg` |

## B. Prompt 相关

### B1. 写法、长度与显示

【官方文档】V5 支持 Tag 与自然语言组合；Tag 通常用小写、逗号分隔，句子可描述关系、动作、构图。V5 扩展了日语等多语言提示词支持。资料未要求固定段落模板，也未把 V3 的「越靠前权重越高」规则推广为 V5 的保证。[Tagging][tags]、[V5 发布说明][launch]、[模型][models]。

【官方文档】模型页列出的 base prompt 有效 token 上限约为 V5 Full 1471、V5 Curated 703；V4.5 约 512 T5 tokens（base 与角色合计）。资料未给出可据此计算 V5 的 22 个角色总长度的完整规则。[模型][models]、[多角色][characters]。

【界面实测】原生输入区使用底部容量条提示占用；本次未看到常驻的精确 token 数字。菜单有分词器入口，未进入账号设置。`03-quality.jpg` 定位输入区；【官方文档】[Basics][basics]。

【官方文档】Random Prompt 会填入一组标签，可以重抽或还原此前提示词；Prompt Chunks 用于保存和插入片段。本次未创建、删除或持久化任何片段，两个图标与完整弹层的逐一映射未实测。[Tagging][tags]、[Prompt Chunks][chunks]。

### B2. 权重与角色

【官方文档】V5 支持 `{文字}` 加强、`[文字]` 减弱：每层分别乘 1.05、除以 1.05；支持 V4 起的 `数字::文字::` 数值强调。V4.5 起可用负数强调，目标是移除概念或向相反概念偏移，不能把负数简单理解成较低的正权重。本文未验证出图效果。[Strengthening & Weakening][weight]。

【界面实测】在原生 Prompt 输入区将一个已有数值权重的首位改动后，页面文本发生对应变化；随后撤销并核对恢复。全程停在生成按钮之前。编辑入口证据：`01-v5-initial.jpg`。

【官方文档】V5 最多 22 个角色，V4/V4.5 最多 6 个；角色正、负提示词独立，V5 可自由放置角色，V4.5 使用 5×5 位置网格。[多角色][characters]。

【界面实测】点击 +、Female 后出现角色卡；「AI 选择」切为「自定义」后可进入圆点定位画布，有 Show Grid 和 Finish Editing Positions。检查后删除本次新建的空角色。`14-character.jpg`–`17-position-grid.jpg`。实际拖动坐标与位置对成图的影响未验证。

### B3. UC 与质量 Tag

【界面实测】V5 High 的 UC 档位为 Heavy、Light、Furry Focus、Human Focus、None。Medium 不显示 UC 编辑和预设。`04-uc.jpg`、`09-medium.jpg`。每档展开的完整隐藏 Tag 列表没有抓取，不凭档名补全。

【官方文档】质量预设会在提示词末尾隐式添加 Tag，编辑器中不展开，但仍占用长度：V5 Light 为 `very aesthetic, amazing quality, no text`，Standard 为 `very aesthetic, masterpiece, no text`；None 不追加。V4.5 Full 额外含 `location`。文档说默认启用，未确认本次版本初始选择 Light 还是 Standard。[质量 Tag][quality]。

### B4. 漫画、文字与补全

【官方文档】V5 发布说明展示用自然语言描述漫画分格、角色和文字，结合角色位置完成单图多格。未查到 `Panel 1:` 是强制、特殊解析或独立 API 语法的说明；不能把自然语言示例写成协议。[V5 发布说明][launch]。

【官方文档】文字可用 `text` 与相应语言标签提示，`Text:` 段应放在 base prompt 最后；多段文字用空行分开，位置、字体等可用自然语言说明。V5 网页可为引用文字准备 Text 段，手动写 Text 段时可自行控制。[Text Rendering][text]、[V5 发布说明][launch]。

【官方文档】Text Rendering 页给出的上限是 V5 Full 750 字符、Curated 374 字符、V4/V4.5 118 字符，含空格换行。英文 Models 页却把 V5 文字长度称作 tokens；两页单位冲突，本报告保留冲突，文字功能按专页记录，不声称服务端已验证边界。[文字专页][text]、[模型页][models]。

【官方文档】Tag 补全依据当前输入给出已知 Tag，圆点透明度表示模型对该 Tag 的熟悉程度。接口按模型、输入片段、语言查询，详见 D。官方词库的原始来源未查到；页面上 Better NovelAI 的 DSO 离线翻译提示不是官方补全数据来源的证据。[Tagging][tags]、[API schema][api]。本次未抓取鉴权头或实时补全响应。

## C. 功能、尺寸与计费

### C1. 功能支持及入口

| 功能 | V5 状态、入口与参数 | 证据及验证边界 |
|---|---|---|
| Vibe Transfer | 当前 V5 主参考面板无入口；V4.5 有。参数是参考图、Information Extracted、Reference Strength，可多图 | 【界面实测】`10-v45.jpg`；【官方文档】[Vibe][vibe]、[发布说明][launch]。没有编码或新增 Vibe |
| 角色／精确参考 | Precise Reference 文档当前限定 V4.5；类型有 character、style、character & style，Strength、Fidelity 滑块通常 0–1，文档也说明可键入负值。与 Vibe 不兼容 | 【官方文档】[Precise Reference][precise]；【界面实测】`10-v45.jpg`。V5 通用上传弹窗出现按钮不算支持证据 |
| 图生图 | 支持；上传图→图生图。Strength、Noise，继承主生成参数 | 【界面实测】`20-import-metadata.jpg`、`22-inpaint.jpg`，已加载仓库演示图后移除；【官方文档】[Image2Image][img2img]、[Strength & Noise][strength] |
| 局部重绘 | V5 Full 支持；图生图预览的 Inpaint 打开画布。遮罩、笔刷、Focused Area、上下文区域等见 A4 | 【界面实测】`22-inpaint.jpg`、`23-focused-inpaint.jpg`；【官方文档】[Inpaint][inpaint]。发布时 Curated 借用 V4.5 inpainting，未实测当前 Curated 分支 |
| 导演工具 | 菜单→导演工具→加载图；工具本身无 V5 模型选择，属于输入图像处理，不能表述为每项都由 V5 推理 | 【界面实测】`18-pixel-snap-controls.jpg`、`24-colorize-defry.jpg`、`25-emotion.jpg`；【官方文档】[Director Tools][director]。仅查看，从未 Transform |
| 放大 | 图像结果的 Upscale；官方说明输出面积为原图四倍。API 另提供 blur 参数，不能等同于前端必有该滑块 | 【官方文档】[Upscale][upscale]、[API schema][api]。V5 输出的实际放大未执行 |
| 增强 | Enhance 会再次按 Prompt 处理；Magnitude 可展开为 Strength、Noise，另有 Upscale Amount；V5 新增 Max✨ | 【官方文档】[Enhance][enhance]、[发布说明][launch]。结果页参数范围／初始值未实测 |
| 变体 | V5 专门按钮、数量、扰动参数和计费未查到；不把换 Seed、图生图或 Enhance 自动称为同一功能 | 【推断】仅说明术语边界；现有截图与 [Enhance][enhance] 均不能证明独立 V5 Variations 接口 |
| 历史记录 | 当前页右侧；选择缩略图、导入设置／Seed、删除、ZIP 下载、固定图像用于比较；无跨会话持久历史保证 | 【官方文档】[History][history]；【界面实测】`01-v5-initial.jpg`，本次新页无生成历史 |

### C2. 导演工具子项

【界面实测】工具名称来自本次导演工具页面，未执行转换。截图只保存不含账户区域的裁剪；部分完整面板因浏览器截图异常未留存，以下参数也以官方说明交叉核对。[Director Tools][director]。

| 原文 | 入口后的输入／选项 | 默认值与范围 | 来源 |
|---|---|---|---|
| Remove BG | 输入图像；生成结果可有 Masked、Generated、Blend | 结果未生成；默认不适用 | 【官方文档】[Director Tools][director]；【界面实测】`18-pixel-snap-controls.jpg` 中工具栏 |
| Line Art | 输入图像→Transform | 额外参数未查到 | 【官方文档】[Director Tools][director]；【界面实测】`18-pixel-snap-controls.jpg` |
| Sketch | 输入图像→Transform | 额外参数未查到 | 【官方文档】[Director Tools][director]；【界面实测】`18-pixel-snap-controls.jpg` |
| Colorize | 输入图、Prompt (Optional)、Defry | Defry 按钮 0–5，观察为 0；出厂默认未查到 | 【界面实测】`24-colorize-defry.jpg`；【官方文档】[Director Tools][director] |
| Emotion | 情绪下拉、强度减／加 | 观察为 Neutral、Normal；强度全部档位未查到 | 【界面实测】`25-emotion.jpg`；【官方文档】[Director Tools][director] |
| Declutter | 输入图像→Transform | 额外参数未查到 | 【官方文档】[Director Tools][director] |
| Pixel Snap | Palettize、Avoid Over Refining、Upscale | Palettize：Off / Auto / 自定义；另两项复选框；完整默认组合未查到 | 【界面实测】`18-pixel-snap-controls.jpg` 和对应页面 DOM |

【界面实测】Emotion 下拉共 24 项：Neutral、Happy、Sad、Angry、Scared、Surprised、Tired、Excited、Nervous、Thinking、Confused、Shy、Disgusted、Smug、Bored、Laughing、Irritated、Aroused、Embarrassed、Worried、Love、Determined、Hurt、Playful。`25-emotion.jpg` 定位下拉，列表由展开后的 DOM 读取；完整展开截图未留存。

### C3. 尺寸

【界面实测】从 `05-size-categories.jpg` 中的类别下拉和三个方向按钮逐项切换，读取宽高输入框；本次得到以下尺寸（宽×高）。逐项值另保存在本地 `size-observations.json`；截图展示入口，未为每个尺寸保存一张截图。

| 类别 | 横向 | 竖向 | 方形 |
|---|---|---|---|
| Normal | 1216×832 | 832×1216 | 1024×1024 |
| Large | 1536×1024 | 1024×1536 | 1472×1472 |
| Wallpaper | 1920×1088 | 1088×1920 | 按钮禁用 |
| Small | 768×512 | 512×768 | 640×640 |

【界面实测】自定义宽高输入的 `min=64`、`step=64`，无 `max` 属性；最大边长和最大面积未查到，没有靠实际生成探测限制。最终恢复到检查前的 832×1216。`05-size-categories.jpg` 定位输入框。

【第三方开源项目】caru-ini 的 SDK 把宽高限制在 64–1600，但网页 Wallpaper 含 1920，故该 SDK 校验不能作为官方当前上限。[SDK 参数定义][sdk-api]。

### C4. 费用与免费条件

【官方文档】Anlas 费用与尺寸、步数、张数、处理类型等有关。Opus 通常要求一次 1 张、最多 1024×1024 等面积、最多 28 步，图生图不在普通免费条件内。订阅页正文出现「at least Normal Sized」措辞，但同页额度说明及 FAQ 以「up to」界定；这里保留这一文案差异，不将前者解释成尺寸下限。[订阅][subscription]、[FAQ][faq]、[Image2Image][img2img]。

【官方文档】V5 免费生成另有 usage 电池限制，V4.5 及之前模型不受该新增限制影响。额度恢复和可生成数量会随官方规则及参数改变，不能称 V5 无限制免费；Medium 在默认条件下比 High 23 步约少用 42% usage。[FAQ][faq]、[Effort][effort]。完整 Anlas 计算公式、每种组合的价格未查到。

【官方文档】Vibe 图首次编码消耗 2 Anlas，改变 Information Extracted 需重新编码；缓存 `.naiv4vibe` 可复用编码。最多 16 个 Vibe，超过 4 个后每个额外参考增加 2 Anlas。Precise Reference 每个参考额外 5 Anlas。这些是相应支持模型的费用，不证明 V5 已支持。[Vibe Transfer][vibe]、[Precise Reference][precise]。

【界面实测】生成按钮底部显示本次 N 张的 Anlas 数；尺寸、图生图状态变化后数字会更新。没有通过余额或此处数字推导未公开公式。开始、结束的页面余额核对结果：一致。`07-advanced.jpg` 显示费用位置；末次余额仅即时比较，不落具体数值。

## D. 接口

### D1. 地址、鉴权与持久令牌

【官方文档】生成请求为 `POST https://image.novelai.net/ai/generate-image`，流式版本为 `POST https://image.novelai.net/ai/generate-image-stream`。JSON 请求体，`Authorization` 使用 Bearer 持久令牌。根对象公开字段为 `action`、`input`、`model`、`parameters`、`url`；schema 没有逐一声明所有字段的 required 和默认值。[公开 API 文档][api-ui]、[schema][api]。

【官方文档】Persistent API Token 用于 API 集成，网页路径为账户设置的 Account 页→Get Persistent API Token。新建令牌会使旧令牌失效，关闭弹层后无法再次查看。公开文档没有说明可选择的细粒度 scopes、具体有效期，也没有证明它仅有图像生成权限。本次未访问令牌内容、未创建或删除令牌。[Account][account]。

【官方文档】公开 API 中 `POST /user/create-persistent-token` 要求用户 JWT，不能用已有 PAT 代替；已有令牌而未指定覆盖时可返回 409。这是资料记录，没有发起请求。[schema][api]。

### D2. V5 文生图请求结构（还原，未发送）

【推断】以下结构综合官方 `image.ImageGenerationRequest` / `image.RequestParameters` 和第三方 SDK 转换器还原，用于说明层级，并非抓包结果或可直接使用的完整兼容契约。根字段和嵌套类型来自 [官方 schema][api]；V5 模型名、`params_version: 4`、V5 继续使用 `v4_prompt` 来自 [SDK 模型常量][sdk-models]、[转换器][sdk-converter]。示例数字是说明用值，不是默认值。

```json
{
  "action": "generate",
  "input": "1girl, outdoors",
  "model": "nai-diffusion-5-full",
  "parameters": {
    "params_version": 4,
    "width": 832,
    "height": 1216,
    "steps": 23,
    "scale": 5,
    "sampler": "k_euler_ancestral",
    "seed": 123456,
    "n_samples": 1,
    "cfg_rescale": 0,
    "negative_prompt": "",
    "v4_prompt": {
      "caption": {
        "base_caption": "1girl, outdoors",
        "char_captions": []
      },
      "use_coords": false,
      "use_order": true
    },
    "v4_negative_prompt": {
      "caption": {
        "base_caption": "",
        "char_captions": []
      }
    }
  }
}
```

【官方文档】角色项结构为 `char_captions: [{char_caption: string, centers: [{x: number, y: number}]}]`；公开 schema 未声明坐标范围。[schema][api]。【第三方开源项目】SDK 将界面坐标转换为归一化中心点，并为 V5 支持自由坐标；这不能代替服务端边界验证。[转换器][sdk-converter]。

【推断】`input`、`parameters.prompt`、`v4_prompt.caption.base_caption` 的重叠字段不能仅凭名称决定优先级；示例采用 SDK 的 V5 结构，未证明任意省略／重复组合都被接受。Medium 的准确 API 模型标识和完整请求差异未查到，不用 High 示例代替 Medium。

### D3. 元数据参数逐项对照

表中「是」只说明公开通用 schema 存在同名 `parameters` 字段，不表示该参数对 V5 生效、必填或有 UI 入口。「未列」只说明 schema 和检查的 SDK 没有给出可核实的同名定义，不断言服务端一定拒绝它。标为未查到的范围／类型不按字段名称猜测。任务说明中的 52 个名称全部列出。

| 元数据名称 | 类型与范围 | 含义／V5 注意点 | 是否属于生成请求体；来源 |
|---|---|---|---|
| `cfg_rescale` | number；UI 0–1，步长 0.02 | 对应 Prompt Guidance Rescale；Medium 不可调 | 是。 【官方文档】[schema][api]；【界面实测】`08-advanced-expanded.jpg`、`09-medium.jpg` |
| `cfg_sched_eligibility` | 未查到 | 内部含义、默认值未查到 | 未列；【官方文档】[schema][api] 检索无定义 |
| `controlnet_model` | string；枚举未查到 | ControlNet 模型标识；不证明 V5 支持 ControlNet | 是。 【官方文档】[schema][api] |
| `controlnet_strength` | number；官方范围未列，SDK 为 0–1 | ControlNet 强度；V5 作用未查到 | 是。 【官方文档】[schema][api]；【第三方开源项目】[SDK][sdk-api] |
| `deliberate_euler_ancestral_bug` | boolean | 官方说明是兼容末步也添加 ancestral noise 的旧行为；schema 文本称默认 true，SDK 主动置 false | 是。 【官方文档】[schema][api]；【第三方开源项目】[转换器][sdk-converter]；V5 生效性未查到 |
| `director_reference_descriptions` | V4ConditionInput[] | 精确／角色参考描述；caption.base_caption。schema 列 character / character&style，当前功能文档还列 style | 是，但 V5 支持未确认。 【官方文档】[schema][api]、[Precise][precise] |
| `director_reference_information_extracted` | number[]，0–1 | 每张角色参考的信息提取值 | 是。 【官方文档】[schema][api]；V5 生效性未查到 |
| `director_reference_secondary_strengths` | 同名类型未查到；外部对应 number[]，0–1 | 【推断】元数据可能对应 Fidelity | 同名未列；外部为 `director_reference_secondary_strength_values`。依据【官方文档】[schema][api]，不能照抄元数据名 |
| `director_reference_strengths` | 同名类型未查到；外部对应 number[]，0–1 | 【推断】元数据可能对应参考强度 | 同名未列；外部为 `director_reference_strength_values`。依据【官方文档】[schema][api] |
| `dynamic_thresholding` | boolean | 动态阈值开关；V5 是否使用未查到 | 是。 【官方文档】[schema][api]；【第三方开源项目】[SDK][sdk-api] |
| `dynamic_thresholding_mimic_scale` | 未查到 | 含义、默认值未查到 | 未列；【官方文档】[schema][api] 检索无定义 |
| `dynamic_thresholding_percentile` | 未查到 | 含义、默认值未查到 | 未列；【官方文档】[schema][api] 检索无定义 |
| `explike_fine_detail` | 未查到 | 未查到 | 未列；【官方文档】[schema][api] 检索无定义 |
| `extra_passthrough_testing` | 未查到 | 不能根据 testing 名称当作正式公开参数 | 未列；【官方文档】[schema][api] 检索无定义 |
| `height` | integer；UI 最小 64、步长 64；服务端上限未查到 | 输出高度（像素） | 是。 【官方文档】[schema][api]；【界面实测】`05-size-categories.jpg` |
| `legacy_v3_extend` | boolean | 旧版本兼容开关的具体效果未查到；SDK 默认关闭 | 是。 【官方文档】[schema][api]；【第三方开源项目】[转换器][sdk-converter] |
| `lora_clip_weights` | 未查到 | 不能据名称推断 V5 提供用户 LoRA 上传能力 | 未列；【官方文档】[schema][api] 检索无定义 |
| `lora_unet_weights` | 未查到 | 未查到 | 未列；【官方文档】[schema][api] 检索无定义 |
| `minimize_sigma_inf` | 未查到 | 未查到 | 未列；【官方文档】[schema][api] 检索无定义 |
| `model_hash` | 未查到 | 【推断】可能是模型溯源元数据；算法和与 API model 的关系未查到 | 未列；依据【官方文档】[schema][api] 只有根 `model`，不把 hash 作为请求必填 |
| `model_name` | 未查到 | 【推断】可能是可读模型元数据；不能替代根 model 的 API 标识 | 同名未列；依据【官方文档】[schema][api]、【第三方开源项目】[模型常量][sdk-models] |
| `n_samples` | integer；UI 1–4，SDK 1–8；服务端完整限制未列 | 一次请求的图像张数 | 是。 【官方文档】[schema][api]；【界面实测】`07-advanced.jpg`；【第三方开源项目】[SDK][sdk-api] |
| `noise_schedule` | string；官方枚举未列 | V4.5 界面可选 karras/exponential/polyexponential；V5 未显示选择器 | 是，V5 有效值未查到。 【官方文档】[schema][api]；【界面实测】`13-v45-noise.jpg` |
| `prefer_brownian` | boolean | SDK 称 Brownian noise 偏好且标 inop；V5 实际行为未查到 | 是。 【官方文档】[schema][api]；【第三方开源项目】[SDK][sdk-api] |
| `prompt` | string；长度见 B | 文本提示词；与根 input、结构化 base_caption 的优先级未查到 | parameters 中存在；根字段名是 input。 【官方文档】[schema][api] |
| `quality_boost` | 未查到 | 不能直接认定为 Quality Tags、qualityToggle 或 Max✨；枚举／映射未查到 | 未列；【官方文档】[schema][api] 检索无定义 |
| `reference_information_extracted_multiple` | number[]；官方范围未列 | 各 Vibe 的信息提取值；编码接口的单值范围为 0–1 | 是。 【官方文档】[schema][api]、[Vibe][vibe]；不证明 V5 支持 |
| `reference_strength_multiple` | number[]；官方范围未列 | 各 Vibe 的参考强度 | 是。 【官方文档】[schema][api]、[Vibe][vibe]；不证明 V5 支持 |
| `request_type` | 同名类型／枚举未查到 | 【推断】可能记录执行类型，不能直接当作 API 参数 | 同名未列；生成根用 `action`，SDK 取 generate/img2img/infill；导演工具另用 `req_type`。依据【官方文档】[schema][api]、【第三方开源项目】[转换器][sdk-converter] |
| `sampler` | string；UI 六项；API 名如 `k_euler_ancestral` | 采样方法；Medium 固定 Euler Ancestral | 是。 【官方文档】[schema][api]、[Effort][effort]；【第三方开源项目】[SDK][sdk-user] |
| `scale` | number；UI 0–10，步长 0.1 | Prompt Guidance | 是。 【官方文档】[schema][api]；【界面实测】`07-advanced.jpg` |
| `seed` | integer；官方 schema 未列边界 | 随机种子；网页留空表示下次随机。接口省略／随机值规则未实测 | 是。 【官方文档】[schema][api]、[Seed][seed] |
| `signed_hash` | 未查到 | 【推断】名称像签名记录，但算法、签名对象、校验用途均未查到 | 未列；依据【官方文档】[schema][api] 的字段检索；不作为已知安全验证机制 |
| `skip_cfg_above_sigma` | number；官方范围未列 | 官方注释关联 Variety Boost；SDK 开启时用 58；V5 UI 未提供 Variety+ | 是。 【官方文档】[schema][api]；【第三方开源项目】[转换器][sdk-converter]；不能把 58 写成 V5 默认 |
| `skip_cfg_below_sigma` | 未查到 | 未查到 | 未列；【官方文档】[schema][api] 检索无定义 |
| `sm` | boolean | SMEA；SDK 标 inop；V5 UI 未提供 | 是。 【官方文档】[schema][api]；【第三方开源项目】[SDK][sdk-api] |
| `sm_dyn` | boolean | SMEA DYN；SDK 标 inop；V5 UI 未提供 | 是。 【官方文档】[schema][api]；【第三方开源项目】[SDK][sdk-api] |
| `steps` | 官方 number；SDK integer；UI 1–50，步长 1 | 采样步数；Medium 固定 14 | 是。 【官方文档】[schema][api]、[Effort][effort]；【界面实测】`07-advanced.jpg` |
| `straight_alpha` | boolean | 官方只给类型；SDK 称直通 alpha 通道。与透明背景 hint 的确切组合要求未查到 | 是。 【官方文档】[schema][api]；【第三方开源项目】[SDK][sdk-api] |
| `stream` | string：msgpack / sse | 流式协议选择；官方流接口说明重点为 SSE | 是。 【官方文档】[schema][api]；MsgPack 帧格式未查到 |
| `tag_hint_qt` | 官方 integer；SDK 错位为 boolean | 质量相关 hint 的枚举和作用未查到；不按 SDK 文案认定为透明图专用开关 | 是。 【官方文档】[schema][api]；【第三方开源项目】[SDK][sdk-api]，冲突保留 |
| `tag_hint_transparent_background` | boolean | 给模型的透明背景提示；官方注明服务端仅透传，不自行解释 | 是。 【官方文档】[schema][api]；不等于保证输出有有效 alpha |
| `tag_hint_uc_preset` | integer；枚举未查到 | UC 相关 hint；与五档 UI 的整数映射未查到 | 是。 【官方文档】[schema][api] |
| `uc` | 同名未列；对应 negative_prompt 为 string | 【推断】元数据负面文本对应 API negative_prompt 或 v4_negative_prompt 的 base_caption | 同名不在公开 parameters；SDK 高层角色对象另有 uc。依据【官方文档】[schema][api]、【第三方开源项目】[SDK][sdk-api] |
| `uncond_per_vibe` | 未查到 | 未查到 | 未列；【官方文档】[schema][api] 检索无定义 |
| `uncond_scale` | 未查到 | 未查到；不按名称等同 Guidance 或 UC 强度 | 未列；【官方文档】[schema][api] 检索无定义 |
| `upscale` | object：`{declared_blur_sigma: number}` | blur sigma 取整到 0、0.30、0.35、0.40、0.45、0.50；不是普通倍数值 | 是。 【官方文档】[schema][api]；与网页 Max✨ 的精确映射未查到 |
| `v4_negative_prompt` | V4ConditionInput object | caption 含 base_caption 和 char_captions，另可含 legacy_uc/use_coords/use_order；V5 仍沿用此名字 | 是。 【官方文档】[schema][api]；【第三方开源项目】[转换器][sdk-converter] |
| `v4_prompt` | V4ConditionInput object | 正面结构化提示词与角色中心点；不是仅 V4 才可用 | 是。 【官方文档】[schema][api]；【第三方开源项目】[转换器][sdk-converter] |
| `version` | 同名类型未查到；params_version 为 integer | 【推断】元数据版本可能对应参数协议版本，但不能保证相等 | 同名未列；SDK V5 请求用 params_version=4。依据【官方文档】[schema][api]、【第三方开源项目】[转换器][sdk-converter] |
| `width` | integer；UI 最小 64、步长 64；服务端上限未查到 | 输出宽度（像素） | 是。 【官方文档】[schema][api]；【界面实测】`05-size-categories.jpg` |
| `wonky_vibe_correlation` | 未查到 | 未查到 | 未列；【官方文档】[schema][api] 检索无定义 |

【推断】任务给出的八个「只在所检查 V5 图片出现」字段，是该批图片的观察差异，不能直接升级为所有 V5 请求的必填要求。已确认通用请求 schema 收录其中 `straight_alpha`、`tag_hint_qt`、`tag_hint_transparent_background`、`tag_hint_uc_preset`、`upscale`；`model_hash`、`model_name`、`quality_boost` 未收录。依据：[官方 schema][api] 与任务参数名单。

### D4. 返回格式、查询与错误

| 用途 | 方法与路径 | 公开返回结构／限制 | 来源 |
|---|---|---|---|
| 普通生成 | POST image.novelai.net/ai/generate-image | 默认支持 application/zip；Accept: application/json 时 201 返回 `{images:[{image:string,index:integer,seed:integer}]}`，image 是 base64；多张对应数组项或 ZIP 中多个图像 | 【官方文档】[schema][api]；【第三方开源项目】[客户端 ZIP 解包][sdk-client] |
| 流式生成 | POST image.novelai.net/ai/generate-image-stream | 200 text/event-stream，intermediate/final/error 类型；多图用样本索引区分，SDK 解析 samp_ix、step_ix、gen_id、sigma、image | 【官方文档】[schema][api]；【第三方开源项目】[流块类型][sdk-api]；未实际接收流 |
| 订阅与余额 | GET /user/subscription | tier、active、expiresAt、perks、trainingStepsLeft、usage；余额字段为 fixedTrainingStepsLeft 和 purchasedTrainingSteps，usage 含 isNegative、percent、timeUntilNextPercent | 【官方文档】[schema][api]；只记录 schema，不保存账号实际响应 |
| Tag 补全 | GET image.novelai.net/ai/generate-image/suggest-tags | query：model、prompt 必需；lang 可为 en/jp，默认 en；Tag 项有 tag:string、confidence:number、count:integer | 【官方文档】[schema][api] |

【官方文档】`usage.percent` 文档范围为 0–100+；`timeUntilNextPercent` 单位秒，含补充额度相关语义。它与 Anlas 余额是两套字段。[schema][api]。

【第三方开源项目】SDK 的订阅客户端使用 `https://image.novelai.net/user/subscription`，注释称旧 api 主机可能要求迁到 image 主机；而官方文档总介绍仍把订阅归于 primary API。本文没有抓取个人订阅响应去裁决当前网页调用哪一个主机，保留这一文档／客户端差异。[SDK 客户端][sdk-client]、[官方 API 总介绍][api-ui]。

【官方文档】TagSuggestionResponse 的 `tags` 在当前 schema 被写成单个 TagSuggestion 引用，而不是数组；【第三方开源项目】SDK 按 Tag 列表处理。实际 V5 响应形状未抓取确认，不把疑似 schema 错漏改写成实测结果。[schema][api]、[客户端][sdk-client]。

| 状态码／限制 | 含义与证据强度 |
|---|---|
| 401 | 未授权；生成端官方明确列出。【官方文档】[schema][api] |
| 500 | 服务端错误；可提供 x-correlation-id 辅助报告，schema 描述其为六位字母数字。【官方文档】[schema][api] |
| 400 | SDK 按无效请求处理，具体参数错误由响应文本给出。【第三方开源项目】[客户端][sdk-client] |
| 402 | SDK 按额度不足或需订阅处理，不能等同于所有 402 都是余额归零。【第三方开源项目】[客户端][sdk-client] |
| 409 | SDK 按冲突处理；创建 PAT 的官方接口也定义令牌已存在这一情形，不能套用于所有生成冲突。【第三方开源项目】[客户端][sdk-client]；【官方文档】[schema][api] |
| 429 | SDK 按频率限制处理；具体 RPM、并发上限、Retry-After 行为未查到。【第三方开源项目】[客户端][sdk-client] |
| 其他 5xx | SDK 按服务端异常处理，完整服务端错误表未查到。【第三方开源项目】[客户端][sdk-client] |
| 并发／频率 | 未查到官方固定数字；未做负载探测。API 使用限制原文见 E。【官方文档】[生成端说明][api] |

### D5. 开源客户端维护情况

【第三方开源项目】下表记录公开仓库状态，日期均为 UTC；「最近提交」指调研时默认分支最新提交的 commit 时间，`pushed_at` 是仓库推送时间，二者不可互换。不以未归档证明积极维护，也不把 README 宣称支持等同于真实调用成功。

| 项目 | 最近提交／推送 | V5 状态与局限 | 来源 |
|---|---|---|---|
| caru-ini/novelai-sdk（Python） | 默认分支 2026-09-05 10:34:20；仓库 pushed_at 2026-10-05 16:52:13；未归档 | 模型常量、参数版本、转换器已含 V5 Full/Curated；近期开源客户端证据。存在 tag_hint_qt 类型与尺寸校验差异，未运行收费测试 | [仓库][sdk-repo]、[提交 72964b1](https://github.com/caru-ini/novelai-sdk/commit/72964b123edb23c082cbef4153d3d3960e33a07d)、[GitHub 元数据](https://api.github.com/repos/caru-ini/novelai-sdk) |
| bedovyy/ComfyUI_NAIDGenerator（ComfyUI 节点） | 默认分支 2026-08-21 06:27:04；未归档 | README 列 V5，但同时声明未以真实 API 验证；是集成节点，不是通用 SDK | [仓库](https://github.com/bedovyy/ComfyUI_NAIDGenerator)、[提交 52da75a](https://github.com/bedovyy/ComfyUI_NAIDGenerator/commit/52da75a33fcb59d892c1b4bf7cbdc00bfd6458ae) |
| Aedial/novelai-api（Python） | 默认分支 2025-06-01 00:27:37；pushed_at 2025-06-01 00:33:42；未归档 | 本次未查到 V5 支持证据；近期维护不足，列作对照，不列为已验证 V5 库 | [仓库](https://github.com/Aedial/novelai-api)、[提交 f185520](https://github.com/Aedial/novelai-api/commit/f1855208050a611af61a39cc6384f444fa18ad54) |

## E. 条款原文摘录

本节只摘录，不判断项目的具体实现是否获准。引号内为短节选，省略号表示中间省略；应通过链接阅读完整上下文。服务条款页面标注生效日期为 2025-12-08。【官方文档】[Terms][terms]。

| 主题 | 原文节选 | 位置与来源 |
|---|---|---|
| 第三方 API 集成 | “request a user's Persistent API token for integration” | 官方 API 文档开头的集成说明。【官方文档】[API 总介绍][api-ui] |
| 自动化生成 | “all generation requests must be initiated by a human action” | POST /ai/generate-image 的 description。【官方文档】[API schema][api] |
| 自动系统与负载 | “automated systems … disrespect the limitations” | 9.1.6，完整条款还涉及 excessive strain。【官方文档】[Terms §9][terms] |
| PAT 替换 | “Generating a new Persistent API Token will invalidate your old one.” | Account 页的 Get Persistent API Token 段。【官方文档】[Account][account] |
| 第三方远程访问账号 | “Allow third parties to access the account remotely” | 5.3.2，位于 Restrictions 的 must not 清单。【官方文档】[Terms §5.3][terms] |
| 账号共享 | “use another person's account” | 8.1 的 may not 清单；完整条款同时涉及账号信息共享及授权管理员例外。【官方文档】[Terms §8.1][terms] |

【官方文档】未查到单独以「批量生成」为标题的许可条款，也未查到 PAT 细粒度权限政策；有关原文限于以上链接。本节不据这些摘录给出法律结论。

## F. 常见任务的步骤数

计数规则：从生成页已打开、目标控件可见开始；一次按钮点击记 1 次点击，选择／改写一段文本记 1 次输入，拖动记 1 次拖动，滚动次数不固定而单列。系统文件选择器的目录导航次数随文件位置变化，不计为固定网页点击数。实测与按已见控件推算的终点分开标注；所有生成按钮均未点击。

| 任务 | 路径与次数 | 实际走到哪里／来源 |
|---|---|---|
| 1. 导入图片全部设置 | 上传图标 1 次点击→系统选文件 1 次文件选择→用途／元数据对话框→确认五项勾选→Import Metadata 1 次点击；默认勾选与本次一致时为 **2 次网页点击＋1 次文件选择**，取消的项目每项另加 1 次点击 | 【界面实测】走到完整导入对话框，未提交 Import Metadata；【推断】最后一次点击与总数依据 `20-import-metadata.jpg` 的按钮及勾选状态。检查用仓库演示图；不读取日常图库 |
| 2. 只改一个 Tag 的权重 | 原生 Prompt 中定位并选中权重数字 **1 次选择操作＋1 次输入**，其余参数不变；若原 Tag 未有数字语法，则选中 Tag 后输入完整 `数值::Tag::`；滚动依位置而定 | 【界面实测】修改已有数值权重后撤销并确认恢复；停止在生成前。`01-v5-initial.jpg` 定位原生编辑区。没有使用扩展权重按钮 |
| 3. 固定 Seed | AI Settings 已展开时，Seed 输入 **1 次输入**；若折叠，先加 **1 次展开点击**。若已有目标结果，点击结果 Seed 是另一条路径 | 【界面实测】输入临时 Seed、核对后恢复；`07-advanced.jpg`。结果 Seed 快捷入口来自【官方文档】[Seed][seed]，本次没生成结果 |
| 3. 换 Seed | 已展开时 Clear **1 次点击**→字段为空，下次随机；或直接改写数字 **1 次输入**。折叠时先加 1 次展开 | 【界面实测】Clear 后字段为空，随后恢复原值，停在生成前；`07-advanced.jpg`。随机生成行为来自【官方文档】[Seed][seed] |
| 4. 新增角色并指定位置 | +→Female/Male/其他→将 AI 选择切为自定义→位置图标→拖角色圆点→Finish Editing Positions；**5 次点击＋1 次拖动**；角色描述另加 1 次输入，角色名可选另加 1 次输入 | 【界面实测】完成前 4 次点击到定位画布，随后退出并删除测试卡；【推断】拖动与完成后的总数依据 `14-character.jpg`–`17-position-grid.jpg` 和【官方文档】[多角色][characters]。未把未执行拖动写成实测成功 |
| 5. 加 Vibe 并调强度 | **V5 当前无可完成路径，次数不适用。** V4.5 对照：上传图标→选文件→Vibe Transfer→编码／参考面板→调整强度；到用途选择为 2 次网页点击＋1 次文件选择，之后涉及编码费用，完整次数未查到 | 【界面实测】`10-v45.jpg`、`20-import-metadata.jpg`；【官方文档】[Vibe][vibe]。未点击 Vibe、未编码、未触动已有参考 |
| 6. 找一小时前历史图 | 同一未刷新会话：历史栏隐藏时展开 1 次＋按数量滚动若干次＋点击目标缩略图 1 次；已显示则少 1 次。不能给固定滚动次数；刷新／离开后该会话历史不可依赖 | 【官方文档】[History][history]；【界面实测】`01-v5-initial.jpg` 仅证实本次空历史面板。没有一小时前样本，完整查找实测未完成，不声称有按时间搜索 |

【官方文档】历史快捷操作另有：Control+Click 导入除 Seed 外设置，Shift+Click 导入 Seed，Control+Shift+Click 导入两者；图生图源图不会随普通复制设置一并恢复。本次未在用户历史中执行这些操作。[History][history]。

## 截图索引

目录：`.codex-runs/novelai-v5/`。所有截图均为本次界面观察，没有通过生成制造样本。`21-img2img.jpg` 实际只截到 Prompt/AI Settings，因此索引如实命名内容，不用它证明参考图滑块。`qa-contact.jpg` 是本地校对联系表，不是独立 UI 证据。

| 文件名 | 内容 | 对应章节 |
|---|---|---|
| `01-v5-initial.jpg` | V5 主生成页、初始面板及空历史 | A、B、C、F |
| `02-models.jpg` | 模型列表顺序 | A2 |
| `03-quality.jpg` | V5 质量预设、透明背景 | A、B |
| `04-uc.jpg` | V5 UC 五档 | A、B |
| `05-size-categories.jpg` | 尺寸类别和输入／方向控件 | A、C |
| `06-samplers.jpg` | 六种采样器 | A、D |
| `07-advanced.jpg` | AI Settings、Seed、生成费用位置 | A、C、D、F |
| `08-advanced-expanded.jpg` | V5 展开高级设置、Rescale | A、D |
| `09-medium.jpg` | Medium 面板变化 | A、B、D |
| `10-v45.jpg` | V4.5 参考图及高级参数 | A、C、F |
| `11-v45-quality.jpg` | V4.5 质量预设 | A3 |
| `12-v45-uc.jpg` | V4.5 UC 档位 | A3 |
| `13-v45-noise.jpg` | V4.5 Noise Schedule | A3、D |
| `14-character.jpg` | 添加角色菜单 | A、B、F |
| `15-character-added.jpg` | 角色卡及工具按钮 | A、B、F |
| `16-character-position.jpg` | 自定义位置入口 | A、B、F |
| `17-position-grid.jpg` | 自由位置画布 | A、B、F |
| `18-pixel-snap-controls.jpg` | Pixel Snap 局部选项及部分工具栏 | C2 |
| `20-import-metadata.jpg` | 上传后的用途和元数据勾选对话框 | A、C、F |
| `21-img2img.jpg` | Prompt 与 AI Settings 局部，未含图生图滑块 | A 定位补充 |
| `22-inpaint.jpg` | 演示图局部重绘画布 | A4、C |
| `23-focused-inpaint.jpg` | Focused Area Selection | A4、C |
| `24-colorize-defry.jpg` | Colorize 的 Defry 0–5 | C2 |
| `25-emotion.jpg` | Emotion、Neutral、Normal 及加减按钮 | C2 |
| `qa-contact.jpg` | 上述 24 张截图的视觉检查联系表 | 交付核对 |

## 来源链接

所有链接读取日期均为 2026-10-11。API 字段表以公开 schema 当日版本为准，固定提交链接用于保留第三方源码证据。

[api]: https://image.novelai.net/docs/doc.json
[api-ui]: https://image.novelai.net/docs/index.html
[models]: https://docs.novelai.net/en/image/models/
[effort]: https://docs.novelai.net/en/image/effort/
[characters]: https://docs.novelai.net/en/image/multiplecharacters/
[quality]: https://docs.novelai.net/en/image/qualitytags/
[tags]: https://docs.novelai.net/en/image/tags/
[weight]: https://docs.novelai.net/en/image/strengthening-weakening/
[basics]: https://docs.novelai.net/en/image/basics/
[chunks]: https://docs.novelai.net/en/image/promptchunks/
[text]: https://docs.novelai.net/en/image/textrendering/
[seed]: https://docs.novelai.net/en/image/seed/
[vibe]: https://docs.novelai.net/en/image/vibetransfer/
[precise]: https://docs.novelai.net/en/image/precisereference/
[img2img]: https://docs.novelai.net/en/image/controltools/
[strength]: https://docs.novelai.net/en/image/strengthnoise/
[inpaint]: https://docs.novelai.net/en/image/inpaint/
[director]: https://docs.novelai.net/en/image/directortools/
[upscale]: https://docs.novelai.net/en/image/upscale/
[enhance]: https://docs.novelai.net/en/image/enhance/
[history]: https://docs.novelai.net/en/image/history/
[faq]: https://docs.novelai.net/en/faq/
[subscription]: https://docs.novelai.net/en/subscription/
[account]: https://docs.novelai.net/en/text/usersettings/account/
[terms]: https://novelai.net/terms
[launch]: https://journal.novelai.net/image-generation-novelai-diffusion-v5-is-here-c2df7c6b8d2d/
[sdk-repo]: https://github.com/caru-ini/novelai-sdk
[sdk-api]: https://github.com/caru-ini/novelai-sdk/blob/72964b123edb23c082cbef4153d3d3960e33a07d/src/novelai/types/api/image.py
[sdk-user]: https://github.com/caru-ini/novelai-sdk/blob/72964b123edb23c082cbef4153d3d3960e33a07d/src/novelai/types/user/image.py
[sdk-client]: https://github.com/caru-ini/novelai-sdk/blob/72964b123edb23c082cbef4153d3d3960e33a07d/src/novelai/_api/client.py
[sdk-models]: https://github.com/caru-ini/novelai-sdk/blob/72964b123edb23c082cbef4153d3d3960e33a07d/src/novelai/constants/models.py
[sdk-converter]: https://github.com/caru-ini/novelai-sdk/blob/72964b123edb23c082cbef4153d3d3960e33a07d/src/novelai/_utils/converter.py
