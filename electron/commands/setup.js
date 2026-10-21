// @ts-check
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
const registryTool = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'reg.exe');
const powershell = path.join(
  process.env.SystemRoot || 'C:\\Windows',
  'System32',
  'WindowsPowerShell',
  'v1.0',
  'powershell.exe',
);

// No user values are interpolated into this PowerShell program.
export const environmentBroadcast = `Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class StudioEnvironment {
  [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
  public static extern IntPtr SendMessageTimeout(IntPtr hwnd, uint msg, UIntPtr wParam, string lParam, uint flags, uint timeout, out UIntPtr result);
}
'@
[UIntPtr] $result = [UIntPtr]::Zero
[void][StudioEnvironment]::SendMessageTimeout([IntPtr]0xffff, 0x001a, [UIntPtr]::Zero, 'Environment', 2, 5000, [ref]$result)`;

/** @param {string} previous @param {string} bin @param {typeof execute} [run] */
export async function writeWindowsPath(previous, bin, run = execute) {
  await run(
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
  await run(powershell, ['-NoProfile', '-NonInteractive', '-Command', environmentBroadcast], {
    windowsHide: true,
    timeout: 10000,
  }).catch((error) => console.warn('Agent PATH broadcast failed', error));
}

/** @param {string} value */
const shQuote = (value) => `'${value.replaceAll("'", "'\\''")}'`;
/** @param {string} value */
const bashPath = (value) =>
  value.replaceAll('\\', '/').replace(/^([a-z]):\//i, (_, drive) => `/${drive.toLowerCase()}/`);
/** @param {string} executable @param {string} script @param {NodeJS.Platform} platform */
export function launcherScripts(executable, script, platform) {
  const sh = `#!/bin/sh\nELECTRON_RUN_AS_NODE=1 exec ${shQuote(platform === 'win32' ? bashPath(executable) : executable)} ${shQuote(script)} "$@"\n`;
  if (platform !== 'win32') return { 'nai-studio': sh };
  const quote = (/** @type {string} */ s) => `"${s.replaceAll('%', '%%')}"`;
  return {
    'nai-studio': sh,
    'nai-studio.cmd': `@echo off\r\nsetlocal DisableDelayedExpansion\r\nset "ELECTRON_RUN_AS_NODE=1"\r\n${quote(executable)} ${quote(script)} %*\r\nexit /b %errorlevel%\r\n`,
  };
}

/** @param {{appRoot:string,userData:string,defaultUserData?:string,executable:string,packaged:boolean,testRoot?:string,platform?:NodeJS.Platform}} options */
export function agentSetup(options) {
  const platform = options.platform || process.platform;
  const home = options.testRoot ? path.join(options.testRoot, 'home') : os.homedir();
  const bin = options.testRoot
    ? path.join(options.testRoot, 'bin')
    : path.join(home, '.local', 'bin');
  const runtime = options.testRoot
    ? path.join(options.testRoot, 'runtime')
    : path.join(options.userData, 'agent-tool');
  const command = path.join(bin, platform === 'win32' ? 'nai-studio.cmd' : 'nai-studio');
  const skillPath = path.join(
    options.packaged ? path.dirname(options.appRoot) : options.appRoot,
    'agent',
    'SKILL.md',
  );
  /** @param {string} file */
  const exists = (file) =>
    fs.access(file).then(
      () => true,
      () => false,
    );
  /** @param {string} target */
  function skillLocation(target) {
    if (target !== 'claude' && target !== 'codex') throw Error('Invalid skill target');
    const root = path.join(home, `.${target}`);
    return {
      root,
      directory: path.join(root, 'skills', 'nai-studio'),
      path: path.join(root, 'skills', 'nai-studio', 'SKILL.md'),
    };
  }
  /** @param {string} target @param {Buffer} bundled */
  async function skillStatus(target, bundled) {
    const location = skillLocation(target);
    const available = await fs.stat(location.root).then(
      (s) => s.isDirectory(),
      () => false,
    );
    /** @type {import('../../src/shared/commands').AgentSkills['claude']['state']} */
    let state = 'unavailable';
    if (available) {
      try {
        state = (await fs.readFile(location.path)).equals(bundled) ? 'installed' : 'outdated';
      } catch (error) {
        if (/** @type {NodeJS.ErrnoException} */ (error).code !== 'ENOENT') throw error;
        state = 'missing';
      }
    }
    return { state, path: location.path };
  }
  async function skills() {
    const bundled = await fs.readFile(skillPath);
    return {
      claude: await skillStatus('claude', bundled),
      codex: await skillStatus('codex', bundled),
    };
  }
  async function userPath() {
    if (platform !== 'win32' || options.testRoot) return process.env.PATH || '';
    try {
      const { stdout } = await execute(registryTool, ['query', 'HKCU\\Environment', '/v', 'Path'], {
        windowsHide: true,
      });
      return stdout.match(/Path\s+REG_(?:EXPAND_)?SZ\s+(.*)/i)?.[1] || '';
    } catch {
      return '';
    }
  }
  /** @param {string} value */
  const includesBin = (value) =>
    value
      .split(platform === 'win32' ? ';' : ':')
      .some(
        (p) => path.resolve(p.replace(/%USERPROFILE%/gi, home)).toLowerCase() === bin.toLowerCase(),
      );
  const status = async () => ({
    installed: await exists(command),
    path: command,
    onPath: includesBin(process.env.PATH || '') || includesBin(await userPath()),
    skillPath,
    platform,
    skills: await skills(),
  });
  async function runtimeFiles() {
    /** @type {Map<string, Buffer>} */
    const files = new Map();
    for (const file of [
      'agent/nai-studio.mjs',
      'agent/client.mjs',
      'agent/SKILL.md',
      'electron/commands/registry.js',
      'electron/commands/parameterValidation.js',
      'src/shared/params.ts',
      'electron/appProfile.js',
    ]) {
      files.set(
        path.join(runtime, file),
        await fs.readFile(file === 'agent/SKILL.md' ? skillPath : path.join(options.appRoot, file)),
      );
    }
    files.set(path.join(runtime, 'package.json'), Buffer.from(JSON.stringify({ type: 'module' })));
    files.set(
      path.join(runtime, 'agent', 'launch.json'),
      Buffer.from(
        JSON.stringify({
          executable: options.executable,
          args: options.packaged ? [] : [options.appRoot],
          userData: options.defaultUserData || options.userData,
        }),
      ),
    );
    for (const [name, text] of Object.entries(
      launcherScripts(options.executable, path.join(runtime, 'agent', 'nai-studio.mjs'), platform),
    )) {
      files.set(path.join(bin, name), Buffer.from(text));
    }
    return files;
  }
  /** @param {Map<string, Buffer>} files */
  async function writeRuntime(files) {
    for (const [file, content] of files) {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, content);
    }
    await fs.chmod(path.join(bin, 'nai-studio'), 0o755);
  }
  return {
    status,
    skill: () => fs.readFile(skillPath, 'utf8'),
    skillPath,
    async install() {
      await writeRuntime(await runtimeFiles());
      let pathFailed = false;
      if (platform === 'win32' && !options.testRoot) {
        const previous = await userPath();
        if (!includesBin(previous)) {
          try {
            await writeWindowsPath(previous, bin);
          } catch {
            pathFailed = true;
          }
        }
      }
      return { ...(await status()), pathFailed };
    },
    async uninstall() {
      for (const name of ['nai-studio', 'nai-studio.cmd'])
        await fs.rm(path.join(bin, name), { force: true });
      await fs.rm(runtime, { recursive: true, force: true });
      return status();
    },
    /** @param {string} target */
    async installSkill(target) {
      const location = skillLocation(target);
      if (
        !(await fs.stat(location.root).then(
          (s) => s.isDirectory(),
          () => false,
        ))
      )
        throw Error(`${target} is unavailable`);
      await fs.mkdir(location.directory, { recursive: true });
      await fs.writeFile(location.path, await fs.readFile(skillPath));
      return { skills: await skills() };
    },
    /** @param {string} target */
    async uninstallSkill(target) {
      await fs.rm(skillLocation(target).directory, { recursive: true, force: true });
      return { skills: await skills() };
    },
    async refresh() {
      try {
        // Recognize older Windows installs that only have the .cmd launcher.
        if (!(await exists(command))) return false;
        const files = await runtimeFiles();
        let outdated = false;
        for (const [file, content] of files) {
          if (
            !(await fs.readFile(file).then(
              (current) => current.equals(content),
              () => false,
            ))
          ) {
            outdated = true;
            break;
          }
        }
        if (outdated) await writeRuntime(files);
        return outdated;
      } catch (error) {
        console.warn('Agent runtime update failed', error);
        return false;
      }
    },
  };
}
