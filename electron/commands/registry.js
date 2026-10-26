// @ts-check
import { MODEL_ORDER } from '../../src/shared/params.ts';
import { validSettingsPatch } from './parameterValidation.js';
/** @typedef {import('../../src/shared/commands').CommandName} CommandName */
/** @typedef {import('../../src/shared/commands').CommandErrorCode} CommandErrorCode */
/** @typedef {{ fields: Record<string, string>, required?: string[], uiOnly?: boolean, mutation?: boolean, example?:object }} Definition */
const revision = { expectedRevision: 'integer' };
const tab = { ...revision, tabId: 'string' };
const scope = { ...tab, scope: 'string' };
const block = { ...scope, block: 'integer' };
const tag = { ...block, index: 'integer' };
const scoped = ['tabId', 'scope'];
const blocked = [...scoped, 'block'];
const tagged = [...blocked, 'index'];
const category =
  'ArtistEra|Subject|Identity|Body|Clothing|Action|Environment|Composition|StyleQuality|Unsorted';
/** @type {Record<CommandName, Definition>} */
export const commandRegistry = {
  'material.pool.create': { fields: { name: 'string' }, required: ['name'], mutation: true },
  'material.pool.rename': {
    fields: { id: 'string', name: 'string' },
    required: ['id', 'name'],
    mutation: true,
  },
  'material.pool.delete': { fields: { id: 'string' }, required: ['id'], mutation: true },
  'material.pool.entry.add': {
    fields: { id: 'string', text: 'text', chance: 'number' },
    required: ['id', 'text'],
    mutation: true,
  },
  'material.pool.entry.update': {
    fields: { id: 'string', entryId: 'string', text: 'text', chance: 'number' },
    required: ['id', 'entryId'],
    mutation: true,
  },
  'material.pool.entry.delete': {
    fields: { id: 'string', entryId: 'string' },
    required: ['id', 'entryId'],
    mutation: true,
  },
  'material.pool.replace': {
    fields: { id: 'string', text: 'text' },
    required: ['id', 'text'],
    mutation: true,
  },
  'block.random.insert': {
    fields: {
      ...scope,
      pool: 'string',
      count: 'integer',
      repeat: 'boolean',
      min: 'number',
      max: 'number',
      step: 'number',
      before: 'integer',
    },
    required: [...scoped, 'pool'],
    mutation: true,
  },
  'block.random.update': {
    fields: {
      ...block,
      pool: 'string',
      count: 'integer',
      repeat: 'boolean',
      min: 'number',
      max: 'number',
      step: 'number',
      before: 'integer',
    },
    required: [...blocked, 'pool'],
    mutation: true,
  },
  'version.apply-random': {
    fields: { ...tab, versionId: 'string', imageId: 'string' },
    required: ['tabId', 'versionId', 'imageId'],
    mutation: true,
  },

  'library.export.estimate': { fields: { ids: 'strings', collectionId: 'string' }, uiOnly: true },
  'library.export': {
    fields: { ids: 'strings', collectionId: 'string', format: 'zip|folder' },
    required: ['format'],
    uiOnly: true,
  },
  'library.export.cancel': { fields: {}, uiOnly: true },
  'library.nsfw.mark': {
    fields: { ids: 'strings', value: 'nsfw|safe|auto' },
    required: ['ids', 'value'],
    mutation: true,
  },
  'settings.blur.get': { fields: {}, uiOnly: true },
  'settings.blur.save': {
    fields: { settings: 'blurSettings' },
    required: ['settings'],
    uiOnly: true,
    mutation: true,
  },
  'settings.network.get': { fields: {}, uiOnly: true },
  'settings.network.save': {
    fields: {
      mode: 'system|direct|manual',
      protocol: 'http|socks5',
      host: 'string',
      port: 'integer',
    },
    required: ['mode'],
    uiOnly: true,
  },
  'settings.network.test': {
    fields: {
      mode: 'system|direct|manual',
      protocol: 'http|socks5',
      host: 'string',
      port: 'integer',
    },
    required: ['mode'],
    uiOnly: true,
  },
  'prompt.tidy': {
    fields: { ...tab, requestId: 'string' },
    required: ['tabId', 'requestId'],
    uiOnly: true,
  },
  'ai.cancel': { fields: { requestId: 'string' }, required: ['requestId'], uiOnly: true },
  'library.suggest-names': {
    fields: { requestId: 'string', groups: 'imageGroups' },
    required: ['requestId', 'groups'],
    uiOnly: true,
  },
  'material.vibes': { fields: {}, uiOnly: true },
  'material.list': { fields: {}, example: {} },
  'material.save': {
    fields: { ...scope, block: 'integer', name: 'string' },
    required: [...scoped, 'name'],
    mutation: true,
    example: { tabId: 'tab-id', scope: 'base:prompt', block: 0, name: '常用场景' },
  },
  'material.insert': {
    fields: { ...tab, id: 'string', scope: 'string', before: 'integer' },
    required: ['tabId', 'id'],
    mutation: true,
    example: { tabId: 'tab-id', id: 'material-id', scope: 'base:prompt', before: 0 },
  },
  'material.rename': {
    fields: { id: 'string', name: 'string' },
    required: ['id', 'name'],
    mutation: true,
    uiOnly: true,
  },
  'material.update': {
    fields: {
      id: 'string',
      block: 'integer',
      negative: 'boolean',
      text: 'text',
      asNew: 'boolean',
    },
    required: ['id', 'text'],
    mutation: true,
    uiOnly: true,
  },
  'material.delete': { fields: { id: 'string' }, required: ['id'], mutation: true, uiOnly: true },

  'workbench.new': {
    fields: { name: 'string', width: 'number', height: 'number', params: 'generationPatch' },
    mutation: true,
  },
  'work.remove-original': {
    fields: { tabId: 'string', expectedRevision: 'integer' },
    required: ['tabId'],
    mutation: true,
  },
  'work.restore-original': { fields: { undo: 'string' }, required: ['undo'], mutation: true },
  'work.save': {
    fields: { tabId: 'string', expectedRevision: 'integer' },
    required: ['tabId'],
    mutation: true,
  },
  'work.detach-images': {
    fields: { workId: 'string', imageIds: 'stringList' },
    required: ['workId', 'imageIds'],
    mutation: true,
  },
  'work.restore-detached': { fields: { undo: 'string' }, required: ['undo'], mutation: true },
  'work.discard-detached': {
    fields: { undos: 'stringList' },
    required: ['undos'],
    mutation: true,
    uiOnly: true,
  },
  'version.delete': {
    fields: { versionId: 'string', confirmed: 'boolean', only: 'boolean' },
    required: ['versionId'],
    mutation: true,
  },
  'branch.delete': {
    fields: { branchId: 'string', confirmed: 'boolean' },
    required: ['branchId'],
    mutation: true,
  },
  'branch.restore': { fields: { undo: 'string' }, required: ['undo'], mutation: true },
  'generate.queue': {
    fields: { ...tab, count: 'integer' },
    required: ['tabId', 'count'],
    mutation: true,
  },
  'params.set': {
    fields: { ...tab, patch: 'generationPatch', dropReferences: 'boolean' },
    required: ['tabId', 'patch'],
    mutation: true,
  },
  'reference.set-base': {
    fields: { ...tab, imageId: 'string', path: 'string', strength: 'number', noise: 'number' },
    required: ['tabId'],
    mutation: true,
  },
  'reference.add-vibe': {
    fields: { ...tab, libraryId: 'string', imageId: 'string', path: 'string' },
    required: ['tabId'],
    mutation: true,
  },
  'reference.add-precise': {
    fields: { ...tab, imageId: 'string', path: 'string' },
    required: ['tabId'],
    mutation: true,
  },
  'reference.set': {
    fields: {
      ...tab,
      id: 'string',
      strength: 'unit',
      information: 'unit',
      type: 'character|style|character&style',
      fidelity: 'unit',
    },
    required: ['tabId', 'id'],
    mutation: true,
  },
  'reference.remove': {
    fields: { ...tab, id: 'string' },
    required: ['tabId', 'id'],
    mutation: true,
  },
  'vibe.library': { fields: {} },
  'generate.estimate-outpaint': {
    fields: { ...tab, imageId: 'string', edges: 'outpaintEdges', fullSize: 'boolean' },
    required: ['tabId', 'imageId', 'edges'],
    uiOnly: true,
  },
  'generate.outpaint': {
    fields: {
      ...tab,
      imageId: 'string',
      edges: 'outpaintEdges',
      mode: 'whole|edges',
      fullSize: 'boolean',
    },
    required: ['tabId', 'imageId', 'edges', 'mode'],
    uiOnly: true,
    mutation: true,
  },
  'generate.estimate-inpaint': {
    fields: {
      ...tab,
      imageId: 'string',
      rect: 'inpaintRect',
      strength: 'number',
      fullSize: 'boolean',
    },
    required: ['tabId', 'imageId', 'rect'],
    uiOnly: true,
  },
  'generate.inpaint': {
    fields: {
      ...tab,
      imageId: 'string',
      rect: 'inpaintRect',
      mask: 'inpaintMask',
      strength: 'number',
      fullSize: 'boolean',
    },
    required: ['tabId', 'imageId', 'rect', 'mask'],
    uiOnly: true,
    mutation: true,
  },
  'generate.estimate-op': {
    fields: {
      ...tab,
      op: 'upscale|enhance',
      imageId: 'string',
      magnitude: 'integer',
      scale: 'enhanceScale',
    },
    required: ['tabId', 'op', 'imageId'],
    uiOnly: true,
  },
  'generate.upscale': {
    fields: { ...tab, imageId: 'string' },
    required: ['tabId', 'imageId'],
    mutation: true,
    uiOnly: true,
  },
  'generate.enhance': {
    fields: { ...tab, imageId: 'string', magnitude: 'integer', scale: 'enhanceScale' },
    required: ['tabId', 'imageId', 'magnitude', 'scale'],
    mutation: true,
    uiOnly: true,
  },
  'generate.estimate': {
    fields: { ...tab, count: 'integer', width: 'number', height: 'number' },
    required: ['tabId', 'count'],
    example: { tabId: 'tab-id', count: 1 },
  },
  'generate.start': {
    fields: {
      ...tab,
      count: 'integer',
      continuous: 'boolean',
      fixedSeed: 'boolean',
      seed: 'integer',
    },
    required: ['tabId', 'count'],
    mutation: true,
    example: { tabId: 'tab-id', count: 1 },
  },
  'generate.status': { fields: { id: 'string', limit: 'integer' }, example: { limit: 20 } },
  'usage.summary': { fields: { range: 'today|week|month' }, example: { range: 'today' } },
  'usage.daily': { fields: { days: 'integer' }, example: { days: 30 } },
  'trash.size': { fields: {}, uiOnly: true },
  'settings.library.get': { fields: {}, uiOnly: true },
  'settings.library.save': {
    fields: { trashAutoCleanup: 'boolean' },
    required: ['trashAutoCleanup'],
    uiOnly: true,
  },
  'generate.pause': { fields: {}, uiOnly: true },
  'generate.resume': { fields: {}, uiOnly: true },
  'generate.set-count': {
    fields: { id: 'string', count: 'integer' },
    required: ['id', 'count'],
    uiOnly: true,
  },
  'generate.skip': { fields: { id: 'string' }, required: ['id'], uiOnly: true },
  'generate.defer': {
    fields: { id: 'string', deferred: 'boolean' },
    required: ['id', 'deferred'],
    uiOnly: true,
  },
  'generate.move': { fields: { id: 'string', before: 'string' }, required: ['id'], uiOnly: true },
  'generate.restore': { fields: { id: 'string' }, required: ['id'], uiOnly: true },
  'generate.confirm': { fields: { ids: 'strings' }, required: ['ids'], uiOnly: true },
  'generate.cancel': { fields: { ids: 'strings' }, required: ['ids'], uiOnly: true },
  'generate.stop': { fields: { id: 'string' }, required: ['id'], uiOnly: true },
  'generate.retry': { fields: { id: 'string' }, required: ['id'], uiOnly: true },
  'account.get': { fields: {}, uiOnly: true },
  'account.save': { fields: { token: 'string' }, required: ['token'], uiOnly: true },
  'account.connection.save': {
    fields: { connection: 'official|relay' },
    required: ['connection'],
    uiOnly: true,
  },
  'account.relay.save': {
    fields: { baseUrl: 'string', key: 'string' },
    required: ['baseUrl'],
    uiOnly: true,
  },
  'account.relay.test': { fields: { baseUrl: 'string', key: 'string' }, uiOnly: true },
  'account.refresh': { fields: {}, uiOnly: true },
  'settings.generation.save': {
    fields: {
      blankModel: ['last', ...MODEL_ORDER].join('|'),
      continuous: 'boolean',
      agentMode: 'confirm|direct',
      limitEnabled: 'boolean',
      dailyLimit: 'integer',
      dailyImageLimit: 'integer',
    },
    uiOnly: true,
  },
  'version.list': {
    fields: { tabId: 'string' },
    required: ['tabId'],
    // The first read creates the work root and must serialize with draft edits.
    mutation: true,
    example: { tabId: 'tab-id' },
  },
  'version.open': {
    fields: { ...tab, versionId: 'string', imageId: 'string' },
    required: ['tabId', 'versionId'],
    mutation: true,
    example: { tabId: 'tab-id', versionId: 'version-id' },
  },
  'prompt.set-size': {
    fields: { ...tab, width: 'number', height: 'number' },
    required: ['tabId', 'width', 'height'],
    mutation: true,
    example: { tabId: 'tab-id', width: 832, height: 1216 },
  },
  'branch.rename': {
    fields: { branchId: 'string', name: 'text' },
    required: ['branchId', 'name'],
    mutation: true,
    example: { branchId: 'branch-id', name: '雨景' },
  },
  'work.open-from-image': {
    fields: { ...tab, versionId: 'string', imageId: 'string' },
    required: ['imageId'],
    mutation: true,
    example: { tabId: 'tab-id', versionId: 'version-id', imageId: 'image-id' },
  },
  'work.open': {
    fields: { workId: 'string', versionId: 'string', imageId: 'string' },
    required: ['workId'],
    mutation: true,
    example: { workId: 'work-id' },
  },
  'agent.setup': { fields: {}, uiOnly: true },
  'agent.install': { fields: {}, uiOnly: true },
  'agent.skill': { fields: {}, uiOnly: true },
  'agent.skill-install': { fields: { target: 'claude|codex' }, required: ['target'], uiOnly: true },
  'agent.skill-uninstall': {
    fields: { target: 'claude|codex' },
    required: ['target'],
    uiOnly: true,
  },
  'agent.uninstall': { fields: {}, uiOnly: true },
  'agent.reveal': { fields: {}, uiOnly: true },
  'image.copy': { fields: { id: 'string', path: 'string' }, uiOnly: true },
  'image.save-as': { fields: { id: 'string', path: 'string', name: 'text' }, uiOnly: true },
  'file.reveal': { fields: { path: 'string', vibe: 'vibe' }, uiOnly: true },
  'workbench.open-many': { fields: { paths: 'strings' }, required: ['paths'], uiOnly: true },
  'import.prepare': { fields: { paths: 'stringList' }, uiOnly: true },
  'import.files': { fields: { paths: 'stringList', fromClipboard: 'boolean' }, uiOnly: true },
  'backup.estimate': { fields: {}, uiOnly: true },
  'backup.export': {
    fields: { includeLibrary: 'boolean' },
    required: ['includeLibrary'],
    uiOnly: true,
  },
  'backup.inspect': { fields: { path: 'string' }, uiOnly: true },
  'backup.restore': { fields: { path: 'string' }, required: ['path'], uiOnly: true },
  'backup.undo': { fields: {}, uiOnly: true },
  'backup.status': { fields: {}, uiOnly: true },
  'backup.cancel': { fields: {}, uiOnly: true },
  'import.folder.scan': { fields: { path: 'string' }, uiOnly: true },
  'import.folder.commit': {
    fields: { sessionId: 'string', folderIds: 'stringList', skipNoMetadata: 'boolean' },
    required: ['sessionId', 'folderIds', 'skipNoMetadata'],
    uiOnly: true,
  },
  'import.cancel': { fields: { id: 'string' }, required: ['id'], uiOnly: true },
  'library.cards': { fields: { view: 'all|favorites|trash' }, required: [], uiOnly: true },
  'library.import-days': {
    fields: { view: 'all|trash', collectionId: 'string', month: 'month' },
    required: ['month'],
    uiOnly: true,
  },
  'collection.create': {
    fields: { collection: 'collectionInput' },
    required: ['collection'],
    uiOnly: true,
  },
  'collection.update': {
    fields: { id: 'string', patch: 'collectionPatch' },
    required: ['id', 'patch'],
    uiOnly: true,
  },
  'collection.delete': { fields: { id: 'string' }, required: ['id'], uiOnly: true },
  'library.restore': { fields: { ids: 'strings' }, required: ['ids'], uiOnly: true },
  'trash.delete-permanently': { fields: { ids: 'stringList' }, required: [], uiOnly: true },
  'trash.summary': { fields: {}, required: [], uiOnly: true },
  'trash.detached': { fields: {}, required: [], uiOnly: true },
  'workbench.temp-sync': { fields: { paths: 'stringList' }, required: ['paths'], uiOnly: true },
  'workbench.save-structure': {
    fields: { filePath: 'string', structure: 'structure', projectId: 'text' },
    required: ['filePath', 'structure'],
    uiOnly: true,
  },
  'workbench.open-clipboard': { fields: {}, required: [], uiOnly: true },
  'dictionary.retranslate': {
    fields: { id: 'string', tags: 'stringList' },
    required: ['id', 'tags'],
    uiOnly: true,
  },
  'dictionary.retranslate-cancel': { fields: { id: 'string' }, required: ['id'], uiOnly: true },
  'dictionary.translate': { fields: { tags: 'stringList' }, required: ['tags'], uiOnly: true },
  'dictionary.remove': { fields: { tags: 'stringList' }, required: ['tags'], uiOnly: true },
  'paragraph.transform': {
    fields: { request: 'paragraphRequest' },
    required: ['request'],
    uiOnly: true,
  },
  'paragraph.cancel': { fields: { id: 'string' }, required: ['id'], uiOnly: true },
  'import.previews': { fields: { sessionId: 'string' }, required: ['sessionId'], uiOnly: true },
  'import.commit': {
    fields: { sessionId: 'string', entryIds: 'stringList' },
    required: ['sessionId', 'entryIds'],
    uiOnly: true,
  },

  'clipboard.read-text': { fields: {}, required: [], uiOnly: true },
  'clipboard.write-text': { fields: { text: 'text' }, required: ['text'], uiOnly: true },
  'settings.ai.get': { fields: {}, required: [], uiOnly: true },
  'settings.ai.save': { fields: { settings: 'aiSettings' }, required: ['settings'], uiOnly: true },
  'settings.appearance.get': { fields: {}, required: [], uiOnly: true },
  'settings.appearance.save': {
    fields: { settings: 'appearanceSettings' },
    required: ['settings'],
    uiOnly: true,
  },
  'settings.productivity.get': { fields: {}, required: [], uiOnly: true },
  'onboarding.get': { fields: {}, required: [], uiOnly: true },
  'onboarding.done': { fields: {}, required: [], uiOnly: true },
  'window.close-choice': {
    fields: { action: 'tray|quit', remember: 'boolean' },
    required: ['action', 'remember'],
    uiOnly: true,
  },
  'tray.menu-size': {
    fields: { width: 'integer', height: 'integer' },
    required: ['width', 'height'],
    uiOnly: true,
  },
  'tray.action': { fields: { action: 'show|quit|close' }, required: ['action'], uiOnly: true },
  'settings.productivity.save': {
    fields: { settings: 'productivitySettings' },
    required: ['settings'],
    uiOnly: true,
  },
  'updates.status': { fields: {}, required: [], uiOnly: true },
  'updates.check': { fields: {}, required: [], uiOnly: true },
  'updates.download': { fields: {}, required: [], uiOnly: true },
  'updates.install': { fields: {}, required: [], uiOnly: true },
  'updates.open-release': { fields: { url: 'text' }, required: [], uiOnly: true },
  'fonts.list': { fields: {}, required: [], uiOnly: true },
  'ai.models': { fields: {}, required: [], uiOnly: true },
  // 1.5 ChatGPT 账号：只给界面用（账号和令牌，Agent 和命令行不能碰）
  'ai.chatgpt.sign-in': { fields: {}, required: [], uiOnly: true },
  'ai.chatgpt.cancel-sign-in': { fields: {}, required: [], uiOnly: true },
  'ai.chatgpt.sign-out': { fields: {}, required: [], uiOnly: true },
  'ai.chatgpt.models': { fields: {}, required: [], uiOnly: true },
  'ai.chatgpt.quota': { fields: {}, required: [], uiOnly: true },
  'ai.chatgpt.manage-usage': { fields: {}, required: [], uiOnly: true },
  'ai.test': { fields: {}, required: [], uiOnly: true },
  'storage.get': { fields: {}, required: [], uiOnly: true },
  'storage.database': { fields: {}, required: [], uiOnly: true },
  'storage.backups': { fields: {}, required: [], uiOnly: true },
  'storage.reveal-backup': { fields: { fileName: 'string' }, required: ['fileName'], uiOnly: true },
  'storage.change': { fields: {}, required: [], uiOnly: true },
  'storage.reveal': { fields: {}, required: [], uiOnly: true },

  'app.status': { uiOnly: false, fields: {} },
  'image.read': { uiOnly: false, fields: { path: 'string' }, required: ['path'] },
  'workbench.list': { uiOnly: false, fields: {} },
  'workbench.open': {
    uiOnly: false,
    fields: {
      ...revision,
      path: 'string',
      libraryId: 'string',
      source: 'source',
      fresh: 'boolean',
      workId: 'string',
    },
    mutation: true,
  },
  'workbench.get': { uiOnly: false, fields: { tabId: 'string' }, required: ['tabId'] },
  'workbench.close': { uiOnly: false, fields: tab, required: ['tabId'], mutation: true },
  'workbench.save-to-library': { uiOnly: false, fields: tab, required: ['tabId'], mutation: true },
  'prompt.set': {
    uiOnly: false,
    fields: { ...scope, text: 'text' },
    required: [...scoped, 'text'],
    mutation: true,
  },
  'block.set-text': {
    uiOnly: false,
    fields: { ...block, text: 'text' },
    required: [...blocked, 'text'],
    mutation: true,
  },
  'block.set-type': {
    uiOnly: false,
    fields: { ...block, type: 'tags|paragraph' },
    required: [...blocked, 'type'],
    mutation: true,
  },
  'tag.add': {
    uiOnly: false,
    fields: { ...block, text: 'string', before: 'integer' },
    required: [...blocked, 'text'],
    mutation: true,
  },
  'tag.remove': { uiOnly: false, fields: tag, required: tagged, mutation: true },
  'tag.set': {
    uiOnly: false,
    fields: { ...tag, text: 'string', weight: 'number' },
    required: tagged,
    mutation: true,
  },
  'character.add': {
    uiOnly: false,
    fields: { ...tab, name: 'text' },
    required: ['tabId'],
    mutation: true,
  },
  'character.remove': {
    uiOnly: false,
    fields: { ...tab, characterId: 'string' },
    required: ['tabId', 'characterId'],
    mutation: true,
  },
  'prompt.copy': {
    uiOnly: false,
    fields: { tabId: 'string', scope: 'string', includeAutomatic: 'boolean' },
    required: ['tabId'],
  },
  'library.search': {
    uiOnly: false,
    fields: {
      query: 'text',
      filters: 'filters',
      collectionId: 'string',
      view: 'all|trash',
      offset: 'integer',
      limit: 'integer',
    },
  },
  'library.get': { uiOnly: false, fields: { id: 'string' }, required: ['id'] },
  'library.import': {
    uiOnly: false,
    fields: { ...revision, path: 'string' },
    required: ['path'],
    mutation: true,
  },
  'library.rename': {
    uiOnly: false,
    fields: { ...revision, id: 'string', name: 'text' },
    required: ['id', 'name'],
    mutation: true,
  },
  'library.trash': {
    uiOnly: false,
    fields: { ...revision, ids: 'strings' },
    required: ['ids'],
    mutation: true,
  },
  'library.rename-many': {
    uiOnly: false,
    example: { changes: [{ id: 'IMAGE', name: '窗边' }], expectedRevision: 0 },
    fields: { ...revision, changes: 'renames' },
    required: ['changes'],
    mutation: true,
  },
  'dictionary.list': {
    uiOnly: false,
    example: { query: 'hair', limit: 20 },
    fields: {
      query: 'text',
      category,
      source: 'manual|danbooru|dso|rule|ai|cache|builtin|heuristic',
      limit: 'integer',
      offset: 'integer',
      all: 'boolean',
    },
  },
  'dictionary.suggest': {
    uiOnly: false,
    fields: { query: 'text' },
    required: ['query'],
    example: { query: 'blue' },
  },
  'dictionary.set-many': {
    uiOnly: false,
    example: {
      entries: [{ tag: 'blue hair', translation: '蓝发', category: 'Body' }],
      expectedRevision: 0,
    },
    fields: { ...revision, entries: 'dictionaryEntries' },
    required: ['entries'],
    mutation: true,
  },
  'collection.list': { uiOnly: false, fields: {} },
  'collection.add': {
    uiOnly: false,
    fields: { ...revision, collectionId: 'string', ids: 'strings' },
    required: ['collectionId', 'ids'],
    mutation: true,
  },
  'collection.remove': {
    uiOnly: false,
    fields: { ...revision, collectionId: 'string', ids: 'strings' },
    required: ['collectionId', 'ids'],
    mutation: true,
  },
  'dictionary.lookup': { uiOnly: false, fields: { tags: 'strings' }, required: ['tags'] },
  'dictionary.set': {
    uiOnly: false,
    fields: {
      ...revision,
      tag: 'string',
      translation: 'text',
      category:
        'ArtistEra|Subject|Identity|Body|Clothing|Action|Environment|Composition|StyleQuality|Unsorted',
    },
    required: ['tag'],
    mutation: true,
  },
  'workbench.session': { fields: { legacyV1: 'text', legacyV2: 'text' }, uiOnly: true },
  'workbench.commit': {
    fields: { base: 'session', next: 'session' },
    required: ['base', 'next'],
    mutation: true,
    uiOnly: true,
  },
  'workbench.editing': { fields: { targets: 'targets' }, required: ['targets'], uiOnly: true },
  'workbench.undo': {
    fields: { undoId: 'string' },
    required: ['undoId'],
    mutation: true,
    uiOnly: true,
  },
};

export class CommandError extends Error {
  /** @param {CommandErrorCode} code @param {string} message @param {Record<string, unknown>} [details] */
  constructor(code, message, details) {
    super(message);
    this.code = code;
    /** @type {Record<string, unknown>|undefined} */
    this.details = details;
  }
}
/** @param {unknown} value @returns {value is Record<string, unknown>} */
export function record(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
/** @param {unknown} value @param {string} type @returns {boolean} */
function valid(value, type) {
  if (type === 'outpaintEdges')
    return (
      record(value) &&
      ['left', 'right', 'top', 'bottom'].every(
        (key) =>
          Number.isSafeInteger(value[key]) &&
          Number(value[key]) >= 0 &&
          Number(value[key]) % 64 === 0,
      ) &&
      Object.keys(value).every((key) => ['left', 'right', 'top', 'bottom'].includes(key)) &&
      Object.values(value).some((n) => Number(n) > 0)
    );
  if (type === 'inpaintMask') return typeof value === 'string' && value.length <= 140 * 1024 * 1024;
  if (type === 'inpaintRect')
    return (
      record(value) &&
      ['x', 'y', 'width', 'height'].every((k) => Number.isSafeInteger(value[k])) &&
      Number(value.x) >= 0 &&
      Number(value.y) >= 0 &&
      Number(value.width) >= 64 &&
      Number(value.height) >= 64
    );
  if (type === 'imageGroups')
    return (
      Array.isArray(value) &&
      value.length > 0 &&
      value.length <= 100 &&
      value.every((v) => valid(v, 'strings')) &&
      new Set(value.flat()).size === value.flat().length
    );
  if (type === 'month') return typeof value === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
  if (type === 'vibe')
    return (
      record(value) &&
      valid(value.encoding, 'string') &&
      Object.entries(value).every(
        ([key, entry]) =>
          [
            'id',
            'name',
            'encoding',
            'strength',
            'information_extracted',
            'image_path',
            'thumbnail_path',
            'file_path',
            'is_embedded',
            'source_type',
            'reference_strength',
            'description',
            'model',
          ].includes(key) &&
          (typeof entry === 'string' ||
            typeof entry === 'number' ||
            typeof entry === 'boolean' ||
            entry === null),
      )
    );
  if (type === 'source')
    return (
      record(value) &&
      ['file', 'library', 'clipboard'].includes(String(value.type)) &&
      Object.entries(value).every(
        ([key, entry]) =>
          ['type', 'path', 'projectId', 'temporaryId', 'fingerprint', 'id'].includes(key) &&
          valid(entry, 'text'),
      )
    );
  if (type === 'stringList')
    return (
      Array.isArray(value) && value.length <= 10000 && value.every((item) => valid(item, 'string'))
    );
  if (type === 'structure')
    return (
      record(value) &&
      typeof value.base_prompt_raw === 'string' &&
      typeof value.base_undesired_raw === 'string' &&
      Array.isArray(value.characters) &&
      Array.isArray(value.base_undesired_tags)
    );
  if (type === 'collectionInput' || type === 'collectionPatch' || type === 'paragraphRequest') {
    /** @type {Record<string,string>} */
    const fields =
      type === 'paragraphRequest'
        ? { id: 'string', text: 'text', direction: 'translate|rewrite' }
        : { name: 'text', kind: 'manual|smart', filters: 'filters' };
    const required =
      type === 'paragraphRequest'
        ? ['id', 'text', 'direction']
        : type === 'collectionInput'
          ? ['name']
          : [];
    return (
      record(value) &&
      required.every((key) => Object.hasOwn(value, key) && value[key] !== undefined) &&
      Object.entries(value).every(
        ([key, entry]) =>
          Object.hasOwn(fields, key) && (entry === undefined || valid(entry, fields[key])),
      )
    );
  }
  if (['blurSettings', 'aiSettings', 'appearanceSettings', 'productivitySettings'].includes(type)) {
    /** @type {Record<string,Record<string,string>>} */
    const schemas = {
      blurSettings: { mode: 'off|nsfw|all', quickAll: 'boolean', words: 'blurWords' },
      aiSettings: {
        baseUrl: 'text',
        model: 'text',
        apiKey: 'text',
        clearApiKey: 'boolean',
        provider: 'chatgpt|apiKey',
        chatgptModel: 'text',
        codexMode: 'boolean',
        introShown: 'boolean',
        hasApiKey: 'boolean',
        encryptionAvailable: 'boolean',
      },
      appearanceSettings: {
        themeMode: 'auto|dark|light',
        primaryColor: 'blue|cyan|geekblue|gold|green|lime|magenta|orange|purple|red|volcano|yellow',
        sansFont: 'text',
        monoFont: 'text',
        proseFont: 'text',
        motion: 'full|reduced|off',
      },
      productivitySettings: {
        recentImageDirectory: 'text',
        autoCheckUpdates: 'boolean',
        closeAction: 'ask|tray|quit',
      },
    };
    return (
      record(value) &&
      Object.entries(value).every(
        ([key, entry]) =>
          (type === 'aiSettings' &&
            ['chatgpt', 'hasApiKey', 'encryptionAvailable'].includes(key)) ||
          (Object.hasOwn(schemas[type], key) && valid(entry, schemas[type][key])),
      )
    );
  }
  if (type === 'renames' || type === 'dictionaryEntries') {
    /** @type {Record<string,string>} */
    const fields =
      type === 'renames'
        ? { id: 'string', name: 'text', has_custom_name: 'boolean' }
        : { tag: 'string', translation: 'text', category };
    return (
      Array.isArray(value) &&
      value.length > 0 &&
      value.length <= 10000 &&
      value.every(
        (item) =>
          record(item) &&
          Object.keys(item).every((key) => Object.hasOwn(fields, key)) &&
          Object.entries(item).every(([key, entry]) => valid(entry, fields[key])) &&
          (type === 'renames'
            ? valid(item.id, 'string') && valid(item.name, 'text')
            : valid(item.tag, 'string') &&
              (item.translation !== undefined || item.category !== undefined)),
      )
    );
  }
  if (type === 'text' || type === 'string')
    return (
      typeof value === 'string' && value.length <= 2_000_000 && (type === 'text' || !!value.trim())
    );
  if (type === 'generationPatch') return validSettingsPatch(value);
  if (type === 'enhanceScale') return [1, 1.5, 2, 'max'].some((scale) => scale === value);
  if (type === 'unit')
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
  if (type === 'integer') return Number.isSafeInteger(value) && Number(value) >= 0;
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'boolean') return typeof value === 'boolean';
  if (type === 'blurWords')
    return (
      Array.isArray(value) && value.length <= 10000 && value.every((w) => typeof w === 'string')
    );
  if (type === 'strings')
    return (
      Array.isArray(value) &&
      value.length > 0 &&
      value.length <= 10000 &&
      value.every((item) => valid(item, 'string'))
    );
  if (type === 'session')
    return (
      record(value) &&
      value.version === 2 &&
      typeof value.activeTabId === 'string' &&
      Array.isArray(value.tabs) &&
      value.tabs.length <= 1000 &&
      value.tabs.every(
        (t) =>
          record(t) &&
          valid(t.id, 'string') &&
          record(t.source) &&
          (record(t.project) || t.project === null),
      )
    );
  if (type === 'targets')
    return (
      Array.isArray(value) &&
      value.length <= 100 &&
      value.every(
        (t) =>
          record(t) &&
          valid(t.tabId, 'string') &&
          (t.scope === undefined || valid(t.scope, 'string')) &&
          (t.block === undefined || valid(t.block, 'integer')),
      )
    );
  if (type === 'filters') {
    if (!record(value)) return false;
    const fields = {
      query: 'text',
      nsfw: 'any|nsfw|safe',
      includeTags: 'strings',
      excludeTags: 'strings',
      tagMatch: 'all|any',
      models: 'strings',
      vibes: 'strings',
      datePreset: 'all|today|7d|30d|90d|year|custom',
      dateFrom: 'text',
      dateTo: 'text',
    };
    return Object.entries(value).every(
      ([key, v]) =>
        Object.hasOwn(fields, key) &&
        ((Array.isArray(v) && !v.length) ||
          valid(v, fields[/** @type {keyof typeof fields} */ (key)])),
    );
  }
  return typeof value === 'string' && type.split('|').includes(value);
}
/** @param {string} name @param {unknown} input @param {'ui'|'agent'} source @returns {CommandName} */
export function validateCommand(name, input, source) {
  if (
    source === 'agent' &&
    Object.hasOwn(commandRegistry, name) &&
    commandRegistry[/** @type {CommandName} */ (name)].uiOnly
  )
    throw new CommandError('forbidden', '这个命令只供软件界面使用');
  if (
    source === 'agent' &&
    ![
      'version.delete',
      'branch.delete',
      'branch.restore',
      'work.restore-original',
      'work.restore-detached',
      'material.pool.delete',
      'material.pool.entry.delete',
    ].includes(name) &&
    (/^(settings?|preferences?|keys?|secrets?|account|generation)\./i.test(name) ||
      /(?:permanent|empty|delete|purge|restore)/i.test(name))
  )
    throw new CommandError('forbidden', '这个命令不在 Agent 可用范围内');
  if (!Object.hasOwn(commandRegistry, name))
    throw new CommandError('invalid_input', '命令不存在，请运行 nai-studio help');
  const key = /** @type {CommandName} */ (name),
    def = commandRegistry[key];
  if (def.uiOnly && source !== 'ui')
    throw new CommandError('forbidden', '这个命令只供软件界面使用');
  if (
    !record(input) ||
    Object.keys(input).some((k) => !Object.hasOwn(def.fields, k)) ||
    (def.required || []).some((k) => !Object.hasOwn(input, k) || input[k] === undefined) ||
    Object.entries(input).some(([k, v]) => v !== undefined && !valid(v, def.fields[k]))
  )
    throw new CommandError('invalid_input', '输入格式不正确，请按 help 中的格式填写');
  if (
    (['library.export', 'library.export.estimate'].includes(name) &&
      Number(input.ids !== undefined) + Number(input.collectionId !== undefined) !== 1) ||
    (['image.copy', 'image.save-as'].includes(name) &&
      Number(!!input.id) + Number(!!input.path) !== 1) ||
    (name === 'file.reveal' && Number(!!input.path) + Number(!!input.vibe) !== 1) ||
    (name === 'workbench.open' &&
      (Number(!!input.path) + Number(!!input.libraryId) > 1 ||
        (source === 'agent' && Number(!!input.path) + Number(!!input.libraryId) !== 1))) ||
    (name === 'tag.set' && input.text === undefined && input.weight === undefined) ||
    (name === 'dictionary.set' &&
      input.translation === undefined &&
      input.category === undefined) ||
    (name === 'generate.status' &&
      input.limit !== undefined &&
      (Number(input.limit) < 1 || Number(input.limit) > 100)) ||
    (name === 'library.search' &&
      input.limit !== undefined &&
      (Number(input.limit) < 1 || Number(input.limit) > 1000))
  )
    throw new CommandError('invalid_input', '输入缺少要修改的内容，或超出允许范围');
  return key;
}
