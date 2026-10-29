import { portablePreferences, mergePortablePreferences } from './backup.js';
import { MODEL_ORDER } from '../src/shared/params.ts';
import fs from 'node:fs';
import { DEFAULT_NSFW_TAGS, normalizeNsfwWords } from '../src/shared/nsfw.ts';
import { normalizeRelayUrl } from './relay.js';
import { relayPresetFor } from '../src/shared/relayPresets.ts';
import { normalizeNetworkSettings } from './network.js';
import path from 'node:path';
import { DEFAULT_BASE_URL, normalizeBaseUrl } from './translation.js';
import { CommandError } from './commands/registry.js';

export const SECRET_DENIED_MESSAGE =
  '钥匙串没有允许本软件读取已保存的密钥。退出并重新打开软件，系统询问时选"始终允许"。';
const SECRET_MESSAGES = {
  novelAITokenEncrypted: '已保存的持久令牌无法读取，请在"设置 → NovelAI 账号"里更换。',
  relayKeyEncrypted: '已保存的中转站 Key 无法读取，请在"设置 → NovelAI 账号"里更换。',
  aiApiKeyEncrypted: '已保存的 API Key 无法读取，请在"设置 → AI 服务"里重新填写。',
  // TODO(design): Confirm the command-side ChatGPT recovery copy.
  chatGPT: '已保存的 ChatGPT 登录信息无法读取，请在"设置 → AI 服务"里重新登录。',
};

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
  const secretCache = new Map();
  const lastQuotas = new Map();
  const platform = options.platform || process.platform;
  const denied = () => platform === 'darwin' && !safeStorage.isEncryptionAvailable();
  const assertSecretAccess = () => {
    if (denied()) throw new CommandError('secret_denied', SECRET_DENIED_MESSAGE);
  };
  const defaultAssetsDirectory = path.resolve(
    options.defaultAssetsDirectory || path.join(dataDirectory, '..', 'assets'),
  );

  const read = () => {
    let stored;
    try {
      stored = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch {
      return {};
    }
    if (stored.relayBaseUrl || stored.relayKeyEncrypted || stored.relayModels) {
      const id = relayPresetFor(stored.relayBaseUrl || '')?.id ?? 'custom';
      if (!stored.relaySlots) {
        stored.relaySlots = {
          [id]: {
            baseUrl: stored.relayBaseUrl || '',
            keyEncrypted: stored.relayKeyEncrypted,
            models: stored.relayModels ?? null,
          },
        };
        stored.relaySlot = id;
      }
      delete stored.relayBaseUrl;
      delete stored.relayKeyEncrypted;
      delete stored.relayModels;
      write(stored);
    }
    return stored;
  };

  const write = (preferences) => {
    const temporaryPath = `${filePath}.tmp`;
    fs.writeFileSync(temporaryPath, JSON.stringify(preferences, null, 2));
    fs.renameSync(temporaryPath, filePath);
  };

  function secretEntry(key, encrypted, json = false) {
    const cached = secretCache.get(key);
    if (cached && cached.encrypted === encrypted) return cached;
    const entry = { encrypted, value: json ? {} : '', readable: true };
    if (encrypted) {
      try {
        assertSecretAccess();
        const value = safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
        entry.value = json ? JSON.parse(value) : value;
        if (json && (!entry.value || typeof entry.value !== 'object' || Array.isArray(entry.value)))
          throw new Error('Invalid saved login');
      } catch {
        entry.readable = false;
        entry.value = json ? {} : '';
      }
    }
    secretCache.set(key, entry);
    return entry;
  }
  function readSecret(key, encrypted, json = false) {
    assertSecretAccess();
    const entry = secretEntry(key, encrypted, json);
    if (!entry.readable) {
      if (platform !== 'darwin' && !safeStorage.isEncryptionAvailable()) {
        if (json) return {};
        const name = {
          novelAITokenEncrypted: '持久令牌',
          relayKeyEncrypted: '中转站 Key',
          aiApiKeyEncrypted: 'API Key',
        }[key.startsWith('relay:') ? 'relayKeyEncrypted' : key];
        throw new Error(`无法解密已保存的${name === 'API Key' ? ' ' : ''}${name}，请重新保存`);
      }
      throw new CommandError(
        'secret_unreadable',
        SECRET_MESSAGES[json ? 'chatGPT' : key.startsWith('relay:') ? 'relayKeyEncrypted' : key],
      );
    }
    return json ? structuredClone(entry.value) : entry.value;
  }
  function secretStatus(preferences = read()) {
    const entries = Object.keys(SECRET_MESSAGES)
      .filter((key) => key !== 'chatGPT')
      .map((key) => secretEntry(key, preferences[key]));
    for (const mode of ['official', 'codex'])
      entries.push(secretEntry(`chatGPT:${mode}`, preferences.chatGPTEncrypted?.[mode], true));
    for (const [id, slot] of Object.entries(preferences.relaySlots || {}))
      entries.push(secretEntry(`relay:${id}`, slot.keyEncrypted));
    if (!safeStorage.isEncryptionAvailable()) return platform === 'darwin' ? 'denied' : 'ok';
    return entries.some((entry) => !entry.readable) ? 'unreadable' : 'ok';
  }
  const refreshSecretStore = () => {
    secretCache.clear();
    return secretStatus();
  };

  const decryptKey = (preferences) => {
    assertSecretAccess();
    if (sessionApiKey) return sessionApiKey;
    return readSecret('aiApiKeyEncrypted', preferences.aiApiKeyEncrypted);
  };

  const publicSettings = () => {
    const preferences = read();
    const mode = preferences.codexMode ? 'codex' : 'official';
    const secretStore = secretStatus(preferences);
    const login = secretEntry(`chatGPT:${mode}`, preferences.chatGPTEncrypted?.[mode], true);
    const account = login.value;
    return {
      baseUrl: preferences.aiBaseUrl || DEFAULT_BASE_URL,
      model: preferences.aiModel || '',
      hasApiKey: Boolean(sessionApiKey || preferences.aiApiKeyEncrypted),
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
      secretStore,
      apiKeyReadable:
        Boolean(sessionApiKey) ||
        secretEntry('aiApiKeyEncrypted', preferences.aiApiKeyEncrypted).readable,
      provider:
        preferences.aiProvider ||
        (sessionApiKey || preferences.aiApiKeyEncrypted ? 'apiKey' : 'chatgpt'),
      chatgpt: {
        readable: login.readable,
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
    return readSecret(`chatGPT:${mode}`, encrypted, true);
  }
  function saveChatGPTRecord(mode, record) {
    if (!['official', 'codex'].includes(mode)) throw new Error('登录方式无效');
    assertSecretAccess();
    if (!safeStorage.isEncryptionAvailable()) throw new Error('当前系统无法安全加密登录令牌');
    const encrypted = safeStorage.encryptString(JSON.stringify(record)).toString('base64');
    const stored = read();
    stored.chatGPTEncrypted = { ...stored.chatGPTEncrypted, [mode]: encrypted };
    write(stored);
    secretCache.delete(`chatGPT:${mode}`);
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
  /** @returns {import('../src/shared/types').BlurSettings} */
  const blurSettings = () => {
    const privacy = read().privacy || {};
    return {
      mode: ['off', 'nsfw', 'all'].includes(privacy.blurMode) ? privacy.blurMode : 'off',
      quickAll: privacy.blurQuickAll === true,
      words: Array.isArray(privacy.nsfwWords)
        ? normalizeNsfwWords(privacy.nsfwWords.filter((w) => typeof w === 'string'))
        : [...DEFAULT_NSFW_TAGS],
      defaultWords: [...DEFAULT_NSFW_TAGS],
    };
  };
  /** @param {Partial<import('../src/shared/types').BlurSettingsInput>} next */
  const saveBlurSettings = (next) => {
    const stored = read();
    const privacy = { ...stored.privacy };
    if (next.mode !== undefined) {
      if (!['off', 'nsfw', 'all'].includes(next.mode)) throw Error('Invalid blur mode');
      privacy.blurMode = next.mode;
    }
    if (next.quickAll !== undefined) {
      if (typeof next.quickAll !== 'boolean') throw Error('Invalid quickAll');
      privacy.blurQuickAll = next.quickAll;
    }
    if (next.words !== undefined) {
      if (!Array.isArray(next.words) || next.words.some((w) => typeof w !== 'string'))
        throw Error('Invalid words');
      privacy.nsfwWords = normalizeNsfwWords(next.words);
    }
    write({ ...stored, privacy });
    return blurSettings();
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
      assertSecretAccess();
      if (!safeStorage.isEncryptionAvailable()) {
        sessionApiKey = apiKey.trim();
        delete preferences.aiApiKeyEncrypted;
      } else {
        preferences.aiApiKeyEncrypted = safeStorage.encryptString(apiKey.trim()).toString('base64');
        secretCache.delete('aiApiKeyEncrypted');
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
      trashAutoCleanup: stored.trashAutoCleanup === true,
    };
  };

  const saveLibrarySettings = ({ assetsDirectory, trashAutoCleanup } = {}) => {
    const nextDirectory =
      assetsDirectory === undefined
        ? librarySettings().assetsDirectory
        : normalizeAssetsDirectory(assetsDirectory, defaultAssetsDirectory, true);
    const stored = read();
    stored.library = { ...stored.library, assetsDirectory: nextDirectory };
    if (trashAutoCleanup !== undefined) {
      if (typeof trashAutoCleanup !== 'boolean') throw new Error('自动清理设置无效');
      stored.library.trashAutoCleanup = trashAutoCleanup;
    }
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

  const relaySlot = () => read().relaySlot || 'custom';
  const relayRecord = (id = relaySlot()) => read().relaySlots?.[id] || {};
  const relayKey = (id = relaySlot()) => readSecret(`relay:${id}`, relayRecord(id).keyEncrypted);
  refreshSecretStore();
  return {
    refreshSecretStore,
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
      return {
        show: !stored.onboardingDone,
        seen: typeof stored.featuresSeen === 'string' ? stored.featuresSeen : null,
      };
    },
    completeOnboarding: (version) => {
      const stored = read();
      if (stored.onboardingDone !== true || stored.featuresSeen !== version)
        write({ ...stored, onboardingDone: true, featuresSeen: version });
      return {};
    },
    novelAIToken: () => {
      return readSecret('novelAITokenEncrypted', read().novelAITokenEncrypted);
    },
    saveNovelAIToken: (token) => {
      assertSecretAccess();
      if (!safeStorage.isEncryptionAvailable()) throw new Error('当前系统无法安全加密持久令牌');
      const stored = read();
      stored.novelAITokenEncrypted = safeStorage.encryptString(token).toString('base64');
      write(stored);
      secretCache.delete('novelAITokenEncrypted');
    },
    relayKey,
    switchRelay: (id) => {
      if (!relayRecord(id).keyEncrypted) throw new Error('这个中转站还没有保存 Key');
      relayKey(id);
      write({ ...read(), relaySlot: id });
    },
    setRelayQuota: (id, quota) => lastQuotas.set(id, quota),
    saveRelayModels: (id, baseUrl, key, models) => {
      const stored = read();
      const record = stored.relaySlots?.[id];
      if (!record || record.baseUrl !== baseUrl || relayKey(id) !== key) return;
      record.models = models;
      write(stored);
    },
    saveRelay: ({ baseUrl, key, models }) => {
      const stored = read();
      baseUrl = normalizeRelayUrl(baseUrl);
      const id = relayPresetFor(baseUrl)?.id ?? 'custom';
      const record = { ...stored.relaySlots?.[id], baseUrl, models: models ?? null };
      if (key !== undefined || stored.relaySlots?.[id]?.baseUrl !== baseUrl) lastQuotas.delete(id);
      if (key !== undefined) {
        assertSecretAccess();
        if (!safeStorage.isEncryptionAvailable()) throw new Error('当前系统无法安全加密 Key');
        record.keyEncrypted = safeStorage.encryptString(key.trim()).toString('base64');
        secretCache.delete(`relay:${id}`);
      }
      stored.relaySlots = { ...stored.relaySlots, [id]: record };
      stored.relaySlot = id;
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
        baseUrl: relayRecord().baseUrl || '',
        hasKey: !!relayRecord().keyEncrypted,
        models: relayRecord().models ?? null,
        slot: relaySlot(),
        slots: Object.entries(read().relaySlots || {}).map(([id, record]) => ({
          id,
          baseUrl: record.baseUrl,
          hasKey: !!record.keyEncrypted,
          readable: secretEntry(`relay:${id}`, record.keyEncrypted).readable,
        })),
        lastQuota: lastQuotas.get(relaySlot()) ?? null,
      },
      dailyImageLimit: 200,
      hasToken: !!(read().generationConnection === 'relay'
        ? relayRecord().keyEncrypted
        : read().novelAITokenEncrypted),
      continuous: false,
      agentMode: 'confirm',
      limitEnabled: false,
      dailyLimit: 100,
      ...(read().generation || {}),
      secretStore: secretStatus(),
      officialTokenReadable: secretEntry('novelAITokenEncrypted', read().novelAITokenEncrypted)
        .readable,
      relayKeyReadable: secretEntry(`relay:${relaySlot()}`, relayRecord().keyEncrypted).readable,
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
      assertSecretAccess();
      const old = secretEntry(`chatGPT:${mode}`, read().chatGPTEncrypted?.[mode], true).value,
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
    aiApiKey: () => decryptKey(read()),
    saveAISettings,
    blurSettings,
    saveBlurSettings,
    appearanceSettings,
    saveAppearanceSettings,
    librarySettings,
    saveLibrarySettings,
    productivitySettings,
    saveProductivitySettings,
    filePath,
  };
}
