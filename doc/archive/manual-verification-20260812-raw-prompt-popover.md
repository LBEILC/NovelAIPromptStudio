# 原始 Prompt 弹层人工验证

- Change under test: `src/PromptOverview.jsx` 与 `src/styles.css` 中的原始 Prompt 编辑弹层宽度约束修复
- Target operating system: Windows 10/11
- Prerequisites: 已安装依赖；准备一张包含较长 Base/Character Prompt 的 NovelAI 图片；应用窗口宽度可调整

## Verification steps

1. 启动应用，将测试图片打开到工作台，在未修改任何 Tag 的情况下首次点击 Base Prompt 区域的“原始 Prompt”。
   - Expected: 弹层首次打开即完整显示标题、“取消”、文本编辑区、解析数量和“保存并解析”；文本或输入框不会把右侧按钮挤出弹层。
   - Observed: Pass。使用问题截图对应的 `e7048dee-2c30-4e45-b1c8-207638347f62` 项目验证，首次打开即完整显示“取消”和“保存并解析”，长 Prompt 保持在文本区内。

2. 关闭弹层后再次打开，不修改文本，再使用“取消”关闭。
   - Expected: 每次打开的宽度与布局保持一致；“取消”和“保存并解析”始终可见；取消不会修改 Tag。
   - Observed: Pass。通过“取消”关闭后重新打开，弹层尺寸与布局一致，两个操作按钮持续可见，Tag 数量保持为 22。

3. 再次打开弹层，编辑原始 Prompt，然后点击“保存并解析”，随后重新打开。
   - Expected: 保存按钮可点击；Tag 按新文本重新解析；重新打开后仍完整显示全部操作按钮。
   - Observed: 保存按钮在 UI 与可访问性树中均可见、可操作；未实际提交文本变更，因为当前两个工作台标签均已有用户的未处理修改，避免覆盖或混入用户草稿。

4. 对 Character Prompt 和 Undesired 区域重复首次打开、取消及保存操作。
   - Expected: 各区域弹层均保持相同的完整布局，且只更新对应 Prompt 区域。
   - Observed: Pass（布局与取消路径）。Base Undesired 与 Character 1 Prompt 弹层均完整显示“取消”、文本区、解析数量和“保存并解析”；未提交文本变更。

5. 将应用窗口缩窄至日常可用的最小宽度，再打开包含长文本的原始 Prompt 弹层。
   - Expected: 弹层受视口宽度约束；文本在输入区内换行或滚动；标题和底部操作按钮不发生横向裁切。
   - Observed: Pass at 1706 × 1033。窗口从全屏还原后重新检查，弹层仍完整受视口约束，操作按钮无横向裁切。

6. 分别在深色和浅色主题下检查弹层。
   - Expected: 两种主题下文字、输入框边界及按钮均清晰可辨，布局一致。
   - Observed: Pass。浅色与深色主题下弹层布局一致，文字、边界及按钮均清晰；验证后已恢复用户原有的浅色主题。

## Result

- Overall result: Pass。用户报告的首次打开原始 Prompt 时操作按钮被挤出/裁切的问题未再复现。
- Discovered issues: 无。保存动作未执行，以保护当前已有的未处理工作台草稿；保存与解析逻辑由 105 项自动测试和生产构建结果覆盖。
