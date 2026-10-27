import '../fixtures/databaseTestBudget.js';
import { afterEach, describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createCommands } from './index.js';
import { commandRegistry, validateCommand } from './registry.js';
import { openCommandSession, mergeSession } from './session.js';
import { openDatabase } from '../database.js';
import { createWorkbenchTab, serializeWorkbenchSession } from '../../src/lib/workbenchSession.js';
import {
  createPromptStructure,
  syncProjectPromptMetadata,
  promptSnapshot,
} from '../../src/lib/promptStructure.js';
import { parsePrompt } from '../../src/lib/prompt.js';
import type { ImageProject } from '../../src/shared/types';
import type { CommandSession, WorkbenchCommandEvent } from '../../src/shared/commands';

const roots: string[] = [];
const databases: Awaited<ReturnType<typeof openDatabase>>[] = [];
afterEach(async () => {
  for (const db of databases.splice(0)) db.close();
  for (const root of roots.splice(0)) await fs.rm(root, { recursive: true, force: true });
});
async function temporary() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nai-commands-'));
  roots.push(root);
  return root;
}
function fixture(): ImageProject {
  const metadata = {
    prompt_raw: 'blue hair, standing\n\nA traveler is waiting beside the quiet window.',
    negative_prompt: 'lowres',
    model: 'synthetic',
    seed: '1',
    width: 64,
    height: 64,
    steps: 28,
    sampler: '',
    guidance: 6,
    generation_mode: 'text_to_image' as const,
  };
  return syncProjectPromptMetadata({
    id: 'synthetic-image',
    name: 'Synthetic',
    image_path: '/synthetic.png',
    thumbnail_path: '',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    metadata,
    prompt_structure: createPromptStructure(metadata),
    tags: parsePrompt(metadata.prompt_raw),
  }) as ImageProject;
}
async function setup() {
  const directory = await temporary(),
    database = await openDatabase(path.join(directory, 'data'));
  databases.push(database);
  database.insertProject(fixture());
  database.createCollection({ id: 'collection', name: 'Synthetic collection', kind: 'manual' });
  const events: WorkbenchCommandEvent[] = [];
  let busy = false;
  const commands = await createCommands({
    directory,
    version: 'test',
    database,
    busy: () => busy,
    readImage: async () => fixture(),
    readSource: async () => fixture(),
    importImage: async (_path, draft) =>
      draft ? database.saveProjectPrompt('synthetic-image', draft) : fixture(),
    emit: (event) => {
      if (event.type === 'workbench') events.push(event);
    },
  });
  const call = async (name: string, input: unknown = {}, origin: 'ui' | 'agent' = 'agent') => {
    const result = await commands.dispatch(name, input, origin);
    if (!result.ok) throw Error(JSON.stringify(result.error));
    return result.data as any;
  };
  return {
    ...commands,
    call,
    directory,
    database,
    events,
    setBusy: (value: boolean) => {
      busy = value;
    },
  };
}

describe('command contract', () => {
  it('returns forbidden for secret.copy from CLI without invoking the clipboard handler', async () => {
    const commands = await setup();
    try {
      expect(
        await commands.dispatch('secret.copy', { kind: 'novelai-token' }, 'agent'),
      ).toMatchObject({ ok: false, error: { code: 'forbidden' } });
    } finally {
      await commands.close();
    }
  });
  it('keeps sensitive command families UI-only', () => {
    for (const [name, definition] of Object.entries(commandRegistry)) {
      if (
        /^(settings\.|trash\.|ai\.|agent\.)/.test(name) ||
        ['dictionary.remove', 'library.restore'].includes(name)
      ) {
        expect(definition.uiOnly, name).toBe(true);
        try {
          validateCommand(name, {}, 'agent');
          throw Error('Command unexpectedly allowed');
        } catch (error) {
          expect(error).toMatchObject({ code: 'forbidden' });
        }
      }
    }
  });
  it('passes the UI caller to native handlers but refuses the same handler to agents', async () => {
    const directory = await temporary();
    const database = await openDatabase(path.join(directory, 'data'));
    databases.push(database);
    const calls: unknown[] = [];
    const commands = await createCommands({
      directory,
      version: 'test',
      database,
      busy: () => false,
      readImage: async () => fixture(),
      readSource: async () => fixture(),
      importImage: async () => fixture(),
      handlers: {
        'settings.ai.get': (_input, caller) => {
          calls.push(caller);
          return {
            baseUrl: '',
            model: '',
            hasApiKey: false,
            encryptionAvailable: true,
            provider: 'chatgpt' as const,
            chatgpt: {
              mode: 'official' as const,
              signedIn: false,
              email: null,
              model: '',
              introShown: false,
              quota: null,
              limited: null,
            },
          };
        },
      },
    });
    const sender = { id: 42 } as Electron.WebContents;
    expect(await commands.dispatch('settings.ai.get', {}, 'agent')).toMatchObject({
      ok: false,
      error: { code: 'forbidden' },
    });
    expect(calls).toHaveLength(0);
    expect(await commands.dispatch('settings.ai.get', {}, 'ui', sender)).toMatchObject({
      ok: true,
    });
    expect(calls).toEqual([{ source: 'ui', sender }]);
  });
  it('validates nested batches before applying any changes and rejects stale revisions', async () => {
    const app = await setup();
    const initial = (await app.call('app.status')).revision;
    for (const entries of [
      [],
      [{ tag: 'synthetic' }],
      [{ tag: 'synthetic', category: 'invalid' }],
      [{ tag: 'synthetic', translation: '译文', extra: true }],
    ]) {
      expect(await app.dispatch('dictionary.set-many', { entries })).toMatchObject({
        ok: false,
        error: { code: 'invalid_input' },
      });
    }
    const changed = await app.call('dictionary.set-many', {
      entries: [{ tag: 'synthetic', translation: '测试', category: 'Body' }],
      expectedRevision: initial,
    });
    expect(changed.items[0]).toMatchObject({ translation: '测试', category: 'Body' });
    expect(
      await app.dispatch('dictionary.set-many', {
        entries: [{ tag: 'synthetic', translation: '失效' }],
        expectedRevision: initial,
      }),
    ).toMatchObject({ ok: false, error: { code: 'conflict' } });
    expect(
      (await app.call('dictionary.list', { query: 'synthetic', all: true })).items[0].translation,
    ).toBe('测试');
    expect(
      (await app.call('dictionary.suggest', { query: 'synthetic' })).items[0].translation,
    ).toBe('测试');
    expect(await app.call('dictionary.suggest', { query: ' ' })).toEqual({ items: [] });
    expect(
      await app.dispatch('library.rename-many', {
        changes: [
          { id: 'synthetic-image', name: '新名称' },
          { id: 'missing', name: '不存在' },
        ],
      }),
    ).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect((await app.call('library.get', { id: 'synthetic-image' })).project.name).toBe(
      'Synthetic',
    );
    const renamed = await app.call('library.rename-many', {
      changes: [{ id: 'synthetic-image', name: '新名称' }],
      expectedRevision: changed.revision,
    });
    expect(renamed.previous[0].name).toBe('Synthetic');
    expect((await app.call('library.get', { id: 'synthetic-image' })).project.name).toBe('新名称');
    await app.call('library.rename-many', {
      changes: renamed.previous,
      expectedRevision: renamed.revision,
    });
    expect((await app.call('library.get', { id: 'synthetic-image' })).project.name).toBe(
      'Synthetic',
    );
  });
  for (const [name, definition] of Object.entries(commandRegistry))
    it(`${name} validates input before execution`, () => {
      for (const input of [{ unexpected: true }, null, []]) {
        try {
          validateCommand(name, input, 'ui');
          throw Error('Invalid input unexpectedly allowed');
        } catch (error) {
          expect(error).toMatchObject({ code: 'invalid_input' });
        }
      }
      if (definition.required?.length) expect(() => validateCommand(name, {}, 'ui')).toThrow();
      if (definition.uiOnly) expect(() => validateCommand(name, {}, 'agent')).toThrow(/只供/);
    });
  it('executes workbench and prompt commands through the dispatcher and saves to the library', async () => {
    const app = await setup();
    expect((await app.call('app.status')).libraryCount).toBe(1);
    expect(
      (await app.call('image.read', { path: '/synthetic.png' })).document.scopes[0].blocks.length,
    ).toBe(2);
    const opened = await app.call('workbench.open', { path: '/synthetic.png' }),
      tabId = opened.tab.id;
    expect(
      (await app.call('workbench.open', { libraryId: 'synthetic-image' })).tab.source.type,
    ).toBe('library');
    expect((await app.call('workbench.list')).tabs).toHaveLength(2);
    let revision = opened.revision;
    const edit = async (name: string, input = {}) => {
      const result = await app.call(name, { tabId, expectedRevision: revision, ...input });
      revision = result.revision;
      return result;
    };
    await edit('prompt.set', {
      scope: 'base:prompt',
      text: 'blue hair, standing\n\nA traveler waits beside the quiet window.',
    });
    await edit('block.set-text', { scope: 'base:prompt', block: 0, text: 'blue hair, sitting' });
    await edit('block.set-type', { scope: 'base:prompt', block: 1, type: 'tags' });
    await edit('tag.add', { scope: 'base:prompt', block: 0, text: 'soft light', before: 1 });
    await edit('tag.set', {
      scope: 'base:prompt',
      block: 0,
      index: 0,
      text: 'red hair',
      weight: 1.25,
    });
    await edit('tag.remove', { scope: 'base:prompt', block: 0, index: 1 });
    let changed = await edit('character.add', { name: 'Synthetic character' });
    await edit('character.remove', {
      characterId: changed.tab.project.prompt_structure.characters[0].id,
    });
    expect((await app.call('prompt.copy', { tabId })).text).toContain('red hair');
    expect((await app.call('workbench.get', { tabId })).revision).toBe(revision);
    const saved = await app.call('workbench.save-to-library', {
      tabId,
      expectedRevision: revision,
    });
    expect(saved.project.metadata.prompt_raw).toContain('red hair');
    expect((await app.call('library.search', { query: 'red hair' })).total).toBe(1);
    expect((await app.call('library.get', { id: 'synthetic-image' })).project.tags[0].weight).toBe(
      1.25,
    );
    await app.call('workbench.close', { tabId, expectedRevision: saved.revision });
    expect((await app.call('workbench.list')).tabs).toHaveLength(1);
  });
  it('executes library, collection and dictionary commands through the dispatcher', async () => {
    const app = await setup();
    await app.call('library.import', { path: '/synthetic.png' });
    await app.call('library.rename', { id: 'synthetic-image', name: 'Renamed' });
    expect((await app.call('collection.list')).items.some((c: any) => c.id === 'collection')).toBe(
      true,
    );
    await app.call('collection.add', { collectionId: 'collection', ids: ['synthetic-image'] });
    expect((await app.call('library.search', { collectionId: 'collection' })).total).toBe(1);
    await app.call('collection.remove', { collectionId: 'collection', ids: ['synthetic-image'] });
    expect((await app.call('library.search', { collectionId: 'collection' })).total).toBe(0);
    await app.call('dictionary.set', { tag: 'red hair', translation: '红发', category: 'Body' });
    expect((await app.call('dictionary.lookup', { tags: ['red hair'] })).items[0].translation).toBe(
      '红发',
    );
    await app.call('dictionary.set', { tag: 'red hair', translation: '' });
    expect((await app.call('dictionary.lookup', { tags: ['red hair'] })).items[0].translation).toBe(
      '',
    );
    await app.call('library.trash', { ids: ['synthetic-image'] });
    expect((await app.call('library.search', { view: 'trash' })).total).toBe(1);
    expect((await app.call('library.search', {})).total).toBe(0);
  });
  it('rejects stale revisions, invalid targets and forbidden capabilities without mutation', async () => {
    const app = await setup();
    const opened = await app.call('workbench.open', { path: '/synthetic.png' });
    const tabId = opened.tab.id;
    await app.call('tag.set', {
      tabId,
      scope: 'base:prompt',
      block: 0,
      index: 0,
      text: 'green hair',
      expectedRevision: 0,
    });
    const before = app.store.get();
    const conflict = await app.dispatch('tag.set', {
      tabId,
      scope: 'base:prompt',
      block: 0,
      index: 0,
      text: 'lost',
      expectedRevision: 0,
    });
    expect(conflict).toMatchObject({ ok: false, error: { code: 'conflict' } });
    expect(
      await app.dispatch('tag.set', { tabId, scope: 'missing', block: 0, index: 0, text: 'lost' }),
    ).toMatchObject({ ok: false, error: { code: 'not_found' } });
    expect(
      await app.dispatch('tag.set', {
        tabId,
        scope: 'base:prompt',
        block: 0,
        index: 0,
        weight: NaN,
      }),
    ).toMatchObject({ ok: false, error: { code: 'invalid_input' } });
    for (const name of [
      'library.delete',
      'library.permanent-delete',
      'trash.empty',
      'settings.set',
      'preferences.get',
      'keys.read',
      'keys.set',
      'generation.create',
      'workbench.commit',
      'workbench.undo',
    ])
      expect(await app.dispatch(name, {})).toMatchObject({
        ok: false,
        error: { code: 'forbidden' },
      });
    app.setBusy(true);
    expect(await app.dispatch('workbench.close', { tabId })).toMatchObject({
      ok: false,
      error: { code: 'app_busy' },
    });
    expect(app.store.get()).toEqual(before);
  });
  it('protects the actively edited block while permitting another block and supports undo', async () => {
    const app = await setup();
    const {
      tab: { id: tabId },
    } = await app.call('workbench.open', { path: '/synthetic.png' });
    await app.call(
      'workbench.editing',
      { targets: [{ tabId, scope: 'base:prompt', block: 0 }] },
      'ui',
    );
    expect(
      await app.dispatch('tag.remove', { tabId, scope: 'base:prompt', block: 0, index: 0 }),
    ).toMatchObject({ ok: false, error: { code: 'conflict' } });
    const before = app.store.get().tabs[0].project;
    await app.call('block.set-text', {
      tabId,
      scope: 'base:prompt',
      block: 1,
      text: 'Another synthetic paragraph.',
    });
    const undoId = app.events.at(-1)!.undoId;
    await app.call('workbench.undo', { undoId }, 'ui');
    expect(app.store.get().tabs[0].project).toEqual(before);
  });
  it('persists confirmed commands across reopen and refuses stale UI replacement', async () => {
    const app = await setup();
    await app.call('workbench.open', { path: '/synthetic.png' });
    const base = app.store.get(),
      next = structuredClone(base);
    next.tabs[0].project!.name = 'local';
    await app.call('tag.set', {
      tabId: base.tabs[0].id,
      scope: 'base:prompt',
      block: 0,
      index: 0,
      text: 'changed',
    });
    expect(() => mergeSession(app.store.get(), base, next)).toThrow(/新的修改/);
    const reopened = await openCommandSession(app.directory, async () => fixture());
    expect(reopened.get().tabs[0].project?.metadata.prompt_raw).toContain('changed');
    expect(reopened.get().tabs[0].revision).toBe(1);
  });
});

describe('legacy workbench migration', () => {
  for (const version of [1, 2])
    it(`imports v${version} once, retaining exact old input and drafts`, async () => {
      const root = await temporary(),
        image = fixture(),
        tab = { ...createWorkbenchTab(image), revision: 0 };
      const session = { version: 2, tabs: [tab], activeTabId: tab.id } as CommandSession;
      const raw =
        version === 2
          ? serializeWorkbenchSession(session)
          : JSON.stringify({
              sourcePath: '/synthetic.png',
              draft: promptSnapshot(image),
              updatedAt: image.updated_at,
            });
      const input = version === 2 ? { legacyV2: raw } : { legacyV1: raw };
      const store = await openCommandSession(root, async () => image);
      const migrated = await store.migrate(input);
      expect(migrated.tabs).toHaveLength(1);
      expect(migrated.tabs[0].project?.metadata.prompt_raw).toBe(image.metadata.prompt_raw);
      expect(
        JSON.parse(await fs.readFile(path.join(root, 'workbench-migration-backup.json'), 'utf8')),
      ).toEqual(input);
      await store.save({ version: 2, tabs: [], activeTabId: '' });
      expect((await store.migrate(input)).tabs).toHaveLength(0);
    });
  it('retains missing-file drafts and leaves malformed migration retryable', async () => {
    const root = await temporary(),
      store = await openCommandSession(root, async () => {
        throw Error('missing');
      });
    await expect(store.migrate({ legacyV2: 'not json' })).rejects.toThrow();
    const image = fixture();
    const raw = JSON.stringify({
      sourcePath: '/missing.png',
      draft: promptSnapshot(image),
      updatedAt: image.updated_at,
    });
    const migrated = await store.migrate({ legacyV1: raw });
    expect(migrated.tabs[0].error).toBeTruthy();
    expect(migrated.tabs[0].project?.metadata.prompt_raw).toContain('blue hair');
  });
});

describe('calendar import-day scope', () => {
  it('counts all, manual, smart and trash scopes without applying unrelated UI filters', async () => {
    const app = await setup();
    for (const [id, day, model] of [
      ['second', 2, 'other'],
      ['third', 2, 'synthetic'],
    ] as const)
      app.database.insertProject({
        ...fixture(),
        id,
        created_at: new Date(2026, 0, day, 12).toISOString(),
        metadata: { ...fixture().metadata, model },
      });
    app.database.createCollection({
      id: 'smart',
      name: 'Synthetic scope',
      kind: 'smart',
      filters: { models: ['synthetic'] },
    });
    await app.call('collection.add', { collectionId: 'collection', ids: ['second'] });
    const read = (collectionId?: string, view = 'all') =>
      app.call('library.import-days', { month: '2026-01', view, collectionId }, 'ui');
    expect((await read()).days).toEqual({ '2026-01-01': 1, '2026-01-02': 2 });
    expect((await read('collection')).days).toEqual({ '2026-01-02': 1 });
    expect((await read('smart')).days).toEqual({ '2026-01-01': 1, '2026-01-02': 1 });
    await app.call('library.trash', { ids: ['third'] });
    expect((await read()).days).toEqual({ '2026-01-01': 1, '2026-01-02': 1 });
    expect((await read(undefined, 'trash')).days).toEqual({ '2026-01-02': 1 });
    expect(
      (await app.dispatch('library.import-days', { month: '2026-01', query: 'unmatched' }, 'ui'))
        .ok,
    ).toBe(false);
  });
});
