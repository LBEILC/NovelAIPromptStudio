# 项目文档

| 文档 | 用途 |
| --- | --- |
| [自动化验收](./automated-acceptance.md) | `verify:app`、`verify:packaged` 等验收命令怎么用，慢机器模式、按分类运行 |
| [独立演示环境](./demo-profile.md) | 命名 Profile 的启动方式、隔离边界与演示图库准备 |
| [发版指南](./release-guide.md) | 版本号、验证、Release Note、标签、Action 与失败处理 |
| [`screenshots/`](./screenshots/) | README 用的产品截图 |
| `npm run screenshots:readme` | 离线启动正式应用，在临时 Profile 中生成七张 2480×1520 的 1.2 README 截图（1240×760、2 倍、浅色、关闭动效），PNG 和每张不超过 300 KB 的 WebP 存入 `.codex-runs/readme/` |

面向使用者的安装、功能和操作说明见项目根目录的 [README](../README.md)。

设计文档、界面稿、任务说明等内部文档不在这个仓库里。
