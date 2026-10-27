import { afterEach, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { copySecret } from './copySecret.js';
import { openPreferences } from './preferences.js';
import { validateCommand } from './commands/registry.js';

const roots = [];
afterEach(() =>
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true })),
);
function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-copy-secret-'));
  roots.push(root);
  const storage = {
    isEncryptionAvailable: () => true,
    encryptString: (s) => Buffer.from(s),
    decryptString: vi.fn((b) => b.toString()),
  };
  return {
    preferences: openPreferences(root, storage),
    storage,
    clipboard: { writeText: vi.fn() },
  };
}
const kinds = [
  ['novelai-token', '持久令牌', (p, s) => p.saveNovelAIToken(s)],
  [
    'relay-key',
    '中转站 Key',
    (p, s) => p.saveRelay({ baseUrl: 'https://synthetic.invalid', key: s }),
  ],
  ['ai-api-key', 'API Key', (p, s) => p.saveAISettings({ apiKey: s, provider: 'chatgpt' })],
];
it.each(kinds)('copies saved %s only to the main-process clipboard', (kind, _name, save) => {
  const { preferences, clipboard } = setup();
  save(preferences, 'synthetic-secret');
  expect(copySecret(kind, preferences, clipboard)).toEqual({ ok: true });
  expect(clipboard.writeText.mock.calls).toEqual([['synthetic-secret']]);
});
it.each(kinds)(
  'distinguishes missing and unreadable %s without leaking errors',
  (kind, name, save) => {
    const { preferences, clipboard, storage } = setup();
    expect(copySecret(kind, preferences, clipboard)).toEqual({
      ok: false,
      error: `还没有保存${name}`,
    });
    save(preferences, 'synthetic-secret');
    storage.decryptString.mockImplementation(() => {
      throw Error('synthetic-secret');
    });
    expect(copySecret(kind, preferences, clipboard)).toEqual({
      ok: false,
      error: `读不出已保存的${name}，请重新填写`,
    });
    expect(clipboard.writeText).not.toHaveBeenCalled();
  },
);
it('hides clipboard failure details and rejects invalid kinds', () => {
  const { preferences, clipboard } = setup();
  preferences.saveNovelAIToken('synthetic-secret');
  clipboard.writeText.mockImplementation(() => {
    throw Error('synthetic-secret');
  });
  expect(copySecret('novelai-token', preferences, clipboard)).toEqual({
    ok: false,
    error: '无法写入剪贴板，请重试',
  });
  expect(copySecret('unknown', preferences, clipboard).ok).toBe(false);
});
it.each(kinds)('forbids %s from the command-line source before reading credentials', (kind) => {
  expect(() => validateCommand('secret.copy', { kind }, 'agent')).toThrow(
    expect.objectContaining({ code: 'forbidden' }),
  );
  expect(validateCommand('secret.copy', { kind }, 'ui')).toBe('secret.copy');
});
