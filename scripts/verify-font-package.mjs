import { readdir, readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { listPackage, extractFile } from '@electron/asar';
import { fontHash } from './fonts.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function size(directory) {
  let bytes = 0;
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    bytes += entry.isDirectory() ? await size(file) : (await stat(file)).size;
  }
  return bytes;
}
let resourceDirectories = process.argv.slice(2);
if (!resourceDirectories.length) {
  if (process.platform === 'win32') resourceDirectories = ['release/win-unpacked/resources'];
  else if (process.platform === 'darwin') {
    const folders = (await readdir('release')).filter((name) =>
      /^mac(?:-arm64|-universal)?$/.test(name),
    );
    if (!folders.length) throw new Error('No packaged macOS application');
    resourceDirectories = folders.map(
      (folder) => 'release/' + folder + '/NovelAI Prompt Studio.app/Contents/Resources',
    );
  } else resourceDirectories = ['release/linux-unpacked/resources'];
}
const reports = [];
for (const resources of resourceDirectories) {
  const archive = path.join(resources, 'app.asar');
  const files = listPackage(archive).map((file) => file.replaceAll('\\', '/').replace(/^\//, ''));
  if (files.some((file) => /(?:Geist|HarmonyOS).*\.(?:woff2?|ttf|otf)$/i.test(file)))
    throw new Error('Removed bundled fonts found in package');
  const expected = [
    ['MiSansVF-', fontHash],
    [
      'newsreader-latin-standard-normal-',
      hash(
        await readFile(
          'node_modules/@fontsource-variable/newsreader/files/newsreader-latin-standard-normal.woff2',
        ),
      ),
    ],
    [
      'ibm-plex-mono-latin-400-normal-',
      hash(
        await readFile(
          'node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-400-normal.woff2',
        ),
      ),
    ],
    [
      'ibm-plex-mono-latin-500-normal-',
      hash(
        await readFile(
          'node_modules/@fontsource/ibm-plex-mono/files/ibm-plex-mono-latin-500-normal.woff2',
        ),
      ),
    ],
  ];
  const fonts = [];
  for (const [prefix, sha256] of expected) {
    const matches = files.filter((file) => file.startsWith(`dist/assets/${prefix}`));
    if (matches.length !== 1)
      throw new Error(`Expected one ${prefix} font, found ${matches.length}`);
    const bytes = extractFile(archive, path.normalize(matches[0]));
    if (hash(bytes) !== sha256) throw new Error(`Packaged font differs from source: ${matches[0]}`);
    fonts.push({ file: matches[0], bytes: bytes.length, sha256 });
  }
  for (const name of ['MiSans', 'Newsreader', 'IBMPlexMono']) {
    const source = await readFile(`LICENSES/${name}/LICENSE`);
    const packaged = await readFile(path.join(resources, 'LICENSES', name, 'LICENSE'));
    if (!source.equals(packaged)) throw new Error(`Packaged ${name} license differs from source`);
  }
  const report = {
    platform: process.platform,
    resources,
    fonts,
    licenses: ['MiSans', 'Newsreader', 'IBMPlexMono'],
    distBytes: await size('dist'),
    asarBytes: (await stat(archive)).size,
    resourcesBytes: await size(resources),
  };
  reports.push(report);
}
await mkdir('.codex-runs/008', { recursive: true });
await writeFile('.codex-runs/008/package-fonts.json', JSON.stringify(reports, null, 2));
console.log(JSON.stringify(reports, null, 2));
