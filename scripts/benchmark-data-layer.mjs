import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fork } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-data-benchmark-'));
const sizes = process.argv.slice(2).length
  ? process.argv.slice(2).map(Number)
  : [1000, 5000, 20000];
if (sizes.some((size) => !Number.isSafeInteger(size) || size < 1))
  throw Error('Sizes must be positive integers');
const results = [];
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
    const timeoutMs = (mode === 'seed' && kind === 'sql.js' && count >= 20000 ? 5 : 20) * 60 * 1000;
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
    const seeded = await run('seed', 'sql.js', fixture, count);
    if (seeded.error) {
      results.push({ ...seeded, kind: 'sql.js (fixture)', phase: `fixture/${seeded.phase}` });
      fs.rmSync(fixture, { recursive: true, force: true });
      const fallback = await run('seed', 'node:sqlite', fixture, count);
      if (fallback.error) {
        results.push({ ...fallback, phase: `fixture/${fallback.phase}` });
        continue;
      }
    }
    for (const kind of ['sql.js', 'node:sqlite', 'better-sqlite3']) {
      const directory = path.join(root, `${count}-${kind.replace(':', '-')}`);
      fs.mkdirSync(directory);
      fs.copyFileSync(path.join(fixture, 'studio.sqlite'), path.join(directory, 'studio.sqlite'));
      results.push(await run('measure', kind, directory, count));
      fs.rmSync(directory, { recursive: true, force: true });
    }
    fs.rmSync(fixture, { recursive: true, force: true });
  }
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
const number = (value) => (!Number.isFinite(value) ? '—' : value.toFixed(2));
const table = [
  '| 图片 | 引擎 | 打开 ms | loadLibrary ms | JSON MiB | 写入中位 ms | 写入最大 ms | 导入100 ms | DB MiB | 峰值RSS MiB | 状态 |',
  '|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---|',
  ...results.map(
    (r) =>
      `| ${r.count} | ${r.kind} | ${number(r.openMs)} | ${number(r.loadMs)} | ${number(r.payloadBytes / 1048576)} | ${number(r.writeMedianMs)} | ${number(r.writeMaxMs)} | ${number(r.importMs)} | ${number(r.fileBytes / 1048576)} | ${number(r.peakRssBytes / 1048576)} | ${r.error ? `失败：${r.phase}` : '通过'} |`,
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
if (results.some((r) => r.count <= 5000 && r.error)) process.exitCode = 1;
