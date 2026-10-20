import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { setTimeout } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
import { mergeReleaseArtifacts } from './merge-release-artifacts.mjs';
import { verifyUpdateArtifacts } from './verify-update-artifacts.mjs';

function gh(args) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

export async function appendIntelRelease(
  tag,
  directory,
  { run = gh, wait = setTimeout, attempts = 120 } = {},
) {
  const names = (await fs.readdir(directory))
    .filter((name) => /-x64\.(dmg|zip)(\.blockmap)?$/.test(name))
    .sort();
  if (!names.some((name) => name.endsWith('.dmg')) || !names.some((name) => name.endsWith('.zip')))
    throw new Error('Missing Intel DMG or ZIP');
  const staging = await fs.mkdtemp(path.join(os.tmpdir(), 'nps-intel-release-'));
  try {
    let ready = false;
    for (let attempt = 0; attempt < attempts; attempt++) {
      try {
        const release = JSON.parse(await run(['release', 'view', tag, '--json', 'isDraft,assets']));
        const assets = new Set(release.assets.map((asset) => asset.name));
        // Release creation and its asset uploads are not atomic.
        ready = !release.isDraft && assets.has('SHA256SUMS.txt') && assets.has('latest-mac.yml');
      } catch {
        ready = false;
      }
      if (ready) break;
      console.log(`Waiting for the primary Release ${tag} (${attempt + 1}/${attempts})`);
      if (attempt + 1 < attempts) await wait(10_000);
    }
    if (!ready) throw new Error(`Primary Release ${tag} was not ready within the polling window`);

    const source = path.join(staging, 'source');
    const published = path.join(source, 'published');
    const intel = path.join(source, 'supplemental');
    const combined = path.join(staging, 'combined');
    await fs.mkdir(published, { recursive: true });
    await fs.mkdir(intel);
    await run(['release', 'download', tag, '--dir', published]);
    await fs.rm(path.join(published, 'SHA256SUMS.txt'), { force: true });
    for (const name of names) {
      // Replace only this job's assets on a rerun; preserve all primary assets.
      await fs.rm(path.join(published, name), { force: true });
      await fs.copyFile(path.join(directory, name), path.join(intel, name));
    }
    await fs.copyFile(path.join(directory, 'latest-mac.yml'), path.join(intel, 'latest-mac.yml'));
    await mergeReleaseArtifacts(source, combined);
    verifyUpdateArtifacts(combined);
    const sums = [];
    for (const name of (await fs.readdir(combined)).sort()) {
      const hash = createHash('sha256')
        .update(await fs.readFile(path.join(combined, name)))
        .digest('hex');
      sums.push(`${hash}  ${name}\n`);
    }
    await fs.writeFile(path.join(combined, 'SHA256SUMS.txt'), sums.join(''));
    // Installers must exist before metadata begins referring to them.
    await run([
      'release',
      'upload',
      tag,
      ...names.map((name) => path.join(combined, name)),
      '--clobber',
    ]);
    await run([
      'release',
      'upload',
      tag,
      path.join(combined, 'latest-mac.yml'),
      path.join(combined, 'SHA256SUMS.txt'),
      '--clobber',
    ]);
    console.log(`Intel assets, combined macOS metadata and checksums uploaded to ${tag}.`);
  } finally {
    await fs.rm(staging, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    await appendIntelRelease(process.argv[2], path.resolve(process.argv[3] || 'release'));
  } catch (error) {
    console.error(
      `::error::Intel supplement failed; the primary Release remains available. ${error.message}`,
    );
    process.exitCode = 1;
  }
}
