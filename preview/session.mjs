import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import { openDatabase } from '../electron/database.js';
import { openPreferences } from '../electron/preferences.js';
import { createCommands } from '../electron/commands/index.js';
import { importLibraryFiles } from '../electron/importer.js';
import {
  readWorkbenchImage,
  applyWorkbenchStructure,
  applyWorkbenchLibraryDetails,
} from '../electron/workbench.js';
import { createPreviewHandlers } from './handlers.mjs';
import { pause } from './services.mjs';
import { hydrateParameters, normalizeSettings } from '../electron/params.js';
import { createChatGPT, chatGPTCommands } from '../electron/chatgpt.js';
import { createWorkbenchFixtures } from '../electron/acceptance/workbenchFixtures.js';

export async function createSession(services, images, emit, empty = false) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-ui-preview-'));
  const assetsDirectory = path.join(directory, 'assets');
  fs.mkdirSync(assetsDirectory);
  const database = await openDatabase(directory);
  const preferences = openPreferences(
    directory,
    {
      isEncryptionAvailable: () => true,
      encryptString: (text) => Buffer.from(text),
      decryptString: (bytes) => bytes.toString(),
    },
    { defaultAssetsDirectory: assetsDirectory },
  );
  const setAI = (enabled) =>
    preferences.saveAISettings({
      provider: 'apiKey',
      baseUrl: services.aiUrl,
      model: enabled ? 'preview-model' : '',
      apiKey: enabled ? 'preview-key' : '',
      clearApiKey: !enabled,
    });
  setAI(true);
  preferences.saveNovelAIToken('acceptance-token');
  preferences.saveAppearanceSettings({ themeMode: 'light', motion: 'full' });
  const allowedPath = (file) => {
    const resolved = fs.realpathSync(file);
    if (!resolved.startsWith(fs.realpathSync(directory) + path.sep))
      throw Error('预览仅允许访问本次临时目录');
    return resolved;
  };
  const readImage = (file) =>
    readWorkbenchImage(allowedPath(file), { enrichProjectTags: database.enrichProjectTags });
  const imported = async (files, draft) => {
    const result = await importLibraryFiles({
      filePaths: files,
      assetsDirectory,
      database,
      prepareProject: async (p) => database.enrichProjectTags(p),
    });
    if (draft)
      database.saveProjectPrompt(result.imported[0]?.id || result.duplicates[0]?.projectId, draft);
    return result;
  };
  const adapter = createPreviewHandlers({
    database,
    preferences,
    dataDirectory: directory,
    assetsDirectory,
    readImage,
    emit,
    state: services.state,
  });
  const chatGPT = createChatGPT({
    preferences,
    emit,
    endpoints: services.chatgpt.endpoints,
    openExternal: (url) => services.chatgpt.openExternal(url, services.allowPort),
  });
  Object.assign(
    adapter.handlers,
    chatGPTCommands(chatGPT, preferences, async () => {}),
  );
  const commands = await createCommands({
    directory,
    version: 'preview',
    database,
    preferences,
    generationBaseUrl: services.novel.url,
    handlers: adapter.handlers,
    busy: () => false,
    emit,
    readImage,
    readSource: async (source) => {
      const library = source.type === 'library' ? database.loadProject(source.projectId) : null;
      const file = library?.image_path || source.path;
      return applyWorkbenchLibraryDetails(
        applyWorkbenchStructure(await readImage(file), database.loadWorkbenchStructure(file)),
        library,
      );
    },
    importImage: async (file, draft) => {
      allowedPath(file);
      const result = await imported([file], draft);
      const id = result.imported[0]?.id || result.duplicates[0]?.projectId;
      if (!id) throw Error(result.errors[0]?.error || '导入失败');
      return database.loadProject(id);
    },
    remember: (tab) => {
      if (tab.project && tab.source.path)
        database.rememberWorkbenchStructure(tab.source.path, tab.project.prompt_structure);
    },
  });
  const sender = new EventEmitter();
  sender.id = 1;
  sender.isDestroyed = () => false;
  sender.send = (_, event) => emit(event);
  const dispatch = (name, input = {}, origin = 'ui') =>
    commands.dispatch(name, input, origin, sender);
  const call = async (name, input = {}, origin = 'ui') => {
    const r = await dispatch(name, input, origin);
    if (!r.ok) throw Error(`${name}: ${r.error.message}`);
    if (r.data?.ok === false) throw Error(`${name}: ${r.data.error}`);
    return r.data;
  };
  const waitJob = async (id) => {
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      const job = (await call('generate.status', { id })).jobs[0];
      if (job.state === 'completed') return job;
      if (['failed', 'cancelled', 'stopped'].includes(job.state)) throw Error(JSON.stringify(job));
      await pause(25);
    }
    throw Error('预览初始化生成超时');
  };
  try {
    for (const collection of database.listCollections())
      await call('collection.delete', { id: collection.id });
    if (!empty) {
      const copies = images.map((file, i) => {
        const target = path.join(directory, `demo-${i + 1}.png`);
        fs.copyFileSync(file, target);
        return target;
      });
      const result = await imported(copies);
      if (result.imported.length !== 14)
        throw Error(`需要14张演示图，实际导入${result.imported.length}`);
      const cards = await database.loadLibraryCards();
      // Isolated preview drafts exercise both parameter/reference capability groups.
      for (const [index, model] of [
        [1, 'nai-diffusion-4-5-full'],
        [2, 'nai-diffusion-5-full'],
      ]) {
        const project = hydrateParameters(database.loadProject(cards[index].id));
        project.params = normalizeSettings({ ...project.params, model });
        project.references = { vibes: [], precise: [] };
        if (index === 1)
          project.references.vibes = [
            {
              id: 'preview-image-vibe',
              name: '色彩参考',
              thumbnail: `data:image/png;base64,${fs.readFileSync(copies[0]).toString('base64')}`,
              file: null,
              strength: 0.6,
              information: 0.7,
              encode: 'new',
            },
            {
              id: 'preview-encoded-vibe',
              name: '编码参考',
              thumbnail: null,
              file: null,
              strength: 0.4,
              information: null,
              encode: null,
              model,
              encoding: Buffer.alloc(128, 1).toString('base64'),
            },
          ];
        database.saveProjectPrompt(project.id, project);
      }
      for (const [name, ids] of [
        ['本周精选', cards.slice(0, 4).map((c) => c.id)],
        ['构图研究', cards.slice(4, 7).map((c) => c.id)],
      ]) {
        const { collection } = await call('collection.create', {
          collection: { name, kind: 'manual' },
        });
        await call('collection.add', { collectionId: collection.id, ids });
      }
      await call('collection.create', {
        collection: {
          name: '人物画面',
          kind: 'smart',
          filters: { includeTags: ['1girl'], tagMatch: 'all' },
        },
      });
      await call('library.rename', { id: cards[0].id, name: '雨后微光' });
      for (const card of cards.slice(0, 3)) await call('workbench.open', { libraryId: card.id });
      const tabId = commands.store.get().tabs[0].id;
      await call('prompt.set-size', { tabId, width: 512, height: 768 });
      // Deliberate spelling errors make the real tidy validator produce reviewable proposals.
      await call('prompt.set', {
        tabId,
        scope: 'base:prompt',
        text: '1girl, blue hair, umbrela\n\nstanding, looking at veiwer\n\nsoft lighting, flim grain',
      });
      for (const [block, name] of [
        [0, '人物与雨伞'],
        [2, '柔光与胶片'],
      ])
        await call('material.save', { tabId, scope: 'base:prompt', block, name });
      let current = await call('workbench.get', { tabId });
      let character = current.document.scopes.find((s) => s.scope.characterId);
      if (!character) {
        await call('character.add', { tabId });
        current = await call('workbench.get', { tabId });
        character = current.document.scopes.find((s) => s.scope.characterId);
      }
      await call('material.save', { tabId, scope: character.scope.key, name: '雨中旅人' });
      database.upsertTagDictionary(
        ['umbrella', 'film grain', 'standing'].map((tag, i) => ({
          tag,
          translation: ['雨伞', '胶片颗粒', '站立'][i],
          translation_source: 'ai',
          category: 'Subject',
          category_source: 'ai',
          has_translation: true,
          has_classification: true,
        })),
      );
      database.persist();
      await call('dictionary.set', { tag: 'umbrella', translation: '透明雨伞' });
      await call('account.refresh');
      const root = (await call('version.list', { tabId })).versions[0];
      services.novel.state.delay = 1;
      for (let i = 0; i < 2; i++) {
        await call('tag.set', {
          tabId,
          scope: 'base:prompt',
          block: 0,
          index: 1,
          text: i ? 'silver hair' : 'blue hair',
        });
        const job = await call('generate.start', { tabId, count: 1 });
        await waitJob(job.id);
      }
      await call('version.open', { tabId, versionId: root.id });
      for (let i = 0; i < 2; i++) {
        await call('tag.set', {
          tabId,
          scope: 'base:prompt',
          block: 0,
          index: 1,
          text: i ? 'green hair' : 'red hair',
        });
        const job = await call('generate.start', { tabId, count: 1 });
        await waitJob(job.id);
      }
      const branchRoot = (await call('version.list', { tabId })).versions.find(
        (v) => v.branchNumber === 1,
      );
      await call('version.open', { tabId, versionId: branchRoot.id });
      await call('prompt.set', {
        tabId,
        scope: 'base:prompt',
        text: 'synthetic nested branch, evening clouds',
      });
      await waitJob((await call('generate.start', { tabId, count: 1 })).id);
      // A separate linear work exercises single-version and descendant deletion.
      const linear = await call('workbench.new', { name: '主线三版', width: 64, height: 64 });
      for (let i = 1; i <= 3; i++) {
        await call('prompt.set', {
          tabId: linear.tab.id,
          scope: 'base:prompt',
          text: `synthetic cloud study ${i}`,
        });
        await waitJob((await call('generate.start', { tabId: linear.tab.id, count: 1 })).id);
      }
      const libraryOriginal = (await call('workbench.open', { libraryId: cards[3].id })).tab;
      for (let i = 1; i <= 2; i++) {
        await call('prompt.set', {
          tabId: libraryOriginal.id,
          scope: 'base:prompt',
          text: `synthetic library study ${i}`,
        });
        await waitJob((await call('generate.start', { tabId: libraryOriginal.id, count: 1 })).id);
      }
      const [externalFile] = await createWorkbenchFixtures(
        path.join(directory, 'external-original'),
        { sizes: [[512, 768]], seed: 49000 },
      );
      const external = (await call('workbench.open', { path: externalFile })).tab;
      for (let i = 1; i <= 2; i++) {
        await call('prompt.set', {
          tabId: external.id,
          scope: 'base:prompt',
          text: `synthetic external study ${i}`,
        });
        await waitJob((await call('generate.start', { tabId: external.id, count: 1 })).id);
      }
      const trash = structuredClone(database.loadProject(cards[13].id));
      trash.id = crypto.randomUUID();
      trash.tags.forEach((t) => (t.id = crypto.randomUUID()));
      trash.name = '回收站演示图';
      trash.content_hash = crypto.randomUUID();
      for (const key of ['image_path', 'thumbnail_path']) {
        const target = path.join(assetsDirectory, `trash-${key}.png`);
        fs.copyFileSync(trash[key], target);
        trash[key] = target;
      }
      database.insertProject(trash);
      await call('library.trash', { ids: [trash.id] });
      await call('prompt.set-size', { tabId, width: 512, height: 768 });
      await call('prompt.set', {
        tabId,
        scope: 'base:prompt',
        text: '1girl, green hair, umbrela\n\nstanding, looking at veiwer\n\nsoft lighting, flim grain',
      });
      const session = commands.store.get();
      session.activeTabId = tabId;
      await commands.store.save(session);
      services.novel.state.delay = 1500;
    }
    return {
      directory,
      database,
      preferences,
      commands,
      dispatch,
      call,
      allowedPath,
      setAI,
      async setChatGPT(scenario) {
        await chatGPT.signOut();
        services.chatgpt.state.plan =
          scenario === 'codex-pro' ? 'pro' : scenario === 'free' ? 'free' : 'plus';
        services.chatgpt.state.error = null;
        preferences.saveAISettings({
          provider: 'chatgpt',
          introShown: true,
          codexMode: scenario.startsWith('codex'),
        });
        if (scenario !== 'signed-out') {
          try {
            await chatGPT.signIn();
            await chatGPT.models();
          } catch (error) {
            if (scenario !== 'free') throw error;
          }
          if (scenario.startsWith('codex')) await chatGPT.quota();
          if (scenario === 'limited') {
            services.chatgpt.state.error = 'subscription_sharing_usage_limit_exceeded';
            await chatGPT.complete([{ role: 'user', content: 'OK' }]).catch(() => {});
          }
        }
      },
      async close() {
        chatGPT.close();
        await commands.close();
        await adapter.close();
        database.close();
        fs.rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
      },
    };
  } catch (error) {
    chatGPT.close();
    await commands.close();
    await adapter.close();
    database.close();
    fs.rmSync(directory, { recursive: true, force: true });
    throw error;
  }
}
