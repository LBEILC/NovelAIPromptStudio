import fs from 'node:fs';
import path from 'node:path';
import { DEFAULT_BASE_URL, normalizeBaseUrl } from './translation.js';

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
      hasApiKey: Boolean(preferences.aiApiKeyEncrypted),
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
    };
  };

  const credentials = () => ({ ...publicSettings(), apiKey: decryptKey(read()) });

  const saveAISettings = ({ baseUrl, model, apiKey, clearApiKey = false }) => {
    const preferences = read();
    preferences.aiBaseUrl = normalizeBaseUrl(baseUrl);
    preferences.aiModel = String(model || '').trim();
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

  return { publicSettings, credentials, saveAISettings, filePath };
}
