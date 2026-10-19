// @ts-check
/** @typedef {import('../../src/shared/commands').CommandName} CommandName */
/** @typedef {import('../../src/shared/commands').CommandErrorCode} CommandErrorCode */
/** @typedef {{ fields: Record<string, string>, required?: string[], uiOnly?: boolean, mutation?: boolean }} Definition */
const revision = { expectedRevision: 'integer' };
const tab = { ...revision, tabId: 'string' };
const scope = { ...tab, scope: 'string' };
const block = { ...scope, block: 'integer' };
const tag = { ...block, index: 'integer' };
const scoped = ['tabId', 'scope'];
const blocked = [...scoped, 'block'];
const tagged = [...blocked, 'index'];
/** @type {Record<CommandName, Definition>} */
export const commandRegistry = {
  'app.status': { fields: {} },
  'image.read': { fields: { path: 'string' }, required: ['path'] },
  'workbench.list': { fields: {} },
  'workbench.open': {
    fields: { ...revision, path: 'string', libraryId: 'string' },
    mutation: true,
  },
  'workbench.get': { fields: { tabId: 'string' }, required: ['tabId'] },
  'workbench.close': { fields: tab, required: ['tabId'], mutation: true },
  'workbench.save-to-library': { fields: tab, required: ['tabId'], mutation: true },
  'prompt.set': {
    fields: { ...scope, text: 'text' },
    required: [...scoped, 'text'],
    mutation: true,
  },
  'block.set-text': {
    fields: { ...block, text: 'text' },
    required: [...blocked, 'text'],
    mutation: true,
  },
  'block.set-type': {
    fields: { ...block, type: 'tags|paragraph' },
    required: [...blocked, 'type'],
    mutation: true,
  },
  'tag.add': {
    fields: { ...block, text: 'string', before: 'integer' },
    required: [...blocked, 'text'],
    mutation: true,
  },
  'tag.remove': { fields: tag, required: tagged, mutation: true },
  'tag.set': {
    fields: { ...tag, text: 'string', weight: 'number' },
    required: tagged,
    mutation: true,
  },
  'character.add': { fields: { ...tab, name: 'text' }, required: ['tabId'], mutation: true },
  'character.remove': {
    fields: { ...tab, characterId: 'string' },
    required: ['tabId', 'characterId'],
    mutation: true,
  },
  'prompt.copy': {
    fields: { tabId: 'string', scope: 'string', includeAutomatic: 'boolean' },
    required: ['tabId'],
  },
  'library.search': {
    fields: {
      query: 'text',
      filters: 'filters',
      collectionId: 'string',
      view: 'all|trash',
      offset: 'integer',
      limit: 'integer',
    },
  },
  'library.get': { fields: { id: 'string' }, required: ['id'] },
  'library.import': { fields: { ...revision, path: 'string' }, required: ['path'], mutation: true },
  'library.rename': {
    fields: { ...revision, id: 'string', name: 'text' },
    required: ['id', 'name'],
    mutation: true,
  },
  'library.trash': { fields: { ...revision, ids: 'strings' }, required: ['ids'], mutation: true },
  'collection.list': { fields: {} },
  'collection.add': {
    fields: { ...revision, collectionId: 'string', ids: 'strings' },
    required: ['collectionId', 'ids'],
    mutation: true,
  },
  'collection.remove': {
    fields: { ...revision, collectionId: 'string', ids: 'strings' },
    required: ['collectionId', 'ids'],
    mutation: true,
  },
  'dictionary.lookup': { fields: { tags: 'strings' }, required: ['tags'] },
  'dictionary.set': {
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
  /** @param {CommandErrorCode} code @param {string} message */
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}
/** @param {unknown} value @returns {value is Record<string, unknown>} */
export function record(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
/** @param {unknown} value @param {string} type @returns {boolean} */
function valid(value, type) {
  if (type === 'text' || type === 'string')
    return (
      typeof value === 'string' && value.length <= 2_000_000 && (type === 'text' || !!value.trim())
    );
  if (type === 'integer') return Number.isSafeInteger(value) && Number(value) >= 0;
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value);
  if (type === 'boolean') return typeof value === 'boolean';
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
    /^(settings?|preferences?|keys?|secrets?|account|generation)\./i.test(name) ||
    /(?:permanent|empty|delete|purge|restore)/i.test(name)
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
    (def.required || []).some((k) => !Object.hasOwn(input, k)) ||
    Object.entries(input).some(([k, v]) => !valid(v, def.fields[k]))
  )
    throw new CommandError('invalid_input', '输入格式不正确，请按 help 中的格式填写');
  if (
    (name === 'workbench.open' && Number(!!input.path) + Number(!!input.libraryId) !== 1) ||
    (name === 'tag.set' && input.text === undefined && input.weight === undefined) ||
    (name === 'dictionary.set' &&
      input.translation === undefined &&
      input.category === undefined) ||
    (name === 'library.search' &&
      input.limit !== undefined &&
      (Number(input.limit) < 1 || Number(input.limit) > 1000))
  )
    throw new CommandError('invalid_input', '输入缺少要修改的内容，或超出允许范围');
  return key;
}
