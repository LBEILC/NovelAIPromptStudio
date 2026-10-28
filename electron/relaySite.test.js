import { expect, it, vi } from 'vitest';
import { relaySiteHandler } from './relaySite.js';
import { RELAY_PRESETS } from '../src/shared/relayPresets.ts';
import { resolveRelayEndpoints } from '../src/shared/relay.ts';
import { validateCommand } from './commands/registry.js';

it('opens only the selected preset site', async () => {
  const open = vi.fn().mockResolvedValue(undefined);
  for (const preset of RELAY_PRESETS) {
    expect(await relaySiteHandler(open)({ id: preset.id })).toEqual({ ok: true });
    expect(open).toHaveBeenLastCalledWith(preset.site);
  }
  expect(open).toHaveBeenCalledTimes(RELAY_PRESETS.length);
});

it('rejects unknown IDs and non-HTTPS sites without opening anything', async () => {
  const open = vi.fn();
  await expect(relaySiteHandler(open)({ id: 'unknown' })).rejects.toThrow('没有这个中转站');
  for (const site of ['http://example.test', 'file:///tmp/test', 'javascript:alert(1)']) {
    await expect(relaySiteHandler(open, [{ id: 'test', site }])({ id: 'test' })).rejects.toThrow(
      'HTTPS',
    );
  }
  expect(open).not.toHaveBeenCalled();
});

it('requires a UI caller and an ID, and rejects caller-supplied URLs', () => {
  const name = 'account.relay.open-site';
  expect(validateCommand(name, { id: RELAY_PRESETS[0].id }, 'ui')).toBe(name);
  expect(() => validateCommand(name, { id: 'test' }, 'agent')).toThrow();
  for (const input of [{}, { id: 1 }, { id: 'test', url: 'https://example.test' }]) {
    expect(() => validateCommand(name, input, 'ui')).toThrow();
  }
});

it('keeps preset addresses canonical, IDs unique and sites HTTPS', () => {
  expect(new Set(RELAY_PRESETS.map((preset) => preset.id)).size).toBe(RELAY_PRESETS.length);
  for (const preset of RELAY_PRESETS) {
    expect(resolveRelayEndpoints(preset.address).address).toBe(preset.address);
    expect(preset.site.startsWith('https://')).toBe(true);
  }
});
