import { describe, expect, it } from 'vitest';
import { listSystemFonts, normalizeSystemFonts } from './fonts.js';

describe('system font listing', () => {
  it('deduplicates families, preserves monospace metadata, and rejects unsafe names', () => {
    expect(normalizeSystemFonts([
      { familyName: '"Cascadia Mono"', monospace: true },
      { name: 'cascadia mono', monospace: false },
      { name: 'HarmonyOS Sans SC', monospace: false },
      { name: 'Bad; font', monospace: false },
    ])).toEqual([
      { family: 'cascadia mono', monospace: true },
      { family: 'HarmonyOS Sans SC', monospace: false },
    ]);
  });

  it('uses the platform reader without leaking font file details', async () => {
    const reader = async () => [{ name: 'Example Sans', postScriptName: 'ExampleSans-Regular', monospace: false }];
    await expect(listSystemFonts(reader)).resolves.toEqual([{ family: 'Example Sans', monospace: false }]);
  });
});
