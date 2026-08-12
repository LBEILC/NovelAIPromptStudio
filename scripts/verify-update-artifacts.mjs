import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const METADATA_FILES = ['latest.yml', 'latest-mac.yml'];

function unquote(value) {
  const trimmed = value.trim();
  const quote = trimmed[0];
  return quote && quote === trimmed.at(-1) && ['\'', '"'].includes(quote)
    ? trimmed.slice(1, -1)
    : trimmed;
}

export function referencedArtifactNames(metadata) {
  const names = new Set();
  for (const line of metadata.split(/\r?\n/u)) {
    const match = line.match(/^\s*(?:-\s*)?(?:url|path):\s*(.+?)\s*$/u);
    if (!match) continue;
    const value = unquote(match[1]);
    let pathname = value;
    try {
      pathname = new URL(value, 'https://updates.invalid/').pathname;
    } catch {
      // Keep the raw relative value so malformed metadata still fails clearly.
    }
    names.add(path.basename(decodeURIComponent(pathname)));
  }
  return [...names];
}

export function verifyUpdateArtifacts(directory) {
  const available = new Set(fs.readdirSync(directory));
  const metadataFiles = METADATA_FILES.filter((file) => available.has(file));
  if (!metadataFiles.length) {
    throw new Error(`No updater metadata found in ${directory}`);
  }

  const missing = [];
  for (const metadataFile of metadataFiles) {
    const metadata = fs.readFileSync(path.join(directory, metadataFile), 'utf8');
    for (const artifact of referencedArtifactNames(metadata)) {
      if (!available.has(artifact)) missing.push(`${metadataFile}: ${artifact}`);
    }
  }

  if (missing.length) {
    throw new Error(`Updater metadata references missing artifacts:\n${missing.map((item) => `- ${item}`).join('\n')}`);
  }
  return { metadataFiles, artifactCount: available.size };
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  const directory = path.resolve(process.argv[2] || 'release');
  try {
    const result = verifyUpdateArtifacts(directory);
    console.log(`Verified ${result.metadataFiles.join(', ')} against artifacts in ${directory}.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
