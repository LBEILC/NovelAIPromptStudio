import fs from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { agentSetup, launcherScripts, writeWindowsPath, environmentBroadcast } from './setup.js';
import { validateCommand } from './registry.js';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

let root: string;
beforeEach(async () => {
  await fs.mkdir('.codex-runs', { recursive: true });
  root = await fs.mkdtemp(path.resolve('.codex-runs', 'agent setup '));
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fs.rm(root, { recursive: true, force: true });
});
const options = () => ({
  appRoot: process.cwd(),
  userData: path.join(root, 'data'),
  testRoot: root,
  executable: process.execPath,
  packaged: false,
});
const agentHome = (target: string) => path.join(root, 'home', `.${target}`);

it('runs installed CLI help and parameter validation without application dependencies', async () => {
  await agentSetup(options()).install();
  const script = path.join(root, 'runtime', 'agent', 'nai-studio.mjs');
  const { stdout } = await promisify(execFile)(process.execPath, [script, 'help'], {
    windowsHide: true,
  });
  const help = JSON.parse(stdout);
  expect(help.ok).toBe(true);
  expect(help.data.commands.some((c: { name: string }) => c.name === 'params.set')).toBe(true);
  await expect(
    promisify(execFile)(
      process.execPath,
      [script, 'params.set', '--json', JSON.stringify({ tabId: 'synthetic', patch: { steps: 0 } })],
      { windowsHide: true },
    ),
  ).rejects.toMatchObject({ stdout: expect.stringContaining('invalid_input') });
});

it('preserves long unexpanded PATH text and broadcasts only after the registry write', async () => {
  const previous = '%USERPROFILE%\\bin;' + 'C:\\Long Folder;'.repeat(100);
  const run = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
  await writeWindowsPath(
    previous,
    'C:\\New Bin',
    run as unknown as Parameters<typeof writeWindowsPath>[2],
  );
  expect(run.mock.calls[0][1]).toEqual([
    'add',
    'HKCU\\Environment',
    '/v',
    'Path',
    '/t',
    'REG_EXPAND_SZ',
    '/d',
    previous + ';C:\\New Bin',
    '/f',
  ]);
  expect(run.mock.calls[1][1]).toEqual([
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    environmentBroadcast,
  ]);
  expect(environmentBroadcast).toContain("'Environment'");
  expect(environmentBroadcast).toContain('0x001a');
  run.mockClear();
  run.mockRejectedValueOnce(Error('registry denied'));
  await expect(
    writeWindowsPath(previous, 'bin', run as unknown as Parameters<typeof writeWindowsPath>[2]),
  ).rejects.toThrow('registry denied');
  expect(run).toHaveBeenCalledOnce();
});
it('does not fail the installation when broadcasting fails', async () => {
  const run = vi
    .fn()
    .mockResolvedValueOnce({ stdout: '', stderr: '' })
    .mockRejectedValueOnce(Error('broadcast failed'));
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  await expect(
    writeWindowsPath('', 'bin', run as unknown as Parameters<typeof writeWindowsPath>[2]),
  ).resolves.toBeUndefined();
  expect(warn).toHaveBeenCalledOnce();
});

it('quotes Windows cmd and Git Bash launchers, including spaces and shell metacharacters', () => {
  const files = launcherScripts(
    "D:\\Program Files\\Studio's $app%!.exe",
    'C:\\User Space\\agent\\nai-studio.mjs',
    'win32',
  );
  expect(files['nai-studio']).toBe(
    "#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec '/d/Program Files/Studio'\\''s $app%!.exe' 'C:\\User Space\\agent\\nai-studio.mjs' \"$@\"\n",
  );
  expect(files['nai-studio.cmd']).toContain('setlocal DisableDelayedExpansion');
  expect(files['nai-studio.cmd']).toContain(
    '"D:\\Program Files\\Studio\'s $app%%!.exe" "C:\\User Space\\agent\\nai-studio.mjs" %*',
  );
});
it.each(['darwin', 'linux'] as const)('quotes the %s shell launcher', (platform) => {
  expect(
    launcherScripts('/Applications/Studio "app".app/run', "/User's Space/agent.mjs", platform),
  ).toEqual({
    'nai-studio':
      "#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec '/Applications/Studio \"app\".app/run' '/User'\\''s Space/agent.mjs' \"$@\"\n",
  });
});
it.each(['claude', 'codex'] as const)(
  'reports all four %s skill states and installs exact bundled bytes',
  async (target) => {
    const setup = agentSetup(options());
    expect((await setup.status()).skills[target].state).toBe('unavailable');
    await expect(setup.installSkill(target)).rejects.toThrow('unavailable');
    await expect(fs.access(agentHome(target))).rejects.toThrow();
    await fs.mkdir(agentHome(target), { recursive: true });
    const missing = (await setup.status()).skills[target];
    expect(missing).toEqual({
      state: 'missing',
      path: path.join(agentHome(target), 'skills', 'nai-studio', 'SKILL.md'),
    });
    expect((await setup.installSkill(target)).skills[target].state).toBe('installed');
    expect(await fs.readFile(missing.path)).toEqual(await fs.readFile(setup.skillPath));
    await fs.appendFile(missing.path, '\nLocal edits');
    expect((await setup.status()).skills[target].state).toBe('outdated');
    expect((await setup.installSkill(target)).skills[target].state).toBe('installed');
  },
);
it.each(['claude', 'codex'] as const)(
  'uninstalls only the %s skill, including repeated/absent uninstall',
  async (target) => {
    const setup = agentSetup(options());
    expect((await setup.uninstallSkill(target)).skills[target].state).toBe('unavailable');
    const sibling = path.join(agentHome(target), 'skills', 'other', 'SKILL.md');
    await fs.mkdir(path.dirname(sibling), { recursive: true });
    await fs.writeFile(sibling, 'keep');
    await setup.installSkill(target);
    for (let i = 0; i < 2; i++)
      expect((await setup.uninstallSkill(target)).skills[target].state).toBe('missing');
    expect(await fs.readFile(sibling, 'utf8')).toBe('keep');
  },
);
it.each(['win32', 'darwin', 'linux'] as const)(
  'installs and removes the %s runtime without touching skills or other tools',
  async (platform) => {
    const setup = agentSetup({ ...options(), platform });
    expect((await setup.uninstall()).installed).toBe(false);
    await fs.mkdir(agentHome('claude'), { recursive: true });
    await setup.installSkill('claude');
    const installed = await setup.install();
    expect(installed.installed).toBe(true);
    expect(installed.skills.claude.state).toBe('installed');
    const scripts = launcherScripts(
      process.execPath,
      path.join(root, 'runtime', 'agent', 'nai-studio.mjs'),
      platform,
    );
    for (const [name, content] of Object.entries(scripts))
      expect(await fs.readFile(path.join(root, 'bin', name), 'utf8')).toBe(content);
    await fs.writeFile(path.join(root, 'bin', 'other'), 'keep');
    for (let i = 0; i < 2; i++) expect((await setup.uninstall()).installed).toBe(false);
    await expect(fs.access(path.join(root, 'runtime'))).rejects.toThrow();
    for (const name of ['nai-studio', 'nai-studio.cmd'])
      await expect(fs.access(path.join(root, 'bin', name))).rejects.toThrow();
    expect(await fs.readFile(path.join(root, 'bin', 'other'), 'utf8')).toBe('keep');
    expect((await setup.status()).skills.claude.state).toBe('installed');
  },
);
it('refreshes only an installed stale runtime and repairs old Windows installations', async () => {
  const setup = agentSetup({ ...options(), platform: 'win32' });
  const writes = vi.spyOn(fs, 'writeFile');
  expect(await setup.refresh()).toBe(false);
  expect(writes).not.toHaveBeenCalled();
  await setup.install();
  writes.mockClear();
  expect(await setup.refresh()).toBe(false);
  expect(writes).not.toHaveBeenCalled();
  const client = path.join(root, 'runtime', 'agent', 'client.mjs');
  await fs.writeFile(client, 'old');
  await fs.rm(path.join(root, 'bin', 'nai-studio'));
  await fs.mkdir(agentHome('codex'), { recursive: true });
  await setup.installSkill('codex');
  const skill = (await setup.status()).skills.codex.path;
  await fs.writeFile(skill, 'local skill');
  expect(await setup.refresh()).toBe(true);
  expect(await fs.readFile(client)).toEqual(await fs.readFile('agent/client.mjs'));
  await fs.access(path.join(root, 'bin', 'nai-studio'));
  expect(await fs.readFile(skill, 'utf8')).toBe('local skill');
  const moved = agentSetup({
    ...options(),
    platform: 'win32',
    executable: 'D:\\Moved App\\studio.exe',
  });
  expect(await moved.refresh()).toBe(true);
  expect(
    JSON.parse(await fs.readFile(path.join(root, 'runtime', 'agent', 'launch.json'), 'utf8'))
      .executable,
  ).toBe('D:\\Moved App\\studio.exe');
});
it('logs a failed startup refresh without throwing', async () => {
  const setup = agentSetup(options());
  await setup.install();
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect(await agentSetup({ ...options(), appRoot: path.join(root, 'missing') }).refresh()).toBe(
    false,
  );
  expect(warn).toHaveBeenCalledOnce();
});
it('rejects non-UI callers and invalid target paths before file operations', async () => {
  for (const name of [
    'agent.setup',
    'agent.install',
    'agent.uninstall',
    'agent.skill-install',
    'agent.skill-uninstall',
  ]) {
    expect(() => validateCommand(name, { target: 'claude' }, 'agent')).toThrow('只供软件界面');
  }
  for (const name of ['agent.skill-install', 'agent.skill-uninstall']) {
    expect(() => validateCommand(name, { target: '../other' }, 'ui')).toThrow('输入格式');
    expect(validateCommand(name, { target: 'codex' }, 'ui')).toBe(name);
  }
  await expect(agentSetup(options()).installSkill('../other')).rejects.toThrow(
    'Invalid skill target',
  );
  await expect(agentSetup(options()).uninstallSkill('../other')).rejects.toThrow(
    'Invalid skill target',
  );
});
