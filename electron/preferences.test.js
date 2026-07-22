import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openPreferences } from './preferences.js';

const temporaryDirectories = [];
const safeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`encrypted:${value}`),
  decryptString: (value) => value.toString().replace(/^encrypted:/, ''),
};

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) fs.rmSync(directory, { recursive: true, force: true });
});

describe('AI preferences', () => {
  it('never exposes the saved API key through public settings', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-preferences-'));
    temporaryDirectories.push(directory);
    const preferences = openPreferences(directory, safeStorage);
    preferences.saveAISettings({ baseUrl: 'https://api.example.com/v1', model: 'qwen-plus', apiKey: 'top-secret' });

    expect(preferences.publicSettings()).toEqual(expect.objectContaining({
      baseUrl: 'https://api.example.com/v1',
      model: 'qwen-plus',
      hasApiKey: true,
    }));
    expect(preferences.publicSettings()).not.toHaveProperty('apiKey');
    expect(preferences.credentials().apiKey).toBe('top-secret');
    expect(fs.readFileSync(preferences.filePath, 'utf8')).not.toContain('top-secret');
  });

  it('persists validated cross-platform appearance preferences', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-preferences-'));
    temporaryDirectories.push(directory);
    const preferences = openPreferences(directory, safeStorage);

    expect(preferences.appearanceSettings()).toEqual({ themeMode: 'dark', primaryColor: 'blue', fontScale: 'large', density: 'comfortable', motion: 'full' });
    expect(preferences.saveAppearanceSettings({ themeMode: 'auto', primaryColor: 'purple', fontScale: 'larger', motion: 'reduced' }))
      .toEqual({ themeMode: 'auto', primaryColor: 'purple', fontScale: 'larger', density: 'comfortable', motion: 'reduced' });
    expect(() => preferences.saveAppearanceSettings({ density: 'tiny' })).toThrow('不支持');
    expect(() => preferences.saveAppearanceSettings({ primaryColor: 'pink' })).toThrow('不支持');
  });
});
