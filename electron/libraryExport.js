import fs from 'node:fs/promises';
import { createReadStream, createWriteStream } from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import yazl from 'yazl';
import { galleryCollectionScope } from '../src/lib/galleryCollections.js';
import { hasImageName, numberedImageNames } from '../src/lib/imageNaming.js';
import { freeDiskBytes } from './folderImport.js';
import { readableBytes } from './importer.js';
import { CommandError } from './commands/registry.js';

export function exportSafeName(value, fallback = 'NovelAI 图片') {
  const name = String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/[. ]+$/g, '')
    .trim();
  return !name || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(name) ? fallback : name;
}

export async function resolveExport(database, input) {
  if (Number(input.ids !== undefined) + Number(input.collectionId !== undefined) !== 1)
    throw new CommandError('invalid_input', '请选择图片或收藏集');
  const date = new Date();
  let name = `NovelAI 图片 ${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  let ids = input.ids;
  if (input.collectionId !== undefined) {
    const collection = database.listCollections().find((c) => c.id === input.collectionId);
    if (!collection) throw new CommandError('not_found', '收藏集不存在');
    name = collection.name;
    ids =
      collection.kind === 'smart'
        ? galleryCollectionScope(await database.loadLibraryCards(), collection).map((p) => p.id)
        : collection.member_ids;
  }
  const items = [];
  let skipped = 0;
  for (const id of new Set(ids)) {
    const image = database.loadProject(id);
    if (!image || image.deleted_at) {
      skipped++;
      continue;
    }
    try {
      const stat = await fs.stat(image.image_path);
      if (!stat.isFile()) {
        skipped++;
        continue;
      }
      items.push({ image, size: stat.size });
    } catch (error) {
      if (!['ENOENT', 'ENOTDIR'].includes(error.code)) throw error;
      skipped++;
    }
  }
  const customName = (image) => image.name && (image.has_custom_name ?? hasImageName(image));
  const groups = new Map();
  for (const item of items) {
    if (!customName(item.image)) continue;
    const group = groups.get(item.image.name) || [];
    group.push(item);
    groups.set(item.image.name, group);
  }
  const numbered = new Map();
  for (const [name, group] of groups) {
    const names = numberedImageNames(name, group.length);
    group.forEach((item, i) => numbered.set(item, names[i]));
  }
  const used = new Set();
  for (const item of items) {
    const { image } = item;
    const extension = path.extname(image.image_path);
    const custom = customName(image);
    let stem = custom
      ? numbered.get(item)
      : path.parse(image.original_filename || '').name || image.id.slice(0, 8);
    stem = exportSafeName(stem, image.id.slice(0, 8));
    let fileName = stem + extension,
      n = 2;
    while (used.has(fileName.normalize('NFC').toLowerCase()))
      fileName = `${stem}-${n++}${extension}`;
    used.add(fileName.normalize('NFC').toLowerCase());
    item.fileName = fileName;
  }
  return {
    items,
    skipped,
    name: exportSafeName(name),
    count: items.length,
    bytes: items.reduce((sum, p) => sum + p.size, 0),
  };
}

export function createLibraryExport({
  database,
  dialog,
  owner = () => undefined,
  progress = () => {},
  freeBytes = freeDiskBytes,
}) {
  let active;
  const estimate = async (input) => {
    const { count, bytes, name } = await resolveExport(database, input);
    return { ok: true, count, bytes, name };
  };
  const run = async (input, caller) => {
    if (active) throw new CommandError('busy', '正在导出图片');
    const controller = new AbortController();
    active = controller;
    const { signal } = controller;
    let partial;
    try {
      const plan = await resolveExport(database, input);
      const options =
        input.format === 'zip'
          ? { defaultPath: `${plan.name}.zip`, filters: [{ name: 'ZIP', extensions: ['zip'] }] }
          : { properties: ['openDirectory', 'createDirectory'] };
      const selected = await (input.format === 'zip'
        ? dialog.showSaveDialog(owner(caller), options)
        : dialog.showOpenDialog(owner(caller), options));
      const destination = input.format === 'zip' ? selected.filePath : selected.filePaths?.[0];
      if (selected.canceled || !destination || signal.aborted) return { canceled: true };
      const available = await freeBytes(
        input.format === 'zip' ? path.dirname(destination) : destination,
      );
      const needed =
        plan.bytes +
        (input.format === 'zip'
          ? 1024 + plan.items.reduce((sum, p) => sum + 256 + Buffer.byteLength(p.fileName) * 2, 0)
          : 0);
      if (needed > available)
        throw new Error(
          `磁盘空间不够：需要 ${readableBytes(needed)}，还剩 ${readableBytes(available)}`,
        );
      signal.throwIfAborted();
      let target;
      if (input.format === 'folder') {
        for (let n = 1; ; n++) {
          target = path.join(destination, plan.name + (n === 1 ? '' : ` ${n}`));
          try {
            await fs.mkdir(target);
            break;
          } catch (error) {
            if (error.code !== 'EEXIST') throw error;
          }
        }
        partial = target;
        for (const [index, item] of plan.items.entries()) {
          await pipeline(
            createReadStream(item.image.image_path),
            createWriteStream(path.join(target, item.fileName), { flags: 'wx' }),
            { signal },
          );
          progress({ done: index + 1, total: plan.count });
        }
        signal.throwIfAborted();
      } else {
        target = destination;
        partial = path.join(path.dirname(target), `.export-${crypto.randomUUID()}.tmp`);
        const zip = new yazl.ZipFile();
        let reading;
        zip.on('error', (error) => zip.outputStream.destroy(error));
        const stop = () => {
          reading?.destroy(signal.reason);
          zip.outputStream.destroy(signal.reason);
        };
        signal.addEventListener('abort', stop, { once: true });
        for (const [index, item] of plan.items.entries()) {
          zip.addReadStreamLazy(item.fileName, { compress: false, size: item.size }, (callback) => {
            if (signal.aborted) return callback(signal.reason);
            if (index) progress({ done: index, total: plan.count });
            if (signal.aborted) return callback(signal.reason);
            reading = createReadStream(item.image.image_path);
            reading.on('error', (error) => zip.outputStream.destroy(error));
            callback(null, reading);
          });
        }
        zip.end();
        try {
          await pipeline(zip.outputStream, createWriteStream(partial, { flags: 'wx' }), { signal });
          if (plan.count) progress({ done: plan.count, total: plan.count });
        } finally {
          signal.removeEventListener('abort', stop);
          reading?.destroy();
        }
        signal.throwIfAborted();
        await fs.rename(partial, target);
      }
      partial = undefined;
      return {
        ok: true,
        path: target,
        count: plan.count,
        bytes: plan.bytes,
        skipped: plan.skipped,
      };
    } catch (error) {
      if (partial) await fs.rm(partial, { recursive: true, force: true });
      if (signal.aborted) return { canceled: true };
      if (error instanceof CommandError) throw error;
      return { ok: false, error: error.message };
    } finally {
      active = undefined;
    }
  };
  return {
    'library.export.estimate': estimate,
    'library.export': run,
    'library.export.cancel': () => {
      active?.abort();
      return { ok: true };
    },
  };
}
