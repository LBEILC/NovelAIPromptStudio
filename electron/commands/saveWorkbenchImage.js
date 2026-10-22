// Shared by explicit saves and the generation worker (inside store.exclusive).
export async function saveWorkbenchImage({ services, store, emit }, value) {
  const root = value.workId && services.database.versions.list(value.workId)[0];
  const original = root?.project || value.project;
  const existing = services.database.loadProject(original.id);
  const saved =
    root && existing && !existing.deleted_at
      ? existing
      : await services.importImage(
          original.image_path,
          value.project.image_path === original.image_path ? value.project : original,
        );
  const fields = {
    id: saved.id,
    image_path: saved.image_path,
    thumbnail_path: saved.thumbnail_path,
  };
  const next = store.get();
  const item = next.tabs.find((t) => t.id === value.id);
  // A queued job may finish saving after its tab was closed or switched versions.
  if (item?.project?.image_path === original.image_path) {
    item.source = { type: 'library', projectId: saved.id, path: saved.image_path };
    item.project = { ...item.project, ...fields };
    if (item.originalProject?.image_path === original.image_path)
      item.originalProject = { ...item.originalProject, ...fields };
    item.revision = (item.revision || 0) + 1;
  }
  if (item) item.workSaved = true;
  await store.save(next);
  if (root) services.database.versions.bindOriginal(value.workId, saved);
  if (root) services.database.versions.save(value.workId);
  emit({ tabId: value.id, libraryChanged: true });
  return { project: saved, revision: item?.revision || 0 };
}
