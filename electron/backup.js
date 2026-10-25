import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import yauzl from 'yauzl';
import yazl from 'yazl';
import { hashFile } from './assets.js';
import { freeDiskBytes, requireDiskSpace } from './folderImport.js';
import { validateBackupDatabase } from './backupDatabase.js';

const fsp = fs.promises;
const required = ['manifest.json', 'studio.sqlite', 'workbench-session.json', 'preferences.json'];
const portable = {
  appearance: ['themeMode', 'primaryColor', 'sansFont', 'monoFont', 'proseFont', 'motion'],
  productivity: ['autoCheckUpdates', 'closeAction'],
  generation: [
    'blankModel',
    'continuous',
    'agentMode',
    'limitEnabled',
    'dailyLimit',
    'dailyImageLimit',
    'spentDate',
    'spentToday',
    'spentImagesToday',
  ],
};
export function portablePreferences(value) {
  const result = {};
  for (const [key, fields] of Object.entries(portable)) {
    if (value[key] && typeof value[key] === 'object')
      result[key] = Object.fromEntries(
        fields.filter((f) => value[key][f] !== undefined).map((f) => [f, value[key][f]]),
      );
  }
  if (typeof value.onboardingDone === 'boolean') result.onboardingDone = value.onboardingDone;
  return result;
}
export function mergePortablePreferences(current, incoming) {
  const result = { ...current };
  for (const key of [...Object.keys(portable), 'onboardingDone']) delete result[key];
  Object.assign(result, portablePreferences(incoming));
  if (current.productivity?.recentImageDirectory)
    result.productivity = {
      ...result.productivity,
      recentImageDirectory: current.productivity.recentImageDirectory,
    };
  return result;
}
function entryPath(name) {
  if (
    !name ||
    name.includes('\\') ||
    name.includes(':') ||
    name.startsWith('/') ||
    name.split('/').some((p) => !p || p === '.' || p === '..')
  )
    throw new Error('备份文件已损坏');
  if (!required.includes(name) && !name.startsWith('library/'))
    throw new Error('不是本软件的备份文件');
  return name;
}
async function listFiles(root, relative = '') {
  const result = [];
  for (const entry of await fsp.readdir(path.join(root, relative), { withFileTypes: true })) {
    if (entry.isSymbolicLink()) continue;
    const name = path.join(relative, entry.name);
    if (entry.isDirectory()) result.push(...(await listFiles(root, name)));
    else if (entry.isFile())
      result.push({
        name: name.split(path.sep).join('/'),
        path: path.join(root, name),
        bytes: (await fsp.stat(path.join(root, name))).size,
      });
  }
  return result;
}
function checkManifest(value, allowNewer = false) {
  if (
    !value ||
    !Number.isInteger(value.format) ||
    typeof value.appVersion !== 'string' ||
    !Number.isFinite(Date.parse(value.createdAt)) ||
    typeof value.includesLibrary !== 'boolean' ||
    !['images', 'works', 'collections', 'dictionary', 'materials'].every(
      (k) => Number.isSafeInteger(value.counts?.[k]) && value.counts[k] >= 0,
    )
  )
    throw new Error('不是本软件的备份文件');
  if (value.format !== 1 && !allowNewer)
    throw new Error(`这个备份来自更新的版本（${value.appVersion}），请先更新软件`);
}

async function readArchive(
  file,
  {
    directory,
    signal,
    progress = () => {},
    allowNewer = false,
    maxBytes = Infinity,
    metadataOnly = false,
  } = {},
) {
  const zip = await new Promise((resolve, reject) =>
    yauzl.open(file, { lazyEntries: true, autoClose: true }, (error, zip) =>
      error ? reject(error) : resolve(zip),
    ),
  );
  const names = new Set();
  let manifest,
    total = 0,
    done = 0;
  try {
    await new Promise((resolve, reject) => {
      zip.once('error', reject);
      zip.once('end', resolve);
      zip.on('entry', (entry) => {
        void (async () => {
          signal?.throwIfAborted();
          const name = entryPath(entry.fileName);
          if (
            names.has(name) ||
            entry.isEncrypted() ||
            ((entry.externalFileAttributes >>> 16) & 0o170000) === 0o120000 ||
            !Number.isSafeInteger(entry.uncompressedSize)
          )
            throw new Error('备份文件已损坏');
          names.add(name);
          total += entry.uncompressedSize;
          if (!Number.isSafeInteger(total) || total > maxBytes) throw new Error('备份文件已损坏');
          if (
            (!directory && name !== 'manifest.json') ||
            (metadataOnly && name.startsWith('library/'))
          ) {
            zip.readEntry();
            return;
          }
          if (name === 'manifest.json' && entry.uncompressedSize > 1024 * 1024)
            throw new Error('备份文件已损坏');
          const stream = await new Promise((resolve, reject) =>
            zip.openReadStream(entry, (error, stream) => (error ? reject(error) : resolve(stream))),
          );
          let crc = 0,
            bytes = 0;
          const chunks = [];
          const meter = new Transform({
            transform(chunk, encoding, callback) {
              crc = zlib.crc32(chunk, crc);
              bytes += chunk.length;
              done += chunk.length;
              progress({ done, total });
              callback(null, chunk);
            },
          });
          if (directory) {
            const target = path.join(directory, ...name.split('/'));
            await fsp.mkdir(path.dirname(target), { recursive: true });
            await pipeline(stream, meter, fs.createWriteStream(target, { flags: 'wx' }), {
              signal,
            });
            if (name === 'manifest.json') manifest = JSON.parse(await fsp.readFile(target, 'utf8'));
          } else {
            await pipeline(
              stream,
              meter,
              new Transform({
                transform(chunk, encoding, callback) {
                  chunks.push(chunk);
                  callback();
                },
              }),
              { signal },
            );
            manifest = JSON.parse(Buffer.concat(chunks).toString());
          }
          if (crc !== entry.crc32 || bytes !== entry.uncompressedSize)
            throw new Error('备份文件已损坏');
          zip.readEntry();
        })().catch(reject);
      });
      zip.readEntry();
    });
    if (!required.every((name) => names.has(name))) throw new Error('不是本软件的备份文件');
    checkManifest(manifest, allowNewer);
    if (!manifest.includesLibrary && [...names].some((n) => n.startsWith('library/')))
      throw new Error('备份文件已损坏');
    return { manifest, total };
  } finally {
    zip.close();
  }
}

async function json(file) {
  return JSON.parse(await fsp.readFile(file, 'utf8'));
}
async function writeJson(file, value) {
  await fsp.writeFile(file, JSON.stringify(value));
}
async function copyMissing(source, destination, name) {
  const components = name.split('/');
  let current = destination;
  for (const component of components.slice(0, -1)) {
    current = path.join(current, component);
    await fsp.mkdir(current).catch((error) => {
      if (error.code !== 'EEXIST') throw error;
    });
    const stat = await fsp.lstat(current);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('图片目录包含不安全链接');
  }
  const target = path.join(destination, ...components);
  try {
    await fsp.copyFile(source, target, fs.constants.COPYFILE_EXCL);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
  }
}

export function createBackupManager({
  dataDirectory,
  assetsDirectory,
  database,
  preferences,
  session,
  version,
  busy = () => false,
  reload = () => {},
  progress = () => {},
  freeBytes = freeDiskBytes,
}) {
  const assets = () =>
    typeof assetsDirectory === 'function' ? assetsDirectory() : assetsDirectory;
  const stateFile = path.join(dataDirectory, 'backup-state.json');
  let operation = null,
    committing = false;
  const state = () => {
    try {
      return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
    } catch {
      return { lastRestore: null };
    }
  };
  const saveState = async (value) => {
    const temporary = stateFile + '.tmp';
    await writeJson(temporary, value);
    await fsp.rename(temporary, stateFile);
  };
  const temporary = () => fsp.mkdtemp(path.join(dataDirectory, 'backup-stage-'));
  async function snapshot(directory) {
    await database.backup.ready();
    return session.exclusive(async () => {
      const counts = database.backup.counts();
      database.backup.snapshot(path.join(directory, 'studio.sqlite'));
      await writeJson(path.join(directory, 'preferences.json'), preferences.backup());
      await writeJson(path.join(directory, 'workbench-session.json'), session.backup());
      return counts;
    });
  }
  async function estimate() {
    const files = await listFiles(assets());
    const db = (await fsp.stat(path.join(dataDirectory, 'studio.sqlite'))).size;
    const dataBytes =
      db +
      Buffer.byteLength(JSON.stringify(preferences.backup())) +
      Buffer.byteLength(JSON.stringify(session.backup())) +
      8192;
    return {
      dataBytes,
      libraryBytes: files.reduce((n, f) => n + f.bytes + 512, 0),
      libraryFiles: files.length,
    };
  }
  async function inspect(file) {
    const base = {
      path: file,
      fileName: path.basename(file),
      bytes: (await fsp.stat(file)).size,
      createdAt: '',
      appVersion: '',
      format: 0,
      includesLibrary: false,
      counts: { images: 0, works: 0, collections: 0, dictionary: 0, materials: 0 },
      compatible: false,
    };
    let stage;
    try {
      stage = await temporary();
      const { manifest } = await readArchive(file, {
        directory: stage,
        metadataOnly: true,
        allowNewer: true,
      });
      if (manifest.format === 1) {
        validateBackupDatabase(path.join(stage, 'studio.sqlite'));
        const saved = await json(path.join(stage, 'workbench-session.json'));
        if (saved.version !== 3 || !Array.isArray(saved.session?.tabs))
          throw new Error('备份文件已损坏');
        await json(path.join(stage, 'preferences.json'));
      }
      return {
        ...base,
        createdAt: manifest.createdAt,
        appVersion: manifest.appVersion,
        format: manifest.format,
        includesLibrary: manifest.includesLibrary,
        counts: manifest.counts,
        compatible: manifest.format === 1,
        ...(manifest.format !== 1
          ? { reason: `这个备份来自更新的版本（${manifest.appVersion}），请先更新软件` }
          : {}),
      };
    } catch (error) {
      return {
        ...base,
        reason: /^(这个备份|不是本软件)/.test(error.message) ? error.message : '备份文件已损坏',
      };
    } finally {
      if (stage) await fsp.rm(stage, { recursive: true, force: true });
    }
  }
  async function reconcile(savedSession) {
    const files = await listFiles(assets()),
      byHash = new Map(),
      byName = new Map();
    const records = database.backup.images();
    const wanted = new Set(records.map((r) => r.content_hash).filter(Boolean));
    for (const file of files) {
      const base = file.name.split('/').at(-1);
      if (!byName.has(base)) byName.set(base, file.path);
      else byName.set(base, null);
      if (/\.(png|jpe?g|webp)$/i.test(file.name)) {
        const hash = await hashFile(file.path);
        if (wanted.has(hash)) byHash.set(hash, file.path);
      }
    }
    const paths = new Map();
    const basename = (file) =>
      String(file || '')
        .split(/[\\/]/)
        .at(-1);
    for (const row of records) {
      const image = byHash.get(row.content_hash);
      const thumb = byName.get(basename(row.thumbnail_path));
      paths.set(row.image_path, image || path.join(assets(), 'missing', `${row.id}.png`));
      if (row.thumbnail_path) paths.set(row.thumbnail_path, thumb || '');
      row.missing = !image;
      row.image_path = image || path.join(assets(), 'missing', `${row.id}.png`);
      row.thumbnail_path = thumb || '';
    }
    const rewrite = (value) => {
      if (typeof value === 'string') {
        if (paths.has(value)) return paths.get(value);
        return (
          ((value.includes('/') || value.includes('\\')) && byName.get(basename(value))) || value
        );
      }
      if (Array.isArray(value)) return value.map(rewrite);
      if (value && typeof value === 'object')
        return Object.fromEntries(Object.entries(value).map(([key, v]) => [key, rewrite(v)]));
      return value;
    };
    database.backup.relink(records, rewrite);
    return {
      missingImages: records.filter((r) => r.missing).length,
      session: rewrite(savedSession),
    };
  }
  async function apply(directory, relink = true) {
    const savedSession = await json(path.join(directory, 'workbench-session.json'));
    const savedPreferences = await json(path.join(directory, 'preferences.json'));
    if (savedSession.version !== 3 || !Array.isArray(savedSession.session?.tabs))
      throw new Error('备份文件已损坏');
    await database.backup.ready();
    database.backup.replace(path.join(directory, 'studio.sqlite'));
    const result = relink
      ? await reconcile(savedSession)
      : { missingImages: 0, session: savedSession };
    preferences.restoreBackup(savedPreferences);
    await session.restoreBackup(result.session);
    return { missingImages: result.missingImages };
  }
  const start = (op) => {
    if (operation) throw new Error('备份操作正在进行');
    if (op === 'restore' && busy()) throw new Error('等生成和导入完成后再恢复');
    operation = { op, controller: new AbortController() };
    return operation.controller.signal;
  };
  return {
    estimate,
    inspect,
    get restoring() {
      return operation?.op === 'restore';
    },
    status: () => ({ lastRestore: state().lastRestore }),
    cancel() {
      if (!operation || committing) return { ok: false };
      operation.controller.abort();
      return { ok: true };
    },
    async export(file, includeLibrary) {
      const signal = start('export');
      let stage, output;
      try {
        const size = await estimate();
        requireDiskSpace(
          size.dataBytes + (includeLibrary ? size.libraryBytes : 0),
          await freeBytes(path.dirname(file)),
        );
        requireDiskSpace(size.dataBytes, await freeBytes(dataDirectory));
        stage = await temporary();
        const counts = await snapshot(stage);
        signal.throwIfAborted();
        const manifest = {
          format: 1,
          appVersion: version,
          createdAt: new Date().toISOString(),
          includesLibrary: includeLibrary,
          counts,
        };
        await writeJson(path.join(stage, 'manifest.json'), manifest);
        const files = await listFiles(stage);
        if (includeLibrary)
          files.push(
            ...(await listFiles(assets())).map((f) => ({ ...f, name: 'library/' + f.name })),
          );
        output = file + '.' + crypto.randomUUID() + '.tmp';
        const zip = new yazl.ZipFile();
        zip.on('error', (error) => zip.outputStream.destroy(error));
        for (const entry of files) zip.addFile(entry.path, entry.name, { compress: false });
        zip.end();
        let done = 0;
        const total = files.reduce((n, f) => n + f.bytes + 512, 0);
        const meter = new Transform({
          transform(chunk, encoding, callback) {
            done += chunk.length;
            progress({ op: 'export', done, total });
            callback(null, chunk);
          },
        });
        await pipeline(zip.outputStream, meter, fs.createWriteStream(output, { flags: 'wx' }), {
          signal,
        });
        signal.throwIfAborted();
        await fsp.rename(output, file);
        output = null;
        const bytes = (await fsp.stat(file)).size;
        progress({ op: 'export', done: bytes, total: bytes });
        return { path: file, bytes };
      } finally {
        operation = null;
        if (output) await fsp.rm(output, { force: true });
        if (stage) await fsp.rm(stage, { recursive: true, force: true });
      }
    },
    async restore(file) {
      const signal = start('restore');
      let stage,
        undo,
        changed = false;
      const previous = state();
      try {
        const preview = await readArchive(file);
        requireDiskSpace(
          preview.total + (await estimate()).dataBytes,
          await freeBytes(dataDirectory),
        );
        stage = await temporary();
        await readArchive(file, {
          directory: stage,
          maxBytes: preview.total,
          signal,
          progress: (e) => progress({ op: 'restore', done: e.done, total: preview.total }),
        });
        validateBackupDatabase(path.join(stage, 'studio.sqlite'));
        const saved = await json(path.join(stage, 'workbench-session.json'));
        if (saved.version !== 3 || !Array.isArray(saved.session?.tabs))
          throw new Error('备份文件已损坏');
        await json(path.join(stage, 'preferences.json'));
        if (preview.manifest.includesLibrary) {
          const library = path.join(stage, 'library');
          const files = await listFiles(library).catch((error) => {
            if (error.code === 'ENOENT') return [];
            throw error;
          });
          requireDiskSpace(
            files.reduce((n, f) => n + f.bytes, 0),
            await freeBytes(assets()),
          );
          for (const entry of files) {
            signal.throwIfAborted();
            await copyMissing(entry.path, assets(), entry.name);
          }
        }
        signal.throwIfAborted();
        undo = await temporary();
        await snapshot(undo);
        committing = true;
        changed = true;
        await saveState({
          undoDirectory: undo,
          lastRestore: {
            at: new Date().toISOString(),
            fileName: path.basename(file),
            createdAt: preview.manifest.createdAt,
            missingImages: 0,
          },
        });
        const result = await session.exclusive(() => apply(stage));
        await saveState({
          undoDirectory: undo,
          lastRestore: { ...state().lastRestore, ...result },
        });
        if (previous.undoDirectory)
          await fsp.rm(ownedUndo(previous.undoDirectory), { recursive: true, force: true });
        undo = null;
        reload();
        return result;
      } catch (error) {
        if (changed && undo) {
          try {
            await session.exclusive(() => apply(undo, false));
            await saveState(previous);
          } catch (rollbackError) {
            // Keep the only recovery snapshot even when the disk also rejects rollback.
            undo = null;
            throw rollbackError;
          }
        }
        throw error;
      } finally {
        operation = null;
        committing = false;
        if (stage) await fsp.rm(stage, { recursive: true, force: true });
        if (undo) await fsp.rm(undo, { recursive: true, force: true });
      }
    },
    async undo() {
      start('restore');
      let rollback;
      try {
        const previous = state();
        if (!previous.lastRestore || !previous.undoDirectory) throw new Error('没有可撤回的恢复');
        const undo = ownedUndo(previous.undoDirectory);
        rollback = await temporary();
        await snapshot(rollback);
        committing = true;
        try {
          await session.exclusive(() => apply(undo));
          await saveState({ lastRestore: null });
        } catch (error) {
          try {
            await session.exclusive(() => apply(rollback, false));
          } catch (rollbackError) {
            rollback = null;
            throw rollbackError;
          }
          throw error;
        }
        await fsp.rm(undo, { recursive: true, force: true });
        reload();
        return {};
      } finally {
        operation = null;
        committing = false;
        if (rollback) await fsp.rm(rollback, { recursive: true, force: true });
      }
    },
  };
  function ownedUndo(directory) {
    if (
      path.dirname(path.resolve(directory)) !== path.resolve(dataDirectory) ||
      !path.basename(directory).startsWith('backup-stage-') ||
      fs.lstatSync(directory).isSymbolicLink()
    )
      throw new Error('恢复快照路径无效');
    return directory;
  }
}
