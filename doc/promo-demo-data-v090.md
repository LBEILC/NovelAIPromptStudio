# v0.9 宣传演示数据规范

> 状态：批次 A 已完成（Windows 取图）
>
> 用途：README、Release 与项目介绍中的公开截图
>
> 适用版本：v0.9.x

## 1. 目标

建立一套与日常图片库隔离、可以重复取图的演示数据。它应在不泄露私人文件名、路径、服务地址或 API 信息的前提下，清楚展示工作台和图片库的真实能力。

演示数据必须来自有权公开使用的 NovelAI 图片。不得把其他生成器的图片伪装成 NovelAI 输出，也不得为了截图修改应用逻辑或伪造不存在的功能。

## 2. 数据集结构

建议准备 12 至 16 张风格连贯的图片，使用原创角色或无明确版权归属的原创场景。至少包含以下四组：

| 系列 | 建议文件名 | 数量 | 用途 |
| --- | --- | ---: | --- |
| 雨后候车亭 | `雨后候车亭-01.png` 至 `雨后候车亭-04.png` | 4 | 相同 Prompt、不同 Seed，演示完整 Prompt 分组和组内浏览 |
| 玻璃花房 | `玻璃花房-01.png` 至 `玻璃花房-04.png` | 4 | 相近 Base Prompt，演示相似 Prompt 分组与筛选 |
| 海边写生 | `海边写生-01.png` 至 `海边写生-03.png` | 3 | 横竖构图混合，演示图库密度和收藏集 |
| 夜间书店 | `夜间书店-01.png` 至 `夜间书店-03.png` | 3 | 不同主题色下的高对比图片，检查浅色与深色界面 |

如果实际素材不适合这些名称，可以替换场景名称，但应继续使用“短场景名 + 两位序号”的结构。正式截图中禁止出现 UUID、随机哈希、整段 Prompt、下载站自动文件名和包含用户名的路径。

### 2.1 共用角色与 Undesired Prompt

正式图片保存在 `demo/promo-v090/final/`。四个系列共用以下风格前缀；它来自用户指定参考图的 NovelAI 元数据，只影响整体画面风格：

```text
1.2::artist:shion(mirudakemann)::, 0.6::artist:ciloranko::, 0.7::artist:min (120716)::, 0.8::artist:kushima yu::, artist:na tarapisu153, 1::artist:yajuu::, 1::artist:ask (askzy)::, artists:ningen mame, rella, 2::artist:sincos::, artist:mikozin, konya karasue, 1.1::artist:kushima yu::, 1.4::artist:matsuura kento::, 1.5::artist:huang gua::, masterpiece, best quality, 2::flat color, pale color ::, -2::artist collaboration, realistic ::, year2025, very aesthetic, no text
```

四个系列使用同一名原创成年角色，使图库在缩小后仍具有明确的一致性。以下内容放入 NovelAI V4.5 的 Character Prompt：

```text
girl, 1girl, solo, original character, adult woman, long copper hair, side braid, teal eyes, navy ribbon hair ornament, gentle confident smile, light beige oversized knit cardigan, white pointed-collar shirt, narrow navy necktie, charcoal gray plaid pleated skirt, black leather shoulder bag
```

所有图片使用以下共用 Undesired Prompt：

```text
nsfw, lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, watermark, signature, text, artist collaboration, realistic, extra characters, duplicate person, bad anatomy, bad hands, extra fingers, missing fingers, extra limbs, malformed limbs, cropped face, border, frame, letterbox
```

为修正试生成中出现的构图偏差，`海边写生-01.png` 与 `海边写生-02.png` 额外排除 `white background, simple background, multiple girls, 2girls, second person, duplicate, self portrait, person depicted on canvas`；`夜间书店-02.png` 额外排除 `standing, umbrella`。雨后候车亭四张不使用这些例外，确保完整 Prompt 分组只因 Seed 不同。

角色是原创演示人物，不使用现有作品的角色名或服装标识。画师 Tag 只放在共用风格前缀，不放入 Character Prompt。若某次生成出现明显角色漂移，应重新生成，不要通过把版权角色 Tag 加回 Prompt 来修正。

正式批次统一使用 NovelAI Diffusion V4.5 Full、Euler Ancestral、Karras、28 Steps、Prompt Guidance 7.5 与 Prompt Guidance Rescale 0.26，每次请求只生成一张。

| 系列 | 正式 Seed |
| --- | --- |
| 雨后候车亭 | `42092101`、`42092102`、`42092103`、`42092104` |
| 玻璃花房 | `42092201`、`42092202`、`42092203`、`42092204` |
| 海边写生 | `42092321`、`42092322`、`42092303` |
| 夜间书店 | `42092401`、`42092412`、`42092403` |

### 2.2 雨后候车亭：完整 Prompt 图片组

文件名：

- `雨后候车亭-01.png`
- `雨后候车亭-02.png`
- `雨后候车亭-03.png`
- `雨后候车亭-04.png`

四张图片必须使用完全相同的 Base Prompt、Character Prompt、模型、Vibe 状态和画幅，只改变 Seed。这样可以稳定演示“完整 Prompt”分组和组内浏览。

共用风格前缀之后追加的场景 Prompt：

```text
1.3::rainy day, quiet city bus stop ::, wet pavement, soft reflections, overcast sky, transparent umbrella, full body, standing, looking at viewer, soft diffused light, muted blue and warm cream palette, cinematic composition, calm atmosphere
```

建议画幅：`832 × 1216`。工作台与 README 主视觉优先使用 `雨后候车亭-02.png`。

### 2.3 玻璃花房：相似 Base Prompt 图片组

文件名：

- `玻璃花房-01.png`
- `玻璃花房-02.png`
- `玻璃花房-03.png`
- `玻璃花房-04.png`

四张图片共用以下 Base Prompt 前缀和共用角色 Prompt，再分别追加一条构图变体。模型与 Vibe 状态保持相同，Seed 分别设置。

共用风格前缀之后追加的场景 Prompt：

```text
1.3::detailed glass greenhouse ::, botanical garden, lush plants, hanging leaves, wooden potting table, afternoon sunlight, soft green and amber palette, natural shadows, peaceful creative workspace
```

逐图追加 Tag：

| 文件名 | 追加 Tag | 建议画幅 |
| --- | --- | --- |
| `玻璃花房-01.png` | `medium shot, standing beside the potting table, looking at viewer, open sketchbook` | `832 × 1216` |
| `玻璃花房-02.png` | `profile, watering small flowers, sunbeams through glass, floating dust` | `832 × 1216` |
| `玻璃花房-03.png` | `sitting on a wooden bench, drawing in sketchbook, relaxed pose` | `832 × 1216` |
| `玻璃花房-04.png` | `close-up portrait, leaves in foreground, shallow depth of field` | `1024 × 1024` |

工作台第二个标签建议使用 `玻璃花房-03.png`；图库相似 Prompt 截图应保留四张。

### 2.4 海边写生：画幅与构图对照

文件名、Base Prompt 与画幅：

| 文件名 | Base Prompt | 建议画幅 |
| --- | --- | --- |
| `海边写生-01.png` | `1.5::detailed seaside promenade and ocean horizon background ::, morning light, sea breeze, 2::full body side view, only one girl standing directly behind a wooden easel, actively painting the coastline on canvas, holding a paintbrush ::, pale blue sky, quiet creative mood, full-bleed composition` | `832 × 1216` |
| `海边写生-02.png` | `1.7::wide coastal landscape, detailed ocean horizon and seaside promenade ::, 2::only one girl seated on a folding stool at a wooden easel on the left, back three-quarter view, actively sketching the coastline on canvas ::, soft morning light, sea breeze, full-bleed composition, solo focus` | `1216 × 832` |
| `海边写生-03.png` | `1.3::close-up at a seaside promenade ::, holding an open sketchbook, ocean and railing softly blurred behind, windblown hair, natural smile, clear morning light, full-bleed composition` | `1024 × 1024` |

这组三张图不要求进入同一自动分组，用于展示不同画幅、图库密度和“构图研究”收藏集。

### 2.5 夜间书店：深色场景与暖色层次

文件名：

- `夜间书店-01.png`
- `夜间书店-02.png`
- `夜间书店-03.png`

共用风格前缀之后追加的场景 Prompt：

```text
1.3::cozy independent bookstore at night ::, tall bookshelves, rain on window, warm tungsten lamps, navy and amber palette, detailed background, quiet atmosphere, books with unmarked spines
```

逐图追加 Tag：

| 文件名 | 追加 Tag | 建议画幅 |
| --- | --- | --- |
| `夜间书店-01.png` | `standing in a narrow aisle, holding two books, three-quarter view, soft rim light` | `832 × 1216` |
| `夜间书店-02.png` | `2::sitting on a cushioned window seat beside the rainy window, reading an open book ::, side view, reflections on glass, full-bleed composition` | `1216 × 832` |
| `夜间书店-03.png` | `close-up portrait, carrying a stack of books, warm light on face, dark shelves behind` | `1024 × 1024` |

工作台第三个标签建议使用 `夜间书店-01.png`；设置页和深色主题截图可用这组图片检查暖色作品与界面背景的分离度。

### 2.6 演示用译名与分类

为 `雨后候车亭-02.png` 至少准备以下译名，使“按分类 + 对照”截图无需依赖自动生成结果：

| Tag | 译名 | 分类 |
| --- | --- | --- |
| `1girl` | 1 名女性 | 角色组成 |
| `copper hair` | 铜红色长发 | 外貌身体 |
| `teal eyes` | 青绿色眼睛 | 外貌身体 |
| `navy hair ribbon` | 深蓝发带 | 服装配饰 |
| `cream cardigan` | 奶油色开衫 | 服装配饰 |
| `charcoal pleated skirt` | 炭灰百褶裙 | 服装配饰 |
| `black shoulder bag` | 黑色单肩包 | 服装配饰 |
| `transparent umbrella` | 透明雨伞 | 道具物件 |
| `rainy day` | 雨天 | 环境背景 |
| `quiet city bus stop` | 安静的城市候车亭 | 环境背景 |
| `wet pavement` | 湿润路面 | 环境背景 |
| `soft reflections` | 柔和倒影 | 镜头光影 |
| `full body` | 全身构图 | 镜头光影 |
| `soft diffused light` | 柔和漫射光 | 镜头光影 |

### 2.7 收藏集与截图选图

- “本周精选”：`雨后候车亭-02.png`、`玻璃花房-01.png`、`海边写生-02.png`、`夜间书店-03.png`。
- “构图研究”：`雨后候车亭-04.png`、`玻璃花房-02.png`、`玻璃花房-04.png`、`海边写生-01.png`、`海边写生-03.png`。
- 工作台三个标签：`雨后候车亭-02.png`、`玻璃花房-03.png`、`夜间书店-01.png`。
- README 主视觉当前图：`雨后候车亭-02.png`。
- 图库普通状态：显示全部 14 张图片，并展开收藏集面板。
- 图库完整 Prompt 分组：选择“雨后候车亭”四张中的任意一张作为组内当前成员。
- 图库多选状态：选择 `雨后候车亭-02.png`、`玻璃花房-01.png` 和 `海边写生-02.png`，使选中画面横跨不同系列。

## 3. Prompt 与图库状态

- 至少一张图片同时包含 Base Prompt、Character Prompt、Base Undesired 和 Character Undesired。
- 至少一组图片只有 Seed 不同，用于验证完整 Prompt 分组。
- 至少两组共享一部分 Base Prompt，但在构图、角色或环境 Tag 上有清晰差异。
- 为工作台主图准备 20 至 40 个可读 Tag，并为其中 8 至 12 个补充准确中文译名和分类。
- 创建“本周精选”和“构图研究”两个手动收藏集；每个收藏集放入 4 至 6 张图片。
- 如需展示智能收藏集，使用能从画面和 Prompt 直接解释的规则，不使用虚构统计指标。
- 工作台打开 3 张图片；当前标签使用可读名称，另外两个标签也不能出现截断 UUID。

## 4. 宣传截图状态

| 输出文件 | 必须展示 | 避免展示 |
| --- | --- | --- |
| `hero-v090.webp` | 当前工作台真实界面、作品与结构化 Tag 的双栏关系 | 调试 Toast、悬浮菜单、API 状态、霓虹科技背景 |
| `workbench-v090.webp` | 三个可读标签、按分类组织、原文/译文对照、Character Prompt | 超长文件名、语法警告占据主视觉、无意义空白 |
| `gallery-v090.webp` | 风格统一的图库、收藏集、筛选与清晰图片名 | 日常图库、重复封面、随机下载文件名 |
| `gallery-groups-v090.webp` | 图片组、组内成员和当前详情之间的关系 | 无法判断分组原因的混杂图片 |
| `gallery-batch-v090.webp` | 框选后的多选状态与批量操作范围 | 危险确认框或选择数量与画面不符 |
| `settings-appearance-v090.webp` | 主题、字体、动效和本地数据设置 | 个人目录、API Key、私人服务地址 |
| `settings-updates-v090.webp` | 当前版本与平台对应的更新方式 | 开发构建错误、过期版本号、调试信息 |

## 5. 取图与发布规则

1. 使用当前稳定版本或明确标记的候选版本，窗口内容区域建议保持一致尺寸。
2. 工作台、图库和设置截图至少各检查一次浅色与深色主题，最终选择最能保持信息层级的一套；README 不混用互相冲突的主题语言。
3. 原始截图单独保存，README 主视觉只在真实截图外围增加克制的“创作档案台”背景，不重绘或伪造应用内部界面。
4. 外围背景只允许低对比度 Tag 结构、纸张/画布层次、轻微档案索引或来自应用图标的括号语言。
5. 禁止紫蓝渐变字、霓虹描边、玻璃卡片堆叠、假终端、假指标、装饰性状态点和通用 SaaS Hero 构图。
6. 缩放到 README 常见宽度后再次检查：应用页面类型、主要图片和核心操作仍应一眼可辨。
7. 发布前按 [批次 A 人工取图与验收清单](./archive/manual-verification-20260823-batch-a-promo-capture.md) 逐项记录结果。

## 6. 隐私与真实性检查

- 图片及 Prompt 已确认可以公开。
- 没有真实用户名、绝对路径、资源库位置或最近目录。
- 没有 API Key、Base URL、模型服务名称或连接测试结果。
- 没有 UUID、随机哈希、调试 Toast、错误堆栈或开发者工具。
- 所有可见功能均存在于当前版本，所有数量均来自截图中的真实状态。
- 截图没有通过生成式工具重绘应用内部文字、控件或数据。
