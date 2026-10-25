import { portablePreferences, mergePortablePreferences } from './backup.js';
import { MODEL_ORDER } from '../src/shared/params.ts';
import fs from 'node:fs';
import { normalizeRelayUrl } from './relay.js';
import { normalizeNetworkSettings } from './network.js';
import path from 'node:path';
import { DEFAULT_BASE_URL, normalizeBaseUrl } from './translation.js';

const APPEARANCE_DEFAULTS = Object.freeze({
  themeMode: 'auto',
  primaryColor: 'blue',
  sansFont: 'MiSans',
  monoFont: 'IBM Plex Mono',
  proseFont: 'Newsreader',
  motion: 'reduced',
});
const APPEARANCE_VALUES = {
  themeMode: new Set(['auto', 'dark', 'light']),
  primaryColor: new Set([
    'blue',
    'cyan',
    'geekblue',
    'gold',
    'green',
    'lime',
    'magenta',
    'orange',
    'purple',
    'red',
    'volcano',
    'yellow',
  ]),
  motion: new Set(['full', 'reduced', 'off']),
};
const LEGACY_FONT_FAMILIES = new Map([
  ['geist', 'Geist'],
  ['harmony', 'HarmonyOS Sans SC'],
  ['system', 'system-ui'],
  ['geist-mono', 'Geist Mono'],
  ['system-mono', 'monospace'],
]);

function normalizeFontFamily(value, fallback, strict = false) {
  const candidate =
    LEGACY_FONT_FAMILIES.get(String(value || '').trim()) || String(value || '').trim();
  if (!candidate) return fallback;
  if (candidate.length > 128 || /[\u0000-\u001f\u007f"\\;{}]/.test(candidate)) {
    if (strict) throw new Error('不支持的字体名称');
    return fallback;
  }
  return candidate;
}

function normalizeAssetsDirectory(value, fallback, strict = false) {
  const candidate = String(value || '').trim();
  if (!candidate) return fallback;
  if (candidate.length > 4096 || candidate.includes('\u0000') || !path.isAbsolute(candidate)) {
    if (strict) throw new Error('资源库位置必须是有效的绝对路径');
    return fallback;
  }
  return path.resolve(candidate);
}

function normalizeRecentImageDirectory(value, strict = false) {
  const candidate = String(value || '').trim();
  if (!candidate) return '';
  if (candidate.length > 4096 || candidate.includes('\u0000') || !path.isAbsolute(candidate)) {
    if (strict) throw new Error('最近图片目录必须是有效的绝对路径');
    return '';
  }
  const resolved = path.resolve(candidate);
  try {
    return fs.statSync(resolved).isDirectory() ? resolved : '';
  } catch {
    return '';
  }
}

export function openPreferences(dataDirectory, safeStorage, options = {}) {
  const filePath = path.join(dataDirectory, 'preferences.json');
  const existedAtStartup = fs.existsSync(filePath);
  let sessionApiKey = '';
  let chatGPT;
  const defaultAssetsDirectory = path.resolve(
    options.defaultAssetsDirectory || path.join(dataDirectory, '..', 'assets'),
  );

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
    if (sessionApiKey) return sessionApiKey;
    if (!preferences.aiApiKeyEncrypted) return '';
    try {
      return safeStorage.decryptString(Buffer.from(preferences.aiApiKeyEncrypted, 'base64'));
    } catch {
      throw new Error('无法解密已保存的 API Key，请重新保存');
    }
  };

  const publicSettings = () => {
    const preferences = read();
    const mode = preferences.codexMode ? 'codex' : 'official';
    const account = chatGPTRecord(mode);
    return {
      baseUrl: preferences.aiBaseUrl || DEFAULT_BASE_URL,
      model: preferences.aiModel || '',
      hasApiKey: Boolean(sessionApiKey || preferences.aiApiKeyEncrypted),
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
      provider:
        preferences.aiProvider ||
        (sessionApiKey || preferences.aiApiKeyEncrypted ? 'apiKey' : 'chatgpt'),
      chatgpt: {
        mode,
        signedIn: Boolean(account.accessToken),
        email: account.email || null,
        model: account.model || '',
        introShown: Boolean(preferences.chatGPTIntroShown),
        quota: account.quota || null,
        limited: account.limited || null,
      },
    };
  };

  const credentials = () => {
    const settings = publicSettings();
    if (settings.provider === 'chatgpt')
      return { ...settings, model: settings.chatgpt.model, chatGPT };
    return { ...settings, apiKey: decryptKey(read()) };
  };

  function chatGPTRecord(mode) {
    const encrypted = read().chatGPTEncrypted?.[mode];
    if (!encrypted) return {};
    try {
      return JSON.parse(safeStorage.decryptString(Buffer.from(encrypted, 'base64')));
    } catch {
      return {};
    }
  }
  function saveChatGPTRecord(mode, record) {
    if (!['official', 'codex'].includes(mode)) throw new Error('登录方式无效');
    if (!safeStorage.isEncryptionAvailable()) throw new Error('当前系统无法安全加密登录令牌');
    const encrypted = safeStorage.encryptString(JSON.stringify(record)).toString('base64');
    const stored = read();
    stored.chatGPTEncrypted = { ...stored.chatGPTEncrypted, [mode]: encrypted };
    write(stored);
  }

  const resolveFont = (value, fallback) => {
    const family = normalizeFontFamily(value, fallback);
    // Failed enumeration is unknown, not proof of absence.
    const installed = options.systemFonts;
    if (
      Array.isArray(installed) &&
      ['geist', 'geist mono', 'harmonyos sans sc'].includes(family.toLowerCase()) &&
      !installed.some((font) => font.family.toLowerCase() === family.toLowerCase())
    )
      return fallback;
    return family;
  };
  const appearanceSettings = () => {
    const stored = read().appearance || {};
    return {
      themeMode: APPEARANCE_VALUES.themeMode.has(stored.themeMode)
        ? stored.themeMode
        : APPEARANCE_DEFAULTS.themeMode,
      primaryColor: APPEARANCE_VALUES.primaryColor.has(stored.primaryColor)
        ? stored.primaryColor
        : APPEARANCE_DEFAULTS.primaryColor,
      sansFont: resolveFont(stored.sansFont, APPEARANCE_DEFAULTS.sansFont),
      monoFont: resolveFont(stored.monoFont, APPEARANCE_DEFAULTS.monoFont),
      proseFont: resolveFont(stored.proseFont, APPEARANCE_DEFAULTS.proseFont),
      motion: APPEARANCE_VALUES.motion.has(stored.motion)
        ? stored.motion
        : APPEARANCE_DEFAULTS.motion,
    };
  };

  const saveAppearanceSettings = (next = {}) => {
    const current = appearanceSettings();
    const appearance = { ...current };
    for (const key of Object.keys(APPEARANCE_DEFAULTS)) {
      if (next[key] === undefined) continue;
      if (key === 'sansFont' || key === 'monoFont' || key === 'proseFont')
        appearance[key] = normalizeFontFamily(next[key], current[key], true);
      else {
        if (!APPEARANCE_VALUES[key].has(next[key])) throw new Error(`不支持的外观设置：${key}`);
        appearance[key] = next[key];
      }
    }
    const stored = read();
    // Removing the UI setting must not erase a previously saved theme color.
    const previous = stored.appearance || {};
    stored.appearance = { ...previous, ...appearance };
    if (Object.hasOwn(previous, 'primaryColor') && !Object.hasOwn(next, 'primaryColor'))
      stored.appearance.primaryColor = previous.primaryColor;
    write(stored);
    return appearanceSettings();
  };

  const saveAISettings = (next = {}) => {
    const {
      baseUrl,
      model,
      apiKey,
      clearApiKey = false,
      provider,
      codexMode,
      chatgptModel,
      introShown,
    } = next;
    const preferences = read();
    if (!preferences.aiProvider) preferences.aiProvider = publicSettings().provider;
    if (provider !== undefined) {
      if (!['apiKey', 'chatgpt'].includes(provider)) throw new Error('AI 服务类型无效');
      preferences.aiProvider = provider;
    }
    if (baseUrl !== undefined) preferences.aiBaseUrl = normalizeBaseUrl(baseUrl);
    if (model !== undefined) preferences.aiModel = String(model || '').trim();
    if (codexMode !== undefined) {
      preferences.codexMode = Boolean(codexMode);
      if (!codexMode && preferences.chatGPTEncrypted) delete preferences.chatGPTEncrypted.codex;
    }
    if (introShown === true) preferences.chatGPTIntroShown = true;
    delete preferences.aiTranslationPrompt;
    delete preferences.aiClassificationPrompt;
    if (clearApiKey) {
      sessionApiKey = '';
      delete preferences.aiApiKeyEncrypted;
    }
    if (typeof apiKey === 'string' && apiKey.trim()) {
      if (!safeStorage.isEncryptionAvailable()) {
        sessionApiKey = apiKey.trim();
        delete preferences.aiApiKeyEncrypted;
      } else {
        preferences.aiApiKeyEncrypted = safeStorage.encryptString(apiKey.trim()).toString('base64');
        sessionApiKey = '';
      }
    }
    delete preferences.translationProvider;
    delete preferences.deepLKeyEncrypted;
    write(preferences);
    if (chatgptModel !== undefined) {
      const mode = preferences.codexMode ? 'codex' : 'official';
      saveChatGPTRecord(mode, { ...chatGPTRecord(mode), model: String(chatgptModel).trim() });
    }
    chatGPT?.settingsChanged(next);
    return publicSettings();
  };

  const librarySettings = () => {
    const stored = read().library || {};
    const assetsDirectory = normalizeAssetsDirectory(
      stored.assetsDirectory,
      defaultAssetsDirectory,
    );
    return {
      assetsDirectory,
      defaultAssetsDirectory,
      isDefault: assetsDirectory === defaultAssetsDirectory,
    };
  };

  const saveLibrarySettings = ({ assetsDirectory } = {}) => {
    const nextDirectory = normalizeAssetsDirectory(assetsDirectory, defaultAssetsDirectory, true);
    const stored = read();
    if (nextDirectory === defaultAssetsDirectory) delete stored.library;
    else stored.library = { assetsDirectory: nextDirectory };
    write(stored);
    return librarySettings();
  };

  const productivitySettings = () => {
    const stored = read().productivity || {};
    return {
      recentImageDirectory: normalizeRecentImageDirectory(stored.recentImageDirectory),
      autoCheckUpdates: stored.autoCheckUpdates !== false,
      closeAction: ['ask', 'tray', 'quit'].includes(stored.closeAction)
        ? stored.closeAction
        : 'ask',
    };
  };

  const saveProductivitySettings = (next = {}) => {
    const current = productivitySettings();
    const productivity = { ...current };
    if (next.recentImageDirectory !== undefined) {
      productivity.recentImageDirectory = normalizeRecentImageDirectory(
        next.recentImageDirectory,
        Boolean(next.recentImageDirectory),
      );
    }
    if (next.autoCheckUpdates !== undefined)
      productivity.autoCheckUpdates = Boolean(next.autoCheckUpdates);
    if (next.closeAction !== undefined) {
      if (!['ask', 'tray', 'quit'].includes(next.closeAction)) throw new Error('无效的关闭行为');
      productivity.closeAction = next.closeAction;
    }
    const stored = read();
    stored.productivity = productivity;
    write(stored);
    return productivitySettings();
  };

  return {
    backup: () => portablePreferences(read()),
    restoreBackup: (value) => write(mergePortablePreferences(read(), value)),
    onboardingSettings: (hasExistingData = () => false) => {
      const stored = read();
      if (typeof stored.onboardingDone !== 'boolean') {
        stored.onboardingDone = Boolean(
          existedAtStartup || stored.novelAITokenEncrypted || hasExistingData(),
        );
        write(stored);
      }
      return { show: !stored.onboardingDone };
    },
    completeOnboarding: () => {
      const stored = read();
      if (stored.onboardingDone !== true) write({ ...stored, onboardingDone: true });
      return {};
    },
    novelAIToken: () => {
      const value = read().novelAITokenEncrypted;
      if (!value) return '';
      try {
        return safeStorage.decryptString(Buffer.from(value, 'base64'));
      } catch {
        throw new Error('无法解密已保存的持久令牌，请重新保存');
      }
    },
    saveNovelAIToken: (token) => {
      if (!safeStorage.isEncryptionAvailable()) throw new Error('当前系统无法安全加密持久令牌');
      const stored = read();
      stored.novelAITokenEncrypted = safeStorage.encryptString(token).toString('base64');
      write(stored);
    },
    relayKey: () => {
      const value = read().relayKeyEncrypted;
      if (!value) return '';
      try {
        return safeStorage.decryptString(Buffer.from(value, 'base64'));
      } catch {
        throw new Error('无法解密已保存的中转站 Key，请重新保存');
      }
    },
    saveRelay: ({ baseUrl, key, models }) => {
      const stored = read();
      stored.relayBaseUrl = normalizeRelayUrl(baseUrl);
      if (key !== undefined) {
        if (!safeStorage.isEncryptionAvailable()) throw new Error('当前系统无法安全加密 Key');
        stored.relayKeyEncrypted = safeStorage.encryptString(key.trim()).toString('base64');
      }
      stored.relayModels = models ?? null;
      write(stored);
    },
    saveConnection: (connection) => {
      if (!['official', 'relay'].includes(connection)) throw new Error('连接方式无效');
      write({ ...read(), generationConnection: connection });
    },
    generationSettings: () => ({
      blankModel: 'last',
      connection: read().generationConnection || 'official',
      officialToken: !!read().novelAITokenEncrypted,
      relay: {
        baseUrl: read().relayBaseUrl || '',
        hasKey: !!read().relayKeyEncrypted,
        models: read().relayModels ?? null,
      },
      dailyImageLimit: 200,
      hasToken: !!(read().generationConnection === 'relay'
        ? read().relayKeyEncrypted
        : read().novelAITokenEncrypted),
      continuous: false,
      agentMode: 'confirm',
      limitEnabled: false,
      dailyLimit: 100,
      ...(read().generation || {}),
    }),
    saveGenerationSettings: (next) => {
      if (
        next.dailyImageLimit !== undefined &&
        (!Number.isSafeInteger(next.dailyImageLimit) || next.dailyImageLimit < 0)
      )
        throw new Error('每日张数上限无效');
      if (next.blankModel !== undefined && !['last', ...MODEL_ORDER].includes(next.blankModel))
        throw new Error('模型无效');
      const stored = read();
      stored.generation = { ...(stored.generation || {}), ...next };
      write(stored);
    },
    networkSettings: () => normalizeNetworkSettings(read().network),
    saveNetworkSettings: (value) => {
      const settings = normalizeNetworkSettings(value);
      write({ ...read(), network: settings });
      return settings;
    },
    publicSettings,
    chatGPTRecord,
    saveChatGPTRecord,
    clearChatGPTRecord: (mode) => {
      const old = chatGPTRecord(mode),
        stored = read();
      if (old.clientId || old.hostId) {
        saveChatGPTRecord(mode, {
          clientId: old.clientId,
          hostId: old.hostId,
          sub: old.sub,
          issuer: old.issuer,
        });
      } else if (stored.chatGPTEncrypted) {
        delete stored.chatGPTEncrypted[mode];
        write(stored);
      }
    },
    attachChatGPT: (service) => {
      chatGPT = service;
    },
    credentials,
    saveAISettings,
    appearanceSettings,
    saveAppearanceSettings,
    librarySettings,
    saveLibrarySettings,
    productivitySettings,
    saveProductivitySettings,
    filePath,
  };
}
