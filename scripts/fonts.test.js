import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { checkFont, requireFont } from './fonts.mjs';

const roots = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});
it('rejects missing or corrupt MiSans before release packaging', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nai-fonts-'));
  roots.push(root);
  const file = path.join(root, 'font.ttf');
  await expect(requireFont(file)).rejects.toThrow('npm run fonts');
  await writeFile(file, 'not a font');
  await expect(checkFont(file)).rejects.toThrow('SHA-256');
  await expect(requireFont(file)).rejects.toThrow('禁止无字体打包');
});
