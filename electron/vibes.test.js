import crypto from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { extractEmbeddedVibes, parseVibeDocument, toProjectVibe } from './vibes.js';

describe('NovelAI V4 Vibe files', () => {
  it('parses cached encoding variants without changing them', () => {
    const encoding = 'encoded-vibe-data';
    const document = {
      identifier: 'novelai-vibe-transfer',
      version: 1,
      type: 'image',
      id: 'original-image-id',
      image: 'aW1hZ2U=',
      encodings: {
        'v4-5full': {
          modelHash: { encoding, params: { information_extracted: 0.7 } },
        },
      },
      importInfo: { model: 'nai-diffusion-4-5-full', information_extracted: 0.7, strength: 0.4 },
    };
    const parsed = parseVibeDocument(document, '风格.naiv4vibe');
    expect(parsed).toMatchObject({
      id: crypto.createHash('sha256').update(encoding).digest('hex'),
      name: '风格',
      strength: 0.4,
      information_extracted: 0.7,
      information_extracted_known: 1,
      encoding_count: 1,
      has_source_image: 1,
    });
  });

  it('extracts encoded vibes from PNG generation metadata', () => {
    const vibes = extractEmbeddedVibes({
      reference_image_multiple: ['x'.repeat(1000), 'y'.repeat(1000)],
      reference_strength_multiple: [0.4, 0.25],
      reference_information_extracted_multiple: [],
    }, 'NovelAI Diffusion V4.5');
    expect(vibes).toHaveLength(2);
    expect(vibes[0]).toMatchObject({ strength: 0.4, information_extracted: null, model: 'nai-diffusion-4-5-full' });
  });

  it('creates a project link while preserving the encoded source', () => {
    const vibe = toProjectVibe({ id: 'cached', name: 'Cache', source_kind: 'encoding', vibe_file: 'cache.naiv4vibe', strength: 0.5 });
    expect(vibe).toMatchObject({ library_id: 'cached', vibe_file: 'cache.naiv4vibe', strength: 0.5, enabled: true });
    expect(vibe.id).not.toBe('cached');
  });

  it('does not mistake missing Information Extracted for zero', () => {
    const parsed = parseVibeDocument({
      identifier: 'novelai-vibe-transfer', version: 1, type: 'encoding',
      encodings: { 'v4-5full': { unknown: { encoding: 'metadata-only-encoding' } } },
      importInfo: { model: 'nai-diffusion-4-5-full', information_extracted: null, strength: 0.4 },
    }, 'metadata.naiv4vibe');
    expect(parsed.information_extracted_known).toBe(0);
  });
});
