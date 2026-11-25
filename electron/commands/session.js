// @ts-check
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import {
  createWorkbenchTab,
  computeWorkbenchTabHasChanges,
  parseWorkbenchSession,
  normalizeWorkbenchViewState,
} from '../../src/lib/workbenchSession.js';
import { syncProjectPromptMetadata } from '../../src/lib/promptStructure.js';
import { CommandError } from './registry.js';
/** @typedef {import('../../src/shared/commands').CommandSession} Session */
/** @typedef {import('../../src/shared/commands').CommandTab} Tab */
/** @typedef {import('../../src/shared/types').ImageProject} Project */
/** @typedef {{session: Session, revision:number, migrated:boolean}} SavedState */

/** @param {string} file @param {unknown} data */
export async function atomicWrite(file, data) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    const handle = await fs.open(temporary, 'wx', 0o600);
    try {
      await handle.writeFile(JSON.stringify(data));
      await handle.sync();
    } finally {
      await handle.close();
    }
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

/** @param {string} directory @param {(source: import('../../src/shared/types').WorkbenchSource) => Promise<Project>} readSource */
export async function openCommandSession(directory, readSource) {
  const file = path.join(directory, 'workbench-session.json');
  /** @type {SavedState} */
  let state = { session: { version: 2, tabs: [], activeTabId: '' }, revision: 0, migrated: false };
  await fs.mkdir(directory, { recursive: true });
  const databaseFile = path.join(directory, 'workbench.sqlite');
  /** @type {DatabaseSync|undefined} */
  let writer;
  const db = new DatabaseSync(databaseFile);
  let hasIndex = false;
  try {
    db.exec(
      'CREATE TABLE IF NOT EXISTS tabs(id TEXT PRIMARY KEY, data TEXT NOT NULL); CREATE TABLE IF NOT EXISTS session(id INTEGER PRIMARY KEY, data TEXT NOT NULL)',
    );
    const row = db.prepare('SELECT data FROM session WHERE id=1').get();
    if (row) {
      hasIndex = true;
      const index = JSON.parse(String(row.data));
      const tabs = new Map(
        db
          .prepare('SELECT id,data FROM tabs')
          .all()
          .map((r) => [r.id, JSON.parse(String(r.data))]),
      );
      state = {
        revision: index.revision,
        migrated: index.migrated,
        session: {
          version: 2,
          activeTabId: index.activeTabId,
          tabs: index.order.map((/** @type {string} */ id) => {
            if (!tabs.has(id)) throw Error('保存的工作台格式无法读取');
            return tabs.get(id);
          }),
        },
      };
    }
  } finally {
    db.close();
  }
  if (!hasIndex) {
    let raw;
    try {
      raw = await fs.readFile(file, 'utf8');
    } catch (error) {
      if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') throw error;
    }
    if (raw) {
      const saved = JSON.parse(raw);
      if (saved.version !== 3 || !Array.isArray(saved.session?.tabs))
        throw Error('保存的工作台格式无法读取');
      await atomicWrite(path.join(directory, 'workbench-v3-migration-backup.json'), saved);
      await publish(saved);
    }
  }
  let tail = Promise.resolve();
  /** @template T @param {() => Promise<T>} action @returns {Promise<T>} */
  function exclusive(action) {
    const result = tail.then(action);
    tail = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  /** @param {SavedState} next */
  async function publish(next) {
    if (new Set(next.session.tabs.map((t) => t.id)).size !== next.session.tabs.length)
      throw new Error('工作台包含重复的标签页 ID');
    const previous = new Map(state.session.tabs.map((t) => [t.id, t]));
    const db = writer || new DatabaseSync(databaseFile);
    try {
      db.exec('PRAGMA synchronous=FULL; BEGIN IMMEDIATE');
      const write = db.prepare('INSERT OR REPLACE INTO tabs(id,data) VALUES(?,?)');
      const tabs = next.session.tabs.map((t) => {
        const old = previous.get(t.id);
        previous.delete(t.id);
        if (old === t) return old;
        const copy = structuredClone(t);
        copy.hasChanges = computeWorkbenchTabHasChanges(copy);
        const json = JSON.stringify(copy);
        if (old && JSON.stringify(old) === json) return old;
        write.run(t.id, json);
        return copy;
      });
      const remove = db.prepare('DELETE FROM tabs WHERE id=?');
      for (const id of previous.keys()) remove.run(id);
      const index = {
        revision: next.revision,
        migrated: next.migrated,
        activeTabId: next.session.activeTabId,
        order: tabs.map((t) => t.id),
      };
      db.prepare('INSERT OR REPLACE INTO session(id,data) VALUES(1,?)').run(JSON.stringify(index));
      db.exec('COMMIT');
      state = { ...next, session: { ...next.session, tabs } };
    } catch (error) {
      if (db.isTransaction) db.exec('ROLLBACK');
      throw error;
    } finally {
      if (!writer) db.close();
    }
  }
  return {
    exclusive,
    connectWriter() {
      if (writer) return;
      const connection = new DatabaseSync(databaseFile);
      try {
        connection.exec('PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL');
      } catch (error) {
        connection.close();
        throw error;
      }
      writer = connection;
    },
    closeWriter() {
      writer?.close();
      writer = undefined;
    },

    hasIndex,
    snapshot: () => state.session,
    /** Mutable session envelope; only the requested tab is writable. @param {string} [id] */
    draft: (id) => ({
      ...state.session,
      tabs: state.session.tabs.map((t) => (id === t.id ? structuredClone(t) : t)),
    }),
    backup: () => structuredClone({ version: 3, ...state }),
    /** @param {{version:number,session:Session,revision:number,migrated:boolean}} saved */
    async restoreBackup(saved) {
      if (saved.version !== 3 || !Array.isArray(saved.session?.tabs))
        throw new Error('备份文件已损坏');
      await publish({
        session: structuredClone(saved.session),
        revision: Number(saved.revision) || 0,
        migrated: true,
      });
    },
    get: () => structuredClone(state.session),
    revision: () => state.revision,
    /** @param {Session} session */
    async save(session) {
      await publish({
        ...state,
        session,
        revision: state.revision + 1,
        migrated: true,
      });
    },
    async bump() {
      await publish({ ...state, revision: state.revision + 1 });
    },
    /** @param {{legacyV1?:string,legacyV2?:string}} input */
    async migrate(input, snapshotOnly = false) {
      if (state.migrated || state.session.tabs.length) {
        const tabs = await Promise.all(
          state.session.tabs.map(async (tab) => {
            if (!tab.source.path) return tab;
            let error = '';
            try {
              await fs.access(tab.source.path);
            } catch {
              error = '图片源已不可用';
            }
            return tab.error === error ? tab : { ...tab, error };
          }),
        );
        state = { ...state, session: { ...state.session, tabs } };
        return snapshotOnly ? state.session : structuredClone(state.session);
      }
      const parsed = parseWorkbenchSession(input.legacyV2) || parseWorkbenchSession(input.legacyV1);
      if (!parsed && (input.legacyV1 || input.legacyV2))
        throw new CommandError('invalid_input', '原有工作台内容无法读取，旧数据已保留');
      if (!parsed) {
        await publish({ ...state, migrated: true });
        return structuredClone(state.session);
      }
      const tabs = await Promise.all(
        parsed.tabs.map(
          async (/** @type {Tab & {draft: NonNullable<Tab['savedDraft']>}} */ stored) => {
            try {
              const project = await readSource(stored.source);
              return {
                ...createWorkbenchTab(project, { ...stored, draft: stored.draft }),
                revision: 0,
              };
            } catch {
              return {
                ...stored,
                revision: 0,
                identity: `${stored.source.type}:${stored.source.projectId || stored.source.path}`,
                project: syncProjectPromptMetadata({
                  id: stored.id,
                  name: stored.displayName,
                  image_path: stored.source.path,
                  thumbnail_path: '',
                  created_at: stored.updatedAt,
                  updated_at: stored.updatedAt,
                  metadata: {},
                  tags: stored.draft.tags || [],
                  prompt_structure: stored.draft.prompt_structure,
                }),
                originalProject: null,
                savedDraft: stored.draft,
                viewState: normalizeWorkbenchViewState(stored.viewState),
                error: '图片源已不可用',
              };
            }
          },
        ),
      );
      // The renderer retains both old keys. Preserve a second exact migration
      // input alongside the atomic new state, so a failed write is recoverable.
      await atomicWrite(path.join(directory, 'workbench-migration-backup.json'), input);
      await publish({
        ...state,
        migrated: true,
        session: { version: 2, tabs, activeTabId: parsed.activeTabId },
      });
      return structuredClone(state.session);
    },
  };
}

/** Strip view-only state; authoritative marks remain in the database.
 * @param {Project|null} project @returns {Project|null} */
export function editableProject(project) {
  if (!project) return project;
  const { nsfw: _derived, ...copy } = project;
  return /** @type {Project} */ (copy);
}

/** Merge independent UI changes with newer main-process state. Conflicts never overwrite a draft.
 * @param {Session} current @param {Session} base @param {Session} next
 * @param {(project:Project)=>Project} [refresh] @returns {Session} */
export function mergeSession(current, base, next, refresh = (project) => project) {
  if (next.order && base.order) {
    const affected = new Set([...next.tabs, ...base.tabs].map((t) => t.id));
    const merged = mergeSession(
      { ...current, tabs: current.tabs.filter((t) => affected.has(t.id)) },
      { ...base, order: undefined },
      { ...next, order: undefined },
      refresh,
    );
    const tabs = new Map(current.tabs.filter((t) => !affected.has(t.id)).map((t) => [t.id, t]));
    for (const t of merged.tabs) tabs.set(t.id, t);
    const previousOrder = current.tabs.map((t) => t.id);
    const reorder =
      base.order.length !== next.order.length || base.order.some((id, i) => id !== next.order?.[i]);
    const order = new Set([
      ...(reorder ? next.order : previousOrder),
      ...previousOrder,
      ...tabs.keys(),
    ]);
    const ordered = [...order].flatMap((id) => tabs.get(id) || []);
    const selected = base.activeTabId !== next.activeTabId ? next.activeTabId : current.activeTabId;
    return {
      version: current.version,
      tabs: ordered,
      activeTabId: tabs.has(selected) ? selected : ordered[0]?.id || '',
    };
  }
  // Refresh cache-backed references on every side using the same current library.
  // Keep reference identity and user controls in the comparison.
  const normalize = (/** @type {Session} */ session) => ({
    ...session,
    tabs: session.tabs.map((tab) => {
      const copy = { ...tab };
      copy.project = editableProject(copy.project && refresh(copy.project));
      copy.originalProject = editableProject(copy.originalProject && refresh(copy.originalProject));
      delete copy.workSaved;
      return copy;
    }),
  });
  current = normalize(current);
  base = normalize(base);
  next = normalize(next);
  const same = (/** @type {unknown} */ a, /** @type {unknown} */ b) =>
    JSON.stringify(a) === JSON.stringify(b);
  const result = { ...current, tabs: current.tabs.map((t) => ({ ...t })) };
  for (const old of base.tabs) {
    if (next.tabs.some((t) => t.id === old.id)) continue;
    const remote = result.tabs.find((t) => t.id === old.id);
    if (remote && !same(remote.project, old.project))
      throw new CommandError('conflict', '标签页已有新的修改，请重新读取后再关闭');
    result.tabs = result.tabs.filter((t) => t.id !== old.id);
  }
  for (const local of next.tabs) {
    const old = base.tabs.find((t) => t.id === local.id);
    const remote = result.tabs.find((t) => t.id === local.id);
    if (!old) {
      if (!remote) result.tabs.push({ ...local, revision: 0 });
      continue;
    }
    if (!remote) {
      if (!same(old.project, local.project))
        throw new CommandError('conflict', '标签页已关闭，输入仍保留在界面');
      continue;
    }
    const edited = !same(old.project, local.project);
    if (edited && !same(remote.project, old.project) && !same(remote.project, local.project))
      throw new CommandError('conflict', '提示词已有新的修改，输入仍保留在界面');
    if (edited) {
      remote.project = local.project;
      remote.revision = (remote.revision || 0) + 1;
      remote.updatedAt = local.updatedAt;
    }
    for (const field of /** @type {const} */ ([
      'displayName',
      'source',
      'originalProject',
      'savedDraft',
      'error',
      'viewState',
      'identity',
    ])) {
      if (!same(old[field], local[field])) Object.assign(remote, { [field]: local[field] });
    }
  }
  if (
    !same(
      base.tabs.map((t) => t.id),
      next.tabs.map((t) => t.id),
    )
  ) {
    const order = next.tabs.map((t) => t.id);
    result.tabs.sort(
      (a, b) =>
        (order.includes(a.id) ? order.indexOf(a.id) : Infinity) -
        (order.includes(b.id) ? order.indexOf(b.id) : Infinity),
    );
  }
  if (base.activeTabId !== next.activeTabId) result.activeTabId = next.activeTabId;
  if (!result.tabs.some((t) => t.id === result.activeTabId))
    result.activeTabId = result.tabs[0]?.id || '';
  return result;
}
