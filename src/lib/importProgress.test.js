import { describe, expect, it } from 'vitest';
import { isImportActive } from './importProgress.js';

describe('gallery import progress', () => {
  it('only treats preparation and file processing as active imports', () => {
    expect(isImportActive({ phase: 'preparing' })).toBe(true);
    expect(isImportActive({ phase: 'importing' })).toBe(true);
    expect(isImportActive({ phase: 'complete' })).toBe(false);
    expect(isImportActive(null)).toBe(false);
  });
});
