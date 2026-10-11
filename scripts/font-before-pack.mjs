import { readdir } from 'node:fs/promises';
import path from 'node:path';
import { requireFont } from './fonts.mjs';

export default async function beforePack(context) {
  const root = context.packager.projectDir;
  await requireFont(path.join(root, '.local/fonts/MiSansVF.ttf'));
  const assets = path.join(root, 'dist/assets');
  const files = await readdir(assets);
  const font = files.find((name) => /^MiSansVF-.*\.ttf$/.test(name));
  if (!font) throw new Error('构建产物缺少 MiSans；运行 npm run package 重新构建。');
  await requireFont(path.join(assets, font));
}
