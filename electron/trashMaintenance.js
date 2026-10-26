import fs from 'node:fs';
import path from 'node:path';
import { resolveManagedAsset } from './assetFiles.js';
import { deleteLibraryImages } from './deleteLibraryImages.js';
import { localDay } from './usage.js';

const identity = (file) =>
  process.platform === 'win32' ? path.resolve(file).toLowerCase() : path.resolve(file);

export function trashSize(database, assetsDirectory) {
  const projects = database.loadTrashSummary();
  const files = new Set(),
    deleted = [];
  let bytes = 0,
    sizeKnown = true;
  for (const project of projects) {
    // Simulate deletion order so two trash records sharing a file count it once,
    // while references from a surviving work or library record keep it excluded.
    const retained = new Set(
      [...database.versions.retainedPaths(project.id, deleted)].map(identity),
    );
    let valid = true;
    for (const file of new Set([project.thumbnail_path, project.image_path].filter(Boolean))) {
      if (retained.has(identity(file))) continue;
      try {
        resolveManagedAsset(assetsDirectory, file);
        if (files.has(identity(file))) continue;
        const stat = fs.statSync(file);
        if (!stat.isFile()) throw new Error('资源不是文件');
        files.add(identity(file));
        bytes += stat.size;
      } catch (error) {
        if (error.code !== 'ENOENT') {
          sizeKnown = false;
          valid = false;
          break;
        }
      }
    }
    if (valid) deleted.push(project.id);
  }
  return { bytes, count: projects.length, sizeKnown };
}

export function createTrashMaintenance({ services, emit = () => {}, now = () => new Date() }) {
  const { database, preferences } = services;
  let timer, running, lastDay;
  const assets = () =>
    services.assetsDirectory?.() || preferences.librarySettings().assetsDirectory;
  async function sweep() {
    if (!preferences || !preferences.librarySettings().trashAutoCleanup || services.busy?.())
      return;
    const time = now(),
      day = localDay(time);
    if (lastDay === day) return;
    const cutoff = time.getTime() - 30 * 24 * 60 * 60 * 1000;
    const ids = database
      .loadTrashSummary()
      .filter((p) => Date.parse(p.deleted_at) < cutoff)
      .map((p) => p.id);
    if (!ids.length) {
      lastDay = day;
      return;
    }
    const result = services.handlers?.['trash.delete-permanently']
      ? await services.handlers['trash.delete-permanently']({ ids }, { source: 'ui' })
      : deleteLibraryImages(database, assets(), ids);
    if (result.ok === false || result.results.failed.length) return result;
    lastDay = day;
    if (result.results.success.length) emit({ libraryChanged: true });
    return result;
  }
  const run = () =>
    running ||
    (running = sweep().finally(() => {
      running = null;
    }));
  return {
    run,
    async start() {
      await run();
      // A busy import/migration is retried later; successful sweeps run once per local day.
      timer = setInterval(() => {
        void run().catch((error) => console.warn('Trash cleanup failed:', error.message));
      }, 60000);
      timer.unref?.();
    },
    async close() {
      clearInterval(timer);
      await running;
    },
    handlers: {
      'trash.size': () => trashSize(database, assets()),
      'settings.library.get': () => preferences.librarySettings(),
      'settings.library.save': async (input) => {
        const settings = preferences.saveLibrarySettings(input);
        if (settings.trashAutoCleanup) await run();
        else lastDay = undefined;
        return settings;
      },
    },
  };
}
