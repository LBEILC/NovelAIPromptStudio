import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { describe, expect, it, vi } from 'vitest';
import {
  checkForUpdates,
  compareVersions,
  getUpdateCapabilities,
  installUpdateAfterClosingDatabase,
} from './updates.js';

describe('database lifecycle during installation', () => {
  it('closes before invoking the installer and forwards its arguments', () => {
    const updater = new EventEmitter();
    const close = vi.fn();
    updater.quitAndInstall = vi.fn(() => expect(close).toHaveBeenCalledOnce());
    installUpdateAfterClosingDatabase(updater, { close }, vi.fn());
    expect(updater.quitAndInstall).toHaveBeenCalledWith(false, true);
  });

  it('requests recovery only once if installation emits an error and throws', () => {
    const updater = new EventEmitter();
    const failure = Error('installer unavailable');
    updater.quitAndInstall = () => {
      updater.emit('error', failure);
      throw failure;
    };
    const recover = vi.fn();
    installUpdateAfterClosingDatabase(updater, { close: vi.fn() }, recover);
    expect(recover).toHaveBeenCalledExactlyOnceWith(failure);
    expect(updater.listenerCount('error')).toBe(0);
  });

  it('does not invoke the installer if closing the database fails', () => {
    const updater = new EventEmitter();
    updater.quitAndInstall = vi.fn();
    expect(() =>
      installUpdateAfterClosingDatabase(
        updater,
        {
          close: () => {
            throw Error('close failed');
          },
        },
        vi.fn(),
      ),
    ).toThrow('close failed');
    expect(updater.quitAndInstall).not.toHaveBeenCalled();
  });
});

describe('release update checks', () => {
  it.each(
    ['win32', 'darwin', 'linux'].flatMap((platform) =>
      [false, true].flatMap((packaged) =>
        [false, true].map((signed) => [platform, packaged, signed]),
      ),
    ),
  )('capabilities for %s packaged=%s signed=%s', (platform, packaged, signed) => {
    const automatic = packaged && (platform === 'win32' || (platform === 'darwin' && signed));
    expect(getUpdateCapabilities(platform, packaged, signed)).toEqual({
      platform,
      updateMode: automatic ? 'automatic' : 'manual',
      canDownloadUpdate: automatic,
      canInstallUpdate: automatic,
      manualUpdateReason: !packaged
        ? 'development'
        : automatic
          ? ''
          : platform === 'darwin'
            ? 'unsigned-macos'
            : 'unsupported-platform',
    });
  });

  it('the installed updater refuses ARM-only metadata on Intel until x64 assets arrive', () => {
    const require = createRequire(import.meta.url);
    const { MacUpdater } = require('electron-updater/out/MacUpdater.js');
    const { findFile } = require('electron-updater/out/providers/Provider.js');
    const file = (arch) => ({
      url: new URL(`https://example.com/app-${arch}.zip`),
      info: { url: `app-${arch}.zip` },
    });
    const arm = file('arm64'),
      intel = file('x64');
    const pending = MacUpdater.filterFilesForArch([arm], false);
    expect(() => findFile(pending, 'zip', ['pkg', 'dmg'])).toThrow('No files provided');
    expect(
      findFile(MacUpdater.filterFilesForArch([arm, intel], false), 'zip', ['pkg', 'dmg']),
    ).toBe(intel);
    expect(findFile(MacUpdater.filterFilesForArch([arm, intel], true), 'zip', ['pkg', 'dmg'])).toBe(
      arm,
    );
  });

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
      json: async () => ({
        tag_name: 'v0.2.0',
        published_at: '2026-07-27T00:00:00Z',
        body: 'Changes',
        html_url: 'https://github.com/LBEILC/NovelAIPromptStudio/releases/tag/v0.2.0',
      }),
    }));
    expect(result).toMatchObject({
      currentVersion: '0.1.2',
      latestVersion: '0.2.0',
      hasUpdate: true,
      notes: 'Changes',
    });
  });
});

it('downloads the release attachment and falls back to Markdown when absent or invalid', async () => {
  const notes = { schema: 'nps-release-notes/1', version: '1.2.0', date: '2026-10-20', items: [] };
  const asset =
    'https://github.com/LBEILC/NovelAIPromptStudio/releases/download/v1.2.0/release-notes.json';
  const release = {
    tag_name: 'v1.2.0',
    body: '# Markdown',
    assets: [{ name: 'release-notes.json', browser_download_url: asset }],
  };
  for (const attachment of [notes, { ...notes, schema: 'unknown' }, null]) {
    const fetcher = vi.fn(async (url) => ({
      ok: true,
      json: async () => (url === asset ? attachment : release),
    }));
    const result = await checkForUpdates('1.0.0', fetcher);
    expect(result.notes).toBe('# Markdown');
    expect(result.structuredNotes).toEqual(attachment === notes ? notes : null);
    expect(fetcher).toHaveBeenCalledTimes(2);
  }
  const failed = await checkForUpdates('1.0.0', async (url) => {
    if (url === asset) throw Error('offline');
    return { ok: true, json: async () => release };
  });
  expect(failed.structuredNotes).toBeNull();
  expect(failed.notes).toBe('# Markdown');
});
