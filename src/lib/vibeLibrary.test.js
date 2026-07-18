import { describe, expect, it } from 'vitest';
import { groupVibeLibraryBySource } from './vibeLibrary.js';

describe('Vibe library source grouping', () => {
  it('groups parameter variants that share the same source image', () => {
    const groups = groupVibeLibraryBySource([
      { id: 'strength-04', source_image_hash: 'shared-image', reference_image: '', name: '0.4' },
      { id: 'strength-08', source_image_hash: 'shared-image', reference_image: 'source.png', name: '0.8' },
      { id: 'encoding-only-a', source_image_hash: '', reference_image: '', name: 'Missing A' },
      { id: 'encoding-only-b', source_image_hash: '', reference_image: '', name: 'Missing B' },
    ]);

    expect(groups).toHaveLength(3);
    expect(groups[0].entries.map((entry) => entry.id)).toEqual(['strength-04', 'strength-08']);
    expect(groups[0].source.reference_image).toBe('source.png');
    expect(groups.slice(1).map((group) => group.key)).toEqual(['missing:encoding-only-a', 'missing:encoding-only-b']);
  });
});
