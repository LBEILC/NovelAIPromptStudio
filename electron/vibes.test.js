import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { extractEmbeddedVibes, fingerprintVibe } from './vibes.js';

describe('embedded Vibe parsing', () => {
  it('fingerprints the copied encoding deterministically', () => {
    expect(fingerprintVibe('encoded-vibe')).toBe(crypto.createHash('sha256').update('encoded-vibe').digest('hex'));
  });

  it('reads Vibe encodings without creating an editable library entry', () => {
    const encoding = 'x'.repeat(200);
    expect(extractEmbeddedVibes({
      reference_image_multiple: [encoding],
      reference_strength_multiple: [0.45],
      reference_information_extracted_multiple: [0.8],
    }, 'curated')).toEqual([{
      encoding,
      strength: 0.45,
      information_extracted: 0.8,
      model: 'nai-diffusion-4-5-curated',
    }]);
  });
});
