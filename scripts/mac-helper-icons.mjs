import fs from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';

// Use the same plist parser as the packager without adding a runtime dependency.
const requireBuilder = createRequire(import.meta.resolve('app-builder-lib'));
const plist = requireBuilder('plist');

async function helpers(app) {
  const frameworks = path.join(app, 'Contents', 'Frameworks');
  const entries = await fs.readdir(frameworks, { withFileTypes: true });
  const names = entries.filter(
    (entry) => entry.isDirectory() && / Helper(?: \([^)]+\))?\.app$/.test(entry.name),
  );
  if (names.length !== 4) throw Error(`Expected four macOS Helpers, found ${names.length}`);
  return names.map((entry) => path.join(frameworks, entry.name, 'Contents'));
}

export async function installHelperIcons(app, source) {
  for (const contents of await helpers(app)) {
    const file = path.join(contents, 'Info.plist');
    const metadata = plist.parse(await fs.readFile(file, 'utf8'));
    await fs.mkdir(path.join(contents, 'Resources'), { recursive: true });
    await fs.copyFile(source, path.join(contents, 'Resources', 'icon.icns'));
    metadata.CFBundleIconFile = 'icon.icns';
    await fs.writeFile(file, plist.build(metadata));
  }
}

export async function verifyHelperIcons(app, source) {
  const expected = await fs.readFile(source);
  for (const contents of await helpers(app)) {
    const metadata = plist.parse(await fs.readFile(path.join(contents, 'Info.plist'), 'utf8'));
    if (metadata.CFBundleIconFile !== 'icon.icns')
      throw Error(`Missing Helper icon reference: ${contents}`);
    const actual = await fs.readFile(path.join(contents, 'Resources', metadata.CFBundleIconFile));
    if (!actual.equals(expected))
      throw Error(`Helper icon does not match application icon: ${contents}`);
  }
  console.log('Verified all four macOS Helper icons');
}

export default async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const icon = path.join(context.packager.projectDir, 'build', 'icons', 'icon.icns');
  await installHelperIcons(app, icon);
  await verifyHelperIcons(app, icon);
}
