import fs from 'node:fs';

const packageJson = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const actualTag = process.argv[2];
const expectedTag = `v${packageJson.version}`;

if (!actualTag) {
  console.error('Usage: node scripts/verify-release-tag.mjs <tag>');
  process.exit(1);
}

if (actualTag !== expectedTag) {
  console.error(`Release tag ${actualTag} does not match package version ${packageJson.version}; expected ${expectedTag}.`);
  process.exit(1);
}

console.log(`Release tag ${actualTag} matches package version ${packageJson.version}.`);
