import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

const sourceUrl = new URL('../../electron/database.js', import.meta.url);
const require = createRequire(sourceUrl);

export async function openNative(kind, file) {
  const module = await import(kind === 'node:sqlite' ? 'node:sqlite' : 'better-sqlite3');
  const db = kind === 'node:sqlite' ? new module.DatabaseSync(file) : new module.default(file);
  db.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;');
  return db;
}

// Research-only sql.js-shaped adapter. All SQL and hydration come from the unchanged
// production source, so the benchmark compares engines, not different payloads.
function facade(db) {
  const bind = (params) =>
    Object.fromEntries(
      Object.entries(params).map(([key, value]) => [key.replace(/^[$:@]/, ''), value]),
    );
  return {
    run(sql, params) {
      if (Array.isArray(params)) db.prepare(sql).run(...params);
      else if (params) db.prepare(sql).run(bind(params));
      else db.exec(sql);
    },
    exec(sql) {
      const result = db.prepare(sql).all();
      return result.length
        ? [{ columns: Object.keys(result[0]), values: result.map(Object.values) }]
        : [];
    },
    prepare(sql) {
      const statement = db.prepare(sql);
      let result;
      let index = -1;
      return {
        bind(params) {
          result = Object.keys(params).length ? statement.all(bind(params)) : statement.all();
        },
        step() {
          return ++index < result.length;
        },
        getAsObject() {
          return result[index];
        },
        free() {},
      };
    },
  };
}

export async function researchDatabase(directory, { native = null, seed = false } = {}) {
  let source = fs.readFileSync(sourceUrl, 'utf8');
  source = source.replace(/from '([^']+)'/g, (_, specifier) => {
    const resolved = specifier.startsWith('.')
      ? new URL(specifier, sourceUrl).href
      : specifier === 'sql.js'
        ? pathToFileURL(require.resolve(specifier)).href
        : specifier;
    return `from '${resolved}'`;
  });
  source = source.replace(
    'createRequire(import.meta.url)',
    `createRequire(${JSON.stringify(sourceUrl.href)})`,
  );
  source = source.replace(
    'export async function openDatabase(dataDirectory)',
    'export async function openDatabase(dataDirectory, injected)',
  );
  if (native) {
    const start = source.indexOf('  const wasmPath =');
    const end = source.indexOf('  database.run(CORE_SCHEMA);', start);
    source = source.slice(0, start) + '  const database = injected;\n' + source.slice(end);
    source = source.replace(
      /  if \(fs.existsSync\(filePath\) && !fs.existsSync\(backupPath\)\)[\s\S]*?COPYFILE_EXCL\);/,
      '',
    );
    source = source.replace(
      /  const persist = \(\) => \{[\s\S]*?\n  \};/,
      '  const persist = () => {};',
    );
  } else if (seed) {
    source = source.replace(
      '  const persist = () => {',
      '  let deferred = true;\n  const persist = () => {\n    if (deferred) return;',
    );
    source = source.replace(
      '    filePath,',
      '    raw: database,\n    flush: () => { deferred = false; persist(); },\n    filePath,',
    );
  }
  const module = await import(
    `data:text/javascript;base64,${Buffer.from(source).toString('base64')}`
  );
  const api = await module.openDatabase(directory, native ? facade(native) : undefined);
  // Deliberately expose only the operations used by this study.
  return {
    loadLibrary: api.loadLibrary,
    insertProject: api.insertProject,
    updateTagDictionary: api.updateTagDictionary,
    persist: api.persist,
    raw: native ? { ...facade(native), close: () => native.close() } : api.raw,
    flush: native
      ? () => native.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode=DELETE')
      : api.flush,
    filePath: api.filePath,
  };
}
