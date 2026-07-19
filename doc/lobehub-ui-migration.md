# LobeHub UI 渐进迁移方案

> 状态：已确认方向  
> 日期：2026-07-19  
> 目标：吸收 LobeHub UI 的组件质量和主题能力，同时保留 NovelAI Prompt Studio 的桌面工作台信息架构。

## 结论

可以使用 LobeHub UI，但不进行一次性推倒重建。应用继续保留现有 Electron、React、Vite 和三栏工作区，通过共享基础控件逐页迁移。

原因：

- `@lobehub/ui` 支持 React 19、ESM、明暗主题和国际化，技术栈与本项目兼容。
- 组件库建立在 Ant Design 和 CSS-in-JS 体系上，完整接入会同时改变主题、样式优先级、依赖规模和桌面端包体。
- 当前作品库、Prompt 总览、Vibe 和分支流程具有较强的专业工作台特征，不适合直接套用聊天产品页面结构。
- 渐进迁移可以保持 SQLite、文件拖拽、原生窗口、快捷键和 macOS/Windows 行为稳定。

参考：<https://ui.lobehub.com/>、<https://www.npmjs.com/package/@lobehub/ui>

## 迁移顺序

### 1. 基础图标与选择控件

- 使用 Lucide React 作为通用功能图标来源；不再使用 Emoji、文字符号或页面内手写 SVG。
- 多选框、状态标记和焦点态使用共享组件，作品库和 Prompt 总览保持同一尺寸与笔画。
- AI 模型品牌图标只有在设置页需要时再评估 `@lobehub/icons`。

### 2. 建立本项目基础控件层

- 提取 Button、IconButton、SelectionMark、Input、Select、Segmented、Tooltip、EmptyState。
- 颜色、圆角、字号、间距和交互状态继续由项目语义 Token 控制。
- 控件 API 参考 LobeHub UI，但视觉方向保持“冷静、精确、工作室级”。

### 3. 小范围验证 LobeHub UI

- 优先在独立的设置页试用 ThemeProvider、表单和浮层控件。
- 对比安装前后的生产包体、启动时间、CSS 优先级和 Windows/macOS 字体回退。
- 验证通过后，再迁移作品管理和 Vibe 管理；Prompt 工作区最后迁移。

### 4. 主题与高级拖拽

- 设置页成为明暗主题、AI 配置和高级 Prompt 配置的统一入口。
- 拖拽排序继续使用专门的拖拽库；组件库只负责视觉，不混淆数据排序和动画职责。

## 明确不做

- 不复制 LobeHub Chat 的聊天布局。
- 不一次性替换所有 CSS。
- 不为了“看起来像 LobeHub”牺牲图片面积、桌面密度或原生窗口行为。
- 不同时保留多套图标和多套基础控件。
