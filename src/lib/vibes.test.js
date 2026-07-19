import { describe, expect, it } from 'vitest';
import { cachedInformationValues, informationExtractedPatch, informationExtractedState, restoreOriginalInformationPatch } from './vibes.js';

describe('Vibe Information Extracted state', () => {
  it('normalizes cached positions and tolerates slider rounding', () => {
    expect(cachedInformationValues('[0.7, 0.4, 0.7, 3, "bad"]')).toEqual([0.4, 0.7]);
    expect(informationExtractedState({ source_kind: 'encoding', information_extracted: 0.701, encoded_values_json: '[0.7]' }))
      .toMatchObject({ kind: 'cached', fileUsable: true });
  });

  it('marks uncached positions as incompatible with the stored file', () => {
    const vibe = { source_kind: 'encoding', information_extracted: 0.7, encoded_values_json: '[0.4,0.7]' };
    expect(informationExtractedState({ ...vibe, ...informationExtractedPatch(vibe, 0.55) }))
      .toMatchObject({ kind: 'uncached', fileUsable: false });
    expect(informationExtractedPatch(vibe, 0.4)).toMatchObject({ information_extracted_dirty: 0 });
  });

  it('keeps an unknown metadata encoding usable until the slider moves', () => {
    const vibe = { source_kind: 'metadata', information_extracted: 0.7, encoded_values_json: '[]', information_extracted_dirty: 0 };
    expect(informationExtractedState(vibe)).toMatchObject({ kind: 'unknown', fileUsable: true });
    expect(informationExtractedState({ ...vibe, ...informationExtractedPatch(vibe, 0.6) }))
      .toMatchObject({ kind: 'uncached', fileUsable: false });
    expect(restoreOriginalInformationPatch({ ...vibe, information_extracted_origin: 0.7 }))
      .toEqual({ information_extracted: 0.7, information_extracted_known: 0, information_extracted_dirty: 0 });
  });
});
