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

可以读取图片里的提示词和参数、工作台草稿、图片库与词典；可以编辑草稿、导入图片、存入图片库、起名、修改普通收藏集和词典。删除只会移入回收站。可以估算费用、排队生成、查询生成结果、切换版本、改分支名及从图片打开新作品。

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
```

张数是正整数，不设产品上限；请求仍逐张发送。不要用循环自行重试失败任务。`generate.status` 返回任务状态、已生成的图片库 ID 与失败原因；软件退出会取消未发出的任务。尺寸取最近的 64 倍数。账号、生成设置、确认、放弃与停止仅供界面使用，命令行返回 `forbidden`。
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
