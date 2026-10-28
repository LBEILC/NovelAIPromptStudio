import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { openPreferences } from './preferences.js';

const temporaryDirectories = [];
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`encrypted:${value}`),
  decryptString: (value) => value.toString().replace(/^encrypted:/, ''),
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0))
    fs.rmSync(directory, { recursive: true, force: true });
});

describe('AI preferences', () => {
  it('persists independent network settings and rejects invalid stored configuration', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-preferences-'));
    temporaryDirectories.push(directory);
    const preferences = openPreferences(directory, safeStorage);
    expect(preferences.networkSettings()).toEqual({ mode: 'system' });
    preferences.saveAISettings({
      provider: 'apiKey',
      baseUrl: 'https://example.com/v1',
      apiKey: 'synthetic',
    });
    const next = { mode: 'manual', protocol: 'socks5', host: 'localhost', port: 1080 };
    preferences.saveNetworkSettings(next);
    expect(openPreferences(directory, safeStorage).networkSettings()).toEqual(next);
    expect(preferences.credentials().apiKey).toBe('synthetic');
    expect(preferences.credentials().baseUrl).toBe('https://example.com/v1');
    expect(() => preferences.saveNetworkSettings({ ...next, host: 'remote.invalid' })).toThrow();
    expect(preferences.networkSettings()).toEqual(next);
    const file = path.join(directory, 'preferences.json');
    const stored = JSON.parse(fs.readFileSync(file, 'utf8'));
    fs.writeFileSync(file, JSON.stringify({ ...stored, network: { mode: 'broken' } }));
    expect(() => openPreferences(directory, safeStorage).networkSettings()).toThrow();
  });
  it.each([undefined, 'full', 'reduced', 'off'])(
    'preserves stored motion %s across unrelated appearance saves',
    (motion) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-preferences-'));
      temporaryDirectories.push(directory);
      const file = path.join(directory, 'preferences.json');
      fs.writeFileSync(file, JSON.stringify({ appearance: { motion } }));
      const preferences = openPreferences(directory, safeStorage);
      expect(preferences.appearanceSettings().motion).toBe(motion ?? 'reduced');
      preferences.saveAppearanceSettings({ themeMode: 'dark' });
      expect(JSON.parse(fs.readFileSync(file, 'utf8')).appearance.motion).toBe(motion ?? 'reduced');
      expect(openPreferences(directory, safeStorage).appearanceSettings().motion).toBe(
        motion ?? 'reduced',
      );
    },
  );
  it('keeps legacy appearance choices and raw primary color while adding the prose font', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-preferences-'));
    temporaryDirectories.push(directory);
    fs.writeFileSync(
      path.join(directory, 'preferences.json'),
      JSON.stringify({
        appearance: {
          themeMode: 'dark',
          primaryColor: 'legacy-custom',
          sansFont: 'Arial',
          monoFont: 'Consolas',
        },
        aiModel: 'keep-model',
      }),
    );
    const preferences = openPreferences(directory, safeStorage);
    expect(preferences.appearanceSettings()).toMatchObject({
      themeMode: 'dark',
      sansFont: 'Arial',
      monoFont: 'Consolas',
      proseFont: 'Newsreader',
    });
    preferences.saveAppearanceSettings({ proseFont: 'Georgia' });
    const stored = JSON.parse(fs.readFileSync(preferences.filePath, 'utf8'));
    expect(stored.appearance).toMatchObject({
      primaryColor: 'legacy-custom',
      proseFont: 'Georgia',
      themeMode: 'dark',
    });
    expect(stored.aiModel).toBe('keep-model');
    expect(() => preferences.saveAppearanceSettings({ proseFont: 'Bad; Font' })).toThrow('不支持');
    const tokens = fs.readFileSync(new URL('../design/tokens.css', import.meta.url), 'utf8');
    expect(tokens.match(/--font-prose:\s*"([^"]+)"/)[1]).toBe('Newsreader');
  });
  it('never exposes the saved API key through public settings', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-preferences-'));
    temporaryDirectories.push(directory);
    const preferences = openPreferences(directory, safeStorage);
    preferences.saveAISettings({
      provider: 'apiKey',
      baseUrl: 'https://api.example.com/v1',
      model: 'qwen-plus',
      apiKey: 'top-secret',
    });

    expect(preferences.publicSettings()).toEqual(
      expect.objectContaining({
        baseUrl: 'https://api.example.com/v1',
        model: 'qwen-plus',
        hasApiKey: true,
      }),
    );
    expect(preferences.publicSettings()).not.toHaveProperty('apiKey');
    expect(preferences.credentials().apiKey).toBe('top-secret');
    expect(fs.readFileSync(preferences.filePath, 'utf8')).not.toContain('top-secret');
  });

  it('ignores legacy custom AI rules and keeps session credentials off disk', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-preferences-'));
    temporaryDirectories.push(directory);
    fs.writeFileSync(
      path.join(directory, 'preferences.json'),
      JSON.stringify({
        aiTranslationPrompt: 'legacy rule',
        aiClassificationPrompt: 'legacy category',
      }),
    );
    const unavailable = { ...safeStorage, isEncryptionAvailable: () => false };
    const preferences = openPreferences(directory, unavailable, { platform: 'win32' });
    expect(preferences.publicSettings()).not.toHaveProperty('translationPrompt');
    preferences.saveAISettings({
      provider: 'apiKey',
      baseUrl: 'https://api.example.com/v1',
      model: 'test',
      apiKey: 'session-only-secret',
    });
    expect(preferences.credentials().apiKey).toBe('session-only-secret');
    const stored = fs.readFileSync(preferences.filePath, 'utf8');
    expect(stored).not.toContain('session-only-secret');
    expect(stored).not.toContain('legacy rule');
    expect(
      openPreferences(directory, unavailable, { platform: 'win32' }).credentials().apiKey,
    ).toBe('');
  });

  it('persists validated cross-platform appearance preferences', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-preferences-'));
    temporaryDirectories.push(directory);
    const preferences = openPreferences(directory, safeStorage);

    expect(preferences.appearanceSettings()).toEqual({
      themeMode: 'auto',
      primaryColor: 'blue',
      sansFont: 'MiSans',
      monoFont: 'IBM Plex Mono',
      proseFont: 'Newsreader',
      motion: 'reduced',
    });
    expect(
      preferences.saveAppearanceSettings({
        themeMode: 'auto',
        primaryColor: 'purple',
        sansFont: 'Microsoft YaHei UI',
        monoFont: 'Cascadia Mono',
        motion: 'reduced',
      }),
    ).toEqual({
      themeMode: 'auto',
      primaryColor: 'purple',
      sansFont: 'Microsoft YaHei UI',
      monoFont: 'Cascadia Mono',
      proseFont: 'Newsreader',
      motion: 'reduced',
    });
    expect(() => preferences.saveAppearanceSettings({ sansFont: 'Bad; Font' })).toThrow('不支持');
    expect(() => preferences.saveAppearanceSettings({ monoFont: 'Bad "Font"' })).toThrow('不支持');
    expect(() => preferences.saveAppearanceSettings({ primaryColor: 'pink' })).toThrow('不支持');
  });

  it('migrates the previous fixed font option values', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-preferences-'));
    temporaryDirectories.push(directory);
    fs.writeFileSync(
      path.join(directory, 'preferences.json'),
      JSON.stringify({ appearance: { sansFont: 'harmony', monoFont: 'system-mono' } }),
    );

    expect(openPreferences(directory, safeStorage).appearanceSettings()).toMatchObject({
      sansFont: 'HarmonyOS Sans SC',
      monoFont: 'monospace',
    });
  });

  it('stores an absolute custom asset directory without moving the preferences database', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-preferences-'));
    temporaryDirectories.push(directory);
    const defaultAssetsDirectory = path.join(directory, 'default-assets');
    const customAssetsDirectory = path.join(directory, 'library on another drive');
    const preferences = openPreferences(directory, safeStorage, { defaultAssetsDirectory });

    expect(preferences.librarySettings()).toEqual({
      assetsDirectory: defaultAssetsDirectory,
      defaultAssetsDirectory,
      isDefault: true,
      trashAutoCleanup: false,
    });
    expect(preferences.saveLibrarySettings({ assetsDirectory: customAssetsDirectory })).toEqual({
      assetsDirectory: customAssetsDirectory,
      defaultAssetsDirectory,
      isDefault: false,
      trashAutoCleanup: false,
    });
    expect(JSON.parse(fs.readFileSync(preferences.filePath, 'utf8'))).toMatchObject({
      library: { assetsDirectory: customAssetsDirectory },
    });
    expect(() => preferences.saveLibrarySettings({ assetsDirectory: 'relative/assets' })).toThrow(
      '绝对路径',
    );
  });

  it('persists an existing absolute recent image directory and update preference', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-preferences-'));
    temporaryDirectories.push(directory);
    const recent = path.join(directory, '图片 (NovelAI)');
    fs.mkdirSync(recent);
    const preferences = openPreferences(directory, safeStorage);

    expect(
      preferences.saveProductivitySettings({
        recentImageDirectory: recent,
        autoCheckUpdates: false,
      }),
    ).toEqual({ recentImageDirectory: recent, autoCheckUpdates: false, closeAction: 'ask' });
    fs.rmSync(recent, { recursive: true });
    expect(preferences.productivitySettings()).toEqual({
      recentImageDirectory: '',
      autoCheckUpdates: false,
      closeAction: 'ask',
    });
    expect(() =>
      preferences.saveProductivitySettings({ recentImageDirectory: 'relative' }),
    ).toThrow('绝对路径');
  });
});

describe('removed bundled font compatibility', () => {
  const open = (appearance, systemFonts) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-font-migration-'));
    temporaryDirectories.push(directory);
    const file = path.join(directory, 'preferences.json');
    fs.writeFileSync(
      file,
      JSON.stringify({ appearance, aiModel: 'unchanged', library: { untouched: true } }),
    );
    return openPreferences(directory, safeStorage, { systemFonts });
  };
  it.each(['Geist', 'Geist Mono', 'HarmonyOS Sans SC', 'geist', 'geist-mono', 'harmony'])(
    'falls back by role for absent removed family %s without rewriting stored data',
    (family) => {
      const p = open({ sansFont: family, monoFont: family, proseFont: family }, []);
      const before = fs.readFileSync(p.filePath, 'utf8');
      expect(p.appearanceSettings()).toMatchObject({
        sansFont: 'MiSans',
        monoFont: 'IBM Plex Mono',
        proseFont: 'Newsreader',
      });
      expect(fs.readFileSync(p.filePath, 'utf8')).toBe(before);
    },
  );
  it.each(['Geist', 'Geist Mono', 'HarmonyOS Sans SC'])(
    'preserves %s when installed (case insensitive)',
    (family) => {
      const p = open({ sansFont: family, monoFont: family, proseFont: family }, [
        { family: family.toLowerCase() },
      ]);
      expect(p.appearanceSettings()).toMatchObject({
        sansFont: family,
        monoFont: family,
        proseFont: family,
      });
    },
  );
  it('preserves custom and generic choices even when absent, and unknown inventory', () => {
    expect(
      open(
        { sansFont: 'Custom Missing', monoFont: 'monospace', proseFont: 'Georgia' },
        [],
      ).appearanceSettings(),
    ).toMatchObject({ sansFont: 'Custom Missing', monoFont: 'monospace', proseFont: 'Georgia' });
    expect(open({ sansFont: 'Geist' }, undefined).appearanceSettings().sansFont).toBe('Geist');
  });
  it('only persists resolved font settings when the user saves appearance', () => {
    const p = open(
      { sansFont: 'Geist', monoFont: 'Geist Mono', primaryColor: 'legacy-custom' },
      [],
    );
    p.saveAppearanceSettings({ proseFont: 'Georgia' });
    const stored = JSON.parse(fs.readFileSync(p.filePath, 'utf8'));
    expect(stored).toMatchObject({
      aiModel: 'unchanged',
      library: { untouched: true },
      appearance: {
        sansFont: 'MiSans',
        monoFont: 'IBM Plex Mono',
        proseFont: 'Georgia',
        primaryColor: 'legacy-custom',
      },
    });
  });
});

describe('tray preferences', () => {
  it('reads old preferences without migration and persists close action while ignoring a legacy notice flag', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-tray-preferences-'));
    temporaryDirectories.push(directory);
    const file = path.join(directory, 'preferences.json');
    fs.writeFileSync(
      file,
      JSON.stringify({
        productivity: { autoCheckUpdates: false },
        untouched: 'keep',
        trayNoticeShown: true,
      }),
    );
    const p = openPreferences(directory, safeStorage);
    expect(p.productivitySettings().closeAction).toBe('ask');
    p.saveProductivitySettings({ closeAction: 'tray' });
    p.saveProductivitySettings({ autoCheckUpdates: true });
    const reopened = openPreferences(directory, safeStorage);
    expect(reopened.productivitySettings().closeAction).toBe('tray');
    expect(JSON.parse(fs.readFileSync(file, 'utf8')).untouched).toBe('keep');
    expect(reopened.productivitySettings()).not.toHaveProperty('trayNoticeShown');
    expect(() => p.saveProductivitySettings({ closeAction: 'invalid' })).toThrow();
  });
});

describe('secret store health', () => {
  const secrets = [
    [
      'token',
      (p) => p.novelAIToken(),
      (p) => p.saveNovelAIToken('synthetic-token'),
      (p) => p.generationSettings().officialTokenReadable,
    ],
    [
      'relay',
      (p) => p.relayKey(),
      (p) => p.saveRelay({ baseUrl: 'https://example.com', key: 'synthetic-relay' }),
      (p) => p.generationSettings().relayKeyReadable,
    ],
    [
      'api',
      (p) => p.aiApiKey(),
      (p) => p.saveAISettings({ apiKey: 'synthetic-api' }),
      (p) => p.publicSettings().apiKeyReadable,
    ],
    [
      'chatgpt',
      (p) => p.chatGPTRecord('official'),
      (p) => p.saveChatGPTRecord('official', { accessToken: 'synthetic-login' }),
      (p) => p.publicSettings().chatgpt.readable,
    ],
  ];
  it.each(['ok', 'denied', 'unreadable'])(
    '%s: all secrets, recovery and unchanged ciphertext',
    (state) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-secrets-'));
      temporaryDirectories.push(directory);
      const original = openPreferences(directory, safeStorage, { platform: 'darwin' });
      secrets.forEach(([, , save]) => save(original));
      const before = fs.readFileSync(original.filePath, 'utf8');
      let broken = state !== 'ok';
      const storage = {
        ...safeStorage,
        isEncryptionAvailable: () => state !== 'denied',
        decryptString: vi.fn((bytes) => {
          if (broken) throw Error('synthetic failure');
          return safeStorage.decryptString(bytes);
        }),
      };
      const p = openPreferences(directory, storage, { platform: 'darwin' });
      expect(p.generationSettings().secretStore).toBe(state);
      expect(p.publicSettings().secretStore).toBe(state);
      const probes = storage.decryptString.mock.calls.length;
      for (const [, read, save, readable] of secrets) {
        expect(readable(p)).toBe(state === 'ok');
        if (state === 'ok') expect(read(p)).toBeTruthy();
        else {
          try {
            read(p);
            throw Error('did not reject');
          } catch (error) {
            expect(error.code).toBe(`secret_${state}`);
          }
        }
        if (state === 'denied') expect(() => save(p)).toThrow('钥匙串没有允许');
      }
      expect(storage.decryptString.mock.calls.length).toBe(probes);
      expect(fs.readFileSync(original.filePath, 'utf8')).toBe(before);
      if (state === 'unreadable') {
        broken = false;
        for (const [, read, save, readable] of secrets) {
          save(p);
          expect(readable(p)).toBe(true);
          expect(read(p)).toBeTruthy();
        }
        expect(p.publicSettings().secretStore).toBe('ok');
      }
      const restarted = openPreferences(directory, safeStorage, { platform: 'darwin' });
      expect(restarted.publicSettings().secretStore).toBe('ok');
      secrets.forEach(([, read]) => expect(read(restarted)).toBeTruthy());
    },
  );
  it('isolates an unreadable secret and probes only changed ciphertext', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-secrets-'));
    temporaryDirectories.push(directory);
    const original = openPreferences(directory, safeStorage);
    secrets.forEach(([, , save]) => save(original));
    const decryptString = vi.fn((bytes) => {
      if (bytes.toString().includes('synthetic-relay')) throw Error('corrupt');
      return safeStorage.decryptString(bytes);
    });
    const p = openPreferences(directory, { ...safeStorage, decryptString });
    expect(p.generationSettings()).toMatchObject({
      secretStore: 'unreadable',
      officialTokenReadable: true,
      relayKeyReadable: false,
    });
    expect(p.publicSettings()).toMatchObject({ apiKeyReadable: true, chatgpt: { readable: true } });
    p.saveAppearanceSettings({ themeMode: 'dark' });
    p.publicSettings();
    p.generationSettings();
    expect(decryptString).toHaveBeenCalledTimes(4);
    p.saveNovelAIToken('replacement');
    p.publicSettings();
    p.generationSettings();
    expect(decryptString).toHaveBeenCalledTimes(5);
  });
  it.each(['win32', 'linux'])('keeps the session API key fallback on %s', (platform) => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-secrets-'));
    temporaryDirectories.push(directory);
    const p = openPreferences(
      directory,
      { ...safeStorage, isEncryptionAvailable: () => false },
      { platform },
    );
    p.saveAISettings({ apiKey: 'session-only' });
    expect(p.aiApiKey()).toBe('session-only');
    expect(p.publicSettings()).toMatchObject({ secretStore: 'ok', encryptionAvailable: false });
    expect(() => p.saveNovelAIToken('synthetic')).toThrow('当前系统无法安全加密');
  });
  it.each(['official', 'codex'])(
    'checks the %s login even when the other mode is selected',
    (mode) => {
      const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-secrets-'));
      temporaryDirectories.push(directory);
      const p = openPreferences(directory, safeStorage);
      p.saveChatGPTRecord(mode, { accessToken: 'synthetic-login' });
      const broken = openPreferences(directory, {
        ...safeStorage,
        decryptString: () => {
          throw Error('corrupt');
        },
      });
      expect(broken.publicSettings().secretStore).toBe('unreadable');
      expect(() => broken.chatGPTRecord(mode)).toThrow(
        expect.objectContaining({ code: 'secret_unreadable' }),
      );
      broken.clearChatGPTRecord(mode);
      expect(broken.publicSettings().secretStore).toBe('ok');
    },
  );
});
