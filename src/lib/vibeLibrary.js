export function groupVibeLibraryBySource(entries = []) {
  const groups = new Map();
  for (const entry of entries) {
    const key = entry.source_image_hash || `missing:${entry.id}`;
    if (!groups.has(key)) groups.set(key, { key, entries: [], source: entry });
    const group = groups.get(key);
    group.entries.push(entry);
    if (!group.source.reference_image && entry.reference_image) group.source = entry;
  }
  return [...groups.values()];
}
