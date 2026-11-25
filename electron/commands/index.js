import { randomCommands } from './random.js';
import { createTrashMaintenance } from '../trashMaintenance.js';
// @ts-check
import { blurCommands } from './blur.js';
import { countImportDays } from '../../src/lib/dateRange.js';
import crypto from 'node:crypto';
import { parameterCommands } from './params.js';
import { hydrateParameters } from '../params.js';
import { materialCommands } from './materials.js';
import { AsyncLocalStorage } from 'node:async_hooks';
import { commandRegistry, validateCommand, CommandError } from './registry.js';
import { openCommandSession, mergeSession } from './session.js';
import {
  addWorkbenchTab,
  createWorkbenchTab,
  workbenchTabHasChanges,
} from '../../src/lib/workbenchSession.js';
import {
  createPromptDocument,
  parsePromptSection,
  editPromptBlockText,
  editPromptTag,
  setPromptBlockType,
  promptDocumentProject,
  copyPromptDocument,
  copyPromptDocumentScope,
} from '../../src/lib/promptDocument.ts';
import {
  addPromptCharacter,
  removePromptCharacter,
  updatePromptCharacter,
  syncProjectPromptMetadata,
} from '../../src/lib/promptStructure.js';
import { filterGalleryProjects } from '../../src/lib/galleryFilters.js';
import { galleryCollectionScope } from '../../src/lib/galleryCollections.js';
import { insertTags } from '../../src/workbench/edits.ts';
import { searchDsoTags, sortTagMatches } from '../dsoDictionary.js';
import { generationCommands } from './generation.js';
import { saveWorkbenchImage } from './saveWorkbenchImage.js';

/** @typedef {import('../../src/shared/commands').CommandName} Name */
/** @typedef {import('../../src/shared/commands').CommandTab} Tab */
/** @typedef {import('../../src/shared/commands').CommandSession} Session */
/** @typedef {import('../../src/shared/commands').CommandEvent} CommandEvent */
/** @typedef {import('../../src/shared/commands').EditingTarget} EditingTarget */
/** @typedef {import('../../src/shared/types').ImageProject} Project */
/** @typedef {import('../../src/shared/types').WorkbenchSource} Source */
/** @typedef {import('../../src/lib/promptDocument').PromptDocument} Document */
/** @typedef {{source:'ui'|'agent', sender?:Electron.WebContents}} Caller */
/** @typedef {{[K in Name]:(input:import('../../src/shared/commands').CommandInput<K>, caller:Caller)=>Promise<import('../../src/shared/commands').CommandOutput<K>>|import('../../src/shared/commands').CommandOutput<K>}} Handlers */
/** @typedef {{
 * directory:string, version:string,
 * network?:ReturnType<import('../network.js').createNetworkManager>, fetcher?:typeof fetch,
 * readImage:(path:string)=>Promise<Project>, readSource:(source:Source)=>Promise<Project>,
 * importImage:(path:string,draft?:Project)=>Promise<Project>,
 * database:Awaited<ReturnType<import('../database.js').openDatabase>>,
 * busy:()=>boolean, prepareUI?:()=>Promise<void>, emit?:(event:CommandEvent, exclude?:Electron.WebContents)=>void,
 * remember?:(tab:Tab)=>void
 * handlers?:Partial<Handlers>
 * selectSource?:(caller:Caller)=>Promise<Source|null>, readyLibrary?:()=>Promise<void>
 * beforeCommand?:(name:Name)=>Promise<void>
 * preferences?:ReturnType<import('../preferences.js').openPreferences>, generationBaseUrl?:string
 * }} Services */

/** @param {Services} services */
export async function createCommands(services) {
  if (services.preferences)
    services.database.nsfw.setWords(services.preferences.blurSettings().words);
  const store = await openCommandSession(services.directory, async (source) =>
    hydrateParameters(await services.readSource(source)),
  );
  /** @type {Map<string,{tab:Tab,key:string,view:Tab}>} */
  const views = new Map();
  /** @param {Tab} tab @param {number} [count] */
  function savedTab(tab, count) {
    const nsfw = tab.project && services.database.nsfw.state(tab.project);
    const originalNsfw = tab.originalProject && services.database.nsfw.state(tab.originalProject);
    const versionCount = count ?? services.database.versions?.count?.(tab.workId) ?? 0;
    const workSaved = services.database.versions?.isSaved(tab.workId) || false;
    const key = JSON.stringify([nsfw, originalNsfw, versionCount, workSaved]);
    const cached = views.get(tab.id);
    if (cached?.tab === tab && cached.key === key) return cached.view;
    const view = {
      ...tab,
      project: tab.project && nsfw ? { ...tab.project, nsfw } : tab.project,
      originalProject:
        tab.originalProject && originalNsfw
          ? { ...tab.originalProject, nsfw: originalNsfw }
          : tab.originalProject,
      versionCount,
      workSaved,
    };
    views.set(tab.id, { tab, key, view });
    return view;
  }
  /** @param {Session} session */
  const savedSession = (session) => {
    const counts = services.database.versions?.counts?.(
      session.tabs.map((t) => t.workId).filter(Boolean),
    );
    return { ...session, tabs: session.tabs.map((t) => savedTab(t, counts?.get(t.workId) ?? 0)) };
  };
  services.database.versions?.setWorkNameResolver(
    () => new Map(store.snapshot().tabs.map((t) => [t.workId, t.displayName])),
  );
  const restored = store.hasIndex ? { version: 2, tabs: [], activeTabId: '' } : store.get();
  for (const t of restored.tabs) {
    if (t.project) t.project = hydrateParameters(t.project);
    if (t.originalProject) t.originalProject = hydrateParameters(t.originalProject);
  }
  if (restored.tabs.length) await store.save(restored);
  /** @type {EditingTarget[]} */
  let editing = [];
  /** @type {AsyncLocalStorage<'ui'|'agent'>} */
  const originContext = new AsyncLocalStorage();
  const source = () => originContext.getStore() || 'ui';
  /** @type {Map<string,{tabId:string,before:Project,revision:number}>} */
  const undo = new Map();
  /** @param {string} id */
  const tab = (id) => {
    const found = store.snapshot().tabs.find((t) => t.id === id);
    if (!found) throw new CommandError('not_found', '标签页不存在，请重新读取工作台');
    return structuredClone(found);
  };
  /** @param {string} id */
  const project = (id) => {
    const found = services.database.loadProject(id);
    if (!found) throw new CommandError('not_found', '图片不存在');
    return /** @type {Project} */ (found);
  };
  /** @param {number|undefined} expected @param {number} actual */
  const revision = (expected, actual) => {
    if (expected !== undefined && expected !== actual)
      throw new CommandError('conflict', '内容已有新的修改，请重新读取后再改');
  };
  /** @param {Tab} value */
  const full = (value) => {
    if (!value.project) throw new CommandError('not_found', '这个标签页没有可读取的提示词');
    const refreshed = services.database.vibeLibrary.refresh({
      ...value.project,
      nsfw: services.database.nsfw.state(value.project),
    });
    return {
      tab: {
        ...value,
        hasChanges: store.snapshot().tabs.find((t) => t.id === value.id)?.hasChanges,
        versionCount: services.database.versions?.count?.(value.workId) || 0,
        workSaved: services.database.versions?.isSaved(value.workId) || false,
        project: refreshed,
      },
      document: createPromptDocument(
        refreshed,
        {},
        services.database.materials.list().filter((p) => p.kind === 'pool'),
      ),
      revision: value.revision || 0,
    };
  };
  let lastPublished = store.snapshot();
  /** @param {Session} before @param {string | undefined} [tabId] @param {boolean} [refreshLibrary] */
  function patch(before, tabId, refreshLibrary = false) {
    const current = store.snapshot();
    const prior = new Map(before.tabs.map((t) => [t.id, t]));
    const workId = current.tabs.find((t) => t.id === tabId)?.workId;
    const tabs = current.tabs.flatMap((t) => {
      const changed = prior.get(t.id) !== t;
      if (!changed && t.id !== tabId && !(refreshLibrary && (!tabId || t.workId === workId)))
        return [];
      const old = views.get(t.id)?.view;
      const view = savedTab(t);
      return changed || view !== old ? [view] : [];
    });
    const order = current.tabs.map((t) => t.id);
    const live = new Set(order);
    for (const id of views.keys()) if (!live.has(id)) views.delete(id);
    return { version: current.version, activeTabId: current.activeTabId, tabs, order };
  }
  /** @param {Partial<import('../../src/shared/commands').WorkbenchCommandEvent>} [extra] */
  const emit = (extra = {}) => {
    const session = patch(lastPublished, extra.tabId, extra.libraryChanged);
    lastPublished = store.snapshot();
    services.emit?.({ type: 'workbench', source: source(), session, ...extra });
  };
  /** @type {{undoId:string,activeTabId:string,items:{tab:Tab,index:number}[]}[]} */
  const closedBatches = [];
  /** @param {string|undefined} workId */
  const retained = (workId) =>
    !!workId && closedBatches.some((b) => b.items.some((i) => i.tab.workId === workId));
  /** @param {{tab:Tab}[]} items */
  function discardReleased(items) {
    const open = new Set(store.snapshot().tabs.map((t) => t.workId));
    for (const id of new Set(items.map((i) => i.tab.workId)))
      if (id && !open.has(id) && !retained(id)) generation.discardEmpty?.(id);
  }
  /** @param {string[]} tabIds */
  async function closeTabs(tabIds) {
    const current = store.snapshot();
    const ids = new Set(tabIds);
    const items = current.tabs.flatMap((tab, index) => (ids.has(tab.id) ? [{ tab, index }] : []));
    if (!items.length) return { closed: 0, undoId: '' };
    const tabs = current.tabs.filter((t) => !ids.has(t.id));
    const activeIndex = current.tabs.findIndex((t) => t.id === current.activeTabId);
    const activeTabId = ids.has(current.activeTabId)
      ? current.tabs
          .slice(0, activeIndex)
          .reverse()
          .find((t) => !ids.has(t.id))?.id ||
        tabs[0]?.id ||
        ''
      : current.activeTabId;
    await store.save({ ...current, tabs, activeTabId });
    const undoId = crypto.randomUUID();
    closedBatches.push({ undoId, items, activeTabId: current.activeTabId });
    if (closedBatches.length > 20) discardReleased(closedBatches.shift().items);
    emit();
    return { closed: items.length, undoId };
  }
  /** @param {EditingTarget} target */
  const unlocked = (target) => {
    if (
      source() === 'agent' &&
      editing.some(
        (t) =>
          t.tabId === target.tabId &&
          (!t.scope || !target.scope || t.scope === target.scope) &&
          (t.block === undefined || target.block === undefined || t.block === target.block),
      )
    )
      throw new CommandError('conflict', '用户正在编辑这个块，请稍后重新读取');
  };
  /** @param {import('../../src/shared/commands').TabInput & {scope?:string,block?:number}} input @param {(doc:Document)=>Document|Project} change */
  async function edit(input, change) {
    const current = tab(input.tabId);
    revision(input.expectedRevision, current.revision || 0);
    unlocked({ tabId: input.tabId, scope: input.scope, block: input.block });
    const doc = full(current).document;
    const changed = change(doc);
    const nextProject = /** @type {Project} */ (
      syncProjectPromptMetadata('scopes' in changed ? promptDocumentProject(changed) : changed)
    );
    const next = {
      ...current,
      project: nextProject,
      revision: (current.revision || 0) + 1,
      updatedAt: new Date().toISOString(),
    };
    const session = store.snapshot();
    await store.save({ ...session, tabs: session.tabs.map((t) => (t.id === next.id ? next : t)) });
    services.remember?.(next);
    let undoId;
    if (source() === 'agent' && current.project) {
      undoId = crypto.randomUUID();
      undo.set(undoId, { tabId: next.id, before: current.project, revision: next.revision });
      if (undo.size > 100) undo.delete(undo.keys().next().value || '');
    }
    emit({ tabId: next.id, undoId });
    return full(next);
  }
  /** @param {Document} doc @param {{scope:string,block?:number,index?:number}} input */
  const locate = (doc, input) => {
    const si = doc.scopes.findIndex((s) => s.scope.key === input.scope),
      section = doc.scopes[si];
    if (!section) throw new CommandError('not_found', '提示词范围不存在');
    if (input.block !== undefined && !section.blocks[input.block])
      throw new CommandError('not_found', '提示词块不存在');
    if (input.index !== undefined && !section.blocks[input.block ?? 0]?.tags[input.index])
      throw new CommandError('not_found', 'Tag 不存在');
    return { si, section };
  };
  /** @param {string} id */
  const collection = (id) => {
    const item = services.database
      .listCollections()
      .find((/** @type {import('../../src/shared/types').Collection} */ c) => c.id === id);
    if (!item) throw new CommandError('not_found', '收藏集不存在');
    return item;
  };
  /** @type {Partial<Handlers>} */
  const handlers = {
    ...blurCommands(services),
    'onboarding.get': () => {
      if (!services.preferences) throw new Error('Preferences unavailable');
      return {
        ...services.preferences.onboardingSettings(() => services.database.hasOnboardingHistory()),
        current: services.version,
      };
    },
    'onboarding.done': () => {
      if (!services.preferences) throw new Error('Preferences unavailable');
      return services.preferences.completeOnboarding(services.version);
    },
    'app.status': async () => ({
      version: services.version,
      libraryCount: (await services.database.loadLibraryCards()).length,
      workbenchTabs: store.snapshot().tabs.length,
      revision: store.revision(),
    }),
    'image.read': async (input) => {
      const p = await services.readImage(input.path);
      return { project: p, document: createPromptDocument(p) };
    },
    'workbench.list': () => ({
      tabs: store.snapshot().tabs.map((t) => ({
        id: t.id,
        name: t.displayName,
        revision: t.revision || 0,
        dirty: workbenchTabHasChanges(t),
        source: t.source,
      })),
      activeTabId: store.snapshot().activeTabId,
    }),
    'workbench.get': (input) => full(tab(input.tabId)),
    'workbench.open': async (input, caller) => {
      revision(input.expectedRevision, store.revision());
      let origin = /** @type {Source|null} */ (
        input.libraryId
          ? { type: 'library', projectId: input.libraryId }
          : input.source || (input.path ? { type: 'file', path: input.path } : null)
      );
      if (!origin && caller.source === 'ui')
        origin = (await services.selectSource?.(caller)) || null;
      if (!origin) return { canceled: true };
      if (input.path && !origin.path) origin.path = input.path;
      if (input.libraryId) project(input.libraryId);
      const image = hydrateParameters(await services.readSource(origin));
      origin.path = image.image_path;
      const fresh = /** @type {{fresh?: boolean}} */ (input).fresh;
      if (!fresh) {
        const reopened = await generation.openSource?.(origin, image, input.workId);
        if (reopened) return reopened;
      }
      const session = store.snapshot();
      let next = /** @type {Session} */ (addWorkbenchTab(session, image, { source: origin }));
      if (fresh || session.tabs.some((t) => t.id === next.activeTabId && t.workId)) {
        const created = createWorkbenchTab(image, { source: origin });
        created.identity = `work:${created.id}`;
        next = { ...session, tabs: [...session.tabs, created], activeTabId: created.id };
      }
      const opened = { .../** @type {Tab} */ (next.tabs.find((t) => t.id === next.activeTabId)) };
      opened.revision ??= 0;
      await generation.initialize?.(opened, true);
      try {
        await store.save({
          ...next,
          tabs: next.tabs.map((t) => (t.id === opened.id ? opened : t)),
        });
      } catch (error) {
        if (!session.tabs.some((t) => t.workId === opened.workId))
          generation.discardEmpty?.(opened.workId);
        throw error;
      }
      emit({ tabId: next.activeTabId });
      return full(tab(next.activeTabId));
    },
    'workbench.close-tabs': ({ tabIds }) => closeTabs(tabIds),
    'workbench.reopen': async ({ undoId }) => {
      const index =
        undoId === undefined
          ? closedBatches.length - 1
          : closedBatches.findIndex((b) => b.undoId === undoId);
      if (index < 0) return { reopened: 0 };
      const batch = closedBatches[index];
      const current = store.snapshot();
      const tabs = [...current.tabs];
      let active = '',
        duplicate = '';
      for (const entry of batch.items) {
        const existing = tabs.find(
          (t) => t.id === entry.tab.id || t.identity === entry.tab.identity,
        );
        if (!existing) tabs.splice(Math.min(entry.index, tabs.length), 0, entry.tab);
        else duplicate = existing.id;
        if (entry.tab.id === batch.activeTabId) active = existing?.id || entry.tab.id;
      }
      await store.save({
        ...current,
        tabs,
        activeTabId: active || duplicate || current.activeTabId || tabs[0].id,
      });
      closedBatches.splice(index, 1);
      discardReleased(batch.items);
      emit();
      return { reopened: batch.items.length };
    },
    'workbench.close': async (input) => {
      const value = tab(input.tabId);
      revision(input.expectedRevision, value.revision || 0);
      unlocked(input);
      await closeTabs([input.tabId]);
      return { closed: input.tabId };
    },
    'workbench.save-to-library': async (input) => {
      const value = tab(input.tabId);
      revision(input.expectedRevision, value.revision || 0);
      unlocked(input);
      if (!value.project) throw new CommandError('not_found', '图片源已不可用');
      await generation.initialize?.(value);
      return saveWorkbenchImage({ services, store, emit }, value);
    },
    'work.save': async (input) => {
      await handlers['workbench.save-to-library']?.(input, { source: source() });
      return full(tab(input.tabId));
    },
    'prompt.set': (input) =>
      edit(input, (doc) => {
        const { si, section } = locate(doc, input);
        doc.scopes[si] = { ...section, ...parsePromptSection(input.text) };
        return doc;
      }),
    'block.set-text': (input) =>
      edit(input, (doc) => {
        const { si, section } = locate(doc, input);
        doc.scopes[si] = { ...section, ...editPromptBlockText(section, input.block, input.text) };
        return doc;
      }),
    'block.set-type': (input) =>
      edit(input, (doc) => {
        const { si, section } = locate(doc, input);
        doc.scopes[si] = { ...section, ...setPromptBlockType(section, input.block, input.type) };
        return doc;
      }),
    'tag.add': (input) =>
      edit(input, (doc) => {
        const { si, section } = locate(doc, input),
          block = section.blocks[input.block];
        if (block.type !== 'tags') throw new CommandError('invalid_input', '只能向 Tag 块添加 Tag');
        if (input.before !== undefined && input.before > block.tags.length)
          throw new CommandError('invalid_input', '插入位置超出 Tag 块');
        return insertTags(doc, si, input.block, input.text, input.before);
      }),
    'tag.remove': (input) =>
      edit(input, (doc) => {
        const { si, section } = locate(doc, input);
        doc.scopes[si] = {
          ...section,
          ...editPromptTag(section, input.block, input.index, { delete: true }),
        };
        return doc;
      }),
    'tag.set': (input) =>
      edit(input, (doc) => {
        const { si, section } = locate(doc, input);
        let next = section;
        if (input.text !== undefined)
          next = { ...next, ...editPromptTag(next, input.block, input.index, { tag: input.text }) };
        if (input.weight !== undefined)
          next = {
            ...next,
            ...editPromptTag(next, input.block, input.index, { weight: input.weight }),
          };
        doc.scopes[si] = next;
        return doc;
      }),
    'character.add': (input) =>
      edit(input, (doc) => {
        let p = addPromptCharacter(promptDocumentProject(doc));
        if (input.name !== undefined)
          p = updatePromptCharacter(p, p.prompt_structure.characters.at(-1).id, {
            label: input.name,
          });
        return /** @type {Project} */ (p);
      }),
    'character.remove': (input) =>
      edit(input, (doc) => {
        const p = promptDocumentProject(doc);
        if (
          !p.prompt_structure.characters.some(
            (/** @type {{id:string}} */ c) => c.id === input.characterId,
          )
        )
          throw new CommandError('not_found', '角色不存在');
        return /** @type {Project} */ (removePromptCharacter(p, input.characterId));
      }),
    'prompt.copy': (input) => {
      const value = full(tab(input.tabId));
      if (input.scope) locate(value.document, { scope: input.scope });
      return {
        text: input.scope
          ? copyPromptDocumentScope(value.document, input.scope)
          : copyPromptDocument(value.document, { includeAutomatic: input.includeAutomatic }),
        revision: value.revision,
      };
    },
    'library.search': async (input) => {
      let cards = await services.database.loadLibraryCards(input.view || 'all');
      if (input.collectionId) cards = galleryCollectionScope(cards, collection(input.collectionId));
      const found = filterGalleryProjects(cards, {
        ...input.filters,
        ...(input.query !== undefined ? { query: input.query } : {}),
      });
      return {
        items: found.slice(input.offset || 0, (input.offset || 0) + (input.limit || 100)),
        total: found.length,
        revision: store.revision(),
      };
    },
    'library.import-days': async (input) => {
      const scope = input.collectionId ? collection(input.collectionId) : null;
      const records =
        scope?.kind === 'smart'
          ? await services.database.loadLibraryCards(input.view || 'all')
          : services.database.listImportDates(input.view || 'all');
      return {
        days: countImportDays(
          scope ? galleryCollectionScope(records, scope) : records,
          input.month,
        ),
      };
    },
    'library.get': async (input) => {
      await services.readyLibrary?.();
      return {
        project: /** @type {import('../../src/shared/types').ImageRecord} */ ({
          ...(services.database.loadProject(input.id) || project(input.id)),
          random: services.database.versions.randomForImage(input.id),
        }),
        revision: store.revision(),
      };
    },
    'library.import': async (input) => {
      revision(input.expectedRevision, store.revision());
      const p = await services.importImage(input.path);
      await store.bump();
      emit({ libraryChanged: true });
      return { project: p, revision: store.revision() };
    },
    'library.rename': async (input) => {
      revision(input.expectedRevision, store.revision());
      project(input.id);
      services.database.updateProjectName(input.id, input.name);
      await store.bump();
      emit({ libraryChanged: true });
      return { project: project(input.id), revision: store.revision() };
    },
    'library.restore': async (input) => {
      try {
        const results = services.database.updateProjects(input.ids, { deleted: false });
        await store.bump();
        emit({ libraryChanged: true });
        return { ok: true, results, summary: summary(results) };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
      }
    },
    'library.trash': async (input) => {
      revision(input.expectedRevision, store.revision());
      if (source() === 'agent') input.ids.forEach(project);
      const { results, versions: removed } = services.database.trashProjects(input.ids);
      const session = store.get();
      try {
        generation.retreatDeleted?.(session);
        await store.save(session);
      } catch (error) {
        services.database.updateProjects(results.success, { deleted: false });
        services.database.refreshGeneratedCards();
        throw error;
      }
      services.database.refreshGeneratedCards();
      emit({ libraryChanged: true });
      const versions = removed.map(
        (/** @type {import("../../src/shared/generation").WorkVersion} */ v) => ({
          workName:
            session.tabs.find((t) => t.workId === v.workId)?.displayName ||
            services.database.versions.work(v.workId)?.origin.name ||
            '',
          number: v.number,
          branchName: v.branchName,
          lastOfBranch: !services.database.versions
            .list(v.workId)
            .some(
              (/** @type {import("../../src/shared/generation").WorkVersion} */ other) =>
                other.branchNumber === v.branchNumber,
            ),
        }),
      );
      return {
        ids: input.ids,
        revision: store.revision(),
        results,
        summary: summary(results),
        versions,
        originsOf: services.database.versions
          .originsOf(results.success)
          .map(
            (/** @type {{workId:string,name:string}} */ w) =>
              session.tabs.find((t) => t.workId === w.workId)?.displayName || w.name || '',
          ),
      };
    },
    'library.rename-many': async (input) => {
      revision(input.expectedRevision, store.revision());
      input.changes.forEach((change) => project(change.id));
      const previous = services.database.updateProjectNames(input.changes);
      await store.bump();
      emit({ libraryChanged: true });
      return { previous, revision: store.revision() };
    },
    'dictionary.list': async (input) => {
      const result = services.database.listTagDictionary(input);
      if (input.all) {
        const counts = await services.database.tagImageCounts();
        result.items = result.items.map(
          (/** @type {import('../../src/shared/types').TagDictionaryEntry} */ item) => ({
            ...item,
            image_count: counts.get(item.tag.toLowerCase().replaceAll('_', ' ')) || 0,
          }),
        );
      }
      return result;
    },
    'dictionary.suggest': async (input) => {
      const search = input.query.trim().slice(0, 240);
      if (!search) return { items: [] };
      const items = new Map(
        searchDsoTags(search).map((item) => [item.tag.toLowerCase().replaceAll(' ', '_'), item]),
      );
      for (const entry of services.database.listTagDictionary({ query: search, limit: 30 }).items) {
        if (/[,，\r\n]/.test(entry.tag) || /[,，\r\n]/.test(entry.display_tag || '')) continue;
        items.set(entry.tag.toLowerCase().replaceAll(' ', '_'), {
          tag: entry.display_tag || entry.tag,
          translation: entry.translation,
          category: entry.category,
        });
      }
      const counts = await services.database.tagImageCounts();
      return {
        items: sortTagMatches([...items.values()], search)
          .slice(0, 30)
          .map((item) => ({
            ...item,
            tag: item.tag.replaceAll('_', ' '),
            count: counts.get(item.tag.toLowerCase().replaceAll('_', ' ')) || 0,
          })),
      };
    },
    'dictionary.set-many': async (input) => {
      revision(input.expectedRevision, store.revision());
      const updated = services.database.updateTagDictionaries(
        input.entries.map((entry) => ({
          tag: entry.tag,
          ...(entry.translation !== undefined ? { translation: entry.translation } : {}),
          ...(entry.category !== undefined ? { category: entry.category } : {}),
        })),
      );
      await store.bump();
      emit({ dictionaryChanged: true });
      return {
        items: updated.filter(Boolean),
        revision: store.revision(),
      };
    },
    'collection.list': () => ({
      items: services.database.listCollections(),
      revision: store.revision(),
    }),
    'collection.add': (input) => members(input, 'add'),
    'collection.remove': (input) => members(input, 'remove'),
    'dictionary.lookup': (input) => ({
      items: [...services.database.lookupTagDictionary(input.tags).values()],
      revision: store.revision(),
    }),
    'dictionary.set': async (input) => {
      revision(input.expectedRevision, store.revision());
      const updated = services.database.updateTagDictionary(input.tag, {
        ...(input.translation !== undefined ? { translation: input.translation } : {}),
        ...(input.category !== undefined ? { category: input.category } : {}),
      });
      await store.bump();
      emit({ dictionaryChanged: true });
      return {
        items: updated ? [updated] : [],
        revision: store.revision(),
      };
    },
    'workbench.session': async (input) => {
      await store.migrate(input, true);
      return savedSession(store.snapshot());
    },
    'workbench.commit': async (input, caller) => {
      const previous = store.snapshot();
      let next;
      try {
        next = mergeSession(
          previous,
          input.base,
          input.next,
          services.database.vibeLibrary.refresh,
        );
      } catch (error) {
        if (error instanceof CommandError && error.code === 'conflict')
          error.details = { ...error.details, session: savedSession(previous) };
        throw error;
      }
      await store.save(next);
      const liveIds = new Set(next.tabs.map((t) => t.id));
      discardReleased(previous.tabs.filter((t) => !liveIds.has(t.id)).map((tab) => ({ tab })));
      const active = next.tabs.find((t) => t.id === next.activeTabId);
      if (active?.workId && previous.activeTabId !== next.activeTabId)
        services.database.versions.touch(active.workId, active.versionId);
      const delta = patch(previous);
      lastPublished = store.snapshot();
      services.emit?.({ type: 'workbench', source: source(), session: delta }, caller.sender);
      return input.next.order ? delta : savedSession(store.snapshot());
    },
    'workbench.editing': (input) => {
      editing = input.targets;
      return { updated: true };
    },
    'workbench.undo': async (input) => {
      const item = undo.get(input.undoId);
      if (!item) throw new CommandError('not_found', '这次修改已无法撤销');
      const value = tab(item.tabId);
      revision(item.revision, value.revision || 0);
      const next = store.get();
      next.tabs = next.tabs.map((t) =>
        t.id === item.tabId ? { ...t, project: item.before, revision: (t.revision || 0) + 1 } : t,
      );
      await store.save(next);
      undo.delete(input.undoId);
      emit({ tabId: item.tabId });
      return savedSession(store.get());
    },
  };
  const generation = generationCommands({
    services,
    store,
    tab,
    revision,
    unlocked,
    emit,
    retained,
  });
  const trashMaintenance = createTrashMaintenance({ services, emit });
  const random = randomCommands({ services, store, tab, edit, locate, unlocked, emit });
  await generation.ready?.();
  await trashMaintenance.start();
  Object.assign(
    handlers,
    generation.handlers,
    trashMaintenance.handlers,
    materialCommands({
      services,
      tab,
      full,
      edit,
      locate,
      revision,
      renamePool: random['material.pool.rename'],
    }),
    random,
    parameterCommands({ services, tab, edit, revision, unlocked }),
  );
  /** @param {import('../../src/shared/commands').CommandInput<'collection.add'>} input @param {'add'|'remove'} action */
  async function members(input, action) {
    revision(input.expectedRevision, store.revision());
    if (collection(input.collectionId).kind !== 'manual')
      throw new CommandError('invalid_input', '智能收藏集按筛选条件收录图片，不能直接修改');
    if (source() === 'agent') input.ids.forEach(project);
    const results = services.database.updateCollectionProjects(
      input.collectionId,
      input.ids,
      action,
    );
    await store.bump();
    emit({ libraryChanged: true });
    return { revision: store.revision(), results, summary: summary(results) };
  }
  /** @param {import('../../src/shared/types').BatchResults} results */
  function summary(results) {
    return {
      success: results.success.length,
      skipped: results.skipped.length,
      failed: results.failed.length,
    };
  }
  /** @param {string} name @param {unknown} input @param {'ui'|'agent'} [origin] @param {Electron.WebContents} [sender] @returns {Promise<import('../../src/shared/commands').CommandResult<unknown>>} */
  async function dispatch(name, input = {}, origin = 'agent', sender) {
    try {
      const key = validateCommand(name, input, origin),
        def = commandRegistry[key];
      await services.beforeCommand?.(key);
      if (services.busy() && def.mutation)
        throw new CommandError('app_busy', '软件正在处理图片库，请稍后再试');
      if (origin === 'agent' || key === 'workbench.list' || key === 'workbench.get')
        await services.prepareUI?.();
      const run = async () => {
        const handler = /** @type {(value:unknown,caller:Caller)=>unknown} */ (
          services.handlers?.[key] || handlers[key]
        );
        if (!handler) throw new CommandError('invalid_input', '命令尚未就绪');
        return {
          ok: /** @type {const} */ (true),
          data: await handler(input, { source: origin, sender }),
        };
      };
      return await originContext.run(origin, () =>
        def.mutation || key === 'workbench.session' ? store.exclusive(run) : run(),
      );
    } catch (error) {
      if (error instanceof CommandError)
        return {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            ...(error.details ? { details: error.details } : {}),
          },
        };
      const code = /** @type {NodeJS.ErrnoException} */ (error).code;
      return {
        ok: false,
        error: {
          code: code === 'ENOENT' ? 'not_found' : 'invalid_input',
          message: error instanceof Error ? error.message : '执行命令失败',
        },
      };
    }
  }
  const restoreBackup = store.restoreBackup;
  store.restoreBackup = async (saved) => {
    await restoreBackup(saved);
    closedBatches.length = 0;
    undo.clear();
    views.clear();
  };
  return {
    dispatch,
    close: async () => {
      await trashMaintenance.close();
      await generation.close();
      discardReleased(closedBatches.splice(0).flatMap((b) => b.items));
    },
    store,
    retainedTabs: () => closedBatches.flatMap((b) => b.items.map((i) => i.tab)),
    clearEditing: () => {
      editing = [];
    },
  };
}
