// @ts-check
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
const registryTool = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');
/** @param {{appRoot:string,userData:string,defaultUserData?:string,executable:string,packaged:boolean,testRoot?:string}} options */
export function agentSetup(options) {
  const bin = options.testRoot
    ? path.join(options.testRoot, 'bin')
    : path.join(os.homedir(), '.local', 'bin');
  const runtime = options.testRoot
    ? path.join(options.testRoot, 'runtime')
    : path.join(options.userData, 'agent-tool');
  const command = path.join(bin, process.platform === 'win32' ? 'nai-studio.cmd' : 'nai-studio');
  const skillPath = path.join(
    options.packaged ? path.dirname(options.appRoot) : options.appRoot,
    'agent',
    'SKILL.md',
  );
  async function userPath() {
    if (process.platform !== 'win32' || options.testRoot) return process.env.PATH || '';
    try {
      const { stdout } = await execute(registryTool, ['query', 'HKCU\\Environment', '/v', 'Path'], {
        windowsHide: true,
      });
      return stdout.match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.*)/i)?.[1]?.trim() || '';
    } catch {
      return '';
    }
  }
  /** @param {string} value */
  const includesBin = (value) =>
    value
      .split(path.delimiter)
      .some(
        (p) =>
          path.resolve(p.replace(/%USERPROFILE%/gi, os.homedir())).toLocaleLowerCase() ===
          bin.toLocaleLowerCase(),
      );
  const status = async () => ({
    installed: await fs.access(command).then(
      () => true,
      () => false,
    ),
    path: command,
    onPath: includesBin(process.env.PATH || '') || includesBin(await userPath()),
    skillPath,
  });
  return {
    status,
    skill: () => fs.readFile(skillPath, 'utf8'),
    skillPath,
    async install() {
      await fs.mkdir(bin, { recursive: true });
      for (const file of [
        'agent/nai-studio.mjs',
        'agent/SKILL.md',
        'electron/commands/registry.js',
        'electron/appProfile.js',
      ]) {
        const target = path.join(runtime, file);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.copyFile(path.join(options.appRoot, file), target);
      }
      await fs.writeFile(path.join(runtime, 'package.json'), JSON.stringify({ type: 'module' }));
      await fs.writeFile(
        path.join(runtime, 'agent', 'launch.json'),
        JSON.stringify({
          executable: options.executable,
          args: options.packaged ? [] : [options.appRoot],
          userData: options.defaultUserData || options.userData,
        }),
      );
      const script = path.join(runtime, 'agent', 'nai-studio.mjs');
      if (process.platform === 'win32') {
        const quote = (/** @type {string} */ s) => `"${s.replaceAll('%', '%%')}"`;
        await fs.writeFile(
          command,
          `@echo off\r\nsetlocal\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n${quote(options.executable)} ${quote(script)} %*\r\nexit /b %errorlevel%\r\n`,
        );
        if (!options.testRoot) {
          const previous = await userPath();
          if (!includesBin(previous))
            await execute(
              registryTool,
              [
                'add',
                'HKCU\\Environment',
                '/v',
                'Path',
                '/t',
                'REG_EXPAND_SZ',
                '/d',
                previous ? `${previous};${bin}` : bin,
                '/f',
              ],
              { windowsHide: true },
            );
        }
      } else {
        const quote = (/** @type {string} */ s) => `'${s.replaceAll("'", "'\\''")}'`;
        await fs.writeFile(
          command,
          `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec ${quote(options.executable)} ${quote(script)} "$@"\n`,
          { mode: 0o755 },
        );
        await fs.chmod(command, 0o755);
      }
      return status();
    },
  };
}
