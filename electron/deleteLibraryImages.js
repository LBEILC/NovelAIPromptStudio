import fs from 'node:fs';
import path from 'node:path';
import { removeManagedAsset } from './assetFiles.js';

const identity = (file) => {
  const absolute = path.resolve(file);
  return process.platform === 'win32' ? absolute.toLowerCase() : absolute;
};

export function deleteLibraryImages(database, assetsDirectory, ids) {
  const results = { success: [], skipped: [], failed: [] };
  const kept = new Set();
  for (const id of [...new Set(ids.map(String).filter(Boolean))]) {
    const project = database.loadProject(id);
    if (!project) {
      results.skipped.push(id);
      continue;
    }
    if (!project.deleted_at) {
      results.failed.push({ id, error: '图片尚未进入回收站' });
      continue;
    }
    const files = [...new Set([project.thumbnail_path, project.image_path].filter(Boolean))];
    try {
      const retained = new Set([...database.versions.retainedPaths(id)].map(identity));
      for (const file of files) {
        const key = identity(file);
        if (retained.has(key)) {
          if (fs.existsSync(file)) kept.add(key);
        } else {
          removeManagedAsset(assetsDirectory, file);
          kept.delete(key);
        }
      }
      database.deleteProject(id);
      results.success.push(id);
    } catch (error) {
      results.failed.push({
        id,
        error: error instanceof Error ? error.message : String(error),
        remainingFiles: files.filter((file) => fs.existsSync(file)),
      });
    }
  }
  return { results, keptFiles: kept.size };
}
