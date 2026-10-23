import { it, expect } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import electron from 'electron';

it('routes real Electron business and updater sessions through local HTTP CONNECT and SOCKS5', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-network-probe-'));
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(
        electron,
        [fileURLToPath(new URL('./fixtures/networkProbe.js', import.meta.url)), root],
        { env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let output = '';
      child.stdout.on('data', (chunk) => {
        output += chunk;
      });
      child.stderr.on('data', (chunk) => {
        output += chunk;
      });
      const timer = setTimeout(() => {
        child.kill();
        reject(Error(`Network probe timed out: ${output}`));
      }, 40000);
      child.on('error', (error) => {
        clearTimeout(timer);
        reject(error);
      });
      child.on('exit', (code) => {
        clearTimeout(timer);
        resolve({ code, output });
      });
    });
    const checks = JSON.parse(
      await fs.readFile(path.join(root, 'result.json'), 'utf8').catch(() => '[]'),
    );
    expect(checks.length, result.output).toBeGreaterThanOrEqual(14);
    expect(
      checks.filter((check) => !check.ok),
      result.output,
    ).toEqual([]);
    expect(result.code, result.output).toBe(0);
  } finally {
    await fs.rm(root, { recursive: true, force: true, maxRetries: 3 });
  }
}, 45000);
