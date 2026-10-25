import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { Worker } from 'node:worker_threads';
import { hashFile, importImage } from './assets.js';

const natural = new Intl.Collator('zh-CN', { numeric: true, sensitivity: 'base' });
const images = /\.(png|jpe?g|webp)$/i;
let attributes;
export function hiddenDirectory(file) {
  if (path.basename(file).startsWith('.')) return true;
  if (process.platform !== 'win32') return false;
  attributes ??= createRequire(import.meta.url)('koffi')
    .load('kernel32.dll')
    .func('uint32_t __stdcall GetFileAttributesW(str16 path)');
  const value = attributes(file);
  if (value === 0xffffffff) throw new Error('无法读取文件夹属性');
  return Boolean(value & 2);
}
export async function freeDiskBytes(directory) {
  const stat = await fs.statfs(directory);
  return Number(stat.bavail) * Number(stat.bsize);
}
export function requireDiskSpace(needed, available) {
  if (needed > available) throw new Error(`磁盘空间不够：需要 ${needed} B，剩余 ${available} B`);
}

// Resolve duplicate leaf names as a group so traversal order never decides the name.
export function nameFolderCollections(folders, existing, root) {
  const targets = folders.filter((f) => f.imageCount);
  const parts = (f) => [
    f.name,
    ...path.dirname(path.join(root, f.relativePath)).split(path.sep).filter(Boolean).reverse(),
  ];
  const depths = new Map(targets.map((f) => [f.id, 0]));
  const name = (f) => {
    const depth = depths.get(f.id),
      p = parts(f);
    return depth
      ? `${p[0]}（${p.slice(1, depth + 1).join('／')}${depth >= p.length ? `／${f.id.slice(0, 8)}` : ''}）`
      : p[0];
  };
  for (let attempt = 0; attempt < 100; attempt++) {
    const counts = new Map();
    for (const f of targets) counts.set(name(f), (counts.get(name(f)) || 0) + 1);
    const collisions = targets.filter(
      (f) =>
        counts.get(name(f)) > 1 || existing.some((c) => c.name === name(f) && c.kind !== 'manual'),
    );
    if (!collisions.length) break;
    for (const f of collisions) depths.set(f.id, depths.get(f.id) + 1);
  }
  for (const f of folders)
    f.collection = f.imageCount
      ? {
          name: name(f),
          existingId: existing.find((c) => c.name === name(f) && c.kind === 'manual')?.id || null,
        }
      : null;
}

async function inspectFiles(files, signal, progress) {
  if (!files.length) return;
  let index = 0;
  const workers = Array.from(
    { length: Math.min(4, files.length) },
    () => new Worker(new URL('./folderScanWorker.js', import.meta.url)),
  );
  try {
    await Promise.all(
      workers.map(async (worker) => {
        while (index < files.length && !signal.aborted) {
          const item = files[index++];
          const result = await new Promise((resolve, reject) => {
            const done = (value) => {
              worker.off('error', fail);
              resolve(value);
            };
            const fail = (error) => {
              worker.off('message', done);
              reject(error);
            };
            worker.once('message', done);
            worker.once('error', fail);
            worker.postMessage({ file: item.path });
          });
          if (result.error) throw new Error(`${item.path}: ${result.error}`);
          Object.assign(item, result);
          progress(item);
        }
      }),
    );
  } finally {
    await Promise.all(workers.map((w) => w.terminate()));
  }
}

export function createFolderImporter({
  database,
  assetsDirectory,
  activeImports = new Map(),
  freeBytes = freeDiskBytes,
}) {
  const sessions = new Map();
  const directory = () =>
    typeof assetsDirectory === 'function' ? assetsDirectory() : assetsDirectory;
  const notifyWith = (notify, sessionId, phase, data) =>
    notify({ batchId: sessionId, sessionId, phase, ...data });
  return {
    cancel(id) {
      const session = sessions.get(id);
      session?.controller.abort();
      if (session && !activeImports.has(id)) sessions.delete(id);
      return Boolean(session);
    },
    async scan(root, notify = () => {}) {
      const stat = await fs.lstat(root).catch(() => null);
      if (!stat?.isDirectory() || stat.isSymbolicLink()) throw new Error('拖进来的不是文件夹');
      root = path.resolve(root);
      const sessionId = crypto.randomUUID(),
        controller = new AbortController();
      const session = { controller, root, folders: [], files: [] };
      sessions.set(sessionId, session);
      activeImports.set(sessionId, controller);
      let processed = 0,
        zipCount = 0,
        lastProgress = 0;
      const progress = (current = '', force = false) => {
        if (force || Date.now() - lastProgress > 75) {
          lastProgress = Date.now();
          notifyWith(notify, sessionId, 'scanning', { processed, total: 0, current });
        }
      };
      progress('', true);
      try {
        async function visit(folder, parentId) {
          if (controller.signal.aborted || hiddenDirectory(folder)) return;
          const relativePath = path.relative(root, folder),
            id = crypto.randomUUID();
          const item = {
            id,
            parentId,
            name: path.basename(folder),
            relativePath,
            imageCount: 0,
            newCount: 0,
            existingCount: 0,
            trashedCount: 0,
            repeatCount: 0,
            noMetadataCount: 0,
            newBytes: 0,
            newNoMetadataCount: 0,
            newNoMetadataBytes: 0,
            collection: null,
          };
          session.folders.push(item);
          const entries = (await fs.readdir(folder, { withFileTypes: true })).sort((a, b) =>
            natural.compare(a.name, b.name),
          );
          for (const entry of entries) {
            if (controller.signal.aborted) return;
            const file = path.join(folder, entry.name);
            if (entry.isSymbolicLink()) continue;
            if (entry.isFile()) {
              if (/\.zip$/i.test(entry.name)) zipCount++;
              if (images.test(entry.name)) {
                item.imageCount++;
                session.files.push({ path: file, folderId: id });
              } else {
                processed++;
                progress(relativePath);
              }
            }
          }
          for (const entry of entries)
            if (entry.isDirectory() && !entry.isSymbolicLink())
              await visit(path.join(folder, entry.name), id);
        }
        await visit(root, null);
        await inspectFiles(session.files, controller.signal, (file) => {
          processed++;
          progress(path.relative(root, path.dirname(file.path)));
        });
        if (controller.signal.aborted) throw new Error('扫描已取消');
        const seen = new Set(),
          byId = new Map(session.folders.map((f) => [f.id, f]));
        for (const file of session.files) {
          const folder = byId.get(file.folderId),
            existing = database.findProjectByContentHash(file.hash);
          const kind = seen.has(file.hash)
            ? 'repeat'
            : existing
              ? existing.deleted_at
                ? 'trashed'
                : 'existing'
              : 'new';
          folder[`${kind}Count`]++;
          if (!file.hasMetadata) folder.noMetadataCount++;
          if (kind === 'new') {
            folder.newBytes += file.bytes;
            if (!file.hasMetadata) {
              folder.newNoMetadataCount++;
              folder.newNoMetadataBytes += file.bytes;
            }
          }
          seen.add(file.hash);
        }
        const keep = new Set(session.folders.filter((f) => f.imageCount).map((f) => f.id));
        for (const folder of [...session.folders].reverse())
          if (keep.has(folder.id) && folder.parentId) keep.add(folder.parentId);
        session.folders = session.folders.filter((f) => keep.has(f.id));
        nameFolderCollections(session.folders, database.listCollections(), root);
        progress('', true);
        return {
          sessionId,
          root,
          folders: structuredClone(session.folders),
          zipCount,
          freeBytes: await freeBytes(directory()),
        };
      } catch (error) {
        sessions.delete(sessionId);
        throw error;
      } finally {
        activeImports.delete(sessionId);
      }
    },
    async commit({ sessionId, folderIds, skipNoMetadata }, notify = () => {}) {
      const session = sessions.get(sessionId);
      if (!session || activeImports.has(sessionId)) throw new Error('导入预览已过期，请重新扫描');
      const selected = new Set(folderIds);
      if (folderIds.some((id) => !session.folders.some((f) => f.id === id)))
        throw new Error('文件夹不存在');
      const files = session.files.filter((f) => selected.has(f.folderId));
      const needed = new Map(
        files
          .filter(
            (f) =>
              !(skipNoMetadata && !f.hasMetadata) && !database.findProjectByContentHash(f.hash),
          )
          .map((f) => [f.hash, f.bytes]),
      );
      const result = {
        imported: 0,
        existing: 0,
        restored: 0,
        skipped: 0,
        collectionsCreated: 0,
        collectionsMerged: 0,
        canceled: false,
        errors: [],
      };
      const collections = new Map();
      const { controller } = session;
      activeImports.set(sessionId, controller);
      let processed = 0;
      const progress = (current = '') =>
        notifyWith(notify, sessionId, 'importing', {
          processed,
          total: files.length,
          current,
          imported: result.imported,
          duplicates: result.existing + result.restored,
          failed: result.errors.length,
          skipped: result.skipped,
        });
      progress();
      try {
        requireDiskSpace(
          [...needed.values()].reduce((a, b) => a + b, 0),
          await freeBytes(directory()),
        );
        nameFolderCollections(session.folders, database.listCollections(), session.root);
        for (const file of files) {
          if (controller.signal.aborted) break;
          if (skipNoMetadata && !file.hasMetadata) {
            result.skipped++;
            processed++;
            progress(file.path);
            continue;
          }
          try {
            // Revalidate the immutable preview before copying, including symlink substitution.
            const relative = path.relative(session.root, file.path).split(path.sep);
            let cursor = session.root;
            for (const component of ['', ...relative]) {
              cursor = path.join(cursor, component);
              if ((await fs.lstat(cursor)).isSymbolicLink())
                throw new Error('文件在扫描后变成了符号链接');
            }
            if ((await hashFile(file.path)) !== file.hash)
              throw new Error('文件在扫描后发生了变化，请重新扫描');
            let project = database.findProjectByContentHash(file.hash);
            if (project) {
              if (project.deleted_at) {
                const restored = database.updateProjects([project.id], { deleted: false });
                if (restored.failed.length) throw new Error('恢复图片失败');
                result.restored++;
              } else result.existing++;
            } else {
              project = await importImage(file.path, directory(), { contentHash: file.hash });
              try {
                database.insertProject(database.enrichProjectTags(project));
              } catch (error) {
                await fs.rm(project.image_path, { force: true });
                await fs.rm(project.thumbnail_path, { force: true });
                throw error;
              }
              result.imported++;
            }
            if (!collections.has(file.folderId)) {
              const target = session.folders.find((f) => f.id === file.folderId).collection;
              const id = target.existingId || crypto.randomUUID();
              if (target.existingId) result.collectionsMerged++;
              else {
                database.createCollection({ id, name: target.name, kind: 'manual' });
                result.collectionsCreated++;
              }
              collections.set(file.folderId, id);
            }
            database.updateCollectionProjects(collections.get(file.folderId), [project.id]);
          } catch (error) {
            result.errors.push({ path: file.path, error: error.message });
          }
          processed++;
          progress(file.path);
        }
        result.canceled = controller.signal.aborted;
        notifyWith(notify, sessionId, 'complete', {
          total: files.length,
          processed,
          imported: result.imported,
          duplicates: result.existing + result.restored,
          failed: result.errors.length,
          skipped: result.skipped,
          remaining: files.length - processed,
          cancelled: result.canceled,
        });
        return result;
      } finally {
        activeImports.delete(sessionId);
        sessions.delete(sessionId);
      }
    },
  };
}
