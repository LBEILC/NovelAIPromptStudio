import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import afterPack, { installHelperIcons, verifyHelperIcons } from './mac-helper-icons.mjs';

const roots = [];
afterEach(async () => {
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});

async function fixture() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'helper-icons-'));
  roots.push(root);
  const app = path.join(root, 'Example.app');
  const contents = [];
  for (const suffix of ['', ' (GPU)', ' (Plugin)', ' (Renderer)']) {
    const dir = path.join(app, 'Contents', 'Frameworks', `Example Helper${suffix}.app`, 'Contents');
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      path.join(dir, 'Info.plist'),
      '<?xml version="1.0"?><plist version="1.0"><dict><key>CFBundleIdentifier</key><string>example.helper</string></dict></plist>',
    );
    contents.push(dir);
  }
  const source = path.resolve('build/icons/icon.icns');
  return { app, source, contents, root };
}

it('adds the exact application icon to every Helper and preserves metadata', async () => {
  const { app, source, contents, root } = await fixture();
  await afterPack({
    electronPlatformName: 'darwin',
    appOutDir: root,
    packager: { projectDir: process.cwd(), appInfo: { productFilename: 'Example' } },
  });
  await expect(verifyHelperIcons(app, source)).resolves.toBeUndefined();
  for (const dir of contents)
    expect(await fs.readFile(path.join(dir, 'Info.plist'), 'utf8')).toContain(
      '<string>example.helper</string>',
    );
  await installHelperIcons(app, source);
  await expect(verifyHelperIcons(app, source)).resolves.toBeUndefined();
});

it('does not access other platform packages', async () => {
  await expect(afterPack({ electronPlatformName: 'win32' })).resolves.toBeUndefined();
  await expect(afterPack({ electronPlatformName: 'linux' })).resolves.toBeUndefined();
});

it('rejects missing Helpers, missing plist references and mismatched icon bytes', async () => {
  const { app, source, contents } = await fixture();
  await expect(verifyHelperIcons(app, source)).rejects.toThrow('icon reference');
  await installHelperIcons(app, source);
  await fs.writeFile(path.join(contents[0], 'Resources', 'icon.icns'), 'wrong');
  await expect(verifyHelperIcons(app, source)).rejects.toThrow('does not match');
  await fs.rm(contents[0], { recursive: true });
  await fs.rmdir(path.dirname(contents[0]));
  await expect(verifyHelperIcons(app, source)).rejects.toThrow('Expected four');
});
