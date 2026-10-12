import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
import referenceSupport from './reference-availability.cjs';

it('reports missing private references without failing and detects local references', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reference-test-'));
  try {
    expect(referenceSupport.referenceAvailability(root)).toEqual({
      available: false,
      reason: '界面稿不在，没有生成对照图',
    });
    fs.mkdirSync(path.join(root, 'design'));
    fs.writeFileSync(path.join(root, 'design', 'preview.html'), '<html></html>');
    expect(referenceSupport.referenceAvailability(root)).toEqual({ available: true, reason: null });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
