import { checkForUpdates, compareVersions, transitionUpdateCheck } from './updates.js';
import {
  createUpdateLogger,
  sanitizeUpdateText,
  requestMirrorUpdate,
  mirrorReleaseNotes,
  MirrorChyanProvider,
  MIRRORCHYAN_SITE,
} from './mirrorchyan.js';

// electron-builder removes build from the packaged package.json. Its generated
// app-update.yml is the packaged copy of build.publish, independent of setFeedURL.
export async function resolveGithubFeed(metadata, updater) {
  const publish = metadata.build?.publish;
  const feed =
    (Array.isArray(publish) ? publish : [publish]).find((item) => item?.provider === 'github') ||
    (await updater.configOnDisk.value);
  if (feed.provider !== 'github' || !feed.owner || !feed.repo)
    throw Error('Invalid GitHub update configuration');
  return feed;
}

export function updateSourceCommands(preferences, openExternal) {
  return {
    'updates.source.get': () => preferences.updateSourceSettings(),
    'updates.source.save': (input) => preferences.saveUpdateSource(input),
    'updates.open-mirrorchyan': async () => {
      await openExternal(MIRRORCHYAN_SITE);
      return { ok: true };
    },
  };
}

export function createUpdateService({
  updater,
  preferences,
  network,
  githubFeed,
  currentVersion,
  capabilities,
  getState,
  notify,
  doubles = null,
  platform = process.platform,
  arch = process.arch,
}) {
  let checking = false,
    downloading = false,
    updaterCheck = false;
  const secrets = () => [preferences.updateSourceSettings().cdk];
  const clean = (value) => sanitizeUpdateText(value, secrets());
  updater.logger = createUpdateLogger(updater.logger || console, secrets);
  updater.autoDownload = false;
  updater.autoInstallOnAppQuit = false;
  updater.allowPrerelease = false;
  const github = async () => {
    updater.setFeedURL(typeof githubFeed === 'function' ? await githubFeed() : githubFeed);
    updater.disableDifferentialDownload = false;
  };
  if (capabilities.canDownloadUpdate && !doubles) {
    // Check events are consumed only by the check that requested them. In particular,
    // late updater events cannot overwrite Mirror metadata or a retained download.
    updater.on('download-progress', (progress) => {
      if (!downloading) return;
      notify({
        phase: 'downloading',
        progress: Math.max(0, Math.min(100, Number(progress.percent) || 0)),
        transferred: Number(progress.transferred) || 0,
        total: Number(progress.total) || 0,
        bytesPerSecond: Number(progress.bytesPerSecond) || 0,
        error: '',
      });
    });
    updater.on('update-downloaded', (info) => {
      if (!downloading) return;
      notify({
        phase: 'downloaded',
        hasUpdate: true,
        latestVersion: info.version,
        progress: 100,
        error: '',
      });
    });
    updater.on('error', (error) => {
      if (updaterCheck) return; // The awaited call below owns check errors.
      if (downloading) notify({ phase: 'error', error: clean(error) });
    });
  }
  const options = () => ({
    currentVersion,
    cdk: preferences.updateSourceSettings().cdk,
    platform,
    arch,
  });
  const mirror = () =>
    requestMirrorUpdate(
      doubles
        ? async () => {
            if (doubles.mirrorError) throw Error('Synthetic mirror transport failure');
            const fixture = doubles.mirrorUpdate || {};
            return {
              json: async () => ({
                code: fixture.code ?? 0,
                data: {
                  version_name: fixture.version ?? 'v99.0.0',
                  release_note: 'Mirror acceptance release',
                  cdk_expired_time: fixture.cdk_expired_time,
                  ...(fixture.url
                    ? {
                        url: 'https://example.com/update.exe?signature=synthetic',
                        sha256: 'a'.repeat(64),
                        filesize: 100,
                      }
                    : {}),
                },
              }),
            };
          }
        : network.fetch,
      options(),
    );
  async function githubCheck() {
    if (doubles) {
      if (doubles.updateError) throw Error(doubles.updateError);
      const version = doubles.updateVersion || '99.0.0';
      return {
        latestVersion: version,
        hasUpdate: compareVersions(version, currentVersion) > 0,
        checkedAt: new Date().toISOString(),
        structuredNotes: doubles.structuredNotes || null,
        notes: '# 验收发布说明\n\n本地替身。[验收链接](https://example.com/acceptance)',
        releaseUrl: `https://github.com/LBEILC/NovelAIPromptStudio/releases/tag/v${version}`,
      };
    }
    if (!capabilities.canDownloadUpdate) return checkForUpdates(currentVersion, network.fetch);
    await github();
    updaterCheck = true;
    let result;
    try {
      result = await network.run(() => updater.checkForUpdates());
    } finally {
      updaterCheck = false;
    }
    const info = result?.updateInfo;
    // TODO(design): Confirm copy for malformed/empty updater responses and busy operations.
    if (!info) throw Error('【文案待定：没有收到有效的更新信息】');
    const notes = Array.isArray(info.releaseNotes)
      ? info.releaseNotes
          .map((item) => `${item.version || ''}\n${item.note || ''}`.trim())
          .filter(Boolean)
          .join('\n\n')
      : String(info.releaseNotes || '').trim();
    const release = {
      hasUpdate: compareVersions(info.version, currentVersion) > 0,
      latestVersion: info.version,
      checkedAt: new Date().toISOString(),
      publishedAt: info.releaseDate || '',
      notes: compareVersions(info.version, currentVersion) > 0 ? clean(notes).slice(0, 4000) : '',
      structuredNotes: null,
      releaseUrl: `https://github.com/LBEILC/NovelAIPromptStudio/releases/tag/v${info.version}`,
    };
    try {
      const extra = await checkForUpdates(currentVersion, network.fetch);
      if (extra.latestVersion === release.latestVersion)
        release.structuredNotes = extra.structuredNotes;
    } catch {
      /* Optional notes must not block an updater result. */
    }
    return release;
  }
  async function check() {
    if (downloading || getState().phase === 'downloading')
      return { ok: false, error: '正在下载更新，下载完成后再检查' };
    if (checking) return { ok: true, ...getState() };
    checking = true;
    const before = getState();
    let metadata = {
      source: 'github',
      downloadSource: 'github',
      cdkExpiresAt: undefined,
      mirrorCode: undefined,
      mirrorFallback: undefined,
    };
    notify({ phase: 'checking', error: '', progress: 0 });
    try {
      await doubles?.beforeUpdateCheck?.();
      if (preferences.updateSourceSettings().source === 'mirrorchyan') {
        const result = await mirror();
        if (!result.failure) {
          result.state.structuredNotes = doubles
            ? doubles.structuredNotes || null
            : await mirrorReleaseNotes(network.fetch, result.state.latestVersion);
          notify(transitionUpdateCheck(before, result.state));
          return { ok: true, ...getState() };
        }
        if (!result.failure.mirrorFallback) {
          notify(
            transitionUpdateCheck(before, {
              ...metadata,
              source: 'mirrorchyan',
              downloadSource: before.downloadSource,
              ...result.failure,
            }),
          );
          return { ok: false, ...getState() };
        }
        metadata = { ...metadata, mirrorCode: result.failure.mirrorCode, mirrorFallback: true };
      }
      const release = await githubCheck();
      notify(transitionUpdateCheck(before, { ...release, ...metadata }));
      return { ok: true, ...getState() };
    } catch (error) {
      notify(transitionUpdateCheck(before, { ...metadata, error: clean(error) }));
      return { ok: false, ...getState() };
    } finally {
      checking = false;
    }
  }
  async function download() {
    if (checking || downloading) return { ok: false, error: '【文案待定：更新操作正在进行】' };
    if (!['available', 'error'].includes(getState().phase))
      return { ok: false, error: '请先检查并确认有可用更新' };
    downloading = true;
    const before = getState();
    try {
      if (
        preferences.updateSourceSettings().source === 'mirrorchyan' &&
        before.downloadSource === 'mirrorchyan'
      ) {
        const result = await mirror();
        if (result.failure) {
          if (!result.failure.mirrorFallback) {
            notify(
              transitionUpdateCheck(before, {
                ...result.failure,
                source: 'mirrorchyan',
              }),
            );
            return { ok: false, ...getState() };
          }
          notify({ mirrorCode: result.failure.mirrorCode });
          throw Error(result.failure.error);
        }
        // TODO(design): Confirm copy for incomplete Mirror metadata and no downloadable version.
        if (!result.download) throw Error('【文案待定：Mirror酱 没有返回可用的更新文件】');
        updater.setFeedURL({
          provider: 'custom',
          updateProvider: MirrorChyanProvider,
          mirrorDownload: result.download,
        });
        updater.disableDifferentialDownload = true;
        notify({ ...result.state, structuredNotes: before.structuredNotes });
      } else {
        await github();
        notify({ downloadSource: 'github' });
      }
      notify({ phase: 'downloading', progress: 0, error: '' });
      await network.run(async () => {
        updaterCheck = true;
        let result;
        try {
          result = await updater.checkForUpdates();
        } finally {
          updaterCheck = false;
        }
        if (!result?.updateInfo || compareVersions(result.updateInfo.version, currentVersion) <= 0)
          throw Error('【文案待定：没有可下载的新版本】');
        await updater.downloadUpdate();
      });
      return { ok: true };
    } catch (error) {
      const message = clean(error);
      notify({ phase: 'error', error: message });
      return { ok: false, error: message };
    } finally {
      downloading = false;
    }
  }
  return { check, download };
}
