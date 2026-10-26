# 项目文档

| 文档 | 用途 |
| --- | --- |
| [自动化验收](./automated-acceptance.md) | `verify:app`、`verify:packaged` 等验收命令怎么用，慢机器模式、按分类运行 |
| [独立演示环境](./demo-profile.md) | 命名 Profile 的启动方式、隔离边界与演示图库准备 |
| [发版指南](./release-guide.md) | 版本号、验证、Release Note、标签、Action 与失败处理 |
| [浏览器界面预览](./ui-preview.md) | `npm run preview` 在浏览器里跑完整界面，使用临时演示数据和本机假服务 |
| [本地数据模型](./data-model.md) | SQLite 各表的含义、谁引用谁 |
| [图库性能测量](./library-benchmark.md) | `benchmark:library` 的用法和各项指标的口径 |
| [`screenshots/`](./screenshots/) | README 用的产品截图 |
| `npm run screenshots:readme` | 离线启动正式应用，在临时 Profile 中生成七张 2480×1520 的 README 截图（文件名仍是 1.2 时的 `-v120`）（1240×760、2 倍、浅色、关闭动效），PNG 和每张不超过 300 KB 的 WebP 存入 `.codex-runs/readme/` |

面向使用者的安装、功能和操作说明见项目根目录的 [README](../README.md)。

设计文档、界面稿、任务说明等内部文档不在这个仓库里。
