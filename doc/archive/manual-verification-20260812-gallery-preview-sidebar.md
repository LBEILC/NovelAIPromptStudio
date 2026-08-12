# 图片库预览侧栏验证记录

## 测试对象

- Change under test: 图片库预览侧栏采用固定的上、中、下三层布局；中间原始 Prompt 区独立滚动；基础 Prompt 与角色 Prompt 分组折叠。
- Commit under test: `65a6d40`（包含在此前的侧栏重构提交 `66f1152`、`650ce7a`、`7759c22` 之后）。
- Target operating system: Windows 11。
- Verification method: 用户明确授权后，使用 Computer Use 操作实际 Electron 开发版应用。

## 前置条件

- 已运行 `npm test`、`npm run build` 和 Lobe UI audit。
- 图片库中存在同时包含基础 Prompt 与角色 Prompt 的长 Prompt 图片。
- 应用窗口尺寸约为 1706 × 1033。

## 验证步骤与结果

1. 启动应用，进入“图片库”，选择一张包含 72 Tags 的长 Prompt 图片。
   - Expected: 图片信息区、Prompt 区和操作区都完整位于侧栏可视范围内；底部按钮不被长 Prompt 挤出。
   - Observed: 通过。图片区固定在顶部，Prompt 区位于中间，工作台编辑、收藏、在文件夹中显示、重命名和删除按钮全部固定显示在底部。

2. 在展开的基础 Prompt 代码块内向下滚动。
   - Expected: 只有中间 Prompt 区滚动，顶部图片与底部按钮的位置不变。
   - Observed: 通过。基础 Prompt 内容从开头滚动到末尾，并露出“角色 1 Prompt”折叠项；图片、尺寸/Tag 信息和全部操作按钮未移动。

3. 操作“角色 1 Prompt”折叠项。
   - Expected: 基础 Prompt 与角色 Prompt 保持独立分组，折叠操作不会改变上下两层的位置。
   - Observed: 通过。角色 Prompt 作为独立折叠项响应点击，上下固定区域均未发生位移或遮挡。

4. 将主题切换为深色并返回图片库查看同一张图片。
   - Expected: 深色主题下三层高度与滚动约束保持一致，文字、代码块和按钮清晰可见。
   - Observed: 通过。深色主题下长 Prompt、独立滚动条和全部底部按钮显示正常，与用户提供的问题场景一致。

5. 将主题恢复为测试前的浅色设置。
   - Expected: 临时测试设置不遗留。
   - Observed: 通过。主题已恢复为浅色。

## 结果

- Overall result: 通过。原问题已复现，并确认 `stableLayout` 修复后，侧栏高度约束在实际 Electron 窗口中生效。
- Discovered issues: 修复前 `DraggablePanel` 的非稳定布局模式会让 Body 的百分比高度按溢出内容计算，导致底部操作区被推出视口；已由提交 `65a6d40` 修复。
- Not exercised: 未触发收藏、重命名、打开文件夹、删除等会改变应用或外部状态的业务操作；本次验证聚焦布局、滚动、折叠和主题表现。
