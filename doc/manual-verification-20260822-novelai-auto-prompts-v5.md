# NovelAI 自动提示词与 V5 识别手动验证

## 待验证变更

- 变更：NovelAI 正向自动质量词、负向 UC 预设识别与复制行为，包含 NovelAI Diffusion V5 新元数据字段兼容。
- 目标操作系统：Windows 10/11。

## 前置条件

- 已安装本次变更构建的 NovelAI Prompt Studio。
- 准备至少一张开启自动质量词和 UC 预设的 NovelAI Diffusion V5 图片。
- 准备至少一张开启自动质量词的 NovelAI Diffusion V4.5 Full 或 Curated 图片。
- 如条件允许，再准备一张关闭自动质量词、但由用户手动输入相同质量词的图片。
- 准备回归图片 `772245e5-1309-481d-9877-a04851eac2ca.png`。
- 系统剪贴板可正常读写。

## 验证步骤

1. 打开工作台，导入开启自动质量词的 V5 图片。
   - 预期结果：Base Prompt 标题下显示“NovelAI V5 Quality Tags Standard”提示和数量；对应 Tag 通过虚线边框和底色区分，不显示多余的“自动”文字徽标。
   - 实际结果：

2. 将鼠标停留在任一 V5 自动质量 Tag 上。
   - 预期结果：悬浮信息明确显示来源为“NovelAI V5 Quality Tags · Standard”，Tag 仍可正常编辑、选择和拖动。
   - 实际结果：

3. 检查同一图片的 Base Undesired Content。
   - 预期结果：能够按照图片元数据和文本显示 Heavy、Light、Human Focus 或其他已确认的 UC 预设名称；对应预设 Tag 通过样式区分，不显示多余的“预设”文字徽标。
   - 实际结果：

4. 点击顶部主按钮“复制可见 Prompt”，粘贴到纯文本编辑器。
   - 预期结果：复制内容不包含已确认的 NovelAI 自动质量词；提示消息说明忽略了多少个 NovelAI 自动 Tag。
   - 实际结果：

5. 打开顶部复制菜单，点击“复制全部 Prompt”。
   - 预期结果：Base Prompt 和 Character Prompt 的用户内容保持原顺序、标点、换行和 `Text:` 块，已确认的自动质量词不在复制结果中。
   - 实际结果：

6. 在同一菜单点击“复制全部 Prompt（包含 … 个 NovelAI 自动 Tag）”。
   - 预期结果：复制结果保留图片元数据中的完整生成 Prompt，包括自动质量词；自然语言、引号、换行和 `Text:` 块没有被改写。
   - 实际结果：

7. 导入 V4.5 Full 或 Curated 图片，重复检查 Base Prompt、自动 Tag 悬浮来源和两种“复制全部”结果。
   - 预期结果：界面显示正确的 V4.5 模型类型；默认复制排除对应模型的自动质量词，显式“包含自动 Tag”复制保留完整原文。
   - 实际结果：

8. 导入关闭自动质量词、但手动包含 `very aesthetic, masterpiece, no text` 等相同词组的图片。
   - 预期结果：这些用户手写 Tag 不显示为已确认自动来源，默认复制不会删除它们。
   - 实际结果：

9. 编辑或打乱一组已识别自动词，使其不再与官方模板完全匹配。
   - 预期结果：界面提示模板未匹配，不再把这些 Tag 当作已确认自动内容排除，复制结果不会静默丢词。
   - 实际结果：

10. 分别在浅色和深色主题、最小窗口宽度下检查 Base Prompt、Base Undesired Content、Tag 来源样式和复制菜单。
    - 预期结果：提示文字可辨认，识别提示与下方 Tag 列表之间留有清晰间距；长提示可截断并通过标题说明查看，不遮挡操作按钮，Tag 与菜单没有溢出或错位。
    - 实际结果：

11. 在工作台打开回归图片 `772245e5-1309-481d-9877-a04851eac2ca.png`。
    - 预期结果：Base Prompt 显示“推断 NovelAI V4.5 Full Quality Tags Standard · 3”，三个对应 Tag 仅通过样式区分；Base Undesired Content 显示“推断 NovelAI UC Heavy · 17”，即使 Heavy 前面还有用户输入的 `nsfw`，预设 Tag 也不显示“预设”文字徽标。
    - 实际结果：

12. 对回归图片分别执行默认“复制全部 Prompt”和“包含自动 Tag”的复制操作。
    - 预期结果：默认复制排除末尾的 `very aesthetic, masterpiece, no text`，但保留用户自己的强化质量词组和角色 Prompt；“包含自动 Tag”复制保持原始内容不变。
    - 实际结果：

## 验证结论

- 总体结果：
- 发现的问题：
