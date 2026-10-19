import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import { expect, it } from 'vitest';
import { startCommandServer, commandEndpoint } from './transport.js';

it('authenticates local clients and removes connection credentials on shutdown', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nai-ipc-'));
  const calls: string[] = [];
  const service = await startCommandServer({
    directory,
    dispatch: async (name) => {
      calls.push(name);
      return { ok: true, data: { name } };
    },
  });
  const request = (value: object): Promise<any> =>
    new Promise((resolve, reject) => {
      const socket = net.connect(service.endpoint);
      let body = '';
      socket.setEncoding('utf8');
      socket.on('connect', () => socket.write(JSON.stringify(value) + '\n'));
      socket.on('data', (chunk) => {
        body += chunk;
      });
      socket.on('end', () => resolve(JSON.parse(body)));
      socket.on('error', reject);
    });
  try {
    const file = path.join(directory, 'agent', 'connection.json');
    const credentials = JSON.parse(await fs.readFile(file, 'utf8'));
    expect(commandEndpoint(directory + '-demo')).not.toBe(service.endpoint);
    expect(await request({ token: 'invalid', name: 'app.status' })).toMatchObject({
      ok: false,
      error: { code: 'forbidden' },
    });
    expect(calls).toEqual([]);
    expect(await request({ token: credentials.token, name: 'app.status' })).toMatchObject({
      ok: true,
    });
    expect(calls).toEqual(['app.status']);
    if (process.platform !== 'win32') expect((await fs.stat(file)).mode & 0o777).toBe(0o600);
  } finally {
    await service.close();
    expect(
      await fs.access(path.join(directory, 'agent', 'connection.json')).then(
        () => true,
        () => false,
      ),
    ).toBe(false);
    await fs.rm(directory, { recursive: true, force: true });
  }
}, 15000);
