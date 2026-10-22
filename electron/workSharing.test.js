import './fixtures/databaseTestBudget.js';
import { it, expect } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from './database.js';
import { createBlankProject } from './workbench.js';
import { deleteLibraryImages } from './deleteLibraryImages.js';
import { createVersionStore } from './versions.js';

async function fixture(run) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-work-sharing-'));
  let database = await openDatabase(directory);
  const image = (id, files = id) => {
    const p = createBlankProject({ name: `Synthetic ${id}`, width: 64, height: 64 });
    delete p.blank;
    Object.assign(p, {
      id,
      image_path: path.join(directory, `${files}.png`),
      thumbnail_path: path.join(directory, `${files}.webp`),
    });
    fs.writeFileSync(p.image_path, 'synthetic image');
    fs.writeFileSync(p.thumbnail_path, 'synthetic thumbnail');
    database.insertProject(p);
    return p;
  };
  try {
    await run(database, image, directory, async () => {
      database.close();
      database = await openDatabase(directory);
      return database;
    });
  } finally {
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

it('lists durable per-image detach records and restores or discards each independently', () =>
  fixture(async (db, image, directory, restart) => {
    const a = image('detached-a'),
      b = image('detached-b');
    const root = db.versions.ensure('detached-work', createBlankProject());
    const first = db.versions.append({
      workId: root.workId,
      parentId: root.id,
      project: a,
      image: a,
      source: 'agent',
      seed: 1,
    });
    const second = db.versions.append({
      workId: root.workId,
      parentId: root.id,
      project: b,
      image: b,
      source: 'agent',
      seed: 2,
    });
    const batch = db.versions.detachImages(root.workId, [a.id, b.id]);
    const entries = db.versions.detachedImages();
    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      workId: root.workId,
      role: 'version',
      detachedAt: expect.any(String),
    });
    expect(entries[0].undo).not.toBe(entries[1].undo);
    db = await restart();
    expect(db.versions.detachedImages()).toEqual(entries);
    db.versions.restoreDetached(entries.find((r) => r.imageId === b.id).undo);
    expect(db.versions.get(second.id).images[0].projectId).toBe(b.id);
    expect(db.versions.get(first.id)).toBeUndefined();
    expect(db.versions.detachedImages()).toHaveLength(1);
    const remaining = entries.find((r) => r.imageId === a.id).undo;
    expect(db.versions.discardDetached([remaining, remaining])).toBe(1);
    expect(db.versions.discardDetached([remaining])).toBe(0);
    expect(db.versions.detachedImages()).toEqual([]);
    expect(() => db.versions.restoreDetached(batch.undo)).toThrow('撤销记录不存在');
    expect(db.loadProject(a.id).deleted_at).toBe('');
    expect(fs.existsSync(a.image_path)).toBe(true);
  }));

it('hides trashed images and removes only their records on permanent deletion', () =>
  fixture(async (db, image, directory) => {
    const a = image('hidden-a'),
      b = image('hidden-b');
    const root = db.versions.ensure('hidden', a);
    db.versions.save(root.workId);
    db.versions.append({
      workId: root.workId,
      parentId: root.id,
      project: b,
      image: b,
      source: 'agent',
      seed: 2,
    });
    const batch = db.versions.detachImages(root.workId, [a.id, b.id]);
    const entry = db.versions.detachedImages().find((r) => r.imageId === a.id);
    db.trashProjects([a.id]);
    expect(db.versions.detachedImages().map((r) => r.imageId)).toEqual([b.id]);
    expect(() => db.versions.restoreDetached(entry.undo)).toThrow('请先从回收站恢复图片');
    expect(deleteLibraryImages(db, directory, [a.id]).results.success).toEqual([a.id]);
    expect(() => db.versions.restoreDetached(entry.undo)).toThrow('撤销记录不存在');
    db.versions.restoreDetached(batch.undo);
    expect(db.versions.detachedImages()).toEqual([]);
    expect(db.loadProject(b.id).work_refs).toHaveLength(1);
  }));

it('keeps batch undo compatible after discarding one image and orders newest records first', () =>
  fixture(async (db, image) => {
    const a = image('batch-a'),
      b = image('batch-b'),
      c = image('batch-c');
    const root = db.versions.ensure('batch', a);
    db.versions.save(root.workId);
    const version = db.versions.append({
      workId: root.workId,
      parentId: root.id,
      project: b,
      image: b,
      source: 'agent',
      seed: 1,
    });
    const batch = db.versions.detachImages(root.workId, [a.id, b.id]);
    const entries = db.versions.detachedImages();
    db.versions.ensure('later', c);
    db.versions.save('later');
    db.versions.detachImages('later', [c.id]);
    expect(db.versions.detachedImages().map((r) => r.imageId)).toEqual([c.id, a.id, b.id]);
    expect(() => db.versions.discardDetached([entries[0].undo, 'image:invalid'])).toThrow(
      '撤销记录不存在',
    );
    expect(db.versions.detachedImages()).toHaveLength(3);
    db.versions.discardDetached([entries.find((r) => r.imageId === b.id).undo]);
    db.versions.restoreDetached(batch.undo);
    expect(db.versions.list(root.workId)[0].originState).toBe('library');
    expect(db.versions.get(version.id)).toBeUndefined();
    expect(db.versions.detachedImages().map((r) => r.imageId)).toEqual([c.id]);
  }));

it('keeps legacy batch tokens readable and reports a deleted work clearly', () =>
  fixture(async (db, image, directory) => {
    const a = image('legacy-detach');
    db.versions.ensure('legacy-detach-work', a);
    db.versions.save('legacy-detach-work');
    const batch = db.versions.detachImages('legacy-detach-work', [a.id]);
    const raw = new DatabaseSync(path.join(directory, 'studio.sqlite'));
    try {
      const payload = JSON.parse(
        raw.prepare('SELECT payload FROM detached_images_undo WHERE token=?').get(batch.undo)
          .payload,
      );
      delete payload.detachedAt;
      delete payload.workName;
      raw
        .prepare('UPDATE detached_images_undo SET payload=? WHERE token=?')
        .run(JSON.stringify(payload), batch.undo);
      expect(db.versions.detachedImages()).toHaveLength(1);
      db.versions.restoreDetached(batch.undo);
      expect(db.loadProject(a.id).work_refs).toHaveLength(1);
      const next = db.versions.detachImages('legacy-detach-work', [a.id]);
      db.versions.trash(db.versions.list('legacy-detach-work'));
      expect(() => db.versions.restoreDetached(next.undo)).toThrow('已经不在了');
      raw.prepare('DELETE FROM works WHERE id=?').run('legacy-detach-work');
      expect(() => db.versions.restoreDetached(next.undo)).toThrow('已经不在了');
    } finally {
      raw.close();
    }
  }));

it('keeps original snapshots when deleting records, but deletes unreferenced files', () =>
  fixture(async (db, image, directory) => {
    const p = image('origin');
    db.versions.ensure('work', p);
    db.versions.save('work');
    const unused = image('unused');
    db.trashProjects([p.id, unused.id]);
    const result = deleteLibraryImages(db, directory, [p.id, unused.id]);
    expect(result).toMatchObject({
      keptFiles: 2,
      results: { success: [p.id, unused.id], failed: [] },
    });
    expect(db.loadProject(p.id)).toBeNull();
    expect(fs.existsSync(p.image_path)).toBe(true);
    expect(fs.existsSync(p.thumbnail_path)).toBe(true);
    expect(fs.existsSync(unused.image_path)).toBe(false);
    expect(fs.existsSync(unused.thumbnail_path)).toBe(false);
    expect(db.versions.list('work')[0].project.image_path).toBe(p.image_path);
  }));

it('retains shared library paths until the last record is permanently deleted', () =>
  fixture(async (db, image, directory) => {
    const a = image('a', 'shared'),
      b = image('b', 'shared');
    db.trashProjects([a.id, b.id]);
    expect(deleteLibraryImages(db, directory, [a.id]).keptFiles).toBe(2);
    expect(fs.existsSync(b.image_path)).toBe(true);
    expect(deleteLibraryImages(db, directory, [b.id]).keptFiles).toBe(0);
    expect(fs.existsSync(b.image_path)).toBe(false);
    const c = image('c', 'shared-batch'),
      d = image('d', 'shared-batch');
    db.trashProjects([c.id, d.id]);
    expect(deleteLibraryImages(db, directory, [c.id, d.id]).keptFiles).toBe(0);
  }));

it('retains files referenced by a live version and ignores deleted versions', () =>
  fixture(async (db, image, directory) => {
    const root = db.versions.ensure('work', createBlankProject());
    const p = image('version');
    const v = db.versions.append({
      workId: 'work',
      parentId: root.id,
      project: p,
      image: p,
      source: 'agent',
      seed: 1,
    });
    // An active generation keeps the emptied version alive until it settles.
    db.versions.setActiveVersions([v.id]);
    db.trashProjects([p.id]);
    expect(deleteLibraryImages(db, directory, [p.id]).keptFiles).toBe(2);
    expect(fs.existsSync(p.image_path)).toBe(true);
    const other = image('deleted-version');
    const next = db.versions.append({
      workId: 'work',
      parentId: root.id,
      project: other,
      image: other,
      source: 'agent',
      seed: 2,
    });
    db.versions.trash([next], true);
    expect(deleteLibraryImages(db, directory, [other.id]).keptFiles).toBe(0);
    expect(fs.existsSync(other.image_path)).toBe(false);
  }));

it('restores detached image order even when subsequent inserts reuse their rowids', () =>
  fixture(async (db, image) => {
    const root = db.versions.ensure('work', createBlankProject());
    const a = image('a'),
      b = image('b'),
      c = image('c');
    const v = db.versions.append({
      workId: 'work',
      parentId: root.id,
      project: a,
      image: a,
      source: 'agent',
      seed: 1,
    });
    db.versions.append({
      workId: 'work',
      parentId: v.id,
      versionId: v.id,
      project: b,
      image: b,
      source: 'agent',
      seed: 2,
    });
    const before = db.versions.get(v.id).images;
    const detached = db.versions.detachImages('work', [b.id]);
    db.versions.append({
      workId: 'work',
      parentId: v.id,
      versionId: v.id,
      project: c,
      image: c,
      source: 'agent',
      seed: 3,
    });
    const d = image('d');
    db.versions.append({
      workId: 'work',
      parentId: v.id,
      versionId: v.id,
      project: d,
      image: d,
      source: 'agent',
      seed: 4,
    });
    db.versions.restoreDetached(detached.undo);
    expect(db.versions.get(v.id).images.slice(0, 2)).toEqual(before);
    expect(db.versions.get(v.id).images[2].projectId).toBe(c.id);
    expect(db.versions.get(v.id).images[3].projectId).toBe(d.id);
  }));

it('migrates generated works without rewriting snapshots and runs only once', () =>
  fixture(async (db, image, directory) => {
    const p = image('legacy'),
      root = db.versions.ensure('legacy-work', p);
    db.versions.append({
      workId: 'legacy-work',
      parentId: root.id,
      project: p,
      image: p,
      source: 'user',
      seed: 1,
    });
    db.versions.ensure('unsaved-blank', createBlankProject());
    db.versions.ensure('saved-original', { ...image('saved-original'), autoSaveOriginal: false });
    db.versions.ensure('pending-original', {
      ...image('pending-original'),
      autoSaveOriginal: true,
    });
    const raw = new DatabaseSync(path.join(directory, 'studio.sqlite'));
    const before = raw.prepare('SELECT * FROM work_versions ORDER BY id').all();
    raw.exec("DROP TABLE saved_works; DELETE FROM app_meta WHERE key='saved_works_v1'");
    raw.close();
    const upgraded = await openDatabase(directory);
    try {
      expect(upgraded.versions.isSaved('legacy-work')).toBe(true);
      expect(upgraded.versions.isSaved('unsaved-blank')).toBe(false);
      expect(upgraded.versions.isSaved('saved-original')).toBe(true);
      expect(upgraded.versions.isSaved('pending-original')).toBe(false);
      const inspect = new DatabaseSync(path.join(directory, 'studio.sqlite'));
      expect(inspect.prepare('SELECT * FROM work_versions ORDER BY id').all()).toEqual(before);
      inspect.close();
      const transient = upgraded.versions.ensure('transient', image('transient'));
      const reopened = await openDatabase(directory);
      try {
        expect(reopened.versions.isSaved(transient.workId)).toBe(false);
      } finally {
        reopened.close();
      }
    } finally {
      upgraded.close();
    }
  }));

it('restores a detached version pruned after its active job settles', () =>
  fixture(async (db, image) => {
    const root = db.versions.ensure('deferred', createBlankProject());
    const p = image('deferred');
    const version = db.versions.append({
      workId: 'deferred',
      parentId: root.id,
      project: p,
      image: p,
      source: 'agent',
      seed: 1,
    });
    db.versions.setActiveVersions([version.id]);
    const detached = db.versions.detachImages('deferred', [p.id]);
    expect(detached.versions).toHaveLength(0);
    db.versions.setActiveVersions([]);
    db.versions.pruneDeferred();
    expect(db.versions.get(version.id)).toBeUndefined();
    db.versions.restoreDetached(detached.undo);
    expect(db.versions.get(version.id).images).toEqual(version.images);
  }));

it('invalidates cached references after external writes and never caches rolled-back state', () =>
  fixture(async (db, image, directory) => {
    const p = image('cache');
    db.versions.ensure('cached', p);
    db.versions.save('cached');
    expect(db.versions.workRefs().get(p.id)).toHaveLength(1);
    const raw = new DatabaseSync(path.join(directory, 'studio.sqlite'));
    try {
      const versions = createVersionStore(raw);
      raw.exec("BEGIN; DELETE FROM saved_works WHERE work_id='cached'");
      expect(versions.workRefs().get(p.id)).toBeUndefined();
      raw.exec('ROLLBACK');
      expect(versions.workRefs().get(p.id)).toHaveLength(1);
      raw.exec("INSERT INTO removed_originals VALUES ('cached')");
      expect(db.versions.workRefs().get(p.id)).toBeUndefined();
      raw.exec("DELETE FROM removed_originals WHERE work_id='cached'");
      expect(db.versions.workRefs().get(p.id)).toHaveLength(1);
      expect(db.versions.workRefs(p.id).get(p.id)).toEqual(db.versions.workRefs().get(p.id));
    } finally {
      raw.close();
    }
  }));
