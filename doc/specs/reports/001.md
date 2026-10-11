# 001 工程实施与验收汇报

日期：2026-10-11。角色：工程负责人。任务：`doc/specs/001-类型格式化与CI.md`。

## 1. 完成了什么

加入严格 TypeScript 检查、63 个 preload 方法的共享 IPC 契约、领域类型、可选的 `window.studio` 声明、限定范围的 Prettier 格式检查和 Windows/macOS CI。发布工作流仅增加打包前的类型检查。

没有迁移现有 JS 文件后缀，没有调整应用逻辑或产品文案。preload 只增加 `@ts-check` 和对象上的 `@satisfies {StudioApi}` JSDoc；括号与换行由注解位置及 Prettier 产生。移除注释和位置元数据后的 Babel AST 与格式化提交中的 preload 完全相同。

提交分为：

- `6816482`：只加入工具、配置、脚本和依赖锁定。
- `a02ed50788f16be6f73a49699a1b382aafcc3e1c`：仅 Prettier 输出。
- 本报告所在提交：共享类型、preload 静态检查注解、`.git-blame-ignore-revs` 与汇报。

按工程派工规则只提交，不推送；由设计负责人验收后推送。

## 2. 改动了哪些文件

- 配置：`tsconfig.json`、`.prettierrc.json`、`.prettierignore`、`package.json`、`package-lock.json`。
- CI：`.github/workflows/ci.yml`、`.github/workflows/release.yml`。
- 类型：`src/shared/types.ts`、`src/shared/ipc.ts`、`src/shared/global.d.ts`，以及 `electron/preload.cjs` 两处类型注解。
- 记录：`.git-blame-ignore-revs`、本文件。
- 纯格式化提交：112 个文件，增加 12,590 行、删除 4,972 行，共 17,562 行 diff。完整清单可用 `git show --stat a02ed50` 查看。

格式化范围限定为 `src/`、`electron/`、`scripts/` 中指定的六种源码后缀及 `vite.config.js`；没有改动 CSS、字体或设计文件。没有手工修改任何既有测试的匹配方式。

直接开发依赖固定为 TypeScript 5.9.3、Prettier 3.6.2、`@types/node` 24.13.3、`@types/react` 19.2.17、`@types/react-dom` 19.2.2。前两者提供检查工具，后三者提供 Node/Electron 与 React 19 类型。Node/React 类型沿用原锁文件已有的传递依赖版本；逐项比较锁文件后，已有包的版本变化数为 0。

## 3. 验证结果

| 检查 | 结果 |
| --- | --- |
| 改动前 `npm test` | 51 个文件、288 个测试通过 |
| `npm ci` | 成功，安装 931 个包，退出码 0 |
| `npm run format:check` | 全部匹配文件通过，退出码 0 |
| `npm run typecheck` | strict 检查通过，退出码 0 |
| 格式化后 `npm test` | 51 个文件、288 个测试通过 |
| 最终 `npm test` | 51 个文件、288 个测试通过；无减少、无失败 |
| 格式化前、后及最终 `npm run build` | 均成功，退出码 0 |
| 工作流 YAML | 使用已安装的 `js-yaml` 分别解析 CI/release，语法通过 |
| IPC 方法名核对 | TypeScript AST 中接口成员与隔离 VM 中 preload 对象键完全一致：63 个 |
| 格式化纯度 | 对 112 个文件的父提交内容逐一重新运行 Prettier，与工作区输出比较；按 Git 换行归一化后全部一致 |
| preload 运行时 | 注解前后 Babel AST 相同；未启动 Electron 或接触用户图库 |

验收要求的改名测试：临时将 `loadLibrary` 改为 `loadLibraryRenamed`，运行 `npm run typecheck`，得到：

```text
electron/preload.cjs(7,5): error TS2353: Object literal may only specify known properties, and 'loadLibraryRenamed' does not exist in type 'StudioApi'.
```

文件已在 `finally` 中按原始字节还原，随后 `npm run typecheck` 通过。另外验证了新增 `unexpectedMethod` 报 TS2353、删除 `loadLibrary` 报 TS1360（缺少必需属性），两项均已还原。

CI 配置使用与 release 一致的 checkout v6、setup-node v7、Node 22 和 npm 缓存；按要求顺序执行五条命令。Windows/macOS 矩阵 `fail-fast: false`，同分支新运行取消旧运行，权限仅 `contents: read`。本机实际为 Windows、Node 24.14.0；尚未推送，不能声称 GitHub Node 22 或 macOS runner 已通过。

## 4. TODO(design) 清单

无。本任务不涉及设计、界面文案或交互决策。

## 5. 推断清单

### TypeScript 附加配置

| 选项 | 理由 |
| --- | --- |
| `target: ES2022` | 覆盖现有现代 JS 语法和集合 API，由 Vite 继续负责真实输出 |
| `lib: ES2022, DOM, DOM.Iterable` | 同时描述 Node 共享语言能力、浏览器对象、FileList 与 DOM 可迭代对象 |
| `module: ESNext` | 与项目 ESM 和 Vite 一致 |
| `moduleResolution: Bundler` | 遵循 Vite 的包解析及无扩展名类型导入；没有把 Electron 改为 TS 运行 |
| `jsx: react-jsx` | React 19 自动 JSX runtime |
| `types: node, vite/client` | 显式启用 Node 全局及 Vite 资源导入声明，避免自动混入测试环境全局 |
| `isolatedModules: true` | 约束未来 TS 代码能被 Vite 按文件转换 |
| `esModuleInterop: true` | 兼容现有 CommonJS 依赖的导入方式 |
| `resolveJsonModule: true` | 为项目现有 JSON 资源导入提供类型解析 |
| `forceConsistentCasingInFileNames: true` | 在 Windows/macOS 间提前发现导入路径大小写问题 |
| `skipLibCheck: true` | 跳过第三方声明包内部检查，检查项目自有 TS 与 preload；不是关闭 strict 子项 |

### IPC 与领域边界

63 个方法的成功、失败、取消分支都追踪了 `electron/main.js` 及相应模块。没有以 `any`、`unknown` 或任意键的未知对象代替 IPC 返回结构。以下是无法由当前 JS 完全证明的边界，未偷偷扩大成运行时校验：

1. `openWorkbenchImage`、`openClipboardWorkbenchImage`、`openDroppedWorkbenchImages` 及三个 import 方法、`commitPreparedImport` 的原始 metadata：`steps`/`guidance` 由 `electron/metadata.js:160`、`:162` 原样读取，按数字、字符串或 null 描述；`novelai_auto.uc_preset`/`params_version` 在 `src/lib/novelaiAutoPrompt.js:197`、`:199` 同样保留原值，按数字、字符串或 null 描述。异常图片实际可能携带其他 JSON 形状，现有 JS 未拦截。数据库归档后的 steps/guidance 则按真实 SQL 结果为 number/null。
2. `loadLibrary`、`updateProjectName` 的历史 metadata 缺失时会回退 `{}`，因此使用 `Partial<StoredGenerationParameters>`；历史 Prompt JSON 可能为空，所以数据库结构与归一化后的完整结构分开描述。任意损坏或手工编辑的 JSON 不保证符合完整类型。来源：`electron/database.js:635`、`:644`、`:697`、`:702`。
3. `loadCollections`、`createCollection`、`updateCollection`：filters 的已知字段来自 `galleryFilters.js`，使用 `Partial<GalleryFilters>`，保留手动收藏集空对象。数据库只序列化/解析 JSON，可能保留其他键；这些没有依据的键不加入契约。
4. `openWorkbenchImage` 的 source 参数按现有调用者限定为 file/library/clipboard，描述已知 path/projectId/temporaryId/fingerprint/id；主进程会透传额外键，类型不承诺这些未知键。拖放参数支持当前 DOM FileList、数组及可迭代 File 集合，允许 null。
5. `getAISettings`/`saveAISettings`：正常保存的字符串字段按字符串声明；读取 preferences 时没有全面校验手工篡改的数据。`listAIModels` 按返回模型 ID 字符串数组描述；上游 JSON 缺少严格 schema，依据当前 map/filter/localeCompare 及 UI 用法推断，非字符串上游数据可能令调用返回 Failure。
6. `listTagCache`、`updateTagCache`、`updateTagCacheMany`、`translateTags` 及图片 Tags 的 category/source 采用现有分类和来源枚举；历史数据库没有对这两个文本列施加全面 CHECK 约束，因此损坏数据或未经过规范化的历史值仍可能超出枚举。
7. off 事件方法按 preload 的真实返回值声明为 `Electron.IpcRenderer`；on 方法无返回值。当前 UI 不消费 off 的返回值。类型不代表已经验证 contextBridge 对返回对象的运行时复制行为。
8. 工具版本选择保留已有锁定版本、采用已发布的固定工具版本；并未跟随 latest。类型文件都不产生运行时代码，未引入额外 ESLint、验证库或构建步骤。

当前 `ipcRenderer.invoke` 自身返回类型来自 Electron 的宽泛声明。preload 契约能约束方法集合和上下文参数类型，但不能自动证明未启用 checkJs 的主进程返回值永远符合声明；本次返回类型靠源码追踪建立，后续迁移需继续维护。

## 6. 【实现时核实】格式化前后产物

保存格式化前 build 的 dist，在格式化后及最终 build 比较全部 306 个 JS 文件；文件匹配忽略末尾内容哈希，内容按原字节比较。

305 个 JS 文件完全一致，包括 `galleryGrouping.worker` 和 `ReleaseNotes` 等分块。主入口从 `index-CIR0FzTT.js` 变为 `index-1aH2Aj-1.js`，只有两处差异：

- `src/WorkbenchPage.jsx:95`：子节点中的 ` · Information ` 拆成 ` · Information` 和单独的空格字符串。
- `src/components/ArchiveImportModal.jsx:287`：选中数量后的 ` / ` 拆成 ` /` 和单独的空格字符串。

Prettier 把跨行 JSX 的尾部空格写成显式 `{' '}`，Vite 因此生成两个相邻字符串子节点。将这两对字符串按相同文本合并后，主入口全文逐字节一致；没有其他逻辑、条件、事件或文字变化。未为了获得同哈希而回退或手调格式化结果。

结论：构建成功，除两处等价 JSX 文本节点拆分外产物相同；不能声称所有文件原始字节完全一致。没有进行 GUI 实测。

## 7. 手动验证与平台限制

无需新增手动验证文档：本次没有改变启动流程、窗口行为、快捷键、对话框、安全存储或打包方式，只增加发布前的静态检查门槛。没有操作用户日常图库。

CI 的 macOS runner 会执行安装、格式检查、类型检查、测试与 Vite 构建，但不能覆盖真实桌面交互、系统字体实际显示、钥匙串、窗口与签名/安装体验；这些在本任务中未更改。遵循人工验证暂停决定，不新增 macOS 交接。

## 8. 偏离说明

构建产物不满足“全部内容完全一致”的预期，具体原因和精确差异见第 6 节；任务说明允许查明并报告此类差异。其余实施范围和提交拆分按任务执行。

## 9. 已知问题与字段差异

逐项核对现有桌面 IPC 消费代码后，未发现可确认的主进程返回字段与当前 UI 消费方式直接不匹配的问题。以下边界保留原样：

- 非桌面 fallback 不等同于桌面 StudioApi：`src/App.jsx:126` 的 getLibraryStorage 缺少 defaultAssetsDirectory，`:140` 的清理结果缺少 removed，`:179` 的 AI 设置缺少两个 Prompt 和 defaultPrompts，`:196` 的更新状态使用 platform='web' 且缺少若干桌面状态字段。这些不是主进程返回值，也不属于本次迁移范围；不能在未来将 fallback 直接断言为完整 StudioApi。
- 数据库 Prompt Tag 未存储 segment_type（`electron/database.js:920` 附近），解析器会生成该字段（`src/lib/prompt.js:324`）；UI 已在 `src/App.jsx:504` 使用 repairLegacyPromptTags，并在 `:505` 归一化 Prompt，因此本次没有认定为未处理的运行时缺陷。
- 安装存在既有 React 19 与 `@emoji-mart/react` peer 范围告警，以及 deprecated/allow-scripts 提示；锁文件生成时 npm audit 报 33 项（7 low、13 moderate、11 high、2 critical）。未在此任务里升级依赖或运行 audit fix。生产构建继续提示部分第三方 chunk 超过 500 KB。

现有命名差异均按实际形状保留：

| 对象/含义 | 持久化或一处命名 | 另一处命名 |
| --- | --- | --- |
| 图片 ID / 组封面 | project_id、prompt_fingerprint | setGroupCover 返回 projectId、promptFingerprint（`electron/database.js:1132`） |
| Vibe 信息强度 | information_extracted | fingerprint 内部 informationExtracted（`electron/vibes.js:16`） |
| 取消 | 对话框结果 canceled（`electron/main.js:788`） | 批次 summary.cancelled（`electron/importer.js:494`） |
| AI 设置 | aiBaseUrl、aiModel 等存储键 | baseUrl、model 等公开键（`electron/preferences.js:111`） |
| Vibe 指纹位置 | 导入对象 metadata.vibe_fingerprint | 图库行顶层 vibe_fingerprint |
| 大括号状态 | 数据库 brace_trailing_comma 为 0/1 | parsePrompt 中为 boolean；类型保留两种 |

以上未作顺手修复，供后续迁移参考。
