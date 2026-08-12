# 图片库最大化布局手动验证

## 测试对象

- Change under test: 图片库右侧预览面板的默认宽度与 `340px` 至 `560px` 的可拖动范围统一，避免超宽或最大化窗口中出现多余空白。
- Target operating system: Windows 11。
- Prerequisites: 图片库中至少有一张可供选中预览的图片。

## 验证步骤

1. 启动应用并进入“图片库”，选中任意一张图片。
   - Expected: 右侧预览面板正常显示图片、Prompt 和底部操作按钮。
   - Observed: 通过（用户验证）。
2. 将应用窗口最大化。
   - Expected: 右侧预览面板贴合窗口右边缘，面板右侧没有大块空白；图片网格使用其余可用空间。
   - Observed: 通过（用户验证）。
3. 拖动预览面板左侧的调整手柄，分别缩窄和加宽面板。
   - Expected: 面板可在约 `340px` 至 `560px` 之间平滑调整，右侧始终贴合窗口边缘。
   - Observed: 通过（用户验证）。
4. 将窗口恢复为非最大化状态，再次最大化。
   - Expected: 面板布局保持稳定，不出现右侧空白，Prompt 滚动区和底部操作按钮仍可见。
   - Observed: 通过（用户验证）。

## 结果

- Overall result: 通过。用户确认验证未发现问题。
- Discovered issues: 无。
