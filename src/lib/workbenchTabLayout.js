export function projectedWorkbenchTabOrder(tabIds, sortingTabId, overTabId) {
  if (!sortingTabId || !overTabId || sortingTabId === overTabId) return tabIds;
  const fromIndex = tabIds.indexOf(sortingTabId);
  const overIndex = tabIds.indexOf(overTabId);
  if (fromIndex < 0 || overIndex < 0) return tabIds;

  const projected = [...tabIds];
  const [sortingTab] = projected.splice(fromIndex, 1);
  projected.splice(overIndex, 0, sortingTab);
  return projected;
}

export function hiddenWorkbenchTabSeparatorIds(tabIds, activeTabId, sortingTabId = '', overTabId = '') {
  const projected = projectedWorkbenchTabOrder(tabIds, sortingTabId, overTabId);
  const hidden = new Set();
  const hideAround = (tabId) => {
    const index = projected.indexOf(tabId);
    if (index < 0) return;
    hidden.add(tabId);
    if (index > 0) hidden.add(projected[index - 1]);
  };

  hideAround(activeTabId);
  if (sortingTabId) hideAround(sortingTabId);
  if (projected.length) hidden.add(projected.at(-1));
  return hidden;
}
