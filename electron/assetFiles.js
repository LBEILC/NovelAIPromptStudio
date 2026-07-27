import fs from 'node:fs';
import path from 'node:path';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

export function resolveImageFile(filePath) {
  const target = path.resolve(String(filePath || ''));
  if (!filePath || !IMAGE_EXTENSIONS.has(path.extname(target).toLowerCase())) {
    throw new Error('请选择 PNG、JPG 或 WEBP 图片');
  }
  const stat = fs.statSync(target);
  if (!stat.isFile()) throw new Error('图片文件不存在');
  return target;
}

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

export function copyOriginalImage(sourcePath, destinationPath) {
  const source = resolveImageFile(sourcePath);
  fs.copyFileSync(source, destinationPath);
  return { source, destination: destinationPath, bytes: fs.statSync(destinationPath).size };
}

export function copyOriginalAsset(assetsDirectory, sourcePath, destinationPath) {
  return copyOriginalImage(resolveManagedAsset(assetsDirectory, sourcePath), destinationPath);
}

export function copyImageToClipboard(filePath, { nativeImage, clipboard }) {
  const image = nativeImage.createFromPath(resolveImageFile(filePath));
  if (image.isEmpty()) throw new Error('图片无法读取');
  clipboard.writeImage(image);
  return image;
}

export function copyManagedImageToClipboard(assetsDirectory, filePath, { nativeImage, clipboard }) {
  return copyImageToClipboard(resolveManagedAsset(assetsDirectory, filePath), { nativeImage, clipboard });
}
