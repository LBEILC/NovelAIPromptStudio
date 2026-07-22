import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const promises = fs.promises;

function isPathInside(parentDirectory, candidate) {
  const relative = path.relative(parentDirectory, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function directoryEntries(directory) {
  try {
    return await promises.readdir(directory, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }
}

async function collectFiles(rootDirectory) {
  const files = [];
  const walk = async (directory, relativeDirectory = '') => {
    for (const entry of await directoryEntries(directory)) {
      if (entry.isSymbolicLink()) throw new Error('资源库包含符号链接，无法安全迁移');
      const relativePath = path.join(relativeDirectory, entry.name);
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolutePath, relativePath);
      else if (entry.isFile()) {
        const stat = await promises.stat(absolutePath);
        files.push({ absolutePath, relativePath, size: stat.size });
      } else throw new Error(`资源库包含不支持的文件类型：${relativePath}`);
    }
  };
  await walk(rootDirectory);
  return files;
}

export async function describeAssetDirectory(directory) {
  const resolved = path.resolve(String(directory || ''));
  const files = await collectFiles(resolved);
  return {
    assetsDirectory: resolved,
    fileCount: files.length,
    totalBytes: files.reduce((total, file) => total + file.size, 0),
  };
}

async function ensureEmptyWritableDirectory(directory) {
  await promises.mkdir(directory, { recursive: true });
  const entries = await directoryEntries(directory);
  if (entries.length) throw new Error('请选择一个空文件夹作为新的资源库位置');
  const probe = path.join(directory, `.novelai-write-test-${crypto.randomUUID()}`);
  await promises.writeFile(probe, 'ok', { flag: 'wx' });
  await promises.rm(probe, { force: true });
}

async function removeCreatedEntries(targetDirectory, names) {
  for (const name of names) {
    await promises.rm(path.join(targetDirectory, name), { recursive: true, force: true }).catch(() => {});
  }
}

export async function migrateAssetDirectory({ sourceDirectory, targetDirectory, commit, onProgress = () => {} }) {
  const source = path.resolve(String(sourceDirectory || ''));
  const target = path.resolve(String(targetDirectory || ''));
  if (path.relative(source, target) === '' && path.relative(target, source) === '') {
    return { ...(await describeAssetDirectory(source)), noChange: true, cleanupWarning: '' };
  }
  if (source === path.parse(source).root || target === path.parse(target).root) throw new Error('不能把磁盘根目录直接用作资源库位置');
  if (isPathInside(source, target) || isPathInside(target, source)) throw new Error('新旧资源库位置不能互相嵌套');

  const sourceStat = await promises.lstat(source).catch((error) => error?.code === 'ENOENT' ? null : Promise.reject(error));
  if (!sourceStat) throw new Error('当前资源库不存在或不可访问，请先恢复原磁盘或文件夹');
  if (sourceStat?.isSymbolicLink()) throw new Error('当前资源库是符号链接，无法安全迁移');
  if (sourceStat && !sourceStat.isDirectory()) throw new Error('当前资源库位置不是文件夹');
  await ensureEmptyWritableDirectory(target);

  const files = sourceStat ? await collectFiles(source) : [];
  const totalBytes = files.reduce((total, file) => total + file.size, 0);
  const stagingName = `.novelai-migration-${crypto.randomUUID()}`;
  const stagingDirectory = path.join(target, stagingName);
  const createdNames = [];
  let completed = 0;
  let bytesCopied = 0;

  try {
    await promises.mkdir(stagingDirectory, { recursive: true });
    for (const file of files) {
      const destination = path.join(stagingDirectory, file.relativePath);
      await promises.mkdir(path.dirname(destination), { recursive: true });
      await promises.copyFile(file.absolutePath, destination, fs.constants.COPYFILE_EXCL);
      const copied = await promises.stat(destination);
      if (copied.size !== file.size) throw new Error(`资源校验失败：${file.relativePath}`);
      completed += 1;
      bytesCopied += file.size;
      onProgress({ phase: 'copying', completed, total: files.length, bytesCopied, totalBytes });
    }

    for (const entry of await directoryEntries(stagingDirectory)) {
      await promises.rename(path.join(stagingDirectory, entry.name), path.join(target, entry.name));
      createdNames.push(entry.name);
    }
    await promises.rm(stagingDirectory, { recursive: true, force: true });
    onProgress({ phase: 'switching', completed, total: files.length, bytesCopied, totalBytes });
    await commit?.({ sourceDirectory: source, targetDirectory: target });
  } catch (error) {
    await promises.rm(stagingDirectory, { recursive: true, force: true }).catch(() => {});
    await removeCreatedEntries(target, createdNames);
    throw error;
  }

  let cleanupWarning = '';
  if (sourceStat) {
    try {
      await promises.rm(source, { recursive: true, force: true });
    } catch (error) {
      cleanupWarning = `新位置已经启用，但旧资源没有完全清理：${error instanceof Error ? error.message : String(error)}`;
    }
  }
  onProgress({ phase: 'complete', completed, total: files.length, bytesCopied, totalBytes });
  return { assetsDirectory: target, fileCount: files.length, totalBytes, noChange: false, cleanupWarning };
}
