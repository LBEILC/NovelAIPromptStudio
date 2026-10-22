import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../electron/database.js';
import { createBlankProject } from '../electron/workbench.js';

// Compact synthetic data for the incremental ownership cost, not a full gallery baseline.
const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-work-refs-benchmark-'));
const count = 10000,
  works = 1000;
let database;
try {
  database = await openDatabase(directory);
  const raw = new DatabaseSync(database.filePath);
  try {
    raw.exec('BEGIN');
    const insert =
      raw.prepare(`INSERT INTO projects(id,name,image_path,thumbnail_path,created_at,updated_at)
      VALUES (?,?,?,?,?,?)`);
    const metadata =
      raw.prepare(`INSERT INTO generation_metadata(project_id,prompt_raw,negative_prompt,model,seed,width,height,extra_json)
      VALUES (?,'synthetic benchmark, test subject','synthetic negative','nai-diffusion-4-5-full',?,832,1216,'{}')`);
    for (let i = 0; i < count; i++) {
      insert.run(
        `image-${i}`,
        `Synthetic ${i}`,
        `synthetic-${i}.png`,
        `synthetic-${i}.webp`,
        '2026-01-01',
        '2026-01-01',
      );
      metadata.run(`image-${i}`, String(i));
    }
    const work = raw.prepare('INSERT INTO works VALUES (?,?,NULL,?)');
    const version = raw.prepare('INSERT INTO work_versions VALUES (?,?,?,?,?,?,?,?,?)');
    const image = raw.prepare('INSERT INTO version_images VALUES (?,?,?,?,?)');
    for (let i = 0; i < works; i++) {
      const project = createBlankProject({ name: `Synthetic work ${i}` });
      delete project.blank;
      Object.assign(project, {
        id: `image-${i}`,
        image_path: `synthetic-${i}.png`,
        thumbnail_path: `synthetic-${i}.webp`,
      });
      const json = JSON.stringify(project),
        workId = `work-${i}`,
        root = `root-${i}`;
      work.run(workId, json, '2026-01-01');
      version.run(root, workId, null, 1, root, 0, json, 'user', '2026-01-01');
      version.run(`version-${i}`, workId, root, 2, root, 0, json, 'user', '2026-01-01');
      raw.prepare('INSERT INTO saved_works VALUES (?)').run(workId);
    }
    for (let i = 0; i < count; i++)
      image.run(`vi-${i}`, `version-${i % works}`, `image-${i}`, String(i), '2026-01-01');
    raw.exec('COMMIT');
  } finally {
    raw.close();
  }
  const start = performance.now();
  const cards = await database.loadLibraryCards();
  const cold = performance.now() - start;
  const original = database.versions.workRefs;
  const measure = async (withRefs) => {
    database.versions.workRefs = withRefs ? original : () => new Map();
    const samples = [];
    for (let i = 0; i < 7; i++) {
      const start = performance.now();
      await database.loadLibraryCards();
      samples.push(performance.now() - start);
    }
    return samples.sort((a, b) => a - b)[3];
  };
  const withoutRefs = await measure(false),
    withRefs = await measure(true);
  database.versions.workRefs = original;
  console.log(
    JSON.stringify(
      {
        images: count,
        works,
        refs: cards.reduce((sum, c) => sum + c.work_refs.length, 0),
        coldCardsMs: +cold.toFixed(2),
        hotWithoutRefsMedianMs: +withoutRefs.toFixed(2),
        hotWithRefsMedianMs: +withRefs.toFixed(2),
        incrementalMs: +(withRefs - withoutRefs).toFixed(2),
      },
      null,
      2,
    ),
  );
} finally {
  database?.close();
  fs.rmSync(directory, { recursive: true, force: true });
}
