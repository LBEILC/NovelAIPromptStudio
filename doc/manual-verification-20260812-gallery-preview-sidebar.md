# 图片库预览侧栏手动验证

## 测试对象

- Change under test: 图片库预览侧栏重构为上、中、下三层；原始 Prompt 按基础与角色分组折叠，并使用 Lobe UI 代码块显示。
- Target operating system: Windows 11

## 已发现并修复的问题

- Commit `66f1152`: Lobe UI `DraggablePanel.Body` 的 Flexbox 与滚动样式覆盖了三层网格，长 Prompt 会把底部操作区推到视口外。
- Current fix: 强制 Body 使用受可视高度约束的三层网格；顶部与底部使用固定高度，中间 Prompt 区使用剩余高度并独立滚动。

## 前置条件

- 已完成 `npm ci`、`npm test` 和 `npm run build`。
- 准备至少三张可导入图片：
  - 一张同时包含 Base Prompt 和至少一个 Character Prompt。
  - 一张只有 Base Prompt。
  - 一张不包含可识别 Prompt。
- 图片库中至少有一个包含多张图片的图片组。

## 验证步骤

1. 启动应用并进入“图片库”，选中同时包含 Base Prompt 和 Character Prompt 的图片。
   - Expected: 右侧预览栏自上而下分为固定图片信息区、可滚动原始 Prompt 区和固定操作区；三个区域均完全位于侧栏可视范围内。
   - Observed:

2. 检查原始 Prompt 区的初始状态。
   - Expected: “基础 Prompt”默认展开；每个非空 Character Prompt 独立显示且默认折叠；空 Prompt 不生成折叠项。
   - Observed:

3. 使用鼠标和键盘依次展开、收起基础与角色 Prompt。
   - Expected: 折叠标题可点击，并可通过 Tab 聚焦后使用 Enter 或 Space 操作；焦点样式清晰，展开内容不会遮挡图片或底部操作。
   - Observed:

4. 检查长 Prompt、复制按钮以及中间区域滚动。
   - Expected: Prompt 在 Lobe UI 代码块内自动换行；悬停后可复制完整 Prompt；只有中间 Prompt 区纵向滚动，代码块本身和整个侧栏不产生额外纵向滚动条；滚动到任意位置时底部按钮均保持可见且位置不变。
   - Observed:

5. 将预览侧栏分别拖到最窄和最宽，并切换图片组内的上一张、下一张。
   - Expected: 标题、Tag 数量和按钮在 340–560 px 宽度内不溢出；图片导航正常；每次切换图片后折叠状态重置为基础展开、角色折叠。
   - Observed:

6. 依次查看只有 Base Prompt 和没有 Prompt 的图片。
   - Expected: 只有 Base Prompt 时不显示角色项；没有 Prompt 时显示“没有检测到 Prompt”，底部操作仍固定且可用。
   - Observed:

7. 分别在浅色和深色主题下检查预览栏，并将动效设置为“关闭”或系统减少动态效果。
   - Expected: 折叠项、代码块、边框、文字和焦点在两种主题下均清晰；减少动效设置得到尊重，没有突兀动画。
   - Observed:

8. 检查收藏、在文件夹中显示、重命名、在工作台编辑、移入回收站，以及回收站中的恢复和永久删除入口。
   - Expected: 所有既有操作保持可用；普通视图与回收站视图的按钮组合正确；危险操作的视觉层级不变。
   - Observed:

## 结果

- Overall result:
- Discovered issues:
