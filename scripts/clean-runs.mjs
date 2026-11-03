// Lists (default) or removes (--apply) rebuildable leftovers under .codex-runs:
// downloaded or unpacked apps, installers, dependency installs, abandoned
// acceptance profiles and huge raw dumps. Reports, logs, screenshots and other
// small evidence stay. Also sweeps dead-run profiles from the system temp dir.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { RUN_TEMP_PREFIXES, findStaleRunTempDirs, staleReason } from './lib/runTempDirs.mjs';

const BINARY_EXTENSIONS = new Set([
  '.exe',
  '.dmg',
  '.zip',
  '.blockmap',
  '.heapsnapshot',
  '.whl',
  '.bin',
  '.safetensors',
  '.onnx',
  '.pt',
  '.gz',
  '.tgz',
  '.7z',
  '.msi',
  '.pkg',
  '.appimage',
  '.deb',
  '.asar',
  '.nupkg',
]);
// Evidence that is never removed, however large.
const KEEP_EXTENSIONS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.mp4',
  '.webm',
  '.mov',
  '.mkv',
  '.wav',
  '.mp3',
  '.m4a',
  '.md',
  '.txt',
  '.log',
]);
const HUGE_FILE_BYTES = 100 * 1024 * 1024;
const APP_MARKERS = ['NovelAI Prompt Studio.exe', 'electron.exe', 'chrome_100_percent.pak'];

async function exists(file) {
  return fs.access(file).then(
    () => true,
    () => false,
  );
}

export async function sizeOf(target) {
  const stat = await fs.lstat(target).catch(() => null);
  if (!stat) return 0;
  if (!stat.isDirectory()) return stat.size;
  let total = 0;
  for (const entry of await fs.readdir(target).catch(() => []))
    total += await sizeOf(path.join(target, entry));
  return total;
}

async function classifyDirectory(directory, name) {
  if (RUN_TEMP_PREFIXES.some((prefix) => name.startsWith(prefix)))
    return (await staleReason(directory, Infinity)) ? '遗留的临时验收档案' : null;
  if (name === 'node_modules') return '依赖安装目录';
  if (name.endsWith('.app')) return 'macOS 程序包';
  if (await exists(path.join(directory, 'pyvenv.cfg'))) return 'Python 虚拟环境';
  const entries = await fs.readdir(directory).catch(() => []);
  if (APP_MARKERS.some((marker) => entries.includes(marker))) return '解包的程序';
  if (entries.includes('$PLUGINSDIR')) return '解开的安装程序';
  // Ranged downloads written as 0, 1, 2, …
  if (entries.length && entries.every((entry) => /^\d+$/.test(entry))) return '下载分片';
  return null;
}

function classifyFile(name, size) {
  const extension = path.extname(name).toLowerCase();
  if (KEEP_EXTENSIONS.has(extension)) return null;
  if (BINARY_EXTENSIONS.has(extension)) return '安装包或二进制文件';
  if (/^\.part\d*$/.test(extension) || /^(?:installer-)?part-\d+(?:\.bin)?$/.test(name))
    return '下载分片';
  if (size >= HUGE_FILE_BYTES) return '超大原始数据';
  return null;
}

async function scan(directory, found, worktrees) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true }).catch(() => [])) {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) continue;
    if (entry.isDirectory()) {
      if (await exists(path.join(target, '.git'))) {
        worktrees.push(target);
        continue;
      }
      const reason = await classifyDirectory(target, entry.name);
      if (reason) found.push({ path: target, reason, size: await sizeOf(target) });
      else await scan(target, found, worktrees);
    } else if (entry.isFile()) {
      const size = (await fs.stat(target)).size;
      const reason = classifyFile(entry.name, size);
      if (reason) found.push({ path: target, reason, size });
    }
  }
}

// Top-level task folders touched recently may belong to a task still running.
export async function findRunLeftovers(runsRoot, { keep = [], olderThanHours = 24 } = {}) {
  const found = [];
  const worktrees = [];
  const skipped = [];
  const now = Date.now();
  for (const entry of await fs.readdir(runsRoot, { withFileTypes: true }).catch(() => [])) {
    const target = path.join(runsRoot, entry.name);
    if (entry.isSymbolicLink()) continue;
    const stat = await fs.stat(target);
    if (keep.includes(entry.name) || now - stat.mtimeMs < olderThanHours * 3600_000) {
      skipped.push(entry.name);
      continue;
    }
    if (entry.isDirectory()) {
      if (await exists(path.join(target, '.git'))) {
        worktrees.push(target);
        continue;
      }
      const reason = await classifyDirectory(target, entry.name);
      if (reason) found.push({ path: target, reason, size: await sizeOf(target) });
      else await scan(target, found, worktrees);
    } else if (entry.isFile()) {
      const reason = classifyFile(entry.name, stat.size);
      if (reason) found.push({ path: target, reason, size: stat.size });
    }
  }
  return { found, worktrees, skipped };
}

const megabytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(0)}M`;

async function freeBytes(target) {
  const stat = await fs.statfs(target).catch(() => null);
  return stat ? stat.bavail * stat.bsize : null;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const keep = args.filter((a) => a.startsWith('--keep=')).map((a) => a.slice('--keep='.length));
  const olderThan = args.find((a) => a.startsWith('--older-than-hours='));
  const olderThanHours = olderThan ? Number(olderThan.split('=')[1]) : 24;
  if (!Number.isFinite(olderThanHours) || olderThanHours < 0)
    throw Error('--older-than-hours must be a non-negative number');
  const runsRoot = path.resolve('.codex-runs');

  const { found, worktrees, skipped } = await findRunLeftovers(runsRoot, { keep, olderThanHours });
  for (const item of await findStaleRunTempDirs(os.tmpdir()))
    found.push({
      path: item.path,
      reason: `系统临时目录：${item.reason}`,
      size: await sizeOf(item.path),
    });

  const byReason = new Map();
  for (const item of found) byReason.set(item.reason, (byReason.get(item.reason) || 0) + item.size);
  for (const item of found.sort((a, b) => b.size - a.size))
    console.log(
      `${megabytes(item.size).padStart(7)}  ${item.reason}  ${path.relative(process.cwd(), item.path) || item.path}`,
    );
  console.log('\n按类型合计：');
  for (const [reason, size] of byReason) console.log(`  ${reason}：${megabytes(size)}`);
  const total = found.reduce((sum, item) => sum + item.size, 0);
  console.log(`共 ${found.length} 项，${megabytes(total)}`);
  if (skipped.length)
    console.log(`跳过（--keep 或 ${olderThanHours} 小时内有改动）：${skipped.join('、')}`);
  if (worktrees.length)
    // Git for Windows follows junctions here: `worktree remove --force` on a
    // checkout whose node_modules links to the main one empties the main one.
    console.log(
      `git worktree 不自动删除。先删掉其中的目录链接（如指向主目录的 node_modules），` +
        `再用 git worktree remove：\n  ${worktrees.join('\n  ')}`,
    );
  if (!apply) {
    console.log('\n只列出，未删除。确认后加 --apply 执行。');
    return;
  }
  const before = await freeBytes(runsRoot);
  let failed = 0;
  for (const item of found) {
    await fs
      .rm(item.path, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 })
      .catch((error) => {
        failed += 1;
        console.error(`删除失败：${item.path}：${error.message}`);
      });
  }
  const after = await freeBytes(runsRoot);
  console.log(
    `已删除 ${found.length - failed} 项` +
      (before !== null && after !== null ? `，磁盘可用空间增加 ${megabytes(after - before)}` : ''),
  );
  if (failed) process.exitCode = 1;
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) await main();
