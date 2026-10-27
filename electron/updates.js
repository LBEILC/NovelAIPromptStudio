import { validateReleaseNotes } from '../src/lib/releaseNotes.js';
// The installer may fail without quitting the app. Let the caller reopen its
// database on failure, but never start the installer with an open connection.
export function installUpdateAfterClosingDatabase(updater, database, onInstallError) {
  database.close();
  let handled = false;
  const failed = (error) => {
    if (handled) return;
    handled = true;
    updater.removeListener('error', failed);
    onInstallError(error);
  };
  updater.once('error', failed);
  try {
    updater.quitAndInstall(false, true);
  } catch (error) {
    failed(error);
  }
}

export function getUpdateCapabilities(platform, packaged, macAutomaticUpdates = false) {
  const automaticUpdates =
    Boolean(packaged) && (platform === 'win32' || (platform === 'darwin' && macAutomaticUpdates));
  let manualUpdateReason = '';
  if (!packaged) manualUpdateReason = 'development';
  else if (platform === 'darwin' && !automaticUpdates) manualUpdateReason = 'unsigned-macos';
  else if (!automaticUpdates) manualUpdateReason = 'unsupported-platform';

  return {
    platform,
    updateMode: automaticUpdates ? 'automatic' : 'manual',
    canDownloadUpdate: automaticUpdates,
    canInstallUpdate: automaticUpdates,
    manualUpdateReason,
  };
}

export function compareVersions(left, right) {
  const parse = (value) =>
    String(value || '')
      .replace(/^v/i, '')
      .split(/[.+-]/)
      .slice(0, 3)
      .map((part) => Number(part) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) > (b[index] || 0) ? 1 : -1;
  }
  return 0;
}

export async function checkForUpdates(currentVersion, fetcher) {
  const response = await fetcher(
    'https://api.github.com/repos/LBEILC/NovelAIPromptStudio/releases/latest',
    {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'NovelAI-Prompt-Studio' },
    },
  );
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error(`GitHub Release 请求失败（${response.status}）`);
  }
  const release = await response.json();
  const version = String(release.tag_name || '').replace(/^v/i, '');
  if (!version) throw new Error('最新 Release 没有有效版本号');
  let structuredNotes = null;
  const asset = release.assets?.find((asset) => asset.name === 'release-notes.json');
  if (asset?.browser_download_url) {
    try {
      const url = new URL(asset.browser_download_url);
      if (
        url.protocol !== 'https:' ||
        url.hostname !== 'github.com' ||
        !url.pathname.startsWith('/LBEILC/NovelAIPromptStudio/releases/download/')
      )
        throw Error('Unexpected release asset URL');
      const response = await fetcher(url.href, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) {
        await response.body?.cancel();
        throw Error('Release notes unavailable');
      }
      const notes = validateReleaseNotes(await response.json());
      if (notes.version === version) structuredNotes = notes;
    } catch {
      /* An optional attachment must never prevent updating. */
    }
  }
  return {
    structuredNotes,
    checkedAt: new Date().toISOString(),
    currentVersion,
    latestVersion: version,
    hasUpdate: compareVersions(version, currentVersion) > 0,
    publishedAt: release.published_at || '',
    notes: String(release.body || '')
      .trim()
      .slice(0, 4_000),
    releaseUrl: String(
      release.html_url || 'https://github.com/LBEILC/NovelAIPromptStudio/releases/latest',
    ),
  };
}
