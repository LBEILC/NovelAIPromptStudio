import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { openDatabase } from '../../electron/database.js';

const [directory, mode] = process.argv.slice(2);
const database = await openDatabase(directory);
database.insertProject({ id: 'committed', name: 'Committed image', tags: [] });
database.updateTagDictionary('durable', { translation: '已提交' });
if (mode === 'in-flight') {
  // Force dirty pages to disk while a rollback journal still owns their originals.
  // The product has no asynchronous/open transaction API; use a second native
  // connection to make this precise crash point reproducible across platforms.
  const raw = new DatabaseSync(path.join(directory, 'studio.sqlite'));
  raw.exec('PRAGMA synchronous=EXTRA; PRAGMA cache_size=5; BEGIN IMMEDIATE');
  raw.prepare('UPDATE projects SET name=? WHERE id=?').run('Uncommitted', 'committed');
  const insert = raw.prepare('INSERT INTO app_meta(key,value) VALUES (?,?)');
  for (let index = 0; index < 200; index++) insert.run(`dirty-${index}`, 'x'.repeat(8192));
}
process.send({ ready: true });
setInterval(() => {}, 1000);
