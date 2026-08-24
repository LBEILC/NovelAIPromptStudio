export function archiveImportNameParts(fileName = '') {
  const normalized = String(fileName || '').replaceAll('\\', '/');
  const parts = normalized.split('/').filter(Boolean);
  return {
    name: parts.at(-1) || normalized || '未命名图片',
    folder: parts.slice(0, -1).join(' / '),
  };
}

export function selectableArchiveEntries(entries = []) {
  return entries.filter((entry) => !entry.previewError);
}

export function reconcileArchiveImportSelection(entries = [], selectedIds = []) {
  const selectable = new Set(selectableArchiveEntries(entries).map((entry) => entry.id));
  return selectedIds.filter((id) => selectable.has(id));
}

export function toggleArchiveImportSelection(entries = [], selectedIds = [], targetId = '', event = {}, anchorId = '') {
  const selectable = selectableArchiveEntries(entries);
  const selectableIds = selectable.map((entry) => entry.id);
  const targetIndex = selectableIds.indexOf(targetId);
  if (targetIndex < 0) return { anchorId, selectedIds };
  if (event.shiftKey && anchorId) {
    const anchorIndex = selectableIds.indexOf(anchorId);
    if (anchorIndex >= 0) {
      const [start, end] = [anchorIndex, targetIndex].sort((left, right) => left - right);
      return {
        anchorId: targetId,
        selectedIds: [...new Set([...selectedIds, ...selectableIds.slice(start, end + 1)])],
      };
    }
  }
  return {
    anchorId: targetId,
    selectedIds: selectedIds.includes(targetId)
      ? selectedIds.filter((id) => id !== targetId)
      : [...selectedIds, targetId],
  };
}
