import fs from 'node:fs/promises';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { afterEach, expect, it, vi } from 'vitest';
import { configuration, main } from '../../agent/client.mjs';
import { validateCommand } from './registry.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function launchConfiguration() {
  vi.stubEnv('NAI_STUDIO_USER_DATA', '');
  vi.stubEnv('NAI_STUDIO_NO_LAUNCH', '');
  const base = path.resolve('.codex-runs', 'cli-test', 'NovelAI Prompt Studio');
  vi.spyOn(fs, 'readFile').mockResolvedValue(
    JSON.stringify({ userData: base, executable: 'test-application', args: ['test-app-root'] }),
  );
  return base;
}

it.each([['--profile=demo'], ['--profile', 'demo']])(
  'routes %j to the demo connection directory',
  async (...flags) => {
    const base = launchConfiguration();
    const connect = vi.fn(async (_config: object, _request: object) => ({ ok: true, data: {} }));
    await main(['app.status', ...flags], { connect });
    expect(connect.mock.calls[0][0]).toMatchObject({
      userData: path.join(path.dirname(base), 'NovelAI Prompt Studio-demo'),
      args: ['test-app-root', '--profile=demo'],
    });
  },
);

it.each([
  { flags: ['--profile=demo'], expected: ['test-app-root', '--profile=demo'] },
  { flags: ['--profile', 'demo'], expected: ['test-app-root', '--profile=demo'] },
  { flags: [], expected: ['test-app-root'] },
])('automatically starts with profile arguments $flags', async ({ flags, expected }) => {
  launchConfiguration();
  const connect = vi
    .fn()
    .mockRejectedValueOnce(Object.assign(Error('Not running'), { code: 'ENOENT' }))
    .mockResolvedValue({ ok: true, data: {} });
  const spawn = vi.fn(() => {
    const child = Object.assign(new EventEmitter(), { unref: vi.fn() });
    queueMicrotask(() => child.emit('spawn'));
    return child;
  });
  expect(await main(['app.status', ...flags], { connect, spawn })).toMatchObject({ ok: true });
  expect(spawn).toHaveBeenCalledWith(
    'test-application',
    expected,
    expect.objectContaining({ shell: false, windowsHide: true }),
  );
  expect(connect).toHaveBeenCalledTimes(2);
});

it('keeps the default connection directory and omits a profile launch flag', async () => {
  const base = launchConfiguration();
  expect(await configuration('default')).toMatchObject({
    userData: base,
    args: ['test-app-root'],
  });
});

it('documents valid image operation examples and keeps UI synchronization private', async () => {
  const help = await main(['help']);
  expect(help.data.imageOperations.title).toBe('图片操作');
  for (const example of help.data.imageOperations.examples)
    expect(validateCommand(example.name, example.input, 'agent')).toBe(example.name);
  expect(
    help.data.commands.some((command: { name: string }) => command.name === 'inpaint.sync'),
  ).toBe(false);
});

it('resolves mask paths relative to the CLI caller before sending them to the application', async () => {
  launchConfiguration();
  const connect = vi.fn(async (_config: object, _request: object) => ({ ok: true, data: {} }));
  await main(
    [
      'generate.estimate-inpaint',
      '--json',
      JSON.stringify({ tabId: 'synthetic', imageId: 'image', maskPath: 'mask.png' }),
    ],
    { connect },
  );
  expect(connect.mock.calls[0][1]).toMatchObject({ input: { maskPath: path.resolve('mask.png') } });
});
