export function compareVersions(left, right) {
  const parse = (value) => String(value || '').replace(/^v/i, '').split(/[.+-]/).slice(0, 3).map((part) => Number(part) || 0);
  const a = parse(left);
  const b = parse(right);
  for (let index = 0; index < 3; index += 1) {
    if ((a[index] || 0) !== (b[index] || 0)) return (a[index] || 0) > (b[index] || 0) ? 1 : -1;
  }
  return 0;
}

export async function checkForUpdates(currentVersion, fetcher) {
  const response = await fetcher('https://api.github.com/repos/LBEILC/NovelAIPromptStudio/releases/latest', {
    headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'NovelAI-Prompt-Studio' },
  });
  if (!response.ok) throw new Error(`GitHub Release 请求失败（${response.status}）`);
  const release = await response.json();
  const version = String(release.tag_name || '').replace(/^v/i, '');
  if (!version) throw new Error('最新 Release 没有有效版本号');
  return {
    currentVersion,
    latestVersion: version,
    hasUpdate: compareVersions(version, currentVersion) > 0,
    publishedAt: release.published_at || '',
    notes: String(release.body || '').trim().slice(0, 4_000),
    releaseUrl: String(release.html_url || 'https://github.com/LBEILC/NovelAIPromptStudio/releases/latest'),
  };
}
