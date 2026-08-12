import { describe, expect, it } from 'vitest';
import { checkForUpdates, compareVersions, getUpdateCapabilities } from './updates.js';

describe('release update checks', () => {
  it('uses automatic updates only where the packaged build can install them', () => {
    expect(getUpdateCapabilities('win32', true)).toMatchObject({
      updateMode: 'automatic',
      canDownloadUpdate: true,
      canInstallUpdate: true,
      manualUpdateReason: '',
    });
    expect(getUpdateCapabilities('darwin', true)).toMatchObject({
      updateMode: 'manual',
      canDownloadUpdate: false,
      canInstallUpdate: false,
      manualUpdateReason: 'unsigned-macos',
    });
    expect(getUpdateCapabilities('darwin', true, true)).toMatchObject({ updateMode: 'automatic' });
    expect(getUpdateCapabilities('win32', false)).toMatchObject({
      updateMode: 'manual',
      manualUpdateReason: 'development',
    });
  });

  it('compares stable semantic versions', () => {
    expect(compareVersions('v1.2.0', '1.1.9')).toBe(1);
    expect(compareVersions('1.2.0', '1.2.0')).toBe(0);
    expect(compareVersions('1.1.9', '1.2.0')).toBe(-1);
  });

  it('returns official release details without making update errors fatal', async () => {
    const result = await checkForUpdates('0.1.2', async () => ({
      ok: true,
      json: async () => ({ tag_name: 'v0.2.0', published_at: '2026-07-27T00:00:00Z', body: 'Changes', html_url: 'https://github.com/LBEILC/NovelAIPromptStudio/releases/tag/v0.2.0' }),
    }));
    expect(result).toMatchObject({ currentVersion: '0.1.2', latestVersion: '0.2.0', hasUpdate: true, notes: 'Changes' });
  });
});
