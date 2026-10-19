---
name: nai-studio
description: 通过本机 nai-studio 命令读取 NovelAI 图片和提示词，编辑 NovelAI Prompt Studio 工作台草稿，搜索和整理图片库，修改翻译词典。用于用户已经授权的本地图片与提示词工作，不用于生成图片、修改设置或访问密钥。
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
nai-studio library.trash --json '{"ids":["IMAGE"],"expectedRevision":0}'
nai-studio collection.list
nai-studio collection.add --json '{"collectionId":"COLLECTION","ids":["IMAGE"],"expectedRevision":0}'
nai-studio collection.remove --json '{"collectionId":"COLLECTION","ids":["IMAGE"],"expectedRevision":0}'
nai-studio dictionary.lookup --json '{"tags":["blue hair","standing"]}'
nai-studio dictionary.set --json '{"tag":"blue hair","translation":"蓝发","category":"Body","expectedRevision":0}'
```

`tag.set` 可以用 `text` 改文字，也可同时设置 `text` 和 `weight`。`tag.add` 可用 `before` 指定插入位置。负面范围是 `base:undesired`；角色范围从读取结果取得。

`prompt.copy` 返回按软件复制规则整理的文本，不写剪贴板。默认复制正面并排除自动追加项；可带 `scope` 复制一个范围，或用 `includeAutomatic:true` 包含自动追加项。

`library.search` 支持 `query`、`collectionId`、`view`（`all` 或 `trash`）、`offset`、`limit`（1–1000）。`filters` 与界面一致，包括 `includeTags`、`excludeTags`、`tagMatch`、`models`、`vibes`、`datePreset`、`dateFrom`、`dateTo`。只返回精简卡片，完整信息用 `library.get` 读取。智能收藏集由筛选条件决定，不能直接加入或移出图片。

演示环境在每条命令后加 `--profile=demo`，例如 `nai-studio app.status --profile=demo`。演示环境和日常环境互不相通，不要在用户没要求时切换环境。

## 能力边界

可以读取图片里的提示词和参数、工作台草稿、图片库与词典；可以编辑草稿、导入图片、存入图片库、起名、修改普通收藏集和词典。删除只会移入回收站。

不能永久删除、清空回收站、修改设置、读取或修改密钥，也不能生成图片。不要通过其他文件、旧接口或数据库绕过这些边界。安装命令行工具由用户在软件的“设置 → Agent”中完成；技能不自动更改系统或账号设置。
