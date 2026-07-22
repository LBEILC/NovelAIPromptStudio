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

  it('persists editable translation and classification prompts', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-preferences-'));
    temporaryDirectories.push(directory);
    const preferences = openPreferences(directory, safeStorage);

    const defaults = preferences.publicSettings().defaultPrompts;
    expect(defaults.translation).toBeTruthy();
    expect(defaults.classification).toBeTruthy();
    expect(preferences.saveAISettings({
      baseUrl: 'https://api.example.com/v1',
      model: 'qwen-plus',
      translationPrompt: 'Translate with my glossary.',
      classificationPrompt: 'Classify using my taxonomy.',
    })).toEqual(expect.objectContaining({
      translationPrompt: 'Translate with my glossary.',
      classificationPrompt: 'Classify using my taxonomy.',
    }));

    const stored = JSON.parse(fs.readFileSync(preferences.filePath, 'utf8'));
    expect(stored).toMatchObject({
      aiTranslationPrompt: 'Translate with my glossary.',
      aiClassificationPrompt: 'Classify using my taxonomy.',
    });
  });

  it('persists validated cross-platform appearance preferences', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'nai-preferences-'));
    temporaryDirectories.push(directory);
    const preferences = openPreferences(directory, safeStorage);

    expect(preferences.appearanceSettings()).toEqual({ themeMode: 'dark', primaryColor: 'blue', fontFamily: 'sans', motion: 'full' });
    expect(preferences.saveAppearanceSettings({ themeMode: 'auto', primaryColor: 'purple', fontFamily: 'mono', motion: 'reduced' }))
      .toEqual({ themeMode: 'auto', primaryColor: 'purple', fontFamily: 'mono', motion: 'reduced' });
    expect(() => preferences.saveAppearanceSettings({ fontFamily: 'serif' })).toThrow('不支持');
    expect(() => preferences.saveAppearanceSettings({ primaryColor: 'pink' })).toThrow('不支持');
  });
});
