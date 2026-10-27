import type { ImageProject } from '../shared/types';

type Version = { id: string; parentId: string | null; project: ImageProject };

/** Cache immutable snapshots by content, since IPC and database reads clone them.
 * A changed parent link or either snapshot invalidates only the affected diff.
 * Each instance belongs to one work/list; absent versions are discarded. */
export function createVersionDifferenceCache<T>(
  compute: (before: ImageProject, after: ImageProject) => T,
) {
  const entries = new Map<
    string,
    { parentId: string | null; before: string; after: string; value: T }
  >();
  return {
    update<V extends Version>(
      versions: readonly V[],
      prompt: (v: V) => ImageProject = (v) => v.project,
    ) {
      const byId = new Map(versions.map((v) => [v.id, v]));
      const snapshots = new Map(versions.map((v) => [v.id, JSON.stringify(v.project)]));
      const result = new Map<string, T>();
      for (const v of versions) {
        const parent = byId.get(v.parentId || '') || v;
        const afterProject = prompt(v);
        const before = snapshots.get(parent.id)!;
        const after =
          afterProject === v.project ? snapshots.get(v.id)! : JSON.stringify(afterProject);
        let entry = entries.get(v.id);
        if (
          !entry ||
          entry.parentId !== v.parentId ||
          entry.before !== before ||
          entry.after !== after
        ) {
          entry = {
            parentId: v.parentId,
            before,
            after,
            value: compute(parent.project, afterProject),
          };
          entries.set(v.id, entry);
        }
        result.set(v.id, entry.value);
      }
      for (const id of entries.keys()) if (!byId.has(id)) entries.delete(id);
      return result;
    },
  };
}
