/** Copy only in the main process; neither the result nor errors contain credentials. */
export function copySecret(kind, preferences, clipboard) {
  const entries = {
    'novelai-token': ['持久令牌', () => preferences.novelAIToken()],
    'relay-key': ['中转站 Key', () => preferences.relayKey()],
    'ai-api-key': ['API Key', () => preferences.aiApiKey()],
  };
  const entry = entries[kind];
  if (!entry) return { ok: false, error: '无效的密钥类型' };
  const [name, read] = entry;
  let value;
  try {
    value = read();
  } catch {
    return { ok: false, error: `读不出已保存的${name}，请重新填写` };
  }
  if (!value) return { ok: false, error: `还没有保存${name}` };
  try {
    clipboard.writeText(value);
    return { ok: true };
  } catch {
    return { ok: false, error: '无法写入剪贴板，请重试' };
  }
}
