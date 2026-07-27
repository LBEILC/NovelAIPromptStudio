#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const SOURCE_EXTENSIONS = new Set(['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx']);
const SKIP_DIRECTORIES = new Set([
  '.agents',
  '.git',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'release',
]);

function parseArguments(argv) {
  const options = {
    json: false,
    projectRoot: process.cwd(),
    strict: false,
    strictDeep: false,
  };

  for (const argument of argv) {
    if (argument === '--json') options.json = true;
    else if (argument === '--strict') options.strict = true;
    else if (argument === '--strict-deep') options.strictDeep = true;
    else if (!argument.startsWith('-')) options.projectRoot = path.resolve(argument);
    else throw new Error(`Unknown option: ${argument}`);
  }

  return options;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, 'utf8'));
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function findInstalledPackage(projectRoot) {
  let current = projectRoot;

  while (true) {
    const candidate = path.join(current, 'node_modules', '@lobehub', 'ui', 'package.json');
    if (await pathExists(candidate)) return candidate;
    const parent = path.dirname(current);
    if (parent === current) return '';
    current = parent;
  }
}

async function collectSourceFiles(directory, files = []) {
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRECTORIES.has(entry.name)) continue;
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) await collectSourceFiles(entryPath, files);
    else if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) files.push(entryPath);
  }
  return files;
}

function lineNumberAt(source, index) {
  return source.slice(0, index).split(/\r?\n/).length;
}

function importedNames(clause) {
  const named = clause.match(/\{([\s\S]*?)\}/)?.[1] || '';
  return named
    .split(',')
    .map((item) => item.trim().split(/\s+as\s+/i)[0]?.trim())
    .filter(Boolean);
}

async function componentIsDeprecated(lobeRoot, componentName, cache) {
  if (cache.has(componentName)) return cache.get(componentName);

  const componentDirectory = path.join(lobeRoot, 'es', componentName);
  let deprecated = false;

  if (await pathExists(componentDirectory)) {
    const candidates = [
      path.join(componentDirectory, `${componentName}.d.mts`),
      path.join(componentDirectory, `${componentName}.mjs`),
    ];
    for (const candidate of candidates) {
      if (!(await pathExists(candidate))) continue;
      const declaration = await fs.readFile(candidate, 'utf8');
      if (/@deprecated[\s\S]{0,240}(?:declare\s+)?const\s+\w+/m.test(declaration)) {
        deprecated = true;
        break;
      }
    }
  }

  cache.set(componentName, deprecated);
  return deprecated;
}

async function auditFile(filePath, projectRoot, lobeRoot, deprecatedCache, options) {
  const source = await fs.readFile(filePath, 'utf8');
  const issues = [];
  let deepImportCount = 0;
  const importPattern = /(?:import|export)\s+([\s\S]*?)\s+from\s+['"](@lobehub\/ui[^'"]*)['"]/g;

  for (const match of source.matchAll(importPattern)) {
    const [, clause, specifier] = match;
    const location = {
      file: path.relative(projectRoot, filePath).replaceAll(path.sep, '/'),
      line: lineNumberAt(source, match.index),
    };

    if (specifier.startsWith('@lobehub/ui/es/')) {
      deepImportCount += 1;
      const componentName = specifier.slice('@lobehub/ui/es/'.length).split('/')[0];
      if (componentName && await componentIsDeprecated(lobeRoot, componentName, deprecatedCache)) {
        issues.push({
          ...location,
          code: 'deprecated-component',
          message: `${componentName} is marked @deprecated by the installed Lobe UI package.`,
          specifier,
          suggestion: `Use the supported public replacement; Base UI primitives normally come from @lobehub/ui/base-ui.`,
        });
      } else if (options.strictDeep) {
        issues.push({
          ...location,
          code: 'deep-import',
          message: 'Deep Lobe UI import couples the file to package layout.',
          specifier,
          suggestion: 'Prefer @lobehub/ui/base-ui or @lobehub/ui when the component is publicly exported.',
        });
      }
      continue;
    }

    if (specifier === '@lobehub/ui') {
      for (const name of importedNames(clause)) {
        if (!await componentIsDeprecated(lobeRoot, name, deprecatedCache)) continue;
        issues.push({
          ...location,
          code: 'deprecated-root-export',
          message: `${name} from the root entry resolves to a deprecated implementation in the installed package.`,
          specifier,
          suggestion: `Import the supported replacement from its documented public entry point.`,
        });
      }
    }
  }

  return { deepImportCount, issues };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const projectPackagePath = path.join(options.projectRoot, 'package.json');
  if (!(await pathExists(projectPackagePath))) {
    throw new Error(`No package.json found at ${options.projectRoot}`);
  }

  const projectPackage = await readJson(projectPackagePath);
  const declaredVersion =
    projectPackage.dependencies?.['@lobehub/ui'] ||
    projectPackage.devDependencies?.['@lobehub/ui'] ||
    '';
  const installedPackagePath = await findInstalledPackage(options.projectRoot);
  if (!installedPackagePath) {
    throw new Error('Installed @lobehub/ui package not found. Install dependencies before auditing.');
  }

  const installedPackage = await readJson(installedPackagePath);
  const lobeRoot = path.dirname(installedPackagePath);
  const sourceRoot = await pathExists(path.join(options.projectRoot, 'src'))
    ? path.join(options.projectRoot, 'src')
    : options.projectRoot;
  const files = await collectSourceFiles(sourceRoot);
  const deprecatedCache = new Map();
  const issues = [];
  let deepImportCount = 0;

  for (const file of files) {
    const result = await auditFile(file, options.projectRoot, lobeRoot, deprecatedCache, options);
    issues.push(...result.issues);
    deepImportCount += result.deepImportCount;
  }

  const report = {
    declaredVersion,
    deepImportCount,
    installedVersion: installedPackage.version,
    issueCount: issues.length,
    issues,
    scannedFiles: files.length,
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    console.log(`Lobe UI ${report.installedVersion} audit`);
    console.log(`Scanned ${report.scannedFiles} source files; found ${report.issueCount} issue(s).`);
    if (declaredVersion) console.log(`Declared version: ${declaredVersion}`);
    console.log(`Deep imports observed: ${deepImportCount}${options.strictDeep ? '' : ' (informational)'}`);
    for (const issue of issues) {
      console.log(`\n[${issue.code}] ${issue.file}:${issue.line}`);
      console.log(`  ${issue.message}`);
      console.log(`  Import: ${issue.specifier}`);
      console.log(`  Fix: ${issue.suggestion}`);
    }
  }

  if (options.strict && issues.length > 0) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`Lobe UI audit failed: ${error.message}`);
  process.exitCode = 2;
});
