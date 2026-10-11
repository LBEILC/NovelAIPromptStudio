# 数据层基线与原生 SQLite 选型（003）

## 复现方法与边界

测量命令：`npm run benchmark:data-layer`，默认依次运行 1000、5000、20000；可追加图片数单独复现，例如 `npm run benchmark:data-layer -- 1000`。结果输出为 Markdown，并保存到 `.codex-runs/data-layer/benchmark.{json,md}`。这些原始日志不提交。

所有数据库由脚本在 `os.tmpdir()` 下新建，结束后清理。没有读取、复制用户图库。正式应用的 `electron/database.js` 和所有运行时代码没有修改。

夹具使用当前 `openDatabase()` 建立 schema，通过当前 `insertProject()` 的 SQL/业务逻辑写入。为避免准备 5000 张夹具时提前执行 5000 次整库导出，研究脚本在内存中的源码副本里仅将准备阶段的 `persist()` 延迟到末尾一次执行；实际 sql.js 测量直接调用未修改的 `openDatabase()`。候选用一个研究专用适配器替换源码副本的底层连接及整库持久化，保留同一套 SQL、字典规则、分组指纹、对象水合和返回字段；只暴露本次测量操作，不构建新的产品数据层。行为等价测试将原型输出与现有入口逐项比较。

每张图片 59 个 Tag；字典 2400 行，Danbooru 缓存 750 行。元数据的 `extra_json` 平均 62 KiB、最大 271 KiB；`prompt_structure_json` 平均 21 KiB、最大 41 KiB。每 100 行含一个最大值，其余值按均值补齐；JSON 内容为确定性的长字符串，不使用几十字节占位。孤立元数据数量按 `round(图片数 × 147 / 159)` 构造。12 张遗留表的定义直接取自仓库 `18386b7^:electron/database.js`，每表 3 行；当前所有表也均有内容。为保留历史孤立数据，夹具补充阶段关闭外键检查；这不是产品迁移方案。

任务提供的是不完整的真实样本统计：按明确给出的列大小、孤立行和 Tag 数构造，不能同时保证每图约 250 KB 的经验总量。未把未知的历史 Vibe、版本快照体积虚构成大块数据。因此本结果是该明确分布下的基线，对更大历史负担的库可能偏乐观。合成内容可高度压缩；SQLite 不对普通 TEXT 压缩，但这不代表真实图片或备份压缩率。长 ASCII 字符串也没有复现真实嵌套对象、Unicode 或 Vibe 解析的复杂度，不能把其解析成本等同于真实素材。

各引擎、各规模在独立 Node 子进程测量，准备进程的峰值不混入测量进程。每进程 12 GiB V8 堆上限；最终脚本对 20000 及以上的 sql.js 夹具准备设 5 分钟上限，其他准备与实际测量设 20 分钟上限。内存为 `process.resourceUsage().maxRSS` 的进程生命周期峰值，包含打开、读取、序列化统计与导入。文件大小为导入前主文件；原始 JSON 另记录导入后主文件、WAL、SHM 合计。

打开计时包含模块初始化、当前 schema 检查和回填；现有实现还包含首次备份和打开末尾整库 `persist()`。原型不执行每次打开的文件复制备份，采用 WAL、`synchronous=FULL`，保持默认自动 checkpoint。写入计时为 7 次 `updateTagDictionary()`（包含 SQL 和其内部 `persist()`/原生提交）的中位数与最大值，没有通过调用一个空 `persist()` 来计算候选优势。100 张导入逐张调用 `insertProject()`，各自独立事务；只测数据层，不含图片解码、缩略图、磁盘图片复制和网络。

`loadLibrary()` 保留全量返回；JSON 大小通过逐项 `JSON.stringify()` 加数组分隔符精确累加 UTF-8 字节，避免 V8 单个字符串长度上限。这不是实际 Electron IPC 耗时测量，也不包含 Chromium 基础内存和渲染进程中的副本。打开/读取/导入各测一次，是本机诊断数据，不是统计稳定的跨机器排名；运行期间有常规开发进程和部分探针打包工作。

## 实测结果

环境：2026-10-11，Windows 10.0.26200 x64，AMD Ryzen 9 9955HX（16 核），物理内存 31.18 GiB，Node 24.14.0、sql.js 1.14.1。命令 `npm run benchmark:data-layer`；以下为完整完成的 1000 / 5000 测量结果。20000 的准备过程单独复测，见表后说明。

| 图片 | 引擎 | 打开 ms | loadLibrary ms | JSON MiB | 写入中位 ms | 写入最大 ms | 导入100 ms | DB MiB | 峰值RSS MiB |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| 1000 | sql.js | 1611.17 | 692.08 | 138.81 | 376.65 | 576.96 | 33880.21 | 210.02 | 1399.18 |
| 1000 | node:sqlite | 1225.15 | 773.25 | 138.81 | 0.58 | 3.47 | 900.41 | 210.02 | 472.79 |
| 1000 | better-sqlite3 | 787.69 | 441.60 | 138.81 | 0.83 | 3.67 | 1204.86 | 210.02 | 570.53 |
| 5000 | sql.js | 10869.51 | 5026.00 | 694.56 | 2031.48 | 2255.07 | 213920.26 | 1048.91 | 6227.23 |
| 5000 | node:sqlite | 5522.88 | 3915.10 | 694.56 | 0.79 | 18.52 | 1340.91 | 1048.91 | 1261.12 |
| 5000 | better-sqlite3 | 3817.86 | 2377.84 | 694.56 | 0.65 | 3.14 | 1328.62 | 1048.91 | 1356.53 |

5000 张单次写入的原始中位数：sql.js **2031.4842 ms**，node:sqlite **0.7934 ms**（约 **2560 倍**），better-sqlite3 **0.6495 ms**（约 **3128 倍**）。两候选都是实际 UPSERT 提交耗时，保留 FULL 同步策略。node:sqlite 首次写入为 18.5162 ms，故同时列最大值，不用中位数掩盖首轮成本。

此规模的三种引擎均返回 **728,298,841 字节（694.56 MiB）** 的相同 JSON 等价内容。sql.js 峰值 **6,529,728,512 字节（6.08 GiB）**，数据库 **1,099,857,920 字节**。引擎替换能显著减少整库导出的成本，却不会自动缩小 IPC 内容。

20000 初次准备使用一个大事务补充全部孤立行，长时间停留在准备阶段、进程峰值超过 11 GiB；为避免把夹具事务策略当成产品失败，停止该准备子进程，保留六组已完成数据，改成每 100 行提交后执行 `npm run benchmark:data-layer -- 20000`。此人工中止不作为 sql.js 打开大库的失败证据。

复测分批准备仍在最后报告 `seed:orphan-13900` 后超过 5 分钟。`Get-Process -Id 50676` 记录 `PeakWorkingSet64=12125020160`（约 11.29 GiB）；这次对已启动的控制器人工施加了该时间上限，子进程退出码为 4294967295。最终脚本已自动化同一限制，并在失败后用原生连接、相同 schema/数据构造夹具，checkpoint、切回 DELETE journal 并关闭，再逐个引擎复制和测量；小夹具回读测试证明这条备用路径可由原始入口读取。

最终 20000 张数据库为 **4,402,954,240 字节（4198.98 MiB）**。以下结果来自 `npm run benchmark:data-layer -- 20000`，包括原始入口的实际打开尝试：

| 图片 | 引擎 | 打开 ms | loadLibrary ms | JSON MiB | 写入中位 ms | 写入最大 ms | 导入100 ms | DB MiB | 峰值RSS MiB | 结果 |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|
| 20000 | sql.js | — | — | — | — | — | — | 4198.98 | 60.45 | open 阶段失败 |
| 20000 | node:sqlite | 17652.34 | 13201.76 | 2779.82 | 0.69 | 2.47 | 1248.13 | 4198.98 | 4246.41 | 通过 |
| 20000 | better-sqlite3 | 11572.37 | 8925.87 | 2779.82 | 0.59 | 2.75 | 1334.58 | 4198.98 | 4296.43 | 通过 |

原始入口错误摘要为 `RangeError [ERR_FS_FILE_TOO_LARGE]: File size (4402954240) is greater than 2 GiB`，栈指向 `node:fs tryCreateBuffer` → `readFileSync` → `electron/database.js:162`。这是当前整文件读入路径的硬失败，尚未进入 loadLibrary；60.45 MiB 只是这个提前失败进程的峰值，不能理解为大库打开很省内存。没有把它误报为 WASM 上限。两个候选在同一文件上完整执行，其返回 JSON 等价大小均为 **2,914,848,281 字节**。

本机保留初次六组结果于 `.codex-runs/data-layer/benchmark-initial.{json,md}`，20000 复测于 `benchmark.{json,md}`；这两轮的数值已完整写入本报告，日志不进 git。默认一条命令会按最终协议依次完成三个规模并输出合并表格。

## 候选逐项核实

| 项目 | node:sqlite | better-sqlite3 13.0.3 |
|---|---|---|
| Windows Electron 43.1.1 开发主进程 | 加载成功；SQLite 3.53.1 | 加载成功；SQLite 3.53.4 |
| Windows 未签名 ASAR 目录包 | 加载、WAL、事务、FTS5、预编译写入、在线备份通过 | 相同项目通过 |
| 本机 Node 24.14.0 / Vitest | 兼容测试通过；打印 ExperimentalWarning | 兼容测试通过，无 ABI 错误 |
| 本机 Node 22.23.3 / Vitest | 兼容测试通过；打印 ExperimentalWarning | 同一安装内容直接通过，无重编译 |
| 同步/异步 | DatabaseSync 的查询、写入同步；backup 返回 Promise | 查询、事务同步；backup 返回 Promise |
| 主线程阻塞 | 同步操作阻塞调用线程；异步备份不等于异步查询接口 | 相同；有 Worker 用法但不是另一套异步查询 API |
| Electron 内置 Node 的稳定性 | 实测 24.18.0；官方对应版本标注 Stability 1.2（Release candidate），开发与打包探针日志均无实验性警告 | 第三方独立版本，无 Node 实验性警告；本次固定 13.0.3 |
| Electron 重编译 | 内置模块，不需要 | 13 系列使用 N-API；本机明确设置 npmRebuild=false 后可直接加载，不能沿用旧版必需按 Electron ABI 重编译的结论 |
| ASAR | 不添加原生文件，不需要新的解包规则 | 探针显式解包 `node_modules/better-sqlite3/prebuilds/**/*` 后通过；不能把依赖归档到 ASAR 就当作原生加载验证 |
| macOS x64 + arm64 | 使用相应 Electron 自带模块 | 包内已有 darwin-x64.node 与 darwin-arm64.node；按 process.arch 选择；仍需 CI 运行证据 |

本机证据命令：

- `npx vitest run scripts/data-layer/compatibility.test.mjs`：覆盖直接打开、所有 21 表完整内容、孤立行、WAL/SHM、重开不丢行、生产返回等价、事务回滚、FTS5、预编译语句、在线备份并重开。
- `npx --yes --package=node@22 node node_modules/vitest/vitest.mjs run scripts/data-layer/compatibility.test.mjs`：同一候选包在 Node 22 下通过，无安装/重建另一份二进制。
- `node scripts/probe-data-layer-electron.mjs`：构建并启动独立无窗口 Electron 主进程和未签名目录包；两候选 `ok=true`，`journal_mode=wal`，回滚后只剩 `{id:2,value:'committed'}`，在线备份 28672 字节。实际 `process.versions`：Electron 43.1.1、Node 24.18.0、N-API 10。
- `Get-AuthenticodeSignature -LiteralPath '.codex-runs/data-layer/electron/package/win-unpacked/sqlite-research-probe.exe'`：`NotSigned`。
- 对生成的 `sqlite-research-probe Setup 1.0.0.exe` 执行同一签名检查也为 `NotSigned`。用 `@electron/asar.listPackage()` 核对包内存在 better-sqlite3 的 `lib/index.js`，ASAR 外 `prebuilds/win32-x64.node` 存在且为 1,989,632 字节。
- `npm view better-sqlite3 version time --json`：13.0.3 发布于 2026-08-05，满足优先采用发布超过 7 天版本的要求。
- 读取 `node_modules/better-sqlite3/{package.json,lib/binding.js,prebuilds/}`：13.0.3 依赖 node-addon-api；包含 macOS 双架构与 Windows x64/arm64 预编译文件，Windows x64 文件 1,989,632 字节，macOS arm64 / x64 分别 1,980,736 / 1,982,880 字节。

稳定级别必须对应实际运行版本，不能拿本机 24.14.0 的警告推断 Electron 的 24.18.0。依据：[Node 24.18.0 SQLite 文档](https://nodejs.org/download/release/v24.18.0/docs/api/sqlite.html)、[better-sqlite3 13.0.0 发布说明](https://github.com/WiseLibs/better-sqlite3/releases/tag/v13.0.0)、[13.0.3 API](https://github.com/WiseLibs/better-sqlite3/blob/v13.0.3/docs/api.md)。同步调用应放在独立 Worker/进程才能避免阻塞 Electron 主线程，这是下一任务的工程建议，本任务不实施。

### 打包体积

同一个独立探针、Electron 43.1.1、Windows x64、ASAR、未签名 NSIS，分别构建含 better-sqlite3 与不含新增依赖的包。`sizes.json` 输出：

| 内容 | node:sqlite 基准 | 加入 better-sqlite3 | 差值 |
|---|---:|---:|---:|
| 解压目录 | 364,133,999 B | 391,855,519 B | +27,721,520 B（26.44 MiB） |
| NSIS 安装包 | 99,505,283 B | 108,341,903 B | +8,836,620 B（8.43 MiB） |

这是独立探针的增量，不能当成正式产品最终安装包大小。探针保留依赖所有平台预编译文件和发布包内容，尚未做按目标架构裁剪。node:sqlite 没有新增依赖或原生解包内容；最终替换还会移除 sql.js，节省量未在本任务估算。

如果采用 node:sqlite，`release.yml` 的 macOS `--x64 --arm64` 命令无需为 SQLite 新增编译工具链、分架构重建或 ASAR 解包规则。若采用 better-sqlite3 13，需要把依赖从 devDependencies 移入 dependencies，确保目标架构二进制进入包并可从 ASAR 外加载；Windows 已证明无需 Electron ABI 重编译，macOS 双架构加载与产物仍由 CI/后续打包验证覆盖。不建议为了 SQLite 一项而全局禁止现有其他原生依赖的重建。ASAR 原生加载限制见 [Electron 官方说明](https://www.electronjs.org/docs/latest/tutorial/asar-archives)。

### macOS CI 状态

`.github/workflows/ci.yml` 保留原有安装、格式、类型、测试和构建步骤，增加 Node 22/24 矩阵，并在 Windows/macOS 运行无窗口 Electron 主进程探针，上传 JSON 与日志。兼容性测试会随普通 `npm test` 运行，没有针对某一候选静默 skip。

本次是工程派发任务，按角色规定只提交、不推送，因此**没有本次提交的远端 macOS CI 运行结果**。本机 Windows 上两个候选都通过，不能声称某个在 macOS 已通过、另一个被卡住。设计负责人验收推送后应读取这四个矩阵结果。CI 尚不覆盖 macOS Intel/Apple Silicon 双架构的打包后运行、签名、公证和实际交互；没有新增暂停中的 macOS 人工交接。

## 单文件假设与 WAL 影响清单

检索命令：`rg -n 'studio\\.sqlite|\\.sqlite|database\\.persist|database\\.filePath|backupPath' electron scripts doc/demo-profile.md`，并检查 `libraryStorage.js`、`appProfile.js` 与主进程调用点。下列仅记录，不改产品实现。

| 位置 | 现有行为及 WAL 下的含义 |
|---|---|
| `electron/database.js:154–165` | 只定位/读取 studio.sqlite；首次备份 copyFileSync 仅复制主文件，无法包含尚未 checkpoint 的提交。 |
| `electron/database.js:291–295` | 导出整库到 .tmp 后 rename 覆盖主文件；WAL 连接存续时不能继续沿用覆盖主文件模型。 |
| `electron/main.js:254` | 损坏提示只要求保留 studio.pre-phase2.sqlite；未来恢复说明需考虑主库和 WAL 状态。 |
| `electron/main.js:1232` | AI Tag 更新后显式 persist；虽然不是文件复制，仍假设这一调用完成整库落盘，需要重新定义持久化/提交语义。 |
| `electron/database.test.js:356–366` | 将首次主文件 bytes 与 immutable backup bytes 比较；只证明单文件 sql.js 模型，不证明 WAL 在线备份。 |
| `electron/main.js:247,388–404`、`electron/libraryStorage.js:66–143` | 数据库位于 userData/data；资源库迁移实际只复制 assets、更新数据库路径，不迁移 studio.sqlite。不能误报为“当前代码会丢 WAL 的数据库迁移”。若将来连数据库一起搬，逐文件复制不是一致性快照。 |
| `electron/appProfile.js:34–64`、`doc/demo-profile.md:37,57` | Profile 按目录隔离，不会复制用户库；文档树仅列 studio.sqlite，尚未描述 sidecar。现有目录级隔离可容纳 WAL/SHM，未来清理需等待连接关闭。 |
| `electron/database.test.js` 与其他临时目录测试 | 原 API 没有 close，测试清理依赖 sql.js 不占用磁盘句柄；原生连接应显式关闭后再清理，尤其 Windows。 |
| `scripts/benchmark-data-layer.mjs`、`scripts/data-layer/compatibility.test.mjs` | 本次研究中的主文件复制只发生在 sql.js 完成导出后，或原生夹具 checkpoint+close 后；不能将此复制方法直接移用到运行中的产品数据库。 |

WAL 是持久化状态的一部分，备份/迁移不能随意丢弃。优先使用在线 backup API，或在明确关闭/完成 checkpoint 的状态复制；详见 [SQLite WAL 文档](https://www.sqlite.org/wal.html)。孤立元数据在完整性检查通过时仍可存在；`integrity_check` 不等于 `foreign_key_check`，本任务没有清洗历史关系。

## 推荐与需要下一任务处理的事项

建议下一任务优先选择 **node:sqlite**。它在实际 Electron 43.1.1 开发和 Windows 打包主进程中已经通过所需能力验证，5000 张写入从约 2 秒降低到不到 1 毫秒，不增加独立二进制、编译或 ASAR 管理。其 Electron 对应 Node 版本仍是 Release candidate，而非 Stability 2；这一风险应明确接受并用固定 Electron 版本、兼容性测试和 CI 管理。better-sqlite3 13 同样可用，N-API 已消除本机 Electron ABI 重编译阻碍；没有发现必须淘汰它的硬伤。若项目更重视独立升级 SQLite 或其成熟 API，可作为备选。不要仅凭这轮单次读取时间宣称其稳定快若干倍。

任务问题的直接回答：

1. 没有先验“可用性”SLA，不能伪造精确拐点。已测试的最小 1000 张就有约 377 ms 的同步翻译写入、约 34 秒的 100 张数据导入；5000 张写入约 2.03 秒、导入约 214 秒、打开约 10.87 秒、峰值约 6.08 GiB，虽然能完成，但主进程同步执行会带来严重阻塞。20000 张实际打开遇到 `readFileSync` 的 2 GiB 硬限制而失败。按 5000 张的每图文件量线性估算，约一万张可能触及该限制；这只是推算，未测中间规模，图片数也会随元数据大小改变。
2. 5000 张的 node:sqlite / better-sqlite3 写入中位分别 0.7934 / 0.6495 ms，相对当前约 2560 / 3128 倍。
3. 两个候选本机 Windows 均通过；macOS CI 本次尚未运行，没有“一个通过、另一个卡住”的证据。已交付可实际确认的 CI 矩阵。
4. 采用 node:sqlite 不需要为 SQLite 调整 release.yml 双架构命令或添加 ASAR/native rebuild；下一任务移除未选中的研究开发依赖，并在替换完成后移除 sql.js。产品数据层替换、事务边界、连接生命周期及 WAL 安全备份仍需单独实施，本任务未做迁移。
5. **需要分页或等效的按需加载边界。** 5000 张已达约 695 MiB。列表应只加载所需字段，完整元数据与 Prompt 结构按需获取；这需要下一任务明确 API 合约。本任务没有改 UI 或数据返回字段。

此外，当前 `backfillPromptFingerprints()`（`electron/database.js:1144`）每次打开都会遍历所有项目、逐一 hydrate、解析 extra_json 和计算指纹。原型有意保留它，因此即使原生连接，5000 张打开仍需 3.82–5.52 秒；WAL 无法解决这种全量启动计算。同步查询应移到独立执行上下文，分页与启动回填也应一并评估。
