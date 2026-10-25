# 本地数据模型

本文对应当前 `electron/database.js`、`versions.js`、`workSharing.js`、`materials.js` 和命令会话实现。SQLite 位于所选 profile 的 `data/studio.sqlite`；原图、缩略图在配置的素材目录。数据库使用 DELETE journal、EXTRA 同步。外键声明用于描述关系，运行时 `foreign_keys=OFF`，关联清理由应用执行。

```text
works ──< work_versions ──< version_images >── projects
  │           │                                ├── generation_metadata
  │           ├── deleted_versions             └──< prompt_tags
  │           └── deferred_version_prunes            │ 读取时合并
  ├── saved_works                                    tag_dictionary
  ├── work_sequences / work_activity / work_file_signatures
  └── removed_originals / original_undo / branch_undo / detached_images_undo

gallery_collections ──< gallery_collection_projects >── projects
prompt_group_covers ──> projects
projects ── library_card_cache（可重建的派生数据）
materials（JSON 素材） ──按内容引用── reference_vibes（参考编码）
```

作品原始图片还通过 `works.origin_json` 和根版本快照中的图片 ID、路径引用图片；这不是数据库外键。一张图片可以属于多个作品。图片库里的“作品组”是读取时计算的视图，不是另一张实体表。

## 表与字段

下列时间字段除明确注明外均为 ISO 时间字符串；空的删除时间表示未删除。JSON 字段按当前读取器解释，不能直接当成另一份可独立修改的实体。

| 表 | 字段含义 |
|---|---|
| `projects` | `id` 图片 ID；`name` 显示名；`image_path` 原图路径；`thumbnail_path` 缩略图路径；`content_hash` 文件 SHA-256；`prompt_fingerprint` 全提示词指纹；`base_prompt_fingerprint` 基础提示词指纹；`vibe_fingerprint` Vibe 指纹；`exact_group_fingerprint` 精确合并指纹；`is_favorite` 旧收藏标记；`deleted_at` 回收站时间；`created_at` 导入时间；`updated_at` 修改时间。 |
| `prompt_tags` | `id` Tag ID；`project_id` 图片 ID；`tag` 英文内容；`translation` 译文；`category` 分类；`weight` 权重；`position` 排列序号；`note` 备注；`raw_segment` 原始片段；`syntax_issue` 语法诊断；`brace_depth` 花括号层级；`brace_group` 括号组标识；`brace_trailing_comma` 组尾逗号标记。主要承载基础正向 Tag。 |
| `generation_metadata` | `project_id` 图片 ID；`prompt_raw` 正向原文；`negative_prompt` 负向原文；`prompt_structure_json` 结构化提示词，包含基础负向和角色提示词；`model` 模型；`seed` 字符串种子；`steps` 步数；`sampler` 采样器；`guidance` 引导值；`width`、`height` 尺寸；`generation_mode` 生成模式；`extra_json` 原始 PNG 元数据及命名等扩展数据。 |
| `tag_dictionary` | `tag` 规范化键；`display_tag` 展示拼写；`translation` 译文；`category` 分类；`has_translation`、`has_classification` 对应信息是否已确定；`translation_source`、`category_source` 信息来源；`updated_at` 更新时间。 |
| `danbooru_tag_cache` | `tag` 查询键；`canonical_tag` 规范词；`category` 外部分类编号；`is_deprecated` 弃用标记；`post_count` 使用计数；`checked_at` 查询时间。 |
| `app_meta` | `key` 命名空间键；`value` 字符串或 JSON。存迁移标记、缓存版本、图片命名覆盖、外部图片提示词结构和逐图失效标记等；并非全部用户偏好。 |
| `prompt_group_covers` | `prompt_fingerprint` 分组键；`project_id` 人工选择的封面图片 ID。 |
| `gallery_collections` | `id` 收藏集 ID；`name` 名称；`kind` manual/smart；`filter_json` 智能筛选规则；`created_at`、`updated_at` 时间。 |
| `gallery_collection_projects` | `collection_id`、`project_id` 联合主键；`created_at` 加入时间。智能收藏集按规则计算，手动收藏集使用成员表。 |
| `works` | `id` 作品 ID；`origin_json` 原始项目快照；`source_json` 打开来源；`created_at` 创建时间。 |
| `work_versions` | `id` 版本 ID；`work_id` 作品 ID；`parent_id` 父版本，根为空；`number` 作品内版本序号；`branch_id` 分支 ID；`branch_number` 分支序号；`snapshot_json` 参数、提示词和参考快照；`source` user/agent 等来源；`created_at` 创建时间。`work_id,number` 唯一。 |
| `version_images` | `id` 关联 ID；`version_id` 版本；`project_id` 图片；`seed` 本张种子；`created_at` 时间。`rowid` 也用于顺序恢复。 |
| `work_branch_names` | `branch_id` 分支键；`name` 用户命名。 |
| `work_sequences` | `work_id` 作品键；`version`、`branch` 已使用的最大版本/分支序号，删除后不回退。 |
| `work_activity` | `work_id` 作品键；`used_at` 使用时间（毫秒数）；`version_id` 最近使用版本。 |
| `work_file_signatures` | `work_id` 作品键；`signature_json` 外部源文件大小、修改时间、哈希，用来辨认再次打开的源文件。 |
| `saved_works` | `work_id` 已保存作品标记，区分未保存草稿。 |
| `deleted_versions` | `version_id` 隐藏版本；`token` 对应撤销批次。 |
| `deferred_version_prunes` | `version_id` 等待清理的版本，活动版本保护解除后再处理。 |
| `branch_undo` | `token` 撤销键；`payload` 版本、图片及操作范围 JSON。 |
| `removed_originals` | `work_id` 标记该作品原图已从作品去掉。 |
| `original_undo` | `token` 撤销键；`work_id` 作品；`project_id` 原图；`kind` 操作类别。 |
| `detached_images_undo` | `token` 撤销批次；`payload` 作品、原图、版本关联及原顺序。按图恢复使用同一 payload 的局部范围。 |
| `materials` | `id` 素材 ID；`kind` 素材类别；`name` 名称；`uses` 使用次数；`payload` 素材内容和内部排序 `_order`；`created_at` 时间。 |
| `reference_vibes` | `id` 参考素材 ID；`document_json` 原始参考信息、缩略图和各模型/信息提取参数对应的编码。 |
| `library_card_cache` | `project_id` 图片键；`project_order` 稳定排序；`created_at`、`is_favorite`、`deleted_at` 列表字段副本；`payload` 卡片 JSON；`prompt_fingerprint`、`base_prompt_fingerprint`、`vibe_fingerprint` 分组字段副本。全部可从主数据重建。 |

## 偏好与会话

`data/preferences.json` 保存外观、生产力、网络、图库路径、AI/NovelAI 设置及首次引导完成标记。敏感凭据由 Electron safeStorage 加密保存。渲染器 localStorage 还保存布局、排序、分组、视图等界面偏好；它不是凭据存储。

命令层 `workbench-session.json` 保存格式版本 3 的封装（session、revision、migrated），其中 session 当前为版本 2，包含标签页、原始快照、草稿和活动标签。写入采用临时文件、同步、重命名。旧 localStorage 会话由 `workbench.session` 接收，迁移输入另存 `workbench-migration-backup.json` 后再落盘；外部源丢失时保留草稿并标记错误。

## 删除与恢复

- 图片移入回收站设置 `projects.deleted_at`，不立即删原图或缩略图；恢复清空时间并恢复有关版本引用。
- 删除版本/分支通过 `deleted_versions` 与撤销 payload 隐藏；需要保留的活动版本进入 `deferred_version_prunes`，清理时保留仍被使用的祖先。
- “从作品去掉”删除该作品的关联并保存 `detached_images_undo`，不等于删除全局图片。回收站可同时呈现已入回收站的图片、从作品去掉的图片记录、原图移除状态；同图其他作品的引用仍有效。
- 永久删除图片只接受已入回收站的记录。`deleteLibraryImages` 先检查 `versions.retainedPaths`，保留其他存续作品需要的文件，其余只删除受管理的素材文件，再通过 `deleteProject` 清理记录。失败按图返回剩余文件，不假装完成。
- 删除收藏集删除集合及成员关系，不删除图片。素材删除直接处理素材记录；不能把所有表的删除都理解为回收站操作。

## 启动迁移顺序

工程没有一个连续递增的全局 schema 数字。发行版本根据引入迁移的提交及首次包含它的 Git 标签核对；实际启动仍以迁移键和缺表/缺列检查为准。

| 首次发行 | 启动迁移 |
|---|---|
| v0.1.0 | `phase2-core` 基础表及旧库备份；后续缺列检查在原表上增补字段。 |
| v0.8.0 | `gallery_favorites_collection_v1`，把旧收藏标记迁入收藏集。 |
| v1.0.0 | 切换原生 SQLite 并备份旧库；提示词指纹版本、逐图失效触发器和持久卡片缓存；本版发行前缓存格式已演进至 `6:image-naming`。 |
| v1.2.0 | `generation_versions_v1`，备份并退役旧实验/系列等表，建立作品与版本模型。 |
| v1.3.0 | `materials_v1`，备份并新增素材表。 |
| v1.4.0 | 新增参考编码库、版本删除/分支撤销及作品编号序列表。 |
| v1.5.1 | 新增原图去掉标记及原图操作撤销表。 |
| v1.5.5 | 新增延迟版本清理、作品活动与文件签名表；`work_originals_v1` 修复唯一匹配的旧原图引用。 |
| v1.6.0 | `saved_works_v1` 补已保存作品标记，并增加按图去掉/恢复的撤销存储。 |

当前打开数据库时按以下依赖顺序处理：

1. 旧文件首次打开前保留 `studio.pre-phase2.sqlite`；切换原生 SQLite 时另保留 `studio.pre-node-sqlite.sqlite`。后者先同步副本再独占发布，失败不继续打开原库。
2. `generation_versions_v1`：在事务中建立作品/版本/关联/分支命名表，移除旧 series、experiments、prompt_versions、旧 collections 和旧 vibe 系列表。存在旧表时先备份为 `studio.pre-generation-versions*.sqlite`。旧图片主表仍可读取；被退役表保留在备份里，并非转换成新作品。
3. `materials_v1`：先备份既有库，再新增 materials；不改原图片或作品快照。
4. `phase2-core`：创建基础表，按缺列补加图片哈希/指纹/收藏/删除字段，Tag 原始语法字段，结构化提示词/尺寸/生成模式以及词典来源字段。原行通过默认值读取，随后建立查询索引；不是重建用户数据。
5. `reference_vibes`、撤销/清理/序列/活动/文件签名表以 `IF NOT EXISTS` 加入；版本序列取已有最大值且不降低。
6. `saved_works_v1`：从已有版本图片、序列以及非空且非待保存的原图补已保存作品标记。快照与 ID 不重写。
7. `gallery_favorites_collection_v1`：把旧 `is_favorite` 图片纳入收藏集，记录已迁移，避免重复处理。
8. `prompt_fingerprints_version=1`：重算派生分组指纹；逐图失效键支持增量刷新。`library_cards_version=6:image-naming` 只在版本变化时重建卡片缓存；触发器标记受影响图片，原始数据不丢弃。
9. `work_originals_v1`：检查丢失的临时原图；只有模型、尺寸、种子和提示词完全匹配且图库候选唯一时重新绑定。先备份，再写修复和迁移统计；歧义项跳过。

尺寸和内容哈希另有启动后台补全（`backfillProjectDimensions`、`backfillProjectContentHashes`）；这不改变图片内容。启动迁移之外的会话迁移见上节。

## 待决定的问题（本次不改结构）

| 观察 | 影响 | 建议 |
|---|---|---|
| 外键关闭，作品与撤销表多数关系也未声明外键 | 绕过应用直接写库可能留下悬空关联 | 先做只读完整性审计，另立迁移方案；不要直接开启 cascade。 |
| 正向原文、Tag 行、结构 JSON 和版本快照包含相同内容 | 合法快照和当前编辑有不同生命周期，误合并会破坏历史；同步遗漏会导致显示不一致 | 明确每条写路径的权威来源及快照边界，再决定规范化。 |
| 原图既在 `works.origin_json` 又在根版本快照中，且可能靠路径关联 | 文件移动或绑定不完整时两处可能不一致 | 后续评估显式原图关联，保留历史快照兼容。 |
| 旧收藏标记与收藏集成员并存 | 迁移后两套字段容易被误当作同一实时状态 | 核对全部旧调用后再决定退役字段。 |
| `app_meta` 同时存迁移标记、派生失效和用户编辑数据 | 不能整体清空来“重置缓存” | 文档化命名空间，未来再拆分存储。 |
| 素材 payload 内含 name/kind 等外层也有的信息 | 更新实现以外层字段为准，payload 可能存在历史副本 | 明确序列化边界后再清理冗余。 |
| 永久删除先删文件再删行，不是跨文件系统事务 | 中途 I/O 失败可能只删除部分文件 | 保留现有逐图失败与剩余路径报告，后续评估可恢复的删除日志。 |
| 累积备份和撤销 JSON 没有统一容量策略 | 长期使用可能增长 | 单独设计保留策略，不在性能整理任务自动删用户历史。 |
