import { it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { undefinedJsNames } from './check-js-names.mjs';

it('reports undefined JS names while ignoring other type errors and TypeScript files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'js-names-'));
  try {
    fs.mkdirSync(path.join(root, 'src'));
    fs.mkdirSync(path.join(root, 'electron'));
    fs.writeFileSync(
      path.join(root, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { noLib: true, types: [] },
        include: ['src/**/*', 'electron/**/*'],
      }),
    );
    fs.writeFileSync(
      path.join(root, 'src', 'fixture.jsx'),
      'export const value = missingRendererName; const count = 1; count();',
    );
    fs.writeFileSync(
      path.join(root, 'electron', 'fixture.js'),
      'export const value = missingMainName;',
    );
    fs.writeFileSync(
      path.join(root, 'src', 'typed-fixture.ts'),
      'export const value = missingTypedName;',
    );
    const errors = undefinedJsNames(root);
    expect(errors).toHaveLength(2);
    expect(errors.every((error) => [2304, 2552].includes(error.code))).toBe(true);
    expect(errors.map((error) => path.basename(error.file.fileName)).sort()).toEqual([
      'fixture.js',
      'fixture.jsx',
    ]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
