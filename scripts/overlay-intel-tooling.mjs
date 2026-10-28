import fs from 'node:fs/promises';

// Keep product source, dependencies and packaging configuration at the release tag.
for (const name of [
  'package-macos.mjs',
  'notarize-macos.mjs',
  'macos-stapler.mjs',
  'verify-macos-signing.mjs',
  'append-intel-release.mjs',
  'merge-release-artifacts.mjs',
  'verify-update-artifacts.mjs',
]) {
  await fs.copyFile(`.release-tooling/scripts/${name}`, `scripts/${name}`);
}
