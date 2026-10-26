---
name: nai-studio
description: 通过本机 nai-studio 命令读取 NovelAI 图片和提示词，编辑 NovelAI Prompt Studio 工作台草稿，搜索和整理图片库，修改翻译词典并排队生成图片。用于用户已经授权的本地图片与提示词工作，不用于修改设置或访问密钥。
---

# NovelAI Prompt Studio

先运行 `nai-studio app.status`，再按用户的任务读取内容。软件没开时，命令行会打开软件窗口。`nai-studio help` 返回当前版本支持的命令及输入字段。

所有输出都是 JSON。成功为 `{"ok":true,"data":...}`，退出码 0；错误为 `{"ok":false,"error":{"code":"...","message":"..."}}`，退出码 1。按 `code` 判断错误，不解析中文提示。命令只连接本机软件，不直接打开数据库或修改保存文件。

## 读写顺序

1. 用 `workbench.list` 找到目标标签页，用 `workbench.get` 读取完整草稿、块和修订号。不要猜测标签页 ID、角色 ID 或块的位置。
2. 修改已有草稿时带上刚读到的 `expectedRevision`。范围 `scope` 使用返回的 `document.scopes[].scope.key`，块 `block` 和 Tag `index` 从 0 开始。
3. 每次成功修改后，使用返回的新修订号。遇到 `conflict`，重新读取；用户可能正在编辑同一块，不要反复强制重试，也不要省略修订号覆盖内容。保留用户的新输入，重新判断原任务是否仍适用。
4. `app_busy` 表示软件还没准备好或正在迁移图片库，稍后再试。`not_found` 时重新列出目标，`invalid_input` 时核对 `help`，`forbidden` 时停止这项操作。

修改工作台草稿会立即出现在界面中。当前标签页会显示“Agent 修改了提示词”和“撤销”。关闭标签页会丢弃这个标签页的草稿，只在用户要求关闭时执行。存入图片库是单独的明确动作：它保存当前提示词记录，图片文件本身不变；已有的同一张图片不会重复导入。

工作台修改使用标签页的修订号。打开新标签页和图片库、收藏集、词典的修改使用 `app.status` 或对应读取结果里的整体修订号。整体修订号可能因其他工作台操作而变化，冲突后重新读取即可。

## 最小例子

常用块和角色保存在本机素材中。`material.save` 保存整个块；省略 `block` 时保存指定角色的块和负面提示词。`material.insert` 复制到草稿并登记一次使用，不修改素材原件。删除与改名只开放给界面。

```sh
nai-studio material.list
nai-studio material.save --json '{"tabId":"TAB","scope":"base:prompt","block":0,"name":"常用场景","expectedRevision":0}'
nai-studio material.save --json '{"tabId":"TAB","scope":"character:CHARACTER:prompt","name":"角色素材","expectedRevision":0}'
nai-studio material.insert --json '{"tabId":"TAB","id":"MATERIAL","scope":"base:prompt","before":0,"expectedRevision":0}'
nai-studio material.insert --json '{"tabId":"TAB","id":"CHARACTER_MATERIAL","expectedRevision":0}'
```

下列 `TAB`、`IMAGE`、`COLLECTION`、`CHARACTER` 和修订号是占位值，执行时替换成读取结果。文件路径使用用户指定的路径。

```sh
nai-studio app.status
nai-studio image.read --path "/path/to/image.png"
nai-studio workbench.list
nai-studio workbench.open --path "/path/to/image.png"
nai-studio workbench.open --json '{"libraryId":"IMAGE"}'
nai-studio workbench.get --tab-id TAB
nai-studio workbench.close --json '{"tabId":"TAB","expectedRevision":0}'
nai-studio workbench.save-to-library --json '{"tabId":"TAB","expectedRevision":0}'
nai-studio prompt.set --json '{"tabId":"TAB","scope":"base:prompt","text":"blue hair, standing","expectedRevision":0}'
nai-studio block.set-text --json '{"tabId":"TAB","scope":"base:prompt","block":0,"text":"blue hair, standing","expectedRevision":0}'
nai-studio block.set-type --json '{"tabId":"TAB","scope":"base:prompt","block":0,"type":"tags","expectedRevision":0}'
nai-studio tag.add --json '{"tabId":"TAB","scope":"base:prompt","block":0,"text":"soft light","expectedRevision":0}'
nai-studio tag.remove --json '{"tabId":"TAB","scope":"base:prompt","block":0,"index":0,"expectedRevision":0}'
nai-studio tag.set --json '{"tabId":"TAB","scope":"base:prompt","block":0,"index":0,"weight":1.2,"expectedRevision":0}'
nai-studio character.add --json '{"tabId":"TAB","name":"角色 1","expectedRevision":0}'
nai-studio character.remove --json '{"tabId":"TAB","characterId":"CHARACTER","expectedRevision":0}'
nai-studio prompt.copy --tab-id TAB
nai-studio library.search --json '{"query":"blue hair","filters":{"includeTags":["standing"],"tagMatch":"all"},"limit":20}'
nai-studio library.get --id IMAGE
nai-studio library.import --path "/path/to/image.png"
nai-studio library.rename --json '{"id":"IMAGE","name":"窗边","expectedRevision":0}'
nai-studio library.rename-many --json '{"changes":[{"id":"IMAGE","name":"窗边"}],"expectedRevision":0}'
nai-studio library.trash --json '{"ids":["IMAGE"],"expectedRevision":0}'
nai-studio collection.list
nai-studio collection.add --json '{"collectionId":"COLLECTION","ids":["IMAGE"],"expectedRevision":0}'
nai-studio collection.remove --json '{"collectionId":"COLLECTION","ids":["IMAGE"],"expectedRevision":0}'
nai-studio dictionary.lookup --json '{"tags":["blue hair","standing"]}'
nai-studio dictionary.list --json '{"query":"hair","limit":20}'
nai-studio dictionary.suggest --json '{"query":"blue"}'
nai-studio dictionary.set --json '{"tag":"blue hair","translation":"蓝发","category":"Body","expectedRevision":0}'
nai-studio dictionary.set-many --json '{"entries":[{"tag":"blue hair","translation":"蓝发","category":"Body"}],"expectedRevision":0}'
```

`tag.set` 可以用 `text` 改文字，也可同时设置 `text` 和 `weight`。`tag.add` 可用 `before` 指定插入位置。负面范围是 `base:undesired`；角色范围从读取结果取得。

`prompt.copy` 返回按软件复制规则整理的文本，不写剪贴板。默认复制正面并排除自动追加项；可带 `scope` 复制一个范围，或用 `includeAutomatic:true` 包含自动追加项。

`library.search` 支持 `query`、`collectionId`、`view`（`all` 或 `trash`）、`offset`、`limit`（1–1000）。`filters` 与界面一致，包括 `includeTags`、`excludeTags`、`tagMatch`、`models`、`vibes`、`datePreset`、`dateFrom`、`dateTo`。只返回精简卡片，完整信息用 `library.get` 读取。智能收藏集由筛选条件决定，不能直接加入或移出图片。

演示环境在每条命令后加 `--profile=demo`，例如 `nai-studio app.status --profile=demo`。演示环境和日常环境互不相通，不要在用户没要求时切换环境。

## 能力边界

可以读取图片里的提示词和参数、工作台草稿、图片库与词典；可以编辑草稿、导入图片、存入图片库、起名、修改普通收藏集和词典。删除只会移入回收站。可以估算费用、排队生成、查询生成结果、切换版本、改分支名及从图片打开新作品。能发起放大、增强、扩图、局部重绘（花钱的照样待确认）。

不能永久删除、清空回收站、修改设置、读取或修改密钥、确认或取消待确认任务、停止生成。不要通过其他文件、旧接口或数据库绕过这些边界。安装命令行工具由用户在软件的“设置 → Agent”中完成；技能不自动更改系统或账号设置。

## 生成与版本

生成可以从已有图片或空白作品的草稿出发。先估算费用，再按用户授权调用 `generate.start`；默认返回待确认任务，等用户在软件里确认，不能自行确认。用户选择直接生成后才会直接排队；每日花费上限可能使任务转回待确认。每张请求串行发送，失败不会自动重试。Agent 生成另起一版，不替换用户正在看的图片。

```sh
nai-studio generate.estimate --json '{"tabId":"TAB","count":1}'
nai-studio generate.start --json '{"tabId":"TAB","count":1,"expectedRevision":0}'
nai-studio generate.status --json '{"id":"JOB"}'
nai-studio version.list --tab-id TAB
nai-studio version.open --json '{"tabId":"TAB","versionId":"VERSION","expectedRevision":0}'
nai-studio prompt.set-size --json '{"tabId":"TAB","width":832,"height":1216,"expectedRevision":0}'
nai-studio branch.rename --json '{"branchId":"BRANCH","name":"雨景"}'
nai-studio work.open-from-image --json '{"tabId":"TAB","versionId":"VERSION","imageId":"IMAGE"}'
nai-studio work.open --json '{"workId":"WORK"}'
nai-studio work.remove-original --json '{"tabId":"TAB"}'
nai-studio work.restore-original --json '{"undo":"UNDO"}'
```

`work.remove-original` 保留根版本的提示词、参数和后续版本。图库原图只移入回收站；文件原图仅从作品中去掉，不删除文件。将返回的 `undo` 传给 `work.restore-original` 可撤销，永久删除仍不向 Agent 开放。

张数是正整数，不设产品上限；请求仍逐张发送。不要用循环自行重试失败任务。`generate.status` 返回任务状态、已生成的图片库 ID 与失败原因，不带内嵌图片数据。不带 `id` 时返回全部未结束任务和最近 20 条已结束任务；`limit` 可设为 1–100，调整已结束任务条数，例如 `nai-studio generate.status --json '{"limit":100}'`。已结束记录只保留最近 100 条，生成图片和版本不受影响。正常退出会取消未发出的任务；异常退出后保留待确认任务、继续排队任务，正在发送的任务转为待确认，避免自动重复收费。尺寸取最近的 64 倍数。账号、生成设置、确认、放弃与停止仅供界面使用，命令行返回 `forbidden`。
# 参数与参考

读取 `workbench.get` 的 `tab.project.params`、`references` 和修订号后修改草稿；这些命令沿用编辑冲突与撤销规则。

```sh
nai-studio params.set --json '{"tabId":"tab-id","expectedRevision":0,"patch":{"steps":23,"quality":"Standard"}}'
nai-studio reference.add-vibe --json '{"tabId":"tab-id","path":"/path/to/reference.png"}'
nai-studio reference.add-precise --json '{"tabId":"tab-id","imageId":"image-id"}'
nai-studio reference.set --json '{"tabId":"tab-id","id":"reference-id","strength":0.6}'
nai-studio reference.remove --json '{"tabId":"tab-id","id":"reference-id"}'
nai-studio vibe.library --json '{}'
nai-studio reference.add-vibe --json '{"tabId":"tab-id","libraryId":"vibe-id"}'
```

Vibe 和精确参考互斥。换模型返回 `needs_confirm` 时，只有用户已授权移除参考图才用 `dropReferences:true` 重试。Medium 的固定参数由命令层执行。添加图片和费用估算不会编码；生成获准执行后才编码，并按图片、模型和信息提取值复用缓存。Agent 必须显式给出参考来源，不能打开文件选择框。

### 从零开始做一幅作品

```sh
nai-studio workbench.new --json '{"name":"云间练习","width":832,"height":1216}'
nai-studio prompt.set --json '{"tabId":"TAB","scope":"base:prompt","text":"clouds, blue sky"}'
nai-studio params.set --json '{"tabId":"TAB","patch":{"steps":28,"scale":5}}'
nai-studio generate.queue --json '{"tabId":"TAB","count":1}'
```

将 `TAB` 替换成新建结果的 `tab.id`。新建不要求持久令牌；生成仍须用户授权并遵守待确认规则。
`branch.delete {branchId, confirmed?}` 可将非主线分支及后代移入回收站；有子分支时先返回 `needs_confirm`，错误的 `details` 提供 `branches`、`versions`、`images` 数量。确认范围后传 `confirmed:true`。生成中的分支不能删除；待确认任务随分支取消。
返回的 `undo` 可交给 `branch.restore {undo}` 撤销。Agent 不能永久删除图片、清空回收站或更改账号设置。

`version.delete` 将指定版本及后代移入回收站，支持主线；原图和起点不能删除。多版时返回 `needs_confirm`，`details.branches` 只计其他分支；确认范围后传 `confirmed:true`。生成中拒绝，待确认任务取消，撤销仍使用返回的 `undo`。

```sh
nai-studio version.delete --json '{"versionId":"VERSION"}'
nai-studio version.delete --json '{"versionId":"VERSION","confirmed":true}'
nai-studio branch.restore --json '{"undo":"UNDO"}'
```

`version.delete` 支持 `only: true`：只删除指定版本、保留后续版本，不要求 `confirmed`；返回的 `undo` 仍交给 `branch.restore` 撤销。原图和起点不可使用。

打开图片（`workbench.open`）会回到所属作品和对应版本；打开原图会恢复最近使用的作品及上次查看的版本。需要另起新作品时传 `fresh: true`，例如 `nai-studio workbench.open --json '{"libraryId":"IMAGE","fresh":true}'`。

### 随机池与随机块

随机池是 `material.list` 返回的 `kind: "pool"` 素材，名称区分大小写，禁止 `_`、`*`、`~` 和换行。条目为 `{id,text,chance}`，`chance` 是正数相对概率，默认 1。

- `material.pool.create {name}`、`material.pool.rename {id,name}`、`material.pool.delete {id}`。
- `material.pool.entry.add {id,text,chance?}`、`material.pool.entry.update {id,entryId,text?,chance?}`、`material.pool.entry.delete {id,entryId}`。
- `material.pool.replace {id,text}`：整池替换，一行一个条目，空行忽略，概率重置为 1。
- `block.random.insert {tabId,scope,pool,count?,repeat?,min?,max?,step?,before?,expectedRevision?}`；`block.random.update` 使用相同选项和必填的 `block` 索引。`min/max` 成对提供，省略则关闭随机权重。

记号写法：`__池名__` 抽一项；`__池名*2__` 抽两项且不重复；`__池名*2r__` 允许重复；`__池名*2~0.8-1.2/0.1__` 按 0.1 步长分别随机每个 Tag 的权重。省略步长时为 0.05。数量为 1～16，权重范围 0.1～3，步长 0.01～1。段落整体加权，已有权重部分保留。只能用于基础和角色的正面提示词；负面记号会阻止生成。条目不支持嵌套随机块。

每张图发送前使用独立于 Seed 的随机数抽一次；版本和工作台保留模板，模板复制也保留记号。图片自身的提示词来自服务返回的实际结果。`version.list` 的 `versions[].images[].random.blocks` 返回记号原文 `source`、池名 `pool`、范围 `scope`、UTF-16 偏移 `start`、实际替换文字 `text` 及条目 `entries`（`id,text,rendered,weights?`）。

`version.apply-random {tabId,versionId,imageId,expectedRevision?}` 将所选图片抽到的内容写入当前草稿，按范围、原位置和原记号匹配，返回更新后的工作台、`applied` 数量及未匹配的 `skipped` 记录。`imageId` 可用版本图片记录 id 或图库 projectId。池子改名同步所有打开的草稿，保留历史版本；删除池子保留草稿，后续生成会报错。

这些命令不改变生成授权规则：Agent 仍须遵守用户授权和应用的待确认机制，不能代替用户确认生成或修改账号设置。

### 作品归属与共用图片

图片库记录的 `work_refs` 列出已建立的作品及原图／版本图角色。同一张图片可以属于多个作品；用 `workbench.open {libraryId, workId}` 返回指定作品并定位图片，不匹配时按默认规则打开。

`work.save {tabId, expectedRevision}` 将原图保存到图片库并建立作品，返回的 `tab.workSaved` 为真；`workbench.save-to-library` 同样建立作品。仅打开的新作品未保存、未生成时，关闭会丢弃它。

`work.detach-images {workId, imageIds}` 只从指定作品移除图片，不移入回收站，也不影响其他作品。返回一个 `undo` 令牌，可用 `work.restore-detached {undo}` 撤销。需要在所有作品中移入回收站时仍用 `library.trash`，永久删除仍不向 Agent 开放。


### 图片操作

导演工具支持 `bg-removal`（去背景）、`lineart`（线稿）、`sketch`（草图）、`colorize`（上色）、`emotion`（换表情）、`declutter`（去杂物）。先估价再发起，Agent 默认待确认，直接模式仍受每日上限约束；完成后不切换用户舞台。中转站不支持。

```sh
nai-studio generate.estimate-director --json '{"tabId":"TAB","imageId":"IMAGE","tool":"bg-removal"}'
nai-studio generate.director --json '{"tabId":"TAB","imageId":"IMAGE","tool":"colorize","prompt":"blue fabric","defry":0}'
nai-studio generate.director --json '{"tabId":"TAB","imageId":"IMAGE","tool":"emotion","emotion":"happy","prompt":"","defry":0}'
```

约 1MP 时线稿、草图、上色、换表情各 20 Anlas；有效 Opus 且发送面积不超过 1MP 时预计免费（未实测）。去背景、去杂物较贵，约 1MP 时各 65 Anlas，Opus 也收费。小图会放大到约 1MP，大于约 3MP 的会缩小，按发送尺寸估价。`outputImages` 表示预计结果张数；去背景一次请求返回三张，存入同一版本，`images[].variant` 分别为 `masked`、`generated`、`blend`。

只有上色、换表情能给 `prompt`（可空）和 `defry`（整数 0–5，0 最强，默认 0）。换表情必须给 `emotion`，适合正面清楚的单人脸；允许值见 `help`。其他工具不能带这些参数。工具提示词保存在 `operationDetails.toolPrompt`，源版本提示词和参数保存在版本快照。请求失败或中断可能已扣费，先检查状态和结果，再决定是否明确重试。

能发起放大、增强、扩图、局部重绘（花钱的照样待确认）。先用 `version.list {tabId}` 找到图片：版本图片取 `images[].projectId`，原图取根版本的 `project.id`。先估价、看结果再发起，默认进入 `pending`；Agent 不能自己确认，也不能改变账号或确认设置。用户设为直接生成时照设置排队，超过每日花费上限仍待确认；中转站按每日张数限制。完成后另起一版，不切换用户正在看的图。

将下面的 `TAB`、`IMAGE` 换成实际 ID。发起时可附 `expectedRevision`，按前面的修订号规则处理冲突。

```sh
nai-studio version.list --json '{"tabId":"TAB"}'
nai-studio generate.estimate-op --json '{"tabId":"TAB","imageId":"IMAGE","op":"upscale"}'
nai-studio generate.upscale --json '{"tabId":"TAB","imageId":"IMAGE"}'
nai-studio generate.estimate-op --json '{"tabId":"TAB","imageId":"IMAGE","op":"enhance","magnitude":2,"scale":1}'
nai-studio generate.enhance --json '{"tabId":"TAB","imageId":"IMAGE","magnitude":2,"scale":1}'
nai-studio generate.estimate-outpaint --json '{"tabId":"TAB","imageId":"IMAGE","edges":{"left":64,"right":0,"top":0,"bottom":0}}'
nai-studio generate.outpaint --json '{"tabId":"TAB","imageId":"IMAGE","edges":{"left":64,"right":0,"top":0,"bottom":0}}'
```

扩图不传 `mode` 时采用估价返回的 `recommended`。**放大、增强用源图那一版的提示词，不看草稿；局部重绘、扩图用编辑器草稿。**修改提示词时写清新区域里要有什么。

局部重绘推荐流程：`image.grid` 看坐标 → 写 `shapes` → `generate.estimate-inpaint` 打开 `previewPath` 检查 → 不对就改形状、重新估价 → 发起。

```sh
nai-studio image.grid --json '{"tabId":"TAB","imageId":"IMAGE"}'
nai-studio generate.estimate-inpaint --json '{"tabId":"TAB","imageId":"IMAGE","shapes":[{"type":"rect","x":100,"y":100,"width":128,"height":128}]}'
nai-studio generate.inpaint --json '{"tabId":"TAB","imageId":"IMAGE","shapes":[{"type":"rect","x":100,"y":100,"width":128,"height":128}]}'
```

坐标始终是原图像素，网格输出会缩小到长边不超过 1568，返回 `scale`。遮罩来源恰好给一种：

- `shapes`：矩形 `{type:"rect",x,y,width,height}`、椭圆 `{type:"ellipse",cx,cy,rx,ry}`、多边形 `{type:"polygon",points:[[x,y],...]}`（3–64 个点）。多个形状取并集；可附 `grow`（0–128，默认 0）向外扩，超出原图裁掉。
- `maskPath`：本地黑白 PNG，尺寸与原图一致，不超过 50 MB；亮度过半为重画，只读原文件。
- `useCurrent:true`：用户正在软件里涂的遮罩，此时 `imageId` 可省略，给了必须一致。

`rect` 可省略以自动出框；给了就必须包含全部遮罩。`strength` 默认 1，`fullSize` 默认 false。估价额外返回 `rect`、`maskBounds`、`maskRatio`、`previewPath`，用于检查真实送去重画的范围。

用户已涂好时先 `inpaint.get`（可省略 `tabId` 取当前标签页），看 `previewPath` 和框内的 `cropPath`，再按用户要求修改草稿。`active:false` 表示没有正在进行的重绘；没有涂抹时 `maskBounds:null`、`maskRatio:0`。可让用户点重绘，也可使用当前遮罩发起，仍走待确认：

```sh
nai-studio inpaint.get --json '{"tabId":"TAB"}'
nai-studio generate.estimate-inpaint --json '{"tabId":"TAB","useCurrent":true}'
nai-studio generate.inpaint --json '{"tabId":"TAB","useCurrent":true}'
```

`generate.status` 的操作任务提供 `operation`、`operationDetails`、`estimate`、`parentNumber`、`name`；局部重绘和扩图还有小图 `previewPath`，取消或完成后会删除。网格和检查预览是临时文件，启动时清理超过 24 小时的文件。
