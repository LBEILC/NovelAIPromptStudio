import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { clipboard } from 'electron';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function candidateClipboardPaths() {
  const candidates = [];
  if (process.platform === 'win32') {
    const fileName = clipboard.readBuffer('FileNameW').toString('ucs2').replace(/\0+$/g, '').trim();
    if (fileName) candidates.push(fileName);
  }
  const formats = new Set(['public.file-url', 'text/uri-list', 'NSFilenamesPboardType']);
  for (const format of clipboard.availableFormats?.() || []) {
    if (/file.?url|filename/i.test(format)) formats.add(format);
  }
  for (const format of formats) {
    const text = clipboard.read(format).trim();
    const bufferText = clipboard.readBuffer(format).toString('utf8').replace(/\0+$/g, '').trim();
    const value = text || bufferText;
    if (!value) continue;
    const plistPaths = [...value.matchAll(/<string>([^<]+)<\/string>/g)].map((match) => match[1]);
    if (plistPaths.length) {
      candidates.push(...plistPaths);
      continue;
    }
    for (const line of value.split(/\r?\n/)) {
      if (!line || line.startsWith('#')) continue;
      try {
        const url = new URL(line);
        if (url.protocol === 'file:') candidates.push(fileURLToPath(url));
      } catch {
        candidates.push(line);
      }
    }
  }
  return candidates;
}

function firstReadableImagePath() {
  for (const candidate of candidateClipboardPaths()) {
    const resolved = path.resolve(candidate);
    try {
      if (IMAGE_EXTENSIONS.has(path.extname(resolved).toLowerCase()) && fs.statSync(resolved).isFile()) return resolved;
    } catch {
      // A stale clipboard file can safely fall back to the bitmap representation.
    }
  }
  return '';
}

export function readClipboardImageSource(temporaryDirectory) {
  const filePath = firstReadableImagePath();
  if (filePath) return { filePath, fromBitmap: false, temporaryId: '', fingerprint: '' };

  const image = clipboard.readImage();
  if (image.isEmpty()) throw new Error('剪贴板中没有可导入的图片');
  const size = image.getSize();
  if (!size.width || !size.height || size.width > 65_535 || size.height > 65_535) throw new Error('剪贴板图片尺寸无效');
  const png = image.toPNG();
  if (!png.length) throw new Error('剪贴板图片为空或已损坏');
  const fingerprint = crypto.createHash('sha256').update(png).digest('hex');
  fs.mkdirSync(temporaryDirectory, { recursive: true });
  const targetPath = path.join(temporaryDirectory, `${fingerprint}.png`);
  if (!fs.existsSync(targetPath)) fs.writeFileSync(targetPath, png);
  return { filePath: targetPath, fromBitmap: true, temporaryId: fingerprint, fingerprint };
}

export function cleanupWorkbenchTemporaryImages(temporaryDirectory, referencedPaths = []) {
  const root = path.resolve(temporaryDirectory);
  const referenced = new Set(referencedPaths.map((filePath) => path.resolve(String(filePath || ''))));
  if (!fs.existsSync(root)) return [];
  const removed = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isFile()) continue;
    const target = path.resolve(root, entry.name);
    if (referenced.has(target) || path.dirname(target) !== root) continue;
    fs.rmSync(target, { force: true });
    removed.push(target);
  }
  return removed;
}
