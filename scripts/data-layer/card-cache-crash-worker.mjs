import { DatabaseSync } from 'node:sqlite';
import { openDatabase } from '../../electron/database.js';

const [directory, mode] = process.argv.slice(2);
const api = await openDatabase(directory);
const stopAtCrashPoint = () => {
  process.send({ ready: true });
  // Only the test's parent kills this child. Pause before SQLite can commit or
  // the builder can start the next batch; no product process is targeted.
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15000);
  process.exit(86);
};
if (mode === 'in-flight') {
  const prepare = DatabaseSync.prototype.prepare;
  DatabaseSync.prototype.prepare = function (sql) {
    const statement = prepare.call(this, sql);
    if (sql.includes('INSERT OR REPLACE INTO library_card_cache')) {
      const run = statement.run.bind(statement);
      statement.run = (params) => {
        run(params);
        stopAtCrashPoint();
      };
    }
    return statement;
  };
}
await api.loadLibraryCards('all', ({ completed, total }) => {
  if (mode === 'committed' && completed > 0 && completed < total) stopAtCrashPoint();
});
throw Error('Crash point was not reached');
