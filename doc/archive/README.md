# 历史文档归档

> 最后核对：2026-08-24

本目录保存已经实现、被当前产品方向取代，或只用于追溯实施与验收过程的文档。归档内容不是当前产品事实，也不建立新待办；除非当前有效文档明确引用，否则不应直接按照归档文档继续开发。

## 产品与实施历史

| 文档 | 归档原因 |
| --- | --- |
| [工作台与图片库效率功能开发规格](./workbench-gallery-productivity-development-spec.md) | 规格中的功能已经实现并发布；仍有效的产品事实已合并到当前产品边界，跨平台待验收项由 `coordination/` 维护。 |
| [图片系列、对比实验与生成分支设计](./experiment-and-branch-design.md) | 分支、系列、实验、关系与对比能力已退出当前产品方向。 |
| [资源库管理、Tag 分类、设置与交互设计](./library-management-taxonomy-settings-design.md) | 旧资源库信息架构已被两页面工作台与图片库结构取代。 |
| [图库、Vibe 库与 Tag 库三阶段开发计划](./three-library-information-architecture-development-plan.md) | 三资源库方案已被两页面结构取代。 |
| [导入流程、Inpainting 提示与批量 Tag 输入设计](./import-workflow-and-metadata-warnings.md) | 记录旧阶段导入、分支与资源管理讨论；相关保留能力以现有代码和当前产品边界为准。 |
| [Lobe UI 完整迁移试验](./lobehub-ui-migration.md) | Lobe UI 迁移已经完成，文档仅保留迁移决策历史。 |

## 手工验收记录

`manual-verification-*.md` 保存已经结束或由维护者手动归档的验证清单，包括通过、失败、被后续修复取代以及保留原始填写状态的记录。归档文件不应被重新当作当前待验收任务；仍需执行的验证必须在 `doc/` 根目录或 `coordination/` 当前交接文件中明确列出。

当前有效文档见上一级的[项目文档索引](../README.md)。
