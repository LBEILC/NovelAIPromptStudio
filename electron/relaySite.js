import { RELAY_PRESETS } from '../src/shared/relayPresets.ts';

export function relaySiteHandler(openExternal, presets = RELAY_PRESETS) {
  return async ({ id }) => {
    const preset = presets.find((entry) => entry.id === id);
    if (!preset) throw new Error('没有这个中转站');
    if (!preset.site.startsWith('https://')) throw new Error('中转站网站必须使用 HTTPS');
    await openExternal(preset.site);
    return { ok: true };
  };
}
