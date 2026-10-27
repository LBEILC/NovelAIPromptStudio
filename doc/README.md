# 项目文档

| 文档 | 用途 |
| --- | --- |
| [使用指南](./guide.md) | 面向使用者：每个功能怎么用、在哪，数据与隐私，快捷键和常见问题 |
| [自动化验收](./automated-acceptance.md) | `verify:app`、`verify:packaged` 等验收命令怎么用，慢机器模式、按分类运行 |
| [独立演示环境](./demo-profile.md) | 命名 Profile 的启动方式、隔离边界与演示图库准备 |
| [发版指南](./release-guide.md) | 版本号、验证、Release Note、标签、Action 与失败处理 |
| [浏览器界面预览](./ui-preview.md) | `npm run preview` 在浏览器里跑完整界面，使用临时演示数据和本机假服务 |
| [本地数据模型](./data-model.md) | SQLite 各表的含义、谁引用谁 |
| [图库性能测量](./library-benchmark.md) | `benchmark:library` 的用法和各项指标的口径 |
| [`screenshots/`](./screenshots/) | README 用的产品截图 |
| `npm run screenshots:readme` | 离线启动正式应用，使用 `demo/images/showcase/` 的 24 张案例图和临时 Profile 生成 9 张截图：`readme-{workbench,versions,inpaint,library,agent}.webp`、`guide-{text,account,compare,dictionary}.webp`。1240×760、2 倍、浅色、关闭动效；PNG 与检查记录存入 `.codex-runs/readme/`，2480×1520、每张小于 300 KB 的 WebP 存入 `doc/screenshots/` |

面向使用者的介绍和安装见项目根目录的 [README](../README.md)，详细用法见[使用指南](./guide.md)。

设计文档、界面稿、任务说明等内部文档不在这个仓库里。
