import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import electron from 'electron';
import { verifyNativePackage } from './verify-native-package.mjs';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { bundledMiSans } from './font-vite.mjs';

import { acceptanceOptions } from './acceptance-options.mjs';
import { timingSummary, logTimings } from '../electron/acceptance/timing.js';
const options = acceptanceOptions();
const packaged = process.argv.includes('--packaged');
if (packaged) {
  options.needsLibrary = true;
  options.needsDictionary = false;
}
const startedAt = Date.now();
const theme = process.argv.includes('--theme=dark') ? 'dark' : 'light';
const output = path.resolve(
  '.codex-runs',
  packaged ? 'acceptance-packaged' : options.outputName,
  ...(packaged ? [] : [theme]),
);
const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nai-acceptance-'));
let failure = false;
let continueDictionary;
const requests = [];
const server = createServer((request, response) => {
  if (request.url === '/control/dictionary-continue') {
    continueDictionary?.();
    continueDictionary = undefined;
    response.end('ok');
    return;
  }
  if (request.url === '/control/fail') {
    failure = true;
    response.end('ok');
    return;
  }
  if (request.url === '/control/success') {
    failure = false;
    response.end('ok');
    return;
  }
  if (request.url === '/control/timeout') {
    failure = 'timeout';
    response.end('ok');
    return;
  }
  requests.push({ method: request.method, url: request.url });
  if (failure === 'timeout') return;
  response.setHeader('Content-Type', 'application/json');
  if (failure) {
    response.writeHead(503);
    response.end(JSON.stringify({ error: { message: '验收服务暂时失败' } }));
    return;
  }
  if (request.method === 'POST') {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      const parsed = JSON.parse(body);
      if (parsed.model === 'dictionary-cancel') return;
      if (String(parsed.model).startsWith('dictionary-')) {
        const tags = JSON.parse(parsed.messages[1].content).tags;
        if (parsed.model === 'dictionary-partial' && tags.some((tag) => tag.endsWith('000'))) {
          response.writeHead(503);
          response.end(JSON.stringify({ error: { message: 'synthetic batch failure' } }));
          return;
        }
        const complete = () =>
          response.end(
            JSON.stringify({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      items: tags.map(() => ({
                        translation: '合成重译结果',
                        category: 'Environment',
                      })),
                    }),
                  },
                },
              ],
            }),
          );
        // Hold the successful second batch while the real renderer inspects
        // the first batch's failure progress, then release through loopback.
        if (parsed.model === 'dictionary-partial') continueDictionary = complete;
        else complete();
      } else
        response.end(
          JSON.stringify({ model: 'acceptance-model', choices: [{ message: { content: 'OK' } }] }),
        );
    });
    return;
  }
  response.end(
    JSON.stringify(
      request.url?.endsWith('/models')
        ? { data: [{ id: 'acceptance-model' }, { id: 'acceptance-other' }] }
        : { model: 'acceptance-model', choices: [{ message: { content: 'OK' } }] },
    ),
  );
});
async function run(executable, args, timeout = options.processTimeoutMs) {
  const env = { ...process.env, CSC_IDENTITY_AUTO_DISCOVERY: 'false' };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.NOVELAI_DEV_URL;
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      env,
      stdio: 'inherit',
      windowsHide: true,
      shell: false,
    });
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`Acceptance process timeout after ${timeout} ms (slow=${options.slow})`));
    }, timeout);
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      code === 0 ? resolve() : reject(new Error(`Acceptance exited ${code}`));
    });
  });
}
try {
  await fs.mkdir(output, { recursive: true });
  for (const file of await fs.readdir(output)) {
    if (
      file.endsWith('.png') ||
      /^(?:checks-(?:progress-)?[012]|timeout-\d+-\d+|manifest)\.json$/.test(file)
    )
      await fs.unlink(path.join(output, file));
  }
  await fs.writeFile(path.join(root, 'owner'), 'verify:app');
  await fs.mkdir(path.join(root, 'fixtures'));
  if (options.category === '图片库·复制') {
    const source = path.resolve('demo/promo-v090/final');
    // Full-suite library order starts with the last imported fixture. Keep that
    // same image (also present in the recorded CI-timeout screenshot) here.
    const file = (await fs.readdir(source))
      .filter((file) => file.endsWith('.png'))
      .sort()
      .at(-1);
    await fs.copyFile(path.join(source, file), path.join(root, 'fixtures', file));
  } else if (options.needsLibrary)
    await fs.cp(path.resolve('demo/promo-v090/final'), path.join(root, 'fixtures'), {
      recursive: true,
    });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const baseUrl = `http://127.0.0.1:${server.address().port}/v1`;
  if (
    !packaged &&
    ['全部', '悬停态覆盖', '客户端控件', '基础组件', '基础组件·细节', '减少动态效果'].includes(
      options.category,
    )
  )
    await build({
      configFile: false,
      base: './',
      plugins: [react(), bundledMiSans()],
      build: {
        outDir: path.join(root, 'showcase'),
        emptyOutDir: true,
        rolldownOptions: { input: path.resolve('ui-showcase.html') },
      },
    });
  let executable = electron;
  if (packaged) {
    if (!process.argv.includes('--existing-package'))
      await run(process.execPath, [
        'node_modules/electron-builder/cli.js',
        '--dir',
        '--publish',
        'never',
        '-c.win.signAndEditExecutable=false',
        '-c.mac.identity=null',
      ]);
    executable =
      process.platform === 'win32'
        ? path.resolve('release/win-unpacked/NovelAI Prompt Studio.exe')
        : process.platform === 'darwin'
          ? path.resolve(
              `release/mac${process.arch === 'arm64' ? '-arm64' : ''}/NovelAI Prompt Studio.app/Contents/MacOS/NovelAI Prompt Studio`,
            )
          : path.resolve('release/linux-unpacked/novelai-prompt-studio');
  }
  if (packaged) await verifyNativePackage(executable);
  const manifests = [];
  for (const phase of packaged || options.category !== '全部' ? [0] : [0, 1, 2]) {
    await fs.writeFile(
      path.join(root, 'run.json'),
      JSON.stringify({
        ...options,
        output,
        phase,
        packaged,
        baseUrl,
        theme,
        reducedMotion: process.argv.includes('--reduced-motion'),
      }),
    );
    let failure;
    try {
      await run(executable, [...(packaged ? [] : ['.']), `--verify-app=${root}`]);
    } catch (error) {
      failure = error;
    }
    const evidence = await fs
      .readFile(path.join(output, `checks-${phase}.json`), 'utf8')
      .then(JSON.parse)
      .catch(async () => {
        const progress = await fs
          .readFile(path.join(output, `checks-progress-${phase}.json`), 'utf8')
          .then(JSON.parse)
          .catch(() => null);
        return {
          phase,
          durationMs: 0,
          ...progress,
          partial: true,
          checks: [
            ...(progress?.checks || []),
            {
              category: '运行',
              label: '进程输出完整验收清单',
              status: 'failed',
              error: String(failure || 'Missing checklist'),
            },
          ],
        };
      });
    if (failure && !evidence.checks.some((item) => item.status === 'failed'))
      evidence.checks.push({
        category: '运行',
        label: '验收进程正常退出',
        status: 'failed',
        error: String(failure),
      });
    manifests.push(evidence);
    if (
      failure &&
      !(await fs.access(path.join(root, 'snapshot.json')).then(
        () => true,
        () => false,
      ))
    )
      break;
  }
  const checks = manifests.flatMap((item) => item.checks);
  const timings = timingSummary(checks);
  logTimings(timings);
  await fs.writeFile(
    path.join(output, 'manifest.json'),
    JSON.stringify(
      {
        packaged,
        theme,
        slow: options.slow,
        diskDelayMs: options.slow > 1 ? 40 * options.slow : 0,
        category: options.category,
        platform: process.platform,
        durationMs: manifests.reduce((sum, item) => sum + item.durationMs, 0),
        checks,
        timing: options.timing,
        timings,
        wallMs: Date.now() - startedAt,
        screenshots: manifests.flatMap((item) => item.screenshots || []),
        requests,
      },
      null,
      2,
    ),
  );
  console.log(
    `验收完成：${checks.filter((item) => item.status === 'passed').length} 条通过，${checks.filter((item) => item.status === 'uncovered').length} 条本平台未覆盖`,
  );
  if (!checks.length || checks.some((item) => item.status === 'failed'))
    throw new Error(
      `验收失败：${checks
        .filter((item) => item.status === 'failed')
        .map((item) => item.label)
        .join('；')}`,
    );
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  if (
    path.dirname(root) !== path.resolve(os.tmpdir()) ||
    !path.basename(root).startsWith('nai-acceptance-')
  )
    throw new Error('Unsafe cleanup path');
  await fs.rm(root, { recursive: true, force: true, maxRetries: 20, retryDelay: 250 });
}
