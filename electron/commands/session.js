// @ts-check
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  createWorkbenchTab,
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
  try {
    const saved = JSON.parse(await fs.readFile(file, 'utf8'));
    if (saved.version !== 3 || !Array.isArray(saved.session?.tabs))
      throw Error('保存的工作台格式无法读取');
    state = saved;
    // Keep drafts and original snapshots even if an external source moved.
    for (const tab of state.session.tabs)
      if (tab.source.path) {
        try {
          await fs.access(tab.source.path);
          tab.error = '';
        } catch {
          tab.error = '图片源已不可用';
        }
      }
  } catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') throw error;
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
    await atomicWrite(file, { version: 3, ...next });
    state = next;
  }
  return {
    exclusive,
    get: () => structuredClone(state.session),
    revision: () => state.revision,
    /** @param {Session} session */
    async save(session) {
      await publish({
        ...state,
        session: structuredClone(session),
        revision: state.revision + 1,
        migrated: true,
      });
    },
    async bump() {
      await publish({ ...state, revision: state.revision + 1 });
    },
    /** @param {{legacyV1?:string,legacyV2?:string}} input */
    async migrate(input) {
      if (state.migrated || state.session.tabs.length) {
        for (const tab of state.session.tabs)
          if (tab.source.path) {
            try {
              await fs.access(tab.source.path);
              tab.error = '';
            } catch {
              tab.error = '图片源已不可用';
            }
          }
        return structuredClone(state.session);
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

/** Merge independent UI changes with newer main-process state. Conflicts never overwrite a draft.
 * @param {Session} current @param {Session} base @param {Session} next @returns {Session} */
export function mergeSession(current, base, next) {
  const same = (/** @type {unknown} */ a, /** @type {unknown} */ b) =>
    JSON.stringify(a) === JSON.stringify(b);
  const result = structuredClone(current);
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
      if (!remote) result.tabs.push({ ...structuredClone(local), revision: 0 });
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
      remote.project = structuredClone(local.project);
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
      if (!same(old[field], local[field]))
        Object.assign(remote, { [field]: structuredClone(local[field]) });
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
