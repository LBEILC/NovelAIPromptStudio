# 独立演示环境

NovelAI Prompt Studio 支持通过命名 Profile 创建与日常图库完全隔离的运行环境。演示环境不会继承默认环境的图库数据库、托管图片、收藏集、Tag 词典、API Key、外观设置、最近目录、工作台会话或浏览器本地存储。

## 启动方式

从仓库启动正式界面：

```text
npm run start:demo
```

启动开发界面：

```text
npm run dev:demo
```

两个脚本都使用 `--profile=demo`。也可以直接为 Electron 或已安装的应用传入其他 Profile，例如 `--profile=screenshots-2026`。名称不区分大小写，最终会规范成小写；只能包含字母、数字和连字符，长度为 1 至 32 个字符。

不带 `--profile` 或显式使用 `--profile=default` 时，应用继续读取原来的默认数据目录，现有用户不需要迁移。

## 隔离范围

命名 Profile 使用系统应用数据目录中的独立同级目录：

| 平台 | `demo` Profile 根目录 |
| --- | --- |
| Windows | `%APPDATA%\NovelAI Prompt Studio-demo\` |
| macOS | `~/Library/Application Support/NovelAI Prompt Studio-demo/` |

目录内的数据保持现有结构：

```text
NovelAI Prompt Studio-demo/
├─ data/
│  ├─ studio.sqlite
│  └─ preferences.json
├─ assets/
│  ├─ images/
│  └─ thumbnails/
├─ session/
└─ workbench-temp/
```

`userData` 隔离数据库、偏好、托管资源与工作台临时文件；`sessionData` 隔离 localStorage、Cookie 和 Chromium 缓存。演示环境内重新选择资源库位置时，选择结果也只写入该 Profile 的 `preferences.json`。

## 准备 v0.9 演示图库

1. 关闭默认环境，运行 `npm run start:demo`。
2. 确认图片库为空，设置页没有已保存的 API Key 或私人服务地址。
3. 从 `demo/promo-v090/final/` 一次导入 14 张正式图片。
4. 按 [v0.9 宣传演示数据规范](./promo-demo-data-v090.md) 创建“本周精选”和“构图研究”收藏集，补充演示用 Tag 译名与分类，并打开三个工作台标签。
5. 退出后再次运行 `npm run start:demo`，确认演示状态恢复。
6. 需要回到日常图库时，退出应用并运行 `npm start`。

不要把默认环境的 `studio.sqlite`、`preferences.json`、Local Storage 或整个 `userData` 复制到演示 Profile。尤其不要复制包含加密 API Key 和最近私人目录的偏好文件。

## 已安装应用

开发脚本只用于仓库工作区。已安装应用也可以接受同一个参数：

- Windows：为应用快捷方式或可执行文件追加 `--profile=demo`。
- macOS：使用 `open -na "NovelAI Prompt Studio" --args --profile=demo` 启动独立实例。

应用目前不提供 Profile 切换器或自动重置按钮。切换 Profile 必须完全退出当前实例后重新启动；删除或重置 Profile 数据属于独立的后续能力，不应通过手工替换数据库实现。
