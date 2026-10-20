import { readdir, readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

async function files(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) =>
        entry.isDirectory()
          ? files(path.join(directory, entry.name))
          : path.join(directory, entry.name),
      ),
    )
  ).flat();
}
const violations = [];
// Global states (motion off, leaving, dragging cursors) have to override every component rule,
// whatever its specificity. They live in one file; !important stays forbidden everywhere else.
const importantAllowed = new Set([path.join('src', 'styles', '11-states.css')]);
for (const file of await files('src')) {
  const source = await readFile(file, 'utf8');
  if (
    /from\s*['"](?:@lobehub\/ui|antd)/.test(source) ||
    (/!important/.test(source) && !importantAllowed.has(file))
  )
    violations.push(`${file}: prohibited import or important`);
  if (file.endsWith('.css')) {
    const css = source.replace(/\/\*[\s\S]*?\*\//g, '');
    if (/#[\da-f]{3,8}\b|(?:rgb|hsl)a?\s*\(|font(?:-size)?\s*:[^;{}]*\dpx/i.test(css))
      violations.push(`${file}: hardcoded color or font size`);
  }
}
const artifacts = await files('dist');
for (const file of artifacts.filter((file) => /\.(?:js|html|css)$/.test(file))) {
  const text = await readFile(file, 'utf8');
  if (/data-showcase|nps-demo-sheet|ui-showcase\.html|suggestion-preview/.test(text))
    violations.push(`${file}: showcase leaked into production`);
}
await mkdir('.codex-runs/004', { recursive: true });
await writeFile('.codex-runs/004/production-files.json', JSON.stringify(artifacts.sort(), null, 2));
console.log(
  `UI source audit: ${violations.length} violations. Production files: ${artifacts.length}; showcase markers absent: ${!violations.length}.`,
);
if (violations.length) {
  console.error(violations.join('\n'));
  process.exitCode = 1;
}
