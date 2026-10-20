import { readFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';
import { validateReleaseNotes } from '../src/lib/releaseNotes.js';
const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const version = String(process.argv[2] || pkg.version).replace(/^v/, '');
if (!/^\d+\.\d+\.\d+$/.test(version)) throw Error('Invalid release version');
const source = path.resolve('release-notes', `${version}.json`);
let content;
try {
  content = await readFile(source, 'utf8');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
if (content !== undefined) {
  const notes = validateReleaseNotes(JSON.parse(content));
  if (notes.version !== version) throw Error('Release notes version does not match release');
  if (process.argv[3]) {
    const destination = path.resolve(process.argv[3]);
    await mkdir(destination, { recursive: true });
    await copyFile(source, path.join(destination, 'release-notes.json'));
  }
  console.log(`Validated release notes ${version}`);
} else console.log(`No structured release notes for ${version}; Markdown remains available.`);
