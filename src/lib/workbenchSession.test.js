import { describe, expect, it } from 'vitest';
import {
  activeWorkbenchCopyContext,
  activeWorkbenchTab,
  addWorkbenchTab,
  closeWorkbenchTab,
  createWorkbenchSession,
  createWorkbenchTab,
  normalizeWorkbenchViewState,
  parseWorkbenchSession,
  scopeWorkbenchCopyContext,
  serializeWorkbenchSession,
  updateWorkbenchTab,
  workbenchHasChanges,
} from './workbenchSession.js';

function fixture(id = 'workbench-1', imagePath = 'C:\\images\\source.png') {
  return {
    id,
    name: 'source',
    image_path: imagePath,
    metadata: { prompt_raw: '1girl', negative_prompt: '' },
    tags: [{ id: 'tag-1', tag: '1girl', weight: 1, category: 'Subject' }],
    prompt_structure: { base_undesired_tags: [], characters: [], use_coords: false, use_order: true },
    vibes: [],
  };
}

describe('workbench session v2', () => {
  it('only exposes copy context reported by the active tab', () => {
    const first = scopeWorkbenchCopyContext({ text: 'prompt', count: 1 }, 'tab-a');
    expect(activeWorkbenchCopyContext(first, 'tab-a')).toMatchObject({ text: 'prompt', count: 1 });
    expect(activeWorkbenchCopyContext(first, 'tab-b')).toEqual({ text: '', count: 0 });
  });

  it('serializes all tab drafts and restores a draft onto a freshly parsed image', () => {
    const session = createWorkbenchSession(fixture());
    activeWorkbenchTab(session).project.tags[0].translation = '一名女孩';
    const saved = parseWorkbenchSession(serializeWorkbenchSession(session));
    const reparsed = fixture('workbench-2');
    const restored = createWorkbenchTab(reparsed, { ...saved.tabs[0], draft: saved.tabs[0].draft });
    expect(restored.project.id).toBe('workbench-2');
    expect(restored.project.tags[0].translation).toBe('一名女孩');
    expect(restored.source.path).toBe(reparsed.image_path);
  });

  it('detects prompt edits independently in each tab', () => {
    let session = createWorkbenchSession(fixture());
    session = addWorkbenchTab(session, fixture('workbench-2', 'C:\\images\\other.png'));
    expect(workbenchHasChanges(session)).toBe(false);
    activeWorkbenchTab(session).project.tags[0].weight = 1.2;
    expect(workbenchHasChanges(session)).toBe(true);
  });

  it('preserves independent overview view state in each serialized tab', () => {
    let session = createWorkbenchSession(fixture());
    const firstId = session.activeTabId;
    session = updateWorkbenchTab(session, firstId, (tab) => ({
      ...tab,
      viewState: normalizeWorkbenchViewState({
        filters: { category: 'Body', polarity: 'prompt', domain: 'character', query: 'hair' },
        language: 'bilingual',
        viewMode: 'category',
      }),
    }));
    session = addWorkbenchTab(session, fixture('workbench-2', 'C:\\images\\other.png'));
    const secondId = session.activeTabId;
    session = updateWorkbenchTab(session, secondId, (tab) => ({
      ...tab,
      viewState: normalizeWorkbenchViewState({
        filters: { category: 'Environment', polarity: 'undesired', domain: 'base', query: '' },
        language: 'translated',
        viewMode: 'structure',
      }),
    }));

    const restored = parseWorkbenchSession(serializeWorkbenchSession(session));
    expect(restored.tabs.find((tab) => tab.id === firstId).viewState).toMatchObject({
      filters: { category: 'Body', polarity: 'prompt', domain: 'character', query: 'hair' },
      language: 'bilingual',
      viewMode: 'category',
    });
    expect(restored.tabs.find((tab) => tab.id === secondId).viewState).toMatchObject({
      filters: { category: 'Environment', polarity: 'undesired', domain: 'base', query: '' },
      language: 'translated',
      viewMode: 'structure',
    });
  });

  it('supplies safe defaults when restoring a session without view state', () => {
    const serialized = JSON.parse(serializeWorkbenchSession(createWorkbenchSession(fixture())));
    delete serialized.tabs[0].viewState;
    const restored = parseWorkbenchSession(JSON.stringify(serialized));
    expect(restored.tabs[0].viewState).toEqual({
      filters: { category: 'All', polarity: 'all', domain: 'all', query: '' },
      language: 'original',
      viewMode: 'structure',
    });
  });

  it('deduplicates stable sources and activates the existing tab', () => {
    let session = createWorkbenchSession(fixture(), { source: { type: 'library', projectId: 'library-1', path: 'C:\\assets\\one.png' } });
    const existing = session.tabs[0].id;
    session = addWorkbenchTab(session, fixture('workbench-2', 'C:\\assets\\one.png'), { source: { type: 'library', projectId: 'library-1', path: 'C:\\assets\\one.png' } });
    expect(session.tabs).toHaveLength(1);
    expect(session.activeTabId).toBe(existing);
  });

  it('closes the active tab and prefers the nearest tab on its left', () => {
    let session = createWorkbenchSession(fixture('one', 'C:\\one.png'));
    session = addWorkbenchTab(session, fixture('two', 'C:\\two.png'));
    session = addWorkbenchTab(session, fixture('three', 'C:\\three.png'));
    const middle = session.tabs[1].id;
    session = { ...session, activeTabId: middle };
    session = closeWorkbenchTab(session, middle);
    expect(session.activeTabId).toBe(session.tabs[0].id);
  });

  it('migrates a v1 session into one v2 tab', () => {
    const migrated = parseWorkbenchSession(JSON.stringify({
      sourcePath: 'C:\\legacy.png',
      draft: { tags: [{ id: 'tag', tag: 'legacy' }], prompt_structure: {} },
      updatedAt: '2026-01-01T00:00:00.000Z',
    }));
    expect(migrated).toMatchObject({
      version: 2,
      tabs: [{ source: { type: 'file', path: 'C:\\legacy.png' } }],
    });
  });
});
