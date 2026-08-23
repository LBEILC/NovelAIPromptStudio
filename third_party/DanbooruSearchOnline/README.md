# DanbooruSearchOnline 数据说明

NovelAI Prompt Studio 的离线中文 Tag 词典派生自 SuzumiyaAkizuki 的 [DanbooruSearchOnline](https://github.com/SuzumiyaAkizuki/DanbooruSearchOnline)（DSO）。原项目与本目录数据按 GNU General Public License Version 3 发布，许可证全文见 [`LICENSE`](./LICENSE)。

## 固定来源

- 上游提交：[`0636f762694fc436b4ac472cf59b85d172eaaac4`](https://github.com/SuzumiyaAkizuki/DanbooruSearchOnline/commit/0636f762694fc436b4ac472cf59b85d172eaaac4)
- 上游提交时间：2026-08-16
- `origin_database/tags_enhanced.csv`：52,476 行数据，GB18030 编码，SHA-256 `9b494660aa3e7ab45ea440b6c16223634c33be54a7e03f58749842ecbfec77fe`
- `origin_database/tag_groups.json`：93 个 Tag Group，SHA-256 `bfe7529f70ba8d367667b879f7db0d4302978aa8f7c2ff72273014533d6bee96`
- `LICENSE`：SHA-256 `3972dc9744f6499f0f9b2dbf76696f2ae7ad8af9b23dde66d6af86c9dfb36986`

原始数据随仓库提供，以保证每个应用 Release 的对应源代码能够独立重建运行时词典。

## 转换方式

运行时使用的 [`electron/data/dso-dictionary.json`](../../electron/data/dso-dictionary.json) 由 [`scripts/update-dso-dictionary.mjs`](../../scripts/update-dso-dictionary.mjs) 确定性生成：

1. 校验全部上游文件的 SHA-256。
2. 从 `cn_name` 逗号分隔内容中选择第一个非空中文名称作为紧凑译文。
3. 将 Danbooru Character（4）和 Copyright（3）映射到 Prompt Studio 的“身份物种”。
4. 将高置信度 Tag Group 映射到角色组成、身份物种、外貌身体、服装配饰、动作表情、环境背景、镜头光影、风格质量或画师年代。
5. 多组 Tag 按显式规则优先级确定唯一分类；无可靠映射的 General Tag 保持“未分类”。
6. 上游唯一一条重复记录 `7月22日` 内容等价，生成时确定性保留第一条。
7. 运行时资源不包含 `wiki`、NSFW 标记、热度或中文别名；这些字段仍完整保存在本目录原始 CSV 中。

生成结果包含 52,475 个唯一 Tag 和全部中文主译名，其中 34,748 个得到确定性分类，17,727 个保留为“未分类”。用户手工修正始终高于 DSO 数据。

## 维护命令

```bash
npm run dso:verify  # 校验固定源文件及生成结果
npm run dso:update  # 从固定提交重新下载并生成运行时词典
```

更新上游版本时，必须同时更新脚本中的提交与哈希、本文件、相关分类测试和 README 数据量说明。不要直接手工编辑生成的 JSON。
