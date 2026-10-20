import { DEFAULT_MONO_FONT, DEFAULT_SANS_FONT } from './fonts.js';
const unavailable = (error) => async () => ({ ok: false, error });
const handlers = {
  'settings.ai.get': (input) =>
    (async () => ({
      baseUrl: 'https://api.openai.com/v1',
      model: '',
      hasApiKey: false,
      encryptionAvailable: true,
    }))(),
  'settings.ai.save': (input) => (async (settings) => settings)(input.settings),
  'settings.appearance.get': (input) =>
    (async () => ({
      themeMode: 'dark',
      primaryColor: 'blue',
      sansFont: DEFAULT_SANS_FONT,
      monoFont: DEFAULT_MONO_FONT,
      motion: 'reduced',
    }))(),
  'settings.appearance.save': (input) => (async (settings) => settings)(input.settings),
  'settings.productivity.get': (input) =>
    (async () => ({ recentImageDirectory: '', autoCheckUpdates: true }))(),
  'settings.productivity.save': (input) => (async (settings) => settings)(input.settings),
  'updates.status': (input) =>
    (async () => ({
      ok: true,
      currentVersion: '0.0.0',
      packaged: false,
      platform: 'web',
      updateMode: 'manual',
      canDownloadUpdate: false,
      canInstallUpdate: false,
      manualUpdateReason: 'development',
    }))(),
  'updates.check': (input) => unavailable('请在桌面应用中检查更新')(),
  'updates.download': (input) => unavailable('请在桌面应用中下载更新')(),
  'updates.install': (input) => unavailable('请在桌面应用中安装更新')(),
  'updates.open-release': (input) => (async () => ({ ok: true }))(input.url),
  'fonts.list': (input) => (async () => ({ ok: true, fonts: [] }))(),
  'ai.models': (input) => unavailable('请在桌面应用中配置 API')(),
  'ai.test': (input) => unavailable('请在桌面应用中配置 API')(),
  'storage.get': (input) =>
    (async () => ({
      ok: true,
      assetsDirectory: '',
      fileCount: 0,
      totalBytes: 0,
      isDefault: true,
    }))(),
  'storage.change': (input) => unavailable('请在桌面应用中更改资源库位置')(),
  'storage.reveal': (input) => unavailable('请在桌面应用中打开资源库文件夹')(),
  'collection.create': (input) => unavailable('请在桌面应用中创建收藏集')(input.collection),
  'collection.update': (input) => unavailable('请在桌面应用中修改收藏集')(input.id, input.patch),
  'collection.delete': (input) => unavailable('请在桌面应用中删除收藏集')(input.id),
  'library.restore': (input) => unavailable('请在桌面应用中管理回收站')(input.ids),
  'trash.delete-permanently': (input) => unavailable('请在桌面应用中管理回收站')(input.ids),
  'trash.summary': (input) => (async () => ({ ok: true, projects: [], count: 0, totalBytes: 0 }))(),
  'workbench.temp-sync': (input) => (async () => ({ ok: true }))(input.paths),
  'workbench.open-clipboard': (input) => unavailable('请在桌面应用中读取剪贴板')(),
  'dictionary.translate': (input) => unavailable('请在桌面应用中配置 API')(input.tags),
  'dictionary.remove': (input) => unavailable('请在桌面应用中批量删除 Tag 缓存')(input.tags),
  'import.previews': (input) => unavailable('请在桌面应用中预览压缩包')(input.sessionId),
  'import.commit': (input) => unavailable('请在桌面应用中导入')(input.sessionId, input.entryIds),
  'library.cards': async () => [],
  'collection.list': async () => ({ items: [], revision: 0 }),
  'dictionary.list': async () => ({ items: [], limit: 40, offset: 0, total: 0 }),
  'workbench.temp-sync': async () => ({ ok: true }),
  'import.prepare': async () => ({ ok: true, canceled: true }),
  'import.cancel': async () => ({ ok: true }),
  'import.files': async () => ({
    ok: true,
    canceled: true,
    imported: [],
    duplicates: [],
    errors: [],
    summary: null,
  }),
  'file.reveal': async () => ({ ok: true, filePath: '' }),
};
export async function previewInvoke(name, input = {}) {
  if (!handlers[name])
    return { ok: false, error: { code: 'forbidden', message: '请在桌面应用中执行此操作' } };
  return { ok: true, data: await handlers[name](input) };
}
