import { describe, expect, it } from 'vitest';
import { createWorkbenchSession, parseWorkbenchSession, serializeWorkbenchSession, workbenchHasChanges } from './workbenchSession.js';

function fixture() {
  return {
    id: 'workbench-1',
    name: 'source',
    image_path: 'C:\\images\\source.png',
    metadata: { prompt_raw: '1girl', negative_prompt: '' },
    tags: [{ id: 'tag-1', tag: '1girl', weight: 1, category: 'Subject' }],
    prompt_structure: { base_undesired_tags: [], characters: [], use_coords: false, use_order: true },
    vibes: [],
  };
}

describe('workbench session', () => {
  it('serializes only the editable prompt draft and restores it onto a freshly parsed image', () => {
    const session = createWorkbenchSession(fixture());
    session.project.tags[0].translation = '一名女孩';
    const saved = parseWorkbenchSession(serializeWorkbenchSession(session));
    const reparsed = { ...fixture(), id: 'workbench-2' };
    const restored = createWorkbenchSession(reparsed, saved);
    expect(restored.project.id).toBe('workbench-2');
    expect(restored.project.tags[0].translation).toBe('一名女孩');
    expect(restored.sourcePath).toBe(reparsed.image_path);
  });

  it('detects prompt edits without treating the source image as changed', () => {
    const session = createWorkbenchSession(fixture());
    expect(workbenchHasChanges(session)).toBe(false);
    session.project.tags[0].weight = 1.2;
    expect(workbenchHasChanges(session)).toBe(true);
  });
});
