import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import sharp from 'sharp';
import { hashFile, importImage } from './assets.js';

export const IMPORT_LIMITS = Object.freeze({
  maxArchiveEntries: 2500,
  maxImagesPerArchive: 1000,
  maxImageBytes: 100 * 1024 * 1024,
  maxArchiveExpandedBytes: 2 * 1024 * 1024 * 1024,
  maxCompressionRatio: 1000,
});

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DIRECT_IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function readableBytes(value) {
  if (value >= 1024 ** 3) return `${(value / 1024 ** 3).toFixed(1)} GB`;
  if (value >= 1024 ** 2) return `${Math.ceil(value / 1024 ** 2)} MB`;
  return `${Math.ceil(value / 1024)} KB`;
}

function isHiddenArchiveEntry(fileName) {
  const parts = fileName.split('/').filter(Boolean);
  return parts[0] === '__MACOSX' || parts.some((part) => part.startsWith('.'));
}

function isSymbolicLink(entry) {
  const unixMode = (entry.externalFileAttributes >>> 16) & 0xffff;
  return (unixMode & 0o170000) === 0o120000;
}

export function isPngSignature(buffer) {
  return Buffer.isBuffer(buffer) && buffer.length >= PNG_SIGNATURE.length
    && buffer.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE);
}

export function validateZipImageEntry(entry, totals = { expandedBytes: 0, imageCount: 0 }) {
  const fileName = String(entry.fileName || '').replaceAll('\\', '/');
  const parts = fileName.split('/');
  if (!fileName || fileName.startsWith('/') || /^[a-zA-Z]:\//.test(fileName) || parts.includes('..')) {
    return { action: 'reject', reason: `ZIP 包含不安全路径：${fileName || '(空路径)'}` };
  }
  if (fileName.endsWith('/') || isHiddenArchiveEntry(fileName)) return { action: 'skip', reason: '系统目录或隐藏文件' };
  if (path.posix.extname(fileName).toLowerCase() !== '.png') return { action: 'skip', reason: '不是 PNG' };
  if (typeof entry.isEncrypted === 'function' ? entry.isEncrypted() : Boolean(entry.generalPurposeBitFlag & 0x1)) {
    return { action: 'reject', reason: `ZIP 中的 PNG 已加密：${fileName}` };
  }
  if (isSymbolicLink(entry)) return { action: 'reject', reason: `ZIP 中不允许符号链接：${fileName}` };
  if (![0, 8].includes(Number(entry.compressionMethod))) return { action: 'reject', reason: `ZIP 使用了不支持的压缩方式：${fileName}` };
  if (!Number.isSafeInteger(entry.uncompressedSize) || entry.uncompressedSize <= 0) return { action: 'skip', reason: 'PNG 条目为空或大小无效' };
  if (entry.uncompressedSize > IMPORT_LIMITS.maxImageBytes) {
    return { action: 'reject', reason: `${fileName} 展开后超过 ${readableBytes(IMPORT_LIMITS.maxImageBytes)}` };
  }
  const ratio = entry.uncompressedSize / Math.max(1, entry.compressedSize);
  if (entry.uncompressedSize > 10 * 1024 * 1024 && ratio > IMPORT_LIMITS.maxCompressionRatio) {
    return { action: 'reject', reason: `${fileName} 的压缩比异常，已阻止导入` };
  }
  if (totals.imageCount + 1 > IMPORT_LIMITS.maxImagesPerArchive) {
    return { action: 'reject', reason: `单个 ZIP 最多导入 ${IMPORT_LIMITS.maxImagesPerArchive} 张 PNG` };
  }
  if (totals.expandedBytes + entry.uncompressedSize > IMPORT_LIMITS.maxArchiveExpandedBytes) {
    return { action: 'reject', reason: `ZIP 展开总大小超过 ${readableBytes(IMPORT_LIMITS.maxArchiveExpandedBytes)}` };
  }
  return { action: 'accept', fileName, ratio };
}

export async function inspectZipArchive(zipPath, { signal } = {}) {
  const zipfile = await yauzl.openPromise(zipPath, { validateEntrySizes: true, strictFileNames: false });
  const accepted = [];
  const totals = { entryCount: 0, imageCount: 0, expandedBytes: 0, skipped: 0 };
  try {
    for await (const entry of zipfile.eachEntry()) {
      if (signal?.aborted) break;
      totals.entryCount += 1;
      if (totals.entryCount > IMPORT_LIMITS.maxArchiveEntries) {
        throw new Error(`ZIP 条目超过 ${IMPORT_LIMITS.maxArchiveEntries} 个，已停止读取`);
      }
      const verdict = validateZipImageEntry(entry, totals);
      if (verdict.action === 'reject') throw new Error(verdict.reason);
      if (verdict.action === 'skip') {
        totals.skipped += 1;
        continue;
      }
      totals.imageCount += 1;
      totals.expandedBytes += entry.uncompressedSize;
      accepted.push({
        fileName: verdict.fileName,
        compressedSize: entry.compressedSize,
        uncompressedSize: entry.uncompressedSize,
      });
    }
  } finally {
    zipfile.close();
  }
  if (signal?.aborted) return { entries: [], ...totals, cancelled: true };
  if (!accepted.length) throw new Error('ZIP 中没有可导入的 PNG');
  return { entries: accepted, ...totals };
}

async function planImports(filePaths, onProgress, signal) {
  const plans = [];
  const errors = [];
  let skipped = 0;
  const uniquePaths = [...new Map((filePaths || []).filter((filePath) => String(filePath || '').trim()).map((filePath) => {
    const resolved = path.resolve(String(filePath));
    return [process.platform === 'win32' ? resolved.toLocaleLowerCase('en-US') : resolved, resolved];
  }).filter(([, filePath]) => filePath)).values()];

  for (const [index, filePath] of uniquePaths.entries()) {
    if (signal?.aborted) break;
    onProgress?.({ phase: 'preparing', current: path.basename(filePath), prepared: index, sourceCount: uniquePaths.length });
    try {
      const stat = fs.statSync(filePath);
      if (!stat.isFile()) throw new Error('只支持本地文件，暂不支持文件夹');
      const extension = path.extname(filePath).toLowerCase();
      if (extension === '.zip') {
        const inspection = await inspectZipArchive(filePath, { signal });
        if (inspection.cancelled) break;
        plans.push({ kind: 'zip', filePath, ...inspection });
        skipped += inspection.skipped;
      } else if (DIRECT_IMAGE_EXTENSIONS.has(extension)) {
        if (stat.size > IMPORT_LIMITS.maxImageBytes) throw new Error(`单张图片不能超过 ${readableBytes(IMPORT_LIMITS.maxImageBytes)}`);
        plans.push({ kind: 'image', filePath, entries: [{ fileName: path.basename(filePath), uncompressedSize: stat.size }] });
      } else {
        throw new Error('仅支持 PNG、JPG、WEBP 或 ZIP');
      }
    } catch (error) {
      errors.push({ file: path.basename(filePath), error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { plans, errors, skipped, total: plans.reduce((sum, plan) => sum + plan.entries.length, 0) };
}

async function firstBytes(filePath, length) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, 0);
    return buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}

async function processZipPlan(plan, temporaryDirectory, processSource, recordFailure, signal) {
  const wanted = new Map();
  for (const entry of plan.entries) wanted.set(entry.fileName, (wanted.get(entry.fileName) || 0) + 1);
  const zipfile = await yauzl.openPromise(plan.filePath, { validateEntrySizes: true, strictFileNames: false });
  try {
    for await (const entry of zipfile.eachEntry()) {
      if (signal?.aborted) break;
      const remaining = wanted.get(entry.fileName) || 0;
      if (!remaining) continue;
      wanted.set(entry.fileName, remaining - 1);
      const temporaryPath = path.join(temporaryDirectory, `${crypto.randomUUID()}.png`);
      try {
        try {
          const readStream = await zipfile.openReadStreamPromise(entry);
          await pipeline(readStream, fs.createWriteStream(temporaryPath, { flags: 'wx' }));
          if (!isPngSignature(await firstBytes(temporaryPath, PNG_SIGNATURE.length))) {
            throw new Error('扩展名是 PNG，但文件签名不匹配');
          }
          await processSource(temporaryPath, `${path.basename(plan.filePath)} / ${entry.fileName}`, path.basename(entry.fileName));
        } catch (error) {
          recordFailure(`${path.basename(plan.filePath)} / ${entry.fileName}`, error);
        }
      } finally {
        fs.rmSync(temporaryPath, { force: true });
      }
    }
  } finally {
    zipfile.close();
  }
}

export async function backfillProjectContentHashes(database) {
  const repaired = [];
  for (const project of database.projectHashCandidates()) {
    try {
      if (fs.existsSync(project.image_path)) repaired.push({ id: project.id, content_hash: await hashFile(project.image_path) });
    } catch {
      // Missing or unreadable legacy assets stay importable; their repair is a separate library concern.
    }
  }
  if (repaired.length) database.setProjectContentHashes(repaired);
}

export async function backfillProjectDimensions(database) {
  const repaired = [];
  for (const project of database.projectDimensionCandidates()) {
    try {
      if (!fs.existsSync(project.image_path)) continue;
      const metadata = await sharp(project.image_path).metadata();
      if (metadata.width && metadata.height) repaired.push({ id: project.id, width: metadata.width, height: metadata.height });
    } catch {
      // Missing or unreadable legacy assets remain available with unknown dimensions.
    }
  }
  if (repaired.length) database.setProjectDimensions(repaired);
}

export async function importLibraryFiles({
  filePaths,
  assetsDirectory,
  database,
  prepareProject = async (project) => project,
  collectionId = '',
  signal,
  onProgress,
}) {
  const temporaryDirectory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'novelai-prompt-studio-import-'));
  const imported = [];
  const duplicates = [];
  const resultErrors = [];
  let processed = 0;
  try {
    const plan = await planImports(filePaths, onProgress, signal);
    resultErrors.push(...plan.errors);
    const report = (patch = {}) => onProgress?.({
      phase: 'importing',
      total: plan.total,
      processed,
      imported: imported.length,
      duplicates: duplicates.length,
      failed: resultErrors.length,
      skipped: plan.skipped,
      ...patch,
    });
    report();

    const processSource = async (sourcePath, displayName, projectName = path.basename(sourcePath)) => {
      if (signal?.aborted) return;
      report({ current: displayName });
      try {
        const contentHash = await hashFile(sourcePath);
        const duplicate = database.findProjectByContentHash(contentHash);
        if (duplicate) {
          duplicates.push({ file: displayName, projectId: duplicate.id, projectName: duplicate.name });
          return;
        }
        let project = await importImage(sourcePath, assetsDirectory, { name: projectName, contentHash });
        project = await prepareProject(project);
        database.insertProject(project);
        imported.push(project);
      } catch (error) {
        resultErrors.push({ file: displayName, error: error instanceof Error ? error.message : String(error) });
      } finally {
        processed += 1;
        report({ current: displayName });
      }
    };

    const recordFailure = (displayName, error) => {
      resultErrors.push({ file: displayName, error: error instanceof Error ? error.message : String(error) });
      processed += 1;
      report({ current: displayName });
    };

    for (const item of plan.plans) {
      if (signal?.aborted) break;
      if (item.kind === 'image') await processSource(item.filePath, path.basename(item.filePath));
      else {
        const processedBeforeArchive = processed;
        try {
          await processZipPlan(item, temporaryDirectory, processSource, recordFailure, signal);
        } catch (error) {
          resultErrors.push({ file: path.basename(item.filePath), error: error instanceof Error ? error.message : String(error) });
          const unprocessed = Math.max(0, item.entries.length - (processed - processedBeforeArchive));
          processed += unprocessed;
          report({ current: path.basename(item.filePath) });
        }
      }
    }

    if (collectionId && imported.length) {
      const organization = database.addProjectsToCollection(collectionId, imported.map((project) => project.id));
      const organizationById = new Map(organization.projects.map((project) => [project.id, project]));
      for (const project of imported) Object.assign(project, organizationById.get(project.id));
    }

    const summary = {
      total: plan.total,
      processed,
      imported: imported.length,
      duplicates: duplicates.length,
      failed: resultErrors.length,
      skipped: plan.skipped,
      remaining: Math.max(0, plan.total - processed),
      cancelled: Boolean(signal?.aborted),
    };
    onProgress?.({ phase: 'complete', ...summary });
    return { ok: resultErrors.length === 0, imported, duplicates, errors: resultErrors, summary };
  } finally {
    fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}
