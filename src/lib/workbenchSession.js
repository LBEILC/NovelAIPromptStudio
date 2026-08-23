import { isPromptAnnotationField, promptSnapshot, restorePromptSnapshot, syncProjectPromptMetadata } from './promptStructure.js';
import { CATEGORY_OPTIONS } from './prompt.js';

export const WORKBENCH_SESSION_KEY = 'novelai-prompt-studio.workbench-session.v2';
export const LEGACY_WORKBENCH_SESSION_KEY = 'novelai-prompt-studio.workbench-session.v1';

const OVERVIEW_CATEGORIES = new Set(['All', ...CATEGORY_OPTIONS]);
const OVERVIEW_POLARITIES = new Set(['all', 'prompt', 'undesired']);
const OVERVIEW_DOMAINS = new Set(['all', 'base', 'character']);
const OVERVIEW_LANGUAGES = new Set(['original', 'translated', 'bilingual']);
const OVERVIEW_VIEW_MODES = new Set(['structure', 'category']);

export const DEFAULT_WORKBENCH_VIEW_STATE = Object.freeze({
  filters: Object.freeze({
    category: 'All',
    polarity: 'all',
    domain: 'all',
    query: '',
  }),
  language: 'original',
  viewMode: 'structure',
});

export function normalizeWorkbenchViewState(value = {}) {
  const filters = value?.filters || {};
  return {
    filters: {
      category: OVERVIEW_CATEGORIES.has(filters.category) ? filters.category : DEFAULT_WORKBENCH_VIEW_STATE.filters.category,
      polarity: OVERVIEW_POLARITIES.has(filters.polarity) ? filters.polarity : DEFAULT_WORKBENCH_VIEW_STATE.filters.polarity,
      domain: OVERVIEW_DOMAINS.has(filters.domain) ? filters.domain : DEFAULT_WORKBENCH_VIEW_STATE.filters.domain,
      query: typeof filters.query === 'string' ? filters.query : DEFAULT_WORKBENCH_VIEW_STATE.filters.query,
    },
    language: OVERVIEW_LANGUAGES.has(value?.language) ? value.language : DEFAULT_WORKBENCH_VIEW_STATE.language,
    viewMode: OVERVIEW_VIEW_MODES.has(value?.viewMode) ? value.viewMode : DEFAULT_WORKBENCH_VIEW_STATE.viewMode,
  };
}

const now = () => new Date().toISOString();

export function workbenchSourceIdentity(source = {}, project = {}) {
  if (source.type === 'library' && source.projectId) return `library:${source.projectId}`;
  if (source.type === 'clipboard' && source.fingerprint) return `clipboard:${source.fingerprint}`;
  const sourcePath = String(source.path || project.image_path || '').replaceAll('\\', '/');
  const isWindows = typeof navigator === 'undefined' ? /^[A-Za-z]:\//.test(sourcePath) : navigator.platform.startsWith('Win');
  return sourcePath ? `file:${isWindows ? sourcePath.toLocaleLowerCase('en-US') : sourcePath}` : `session:${source.id || project.id || ''}`;
}

export function createWorkbenchTab(project, options = {}) {
  const originalProject = syncProjectPromptMetadata(structuredClone(project));
  const draft = options.draft
    ? syncProjectPromptMetadata(restorePromptSnapshot(structuredClone(originalProject), options.draft))
    : structuredClone(originalProject);
  const source = {
    type: options.source?.type || 'file',
    projectId: options.source?.projectId || '',
    path: options.source?.path || project.image_path || '',
    temporaryId: options.source?.temporaryId || '',
    fingerprint: options.source?.fingerprint || '',
  };
  return {
    id: options.id || crypto.randomUUID(),
    identity: workbenchSourceIdentity(source, project),
    displayName: options.displayName || project.name || '未命名图片',
    source,
    originalProject,
    project: draft,
    viewState: normalizeWorkbenchViewState(options.viewState),
    updatedAt: options.updatedAt || now(),
    error: '',
  };
}

export function createWorkbenchSession(project = null, options = {}) {
  if (!project) return { version: 2, tabs: [], activeTabId: '' };
  const tab = createWorkbenchTab(project, options);
  return { version: 2, tabs: [tab], activeTabId: tab.id };
}

export function activeWorkbenchTab(session) {
  return session?.tabs?.find((tab) => tab.id === session.activeTabId) || session?.tabs?.[0] || null;
}

export function addWorkbenchTab(session, project, options = {}) {
  const current = session?.version === 2 ? session : createWorkbenchSession();
  const identity = workbenchSourceIdentity(options.source, project);
  const existing = current.tabs.find((tab) => tab.identity === identity);
  if (existing) return { ...current, activeTabId: existing.id };
  const tab = createWorkbenchTab(project, options);
  return { ...current, tabs: [...current.tabs, tab], activeTabId: tab.id };
}

export function updateWorkbenchTab(session, tabId, updater) {
  return {
    ...session,
    tabs: session.tabs.map((tab) => tab.id === tabId
      ? (typeof updater === 'function' ? updater(tab) : { ...tab, ...updater })
      : tab),
  };
}

export function reorderWorkbenchTabs(session, tabId, targetTabId) {
  if (!session?.tabs?.length || tabId === targetTabId) return session;
  const fromIndex = session.tabs.findIndex((tab) => tab.id === tabId);
  const targetIndex = session.tabs.findIndex((tab) => tab.id === targetTabId);
  if (fromIndex < 0 || targetIndex < 0) return session;
  const tabs = [...session.tabs];
  const [moved] = tabs.splice(fromIndex, 1);
  tabs.splice(targetIndex, 0, moved);
  return { ...session, tabs };
}

export function closeWorkbenchTab(session, tabId) {
  const index = session.tabs.findIndex((tab) => tab.id === tabId);
  if (index < 0) return session;
  const tabs = session.tabs.filter((tab) => tab.id !== tabId);
  if (session.activeTabId !== tabId) return { ...session, tabs };
  const next = tabs[Math.max(0, index - 1)] || tabs[index] || null;
  return { ...session, tabs, activeTabId: next?.id || '' };
}

export function cycleWorkbenchTab(session, direction = 1) {
  if (!session?.tabs?.length) return session;
  const index = Math.max(0, session.tabs.findIndex((tab) => tab.id === session.activeTabId));
  const next = (index + direction + session.tabs.length) % session.tabs.length;
  return { ...session, activeTabId: session.tabs[next].id };
}

function serializableTab(tab) {
  return {
    id: tab.id,
    source: tab.source,
    displayName: tab.displayName,
    updatedAt: tab.updatedAt || now(),
    draft: tab.project ? promptSnapshot(tab.project) : tab.savedDraft,
    viewState: normalizeWorkbenchViewState(tab.viewState),
  };
}

export function serializeWorkbenchSession(session) {
  if (!session?.tabs?.length) return '';
  return JSON.stringify({
    version: 2,
    activeTabId: session.activeTabId,
    tabs: session.tabs.map(serializableTab),
  });
}

function migrateV1(parsed) {
  if (!parsed?.sourcePath || !parsed?.draft) return null;
  const id = crypto.randomUUID();
  return {
    version: 2,
    activeTabId: id,
    tabs: [{
      id,
      source: { type: 'file', path: parsed.sourcePath, projectId: '', temporaryId: '', fingerprint: '' },
      displayName: '',
      updatedAt: parsed.updatedAt || now(),
      draft: parsed.draft,
    }],
  };
}

export function parseWorkbenchSession(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (parsed?.version !== 2) return migrateV1(parsed);
    const tabs = Array.isArray(parsed.tabs)
      ? parsed.tabs
        .filter((tab) => tab?.id && tab?.source && tab?.draft)
        .map((tab) => ({ ...tab, viewState: normalizeWorkbenchViewState(tab.viewState) }))
      : [];
    if (!tabs.length) return null;
    return {
      version: 2,
      tabs,
      activeTabId: tabs.some((tab) => tab.id === parsed.activeTabId) ? parsed.activeTabId : tabs[0].id,
    };
  } catch {
    return null;
  }
}

export function workbenchTabHasChanges(tab) {
  if (!tab?.project || !tab?.originalProject) return false;
  const comparableSnapshot = (project) => JSON.stringify(normalizePromptChangeValue(promptSnapshot(project)));
  return comparableSnapshot(tab.project) !== comparableSnapshot(tab.originalProject);
}

function normalizePromptChangeValue(value) {
  if (Array.isArray(value)) return value.map(normalizePromptChangeValue);
  if (!value || typeof value !== 'object') return value;
  return Object.keys(value)
    .filter((key) => key !== 'id' && !isPromptAnnotationField(key))
    .sort()
    .reduce((normalized, key) => {
      normalized[key] = normalizePromptChangeValue(value[key]);
      return normalized;
    }, {});
}

export function scopeWorkbenchCopyContext(context = {}, tabId = '') {
  return { ...context, tabId };
}

export function activeWorkbenchCopyContext(context = {}, tabId = '') {
  return context.tabId === tabId ? context : { text: '', count: 0 };
}

export function workbenchHasChanges(session) {
  return Boolean(session?.tabs?.some(workbenchTabHasChanges));
}
