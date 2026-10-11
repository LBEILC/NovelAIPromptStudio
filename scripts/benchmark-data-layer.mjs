import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { ensureCardBenchmarkTags } from './data-layer/fixture.mjs';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-data-benchmark-'));
const args = process.argv.slice(2);
const fixtureOption = args.find((arg) => arg.startsWith('--fixtures-root='));
const fixtureRoot = fixtureOption
  ? path.resolve(fixtureOption.slice('--fixtures-root='.length))
  : null;
const sizeArgs = args.filter((arg) => arg !== fixtureOption);
const sizes = sizeArgs.length ? sizeArgs.map(Number) : [1000, 5000, 20000];
if (sizes.some((size) => !Number.isSafeInteger(size) || size < 1))
  throw Error('Sizes must be positive integers');
const results = [];
const require = createRequire(import.meta.url);
const runIpc = (directory, count) =>
  new Promise((resolve) => {
    const output = path.join(directory, 'ipc.json');
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = spawn(
      require('electron'),
      [
        fileURLToPath(new URL('./data-layer/electron-cards.mjs', import.meta.url)),
        directory,
        output,
        String(count),
        '--prepared',
      ],
      {
        env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
      },
    );
    let log = '';
    child.stdout.on('data', (data) => {
      log = (log + data).slice(-6000);
    });
    child.stderr.on('data', (data) => {
      log = (log + data).slice(-6000);
    });
    const timer = setTimeout(() => child.kill(), 20 * 60 * 1000);
    child.on('error', (error) => {
      log += error.message;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(
        code === 0 && fs.existsSync(output)
          ? JSON.parse(fs.readFileSync(output, 'utf8'))
          : { ok: false, error: `exit=${code}: ${log}` },
      );
    });
  });
const run = (mode, kind, directory, count) =>
  new Promise((resolve) => {
    const child = fork(
      fileURLToPath(new URL('./data-layer/worker.mjs', import.meta.url)),
      [mode, kind, directory, String(count)],
      { execArgv: ['--expose-gc', '--max-old-space-size=12288'], silent: true },
    );
    let phase = 'launch';
    let result;
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-6000);
    });
    child.stdout.resume();
    child.on('message', (message) => {
      if (message.phase) {
        phase = message.phase;
        console.error(`${kind}/${count}: ${phase}`);
      }
      if (message.result) result = message.result;
    });
    const timeoutMs = 20 * 60 * 1000;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.on('error', (error) => {
      stderr += error.message;
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve(
        result || {
          kind,
          count,
          phase,
          error: `${timedOut ? `timeout after ${timeoutMs} ms; ` : ''}exit=${code}, signal=${signal}; ${stderr}`,
        },
      );
    });
  });

try {
  for (const count of sizes) {
    const fixture = path.join(root, `fixture-${count}`);
    let seeded;
    if (fixtureRoot) {
      // Reuse only benchmark-generated snapshots for iteration. The supplied
      // source is read-only; all measurements still use a fresh temporary copy.
      const source = path.join(fixtureRoot, `fixture-${count}`);
      const manifest = JSON.parse(fs.readFileSync(path.join(source, 'fixture.json'), 'utf8'));
      if (manifest.kind !== 'synthetic-data-layer' || manifest.count !== count)
        throw Error('Expected a matching synthetic benchmark fixture');
      fs.mkdirSync(fixture);
      fs.copyFileSync(path.join(source, 'studio.sqlite'), path.join(fixture, 'studio.sqlite'));
      const raw = new DatabaseSync(path.join(fixture, 'studio.sqlite'));
      try {
        if (raw.prepare('SELECT count(*) n FROM projects').get().n !== count)
          throw Error('Fixture project count mismatch');
        raw.exec(
          "DROP TABLE IF EXISTS library_card_cache; DELETE FROM app_meta WHERE key = 'library_cards_version'",
        );
      } finally {
        raw.close();
      }
      seeded = {};
    } else seeded = await run('seed', 'node:sqlite', fixture, count);
    if (seeded.error) {
      results.push(seeded);
      continue;
    }
    ensureCardBenchmarkTags(fixture, count);
    for (const kind of ['node:sqlite']) {
      const directory = path.join(root, `${count}-${kind.replace(':', '-')}`);
      fs.mkdirSync(directory);
      fs.copyFileSync(path.join(fixture, 'studio.sqlite'), path.join(directory, 'studio.sqlite'));
      const result = await run('measure', kind, directory, count);
      const ipcDirectory = path.join(root, `ipc-${count}`);
      fs.mkdirSync(ipcDirectory);
      fs.copyFileSync(
        path.join(fixture, 'studio.sqlite'),
        path.join(ipcDirectory, 'studio.sqlite'),
      );
      console.error(`Electron/${count}: renderer IPC`);
      const prepared = await run('prepare-cards', kind, ipcDirectory, count);
      result.ipc = prepared.error
        ? { ok: false, error: prepared.error }
        : await runIpc(ipcDirectory, count);
      if (!result.ipc.ok) {
        result.phase = 'Electron IPC';
        result.error = result.ipc.error;
      }
      result.performanceChecks =
        count === 5000
          ? [
              {
                label: '无变更重开后的首次列表',
                ms: Math.max(
                  result.cardsMs,
                  result.ipc.mainMs?.[0] ?? 0,
                  result.ipc.mainBlockingMs?.[0] ?? 0,
                ),
                limitMs: 400,
              },
              {
                label: '无变更热列表',
                ms: Math.max(
                  ...(result.warmCardsMs || []),
                  ...(result.ipc.mainBlockingMs?.slice(1, 3) || []),
                ),
                limitMs: 100,
              },
              {
                label: '首次建立最大事件循环阻塞',
                ms: Math.max(
                  result.firstCacheMaxBlockingMs,
                  result.ipc.mainBlockingMs?.[3] ?? Infinity,
                ),
                limitMs: 100,
              },
              ...Object.entries({
                uniqueTranslation: 400,
                uniqueCategory: 400,
                commonCategory: 1500,
                import200: 1500,
                metadataOnly: 100,
              }).map(([name, limitMs]) => ({
                label: `词典变化及列表：${name}`,
                ms: result.dictionaryScenarios?.[name]?.ms,
                limitMs,
              })),
              ...['tag', 'rename', 'trash'].map((change) => ({
                label: `单图改动后列表：${change}`,
                ms: result.afterEditCardsMs?.[change],
                limitMs: 400,
              })),
              { label: '导入 100 张后列表', ms: result.afterImportCardsMs, limitMs: 1000 },
              {
                label: '渲染器到渲染器真实 IPC',
                ms: Math.max(...(result.ipc.samples || [])),
                limitMs: 1000,
              },
            ].map((check) => ({
              ...check,
              passed: Number.isFinite(check.ms) && check.ms <= check.limitMs,
            }))
          : [];
      results.push(result);
      fs.rmSync(directory, { recursive: true, force: true });
    }
    fs.rmSync(fixture, { recursive: true, force: true });
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
const number = (value) => (!Number.isFinite(value) ? '—' : value.toFixed(2));
const table = [
  '| 图片 | 引擎 | 首次打开 ms | 再次打开 ms | 卡片 ms | 卡片 MiB | 单张详情 ms | 最大调用耗时 ms | loadLibrary ms | JSON MiB | 写入中位 ms | 写入最大 ms | 导入100 ms | DB MiB | 峰值RSS MiB | 状态 |',
  '|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|',
  ...results.map(
    (r) =>
      `| ${r.count} | ${r.kind} | ${number(r.openMs)} | ${number(r.secondOpenMs)} | ${number(r.cardsMs)} | ${number(r.cardsBytes / 1048576)} | ${number(r.detailMs)} | ${number(r.maxBlockingMs)} | ${number(r.loadMs)} | ${number(r.payloadBytes / 1048576)} | ${number(r.writeMedianMs)} | ${number(r.writeMaxMs)} | ${number(r.importMs)} | ${number(r.fileBytes / 1048576)} | ${number(r.peakRssBytes / 1048576)} | ${r.error ? `失败：${r.phase}` : r.performanceChecks?.some((c) => !c.passed) ? '性能未达标' : '完成'} |`,
  ),
].join('\n');
fs.mkdirSync('.codex-runs/data-layer', { recursive: true });
fs.writeFileSync(
  '.codex-runs/data-layer/benchmark.json',
  JSON.stringify(
    {
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch,
        cpu: os.cpus()[0].model,
        memory: os.totalmem(),
      },
      results,
    },
    null,
    2,
  ),
);
fs.writeFileSync('.codex-runs/data-layer/benchmark.md', table);
console.log(table);
const scenarios = [
  '| 图片 | 首建缓存 ms | 重开首次列表 ms | 热列表最大 ms | 改 Tag 后 ms | 改名后 ms | 回收站后 ms | 导入100后列表 ms | Electron IPC 首次 ms | Electron IPC 热最大 ms |',
  '|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|',
  ...results.map(
    (r) =>
      `| ${r.count} | ${number(r.firstCacheMs)} | ${number(r.cardsMs)} | ${number(Math.max(...(r.warmCardsMs || [])))} | ${number(r.afterEditCardsMs?.tag)} | ${number(r.afterEditCardsMs?.rename)} | ${number(r.afterEditCardsMs?.trash)} | ${number(r.afterImportCardsMs)} | ${number(r.ipc?.samples?.[0])} | ${number(Math.max(...(r.ipc?.samples?.slice(1) || [])))} |`,
  ),
].join('\n');
fs.appendFileSync('.codex-runs/data-layer/benchmark.md', '\n\n' + scenarios);
console.log(scenarios);
const dictionaryScenarios = [
  '| 图片 | 稀有 Tag 译文 ms | 稀有 Tag 分类 ms | 八成 Tag 分类 ms | 导入200条 ms | 无语义变化 ms | 首建最大阻塞 ms（Node / Electron，含回复） | 首建期间成功 IPC 次数 |',
  '|---:|---:|---:|---:|---:|---:|---|---:|',
  ...results.map(
    (r) =>
      `| ${r.count} | ${number(r.dictionaryScenarios?.uniqueTranslation?.ms)} | ${number(r.dictionaryScenarios?.uniqueCategory?.ms)} | ${number(r.dictionaryScenarios?.commonCategory?.ms)} | ${number(r.dictionaryScenarios?.import200?.ms)} | ${number(r.dictionaryScenarios?.metadataOnly?.ms)} | ${number(r.firstCacheMaxBlockingMs)} / ${number(r.ipc?.mainBlockingMs?.[3])} | ${r.ipc?.firstBuild?.responsiveRequests ?? '—'} |`,
  ),
].join('\n');
fs.appendFileSync('.codex-runs/data-layer/benchmark.md', '\n\n' + dictionaryScenarios);
console.log(dictionaryScenarios);
for (const result of results)
  for (const check of result.performanceChecks || [])
    console.log(
      `${check.passed ? 'PASS' : 'FAIL'} ${check.label}: ${number(check.ms)} ms <= ${check.limitMs} ms`,
    );
if (results.some((r) => r.error || r.performanceChecks?.some((check) => !check.passed)))
  process.exitCode = 1;
