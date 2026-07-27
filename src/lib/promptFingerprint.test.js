import { describe, expect, it } from 'vitest';
import { promptFingerprint } from './promptFingerprint.js';

function project({ seed = '1', undesired = 'lowres', center = { x: 0.25, y: 0.5 }, order = ['girl', 'blue hair'] } = {}) {
  const tag = (value, index) => ({ id: `${value}-${index}`, tag: value, weight: 1 });
  return {
    tags: [tag('masterpiece', 0)],
    metadata: { seed },
    prompt_structure: {
      base_undesired_tags: [tag(undesired, 0)],
      use_coords: true,
      use_order: true,
      characters: [{
        id: 'character',
        center,
        prompt_tags: order.map(tag),
        undesired_tags: [tag('bad hands', 0)],
      }],
    },
  };
}

describe('complete Prompt fingerprint', () => {
  it('ignores seed but keeps undesired content, tag order, and character position semantic', () => {
    expect(promptFingerprint(project({ seed: '1' }))).toBe(promptFingerprint(project({ seed: '999' })));
    expect(promptFingerprint(project({ undesired: 'blurry' }))).not.toBe(promptFingerprint(project()));
    expect(promptFingerprint(project({ order: ['blue hair', 'girl'] }))).not.toBe(promptFingerprint(project()));
    expect(promptFingerprint(project({ center: { x: 0.75, y: 0.5 } }))).not.toBe(promptFingerprint(project()));
  });

  it('does not group images without any Prompt semantic', () => {
    expect(promptFingerprint({ tags: [], metadata: {}, prompt_structure: { base_undesired_tags: [], characters: [] } })).toBe('');
  });
});
