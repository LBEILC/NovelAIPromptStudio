import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  checkForUpdates,
  compareVersions,
  getUpdateCapabilities,
  installUpdateAfterClosingDatabase,
  transitionUpdateCheck,
} from './updates.js';

describe('rechecking updates', () => {
  const state = (phase) => ({
    phase,
    latestVersion: '2.0.0',
    hasUpdate: true,
    progress: phase === 'downloaded' ? 100 : 0,
    releaseUrl: 'https://example.com/v2',
    notes: 'X',
  });
  it.each(['available', 'downloaded'])('preserves %s on a network error', (phase) => {
    const before = state(phase);
    expect(transitionUpdateCheck(before, { error: 'offline' })).toEqual({
      ...before,
      error: 'offline',
    });
  });
  it.each(['available', 'downloaded'])('keeps %s when the same version is found', (phase) => {
    expect(
      transitionUpdateCheck(state(phase), { hasUpdate: true, latestVersion: '2.0.0' }),
    ).toMatchObject({ phase, latestVersion: '2.0.0', error: '' });
  });
  it.each(['available', 'downloaded'])(
    'replaces %s with the newer version and release page',
    (phase) => {
      expect(
        transitionUpdateCheck(state(phase), {
          hasUpdate: true,
          latestVersion: '2.0.1',
          releaseUrl: 'https://example.com/vY',
        }),
      ).toMatchObject({
        phase: 'available',
        latestVersion: '2.0.1',
        progress: 0,
        releaseUrl: 'https://example.com/vY',
      });
    },
  );
  it('never changes a download in progress', () => {
    const before = state('downloading');
    for (const result of [{ error: 'offline' }, { hasUpdate: true, latestVersion: '2.0.1' }])
      expect(transitionUpdateCheck(before, result)).toBe(before);
  });
  it('supports initial checks, no update and initial errors', () => {
    expect(transitionUpdateCheck({ phase: 'idle' }, { error: 'offline' }).phase).toBe('error');
    expect(
      transitionUpdateCheck({ phase: 'idle' }, { hasUpdate: true, latestVersion: '2.0.0' }).phase,
    ).toBe('available');
    expect(
      transitionUpdateCheck({ phase: 'idle' }, { hasUpdate: false, latestVersion: '1.0.0' }).phase,
    ).toBe('current');
  });

  it('the installed updater downloads Y after X and passes Y to installation', async () => {
    const require = createRequire(import.meta.url);
    const { BaseUpdater } = require('electron-updater/out/BaseUpdater.js');
    const { DownloadedUpdateHelper } = require('electron-updater/out/DownloadedUpdateHelper.js');
    const root = await mkdtemp(path.join(os.tmpdir(), 'update-recheck-'));
    const updater = new BaseUpdater(null, { version: '1.0.0', isPackaged: true });
    updater.logger = { info() {}, warn() {}, error() {} };
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.downloadedUpdateHelper = new DownloadedUpdateHelper(root);
    let version = '2.0.0';
    updater.getUpdateInfoAndProvider = async () => ({
      info: { version, files: [{ url: `app-${version}.exe`, sha512: version }] },
      provider: {
        resolveFiles: (info) =>
          info.files.map((file) => ({
            url: new URL(`https://example.com/${file.url}`),
            info: file,
          })),
      },
    });
    updater.doDownloadUpdate = (options) =>
      updater.executeDownload({
        fileExtension: 'exe',
        downloadUpdateOptions: options,
        fileInfo: options.updateInfoAndProvider.provider.resolveFiles(
          options.updateInfoAndProvider.info,
        )[0],
        task: (file) => writeFile(file, options.updateInfoAndProvider.info.version),
      });
    const installed = [];
    updater.doInstall = () => {
      installed.push(updater.installerPath);
      return true;
    };
    try {
      await updater.checkForUpdates();
      await updater.downloadUpdate();
      const first = updater.installerPath;
      await updater.checkForUpdates();
      expect(updater.installerPath).toBe(first);
      version = '2.0.1';
      await updater.checkForUpdates();
      expect(updater.updateInfoAndProvider.info.version).toBe(version);
      await updater.downloadUpdate();
      expect(updater.install()).toBe(true);
      expect(installed).toEqual([path.join(root, 'pending', 'app-2.0.1.exe')]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

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
