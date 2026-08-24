import { describe, expect, it } from 'vitest';
import { archiveImportNameParts, reconcileArchiveImportSelection, toggleArchiveImportSelection } from './archiveImport.js';

const entries = [
  { id: 'one', fileName: 'folder/one.png' },
  { id: 'two', fileName: 'folder/two.png' },
  { id: 'broken', fileName: 'broken.png', previewError: 'invalid' },
  { id: 'three', fileName: 'three.png' },
];

describe('archive import selection', () => {
  it('uses the same additive Shift range behavior as Gallery selection', () => {
    expect(toggleArchiveImportSelection(entries, ['one'], 'three', { shiftKey: true }, 'one')).toEqual({
      anchorId: 'three',
      selectedIds: ['one', 'two', 'three'],
    });
  });

  it('toggles ordinary selections and excludes unreadable previews', () => {
    expect(toggleArchiveImportSelection(entries, ['one', 'two'], 'two')).toEqual({ anchorId: 'two', selectedIds: ['one'] });
    expect(toggleArchiveImportSelection(entries, ['one'], 'broken')).toEqual({ anchorId: '', selectedIds: ['one'] });
    expect(reconcileArchiveImportSelection(entries, ['one', 'broken', 'missing'])).toEqual(['one']);
  });

  it('keeps a compact visible name while retaining the archive folder', () => {
    expect(archiveImportNameParts('作品\\角色 A\\第三张.png')).toEqual({ name: '第三张.png', folder: '作品 / 角色 A' });
  });
});
