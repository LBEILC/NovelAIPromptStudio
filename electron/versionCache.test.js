import { describe, it, expect, vi } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createVersionStore, migrateGenerationVersions } from './versions.js';

function fixture(run) {
  const db = new DatabaseSync(':memory:');
  try {
    migrateGenerationVersions(db, 'unused');
    db.exec(
      "CREATE TABLE projects(id TEXT PRIMARY KEY, deleted_at TEXT, image_path TEXT DEFAULT ''); INSERT INTO projects(id,deleted_at) VALUES ('synthetic-image','')",
    );
    const hydrate = vi.fn((p) => p);
    const store = createVersionStore(db, hydrate);
    const p = { id: 'synthetic-image', metadata: { prompt_raw: 'synthetic', negative_prompt: '' } };
    const root = store.ensure('a', p);
    const child = store.append({
      workId: 'a',
      parentId: root.id,
      project: p,
      source: 'agent',
      image: { id: p.id },
      seed: 1,
    });
    store.ensure('b', { ...p, blank: true });
    run({ db, store, hydrate, p, root, child });
  } finally {
    db.close();
  }
}
describe('decoded version lists', () => {
  it('invalidates for INSERT OR IGNORE detachment and restores the original', () =>
    fixture(({ store, root, p }) => {
      expect(store.list('a')[0].originState).toBe('library');
      const { undo } = store.detachImages('a', [p.id]);
      expect(store.list('a').find((v) => v.id === root.id).originState).toBe('removed');
      store.restoreDetached(undo);
      expect(store.list('a')[0].originState).toBe('library');
    }));
  it('reuses reads, invalidates only the written work, and reads ensure without decoding the list', () =>
    fixture(({ store, hydrate, p, child }) => {
      const a = store.list('a'),
        b = store.list('b');
      hydrate.mockClear();
      expect(store.list('a')).toBe(a);
      expect(store.list('b')).toBe(b);
      expect(hydrate).not.toHaveBeenCalled();
      store.ensure('a', p);
      expect(hydrate).toHaveBeenCalledTimes(1);
      store.append({
        workId: 'a',
        parentId: child.id,
        versionId: child.id,
        project: p,
        source: 'agent',
        image: { id: p.id },
        seed: 2,
      });
      expect(store.list('a').find((v) => v.id === child.id).images).toHaveLength(2);
      expect(a.find((v) => v.id === child.id).images).toHaveLength(1);
      expect(store.list('b')).toBe(b);
    }));
  it('reflects branch rename, deletion, reparenting, restoration and rollback', () =>
    fixture(({ db, store, p, root, child }) => {
      const tail = store.append({
        workId: 'a',
        parentId: child.id,
        project: p,
        source: 'agent',
        image: { id: p.id },
        seed: 3,
      });
      store.list('a');
      store.rename(child.id, 'synthetic branch');
      expect(store.list('a').every((v) => v.branchName === 'synthetic branch')).toBe(true);
      const undo = store.trash([child], true);
      expect(store.list('a').map((v) => v.id)).toEqual([root.id, tail.id]);
      expect(store.list('a').at(-1).parentId).toBe(root.id);
      store.restore(undo);
      expect(store.list('a').at(-1).parentId).toBe(child.id);
      db.exec('BEGIN');
      store.rename(root.id, 'temporary');
      expect(store.list('a')[0].branchName).toBe('temporary');
      db.exec('ROLLBACK');
      expect(store.list('a')[0].branchName).toBe('synthetic branch');
      store.rename(root.id, 'committed');
      expect(store.list('a')[0].branchName).toBe('committed');
    }));
  it('observes image trash/restore, random records, variants, snapshot writes and permanent deletion', () =>
    fixture(({ db, store, p, child }) => {
      store.list('a');
      db.prepare("UPDATE projects SET deleted_at='synthetic-time' WHERE id=?").run(p.id);
      expect(store.list('a')[0].originState).toBe('trashed');
      expect(store.list('a')[1].images[0].deleted).toBe(true);
      db.prepare("UPDATE projects SET deleted_at='' WHERE id=?").run(p.id);
      expect(store.list('a')[0].originState).toBe('library');
      const imageId = store.list('a')[1].images[0].id;
      db.prepare('INSERT INTO version_image_variants VALUES (?,?)').run(
        imageId,
        'synthetic-variant',
      );
      db.prepare('INSERT INTO version_image_random VALUES (?,?)').run(
        imageId,
        JSON.stringify({ blocks: [] }),
      );
      expect(store.list('a')[1].images[0]).toMatchObject({
        variant: 'synthetic-variant',
        random: { blocks: [] },
      });
      db.prepare('UPDATE work_versions SET snapshot_json=? WHERE id=?').run(
        JSON.stringify({ ...p, name: 'changed' }),
        child.id,
      );
      expect(store.list('a')[1].project.name).toBe('changed');
      store.purgeImage(p.id);
      expect(store.list('a').every((v) => v.images.length === 0)).toBe(true);
      expect(store.list('a')[0].originState).toBe('removed');
    }));
});
