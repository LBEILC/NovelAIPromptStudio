// Shared by explicit saves and the generation worker (inside store.exclusive).
export async function saveWorkbenchImage({ services, store, emit }, value) {
  const saved = await services.importImage(value.project.image_path, value.project);
  const root = value.workId && services.database.versions.list(value.workId)[0];
  const fields = {
    id: saved.id,
    image_path: saved.image_path,
    thumbnail_path: saved.thumbnail_path,
  };
  const next = store.get();
  const item = next.tabs.find((t) => t.id === value.id);
  // A queued job may finish saving after its tab was closed or switched versions.
  if (item?.project?.image_path === value.project.image_path) {
    item.source = { type: 'library', projectId: saved.id, path: saved.image_path };
    item.project = { ...item.project, ...fields };
    if (item.originalProject?.image_path === value.project.image_path)
      item.originalProject = { ...item.originalProject, ...fields };
    item.revision = (item.revision || 0) + 1;
  }
  await store.save(next);
  if (root && (root.id === value.versionId || root.project.image_path === value.project.image_path))
    services.database.versions.bindOriginal(value.workId, saved);
  emit({ tabId: value.id, libraryChanged: true });
  return { project: saved, revision: item?.revision || 0 };
}
