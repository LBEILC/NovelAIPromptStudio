import { describe, expect, it } from 'vitest';
import { fontStack, isMonospaceFont, partitionFontFamilies, quoteFontFamily } from './fonts.js';

describe('font preferences', () => {
  it('quotes concrete font families but preserves CSS generic families', () => {
    expect(quoteFontFamily('Cascadia Mono')).toBe('"Cascadia Mono"');
    expect(quoteFontFamily('system-ui')).toBe('system-ui');
    expect(fontStack('Cascadia Mono', 'mono')).toContain('"Cascadia Mono"');
  });

  it('uses metadata, names, and measured glyph widths to identify monospace fonts', () => {
    expect(isMonospaceFont({ family: 'Example Fixed', monospace: true })).toBe(true);
    expect(isMonospaceFont({ family: 'JetBrains Mono', monospace: false })).toBe(true);
    expect(isMonospaceFont({ family: 'Measured Font' }, (_family, sample) => sample.length * 10)).toBe(true);
    expect(isMonospaceFont({ family: 'Proportional Font' }, (_family, sample) => sample.startsWith('i') ? 20 : 80)).toBe(false);
  });

  it('keeps bundled fonts available while partitioning system families', () => {
    const result = partitionFontFamilies([
      { family: 'Example Sans', monospace: false },
      { family: 'Example Mono', monospace: true },
    ]);
    expect(result.proportional).toEqual(expect.arrayContaining(['Geist', 'HarmonyOS Sans SC', 'Example Sans']));
    expect(result.monospace).toEqual(expect.arrayContaining(['Geist Mono', 'Example Mono']));
  });
});
