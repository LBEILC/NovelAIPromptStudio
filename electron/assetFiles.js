import fs from 'node:fs';
import path from 'node:path';

export function resolveManagedAsset(assetsDirectory, filePath) {
  const root = path.resolve(String(assetsDirectory || ''));
  const target = path.resolve(String(filePath || ''));
  const relative = path.relative(root, target);
  if (!filePath || !relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error('资源路径不在应用资源库目录内');
  }
  return target;
}

export function removeManagedAsset(assetsDirectory, filePath) {
  const target = resolveManagedAsset(assetsDirectory, filePath);
  fs.rmSync(target, { force: true });
  return target;
}

export function copyOriginalAsset(assetsDirectory, sourcePath, destinationPath) {
  const source = resolveManagedAsset(assetsDirectory, sourcePath);
  fs.copyFileSync(source, destinationPath);
  return { source, destination: destinationPath, bytes: fs.statSync(destinationPath).size };
}

export function copyManagedImageToClipboard(assetsDirectory, filePath, { nativeImage, clipboard }) {
  const image = nativeImage.createFromPath(resolveManagedAsset(assetsDirectory, filePath));
  if (image.isEmpty()) throw new Error('图片无法读取');
  clipboard.writeImage(image);
  return image;
}
