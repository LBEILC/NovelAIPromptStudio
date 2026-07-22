import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { exportEmbeddedVibeFile, extractEmbeddedVibes, fingerprintVibe } from './vibes.js';

const temporaryDirectories = [];

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

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

  it('exports an embedded encoding as a reusable .naiv4vibe file', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'novelai-vibe-export-'));
    temporaryDirectories.push(directory);
    const encoding = 'v'.repeat(240);
    const filePath = exportEmbeddedVibeFile({
      encoding,
      information_extracted: 0.72,
      model: 'nai-diffusion-4-5-curated',
      name: 'Vibe 1',
      strength: 0.45,
    }, directory);
    const document = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    expect(path.extname(filePath)).toBe('.naiv4vibe');
    expect(document).toMatchObject({
      identifier: 'novelai-vibe-transfer',
      version: 1,
      type: 'encoding',
      importInfo: {
        model: 'nai-diffusion-4-5-curated',
        information_extracted: 0.72,
        strength: 0.45,
      },
    });
    expect(document.encodings['v4-5curated'].unknown.encoding).toBe(encoding);
    expect(document.encodings['v4-5curated'].unknown.params.information_extracted).toBe(0.72);
  });
});
