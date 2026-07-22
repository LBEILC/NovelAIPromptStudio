import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_BASE_URL, DEFAULT_CLASSIFICATION_PROMPT, DEFAULT_TRANSLATION_PROMPT, normalizeBaseUrl } from './translation.js';

const APPEARANCE_DEFAULTS = Object.freeze({ themeMode: 'dark', primaryColor: 'blue', sansFont: 'geist', monoFont: 'geist-mono', motion: 'full' });
const APPEARANCE_VALUES = {
  themeMode: new Set(['auto', 'dark', 'light']),
  primaryColor: new Set(['blue', 'cyan', 'geekblue', 'gold', 'green', 'lime', 'magenta', 'orange', 'purple', 'red', 'volcano', 'yellow']),
  sansFont: new Set(['geist', 'harmony', 'system']),
  monoFont: new Set(['geist-mono', 'system-mono']),
  motion: new Set(['full', 'reduced', 'off']),
};

export function openPreferences(dataDirectory, safeStorage) {
  const filePath = path.join(dataDirectory, 'preferences.json');

  const read = () => {
    try {
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return {};
    }
  };

  const write = (preferences) => {
    const temporaryPath = `${filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(preferences, null, 2));
    fs.renameSync(temporaryPath, filePath);
  };

  const decryptKey = (preferences) => {
    if (!preferences.aiApiKeyEncrypted) return '';
    try {
      return safeStorage.decryptString(Buffer.from(preferences.aiApiKeyEncrypted, 'base64'));
    } catch {
      throw new Error('无法解密已保存的 API Key，请重新保存');
    }
  };

  const publicSettings = () => {
    const preferences = read();
    return {
      baseUrl: preferences.aiBaseUrl || DEFAULT_BASE_URL,
      model: preferences.aiModel || '',
      translationPrompt: preferences.aiTranslationPrompt || DEFAULT_TRANSLATION_PROMPT,
      classificationPrompt: preferences.aiClassificationPrompt || DEFAULT_CLASSIFICATION_PROMPT,
      defaultPrompts: {
        translation: DEFAULT_TRANSLATION_PROMPT,
        classification: DEFAULT_CLASSIFICATION_PROMPT,
      },
      hasApiKey: Boolean(preferences.aiApiKeyEncrypted),
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
    };
  };

  const credentials = () => ({ ...publicSettings(), apiKey: decryptKey(read()) });

  const appearanceSettings = () => {
    const stored = read().appearance || {};
    return Object.fromEntries(Object.entries(APPEARANCE_DEFAULTS).map(([key, fallback]) => [
      key,
      APPEARANCE_VALUES[key].has(stored[key]) ? stored[key] : fallback,
    ]));
  };

  const saveAppearanceSettings = (next = {}) => {
    const current = appearanceSettings();
    const appearance = { ...current };
    for (const key of Object.keys(APPEARANCE_DEFAULTS)) {
      if (next[key] === undefined) continue;
      if (!APPEARANCE_VALUES[key].has(next[key])) throw new Error(`不支持的外观设置：${key}`);
      appearance[key] = next[key];
    }
    const stored = read();
    stored.appearance = appearance;
    write(stored);
    return appearanceSettings();
  };

  const saveAISettings = ({ baseUrl, model, apiKey, translationPrompt, classificationPrompt, clearApiKey = false }) => {
    const preferences = read();
    preferences.aiBaseUrl = normalizeBaseUrl(baseUrl);
    preferences.aiModel = String(model || '').trim();
    const nextTranslationPrompt = String(translationPrompt || '').trim() || DEFAULT_TRANSLATION_PROMPT;
    const nextClassificationPrompt = String(classificationPrompt || '').trim() || DEFAULT_CLASSIFICATION_PROMPT;
    if (nextTranslationPrompt === DEFAULT_TRANSLATION_PROMPT) delete preferences.aiTranslationPrompt;
    else preferences.aiTranslationPrompt = nextTranslationPrompt;
    if (nextClassificationPrompt === DEFAULT_CLASSIFICATION_PROMPT) delete preferences.aiClassificationPrompt;
    else preferences.aiClassificationPrompt = nextClassificationPrompt;
    if (clearApiKey) delete preferences.aiApiKeyEncrypted;
    if (typeof apiKey === 'string' && apiKey.trim()) {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('当前系统无法安全加密 API Key');
      preferences.aiApiKeyEncrypted = safeStorage.encryptString(apiKey.trim()).toString('base64');
    }
    delete preferences.translationProvider;
    delete preferences.deepLKeyEncrypted;
    write(preferences);
    return publicSettings();
  };

  return { publicSettings, credentials, saveAISettings, appearanceSettings, saveAppearanceSettings, filePath };
}
