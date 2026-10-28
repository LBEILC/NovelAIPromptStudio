import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { extractFile } from '@electron/asar';
import { verifyHelperIcons } from './mac-helper-icons.mjs';

const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  const output = (result.stdout || '') + (result.stderr || '');
  console.log(output.trim());
  if (result.error || result.status !== 0)
    throw Error(`${command} failed: ${output}`, { cause: result.error });
  return output;
};
async function verify(app) {
  await verifyHelperIcons(app, path.resolve('build/icons/icon.icns'));
  if (!process.env.CSC_LINK) {
    console.log('Signing unconfigured: signature verification skipped');
    return;
  }
  run('codesign', ['--verify', '--deep', '--strict', '--verbose=2', app]);
  const signature = run('codesign', ['-dv', '--verbose=4', app]);
  if (
    !signature.includes('Authority=Developer ID Application:') ||
    !process.env.APPLE_TEAM_ID ||
    !signature.includes(`TeamIdentifier=${process.env.APPLE_TEAM_ID}`)
  )
    throw Error('Unexpected signing identity');
  const assessment = run('spctl', ['-a', '-vvv', '-t', 'exec', app]);
  if (!assessment.includes('source=Notarized Developer ID'))
    throw Error('Missing notarized Developer ID assessment');
  run('xcrun', ['stapler', 'validate', app]);
  const metadata = JSON.parse(
    extractFile(path.join(app, 'Contents/Resources/app.asar'), 'package.json').toString(),
  );
  if (metadata.macSignedAndNotarized !== true) throw Error('Missing signed update capability');
  console.log(`Verified signed and stapled app: ${app}`);
}
const root = path.resolve('release');
const entries = await fs.readdir(root);
const appDirs = entries.filter((name) => name === 'mac' || name.startsWith('mac-'));
if (appDirs.length !== 1) throw Error('Expected one macOS package directory');
const bundleName = 'NovelAI Prompt Studio.app';
await verify(path.join(root, appDirs[0], bundleName));
const zips = entries.filter((name) => name.endsWith('.zip'));
if (zips.length !== 1) throw Error('Expected one update ZIP');
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'nps-signed-zip-'));
try {
  run('ditto', ['-x', '-k', path.join(root, zips[0]), temporary]);
  await verify(path.join(temporary, bundleName));
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
