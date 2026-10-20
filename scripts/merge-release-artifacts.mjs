import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function mergeMacMetadata(documents, architectures = ['x64', 'arm64']) {
  if (!documents.length) throw new Error('Expected macOS metadata');
  const sections = documents.map((text) => {
    const match = text
      .replaceAll('\r\n', '\n')
      .match(/^([\s\S]*?)^files:\n((?:[ \t].*\n|\n)+)([\s\S]*)$/m);
    if (!match) throw new Error('Unrecognized updater metadata files section');
    return { head: match[1], files: match[2], tail: match[3] };
  });
  const versions = sections.map(({ head }) => head.match(/^version:\s*(.+)$/m)?.[1]);
  if (!versions[0] || versions.some((version) => version !== versions[0]))
    throw new Error('Updater versions differ');
  // A supplemental job can be rerun after metadata was already merged.
  const entries = new Map();
  for (const section of sections) {
    for (const entry of section.files.trimEnd().split(/(?=^  - url:)/m)) {
      if (!entry.trim()) continue;
      const url = entry.match(/^  - url:\s*(.+)$/m)?.[1];
      if (!url) throw new Error('Unrecognized updater file entry');
      entries.set(url, `${entry.trimEnd()}\n`);
    }
  }
  const files = [...entries.values()].join('');
  for (const arch of architectures)
    if (!new RegExp(`-${arch}\\.zip`).test(files))
      throw new Error(`Missing ${arch} update archive`);
  return `${sections[0].head}files:\n${files}${sections[0].tail}`;
}

export async function mergeReleaseArtifacts(source, destination, architectures = ['x64', 'arm64']) {
  await fs.mkdir(destination, { recursive: true });
  const mac = [];
  const copied = new Set();
  for (const directory of (await fs.readdir(source)).sort()) {
    for (const name of await fs.readdir(path.join(source, directory))) {
      const file = path.join(source, directory, name);
      if (name === 'latest-mac.yml') mac.push(await fs.readFile(file, 'utf8'));
      else {
        if (copied.has(name)) throw new Error(`Duplicate release artifact: ${name}`);
        copied.add(name);
        await fs.copyFile(file, path.join(destination, name));
      }
    }
  }
  await fs.writeFile(
    path.join(destination, 'latest-mac.yml'),
    mergeMacMetadata(mac, architectures),
  );
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]))
  await mergeReleaseArtifacts(
    path.resolve(process.argv[2]),
    path.resolve(process.argv[3]),
    process.argv[4]?.split(','),
  );
