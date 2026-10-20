// @ts-check
import net from 'node:net';
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { atomicWrite } from './session.js';

const execute = promisify(execFile);
/** @param {string} directory */
export function commandEndpoint(directory) {
  const id = crypto.createHash('sha256').update(path.resolve(directory)).digest('hex').slice(0, 24);
  return process.platform === 'win32'
    ? `\\\\.\\pipe\\nai-studio-${id}`
    : path.join(directory, 'agent', 's');
}
/** @param {string} directory */
export async function protectDirectory(directory) {
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  if (process.platform === 'win32') {
    const system = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32');
    const { stdout } = await execute(
      path.join(system, 'whoami.exe'),
      ['/user', '/fo', 'csv', '/nh'],
      { windowsHide: true },
    );
    const sid = stdout.match(/S-1-[0-9-]+/)?.[0];
    if (!sid) throw Error('无法确定当前用户，命令行连接没有启用');
    await execute(
      path.join(system, 'icacls.exe'),
      [directory, '/inheritance:r', '/grant:r', `*${sid}:(OI)(CI)F`],
      { windowsHide: true },
    );
  } else await fs.chmod(directory, 0o700);
}
/** @param {{directory:string,dispatch:(name:string,input:unknown)=>Promise<unknown>}} options */
export async function startCommandServer({ directory, dispatch }) {
  const privateDirectory = path.join(directory, 'agent');
  await protectDirectory(privateDirectory);
  const endpoint = commandEndpoint(directory),
    token = crypto.randomBytes(32).toString('hex');
  if (process.platform !== 'win32') await fs.rm(endpoint, { force: true });
  const tokenFile = path.join(privateDirectory, 'connection.json');
  const server = net.createServer((socket) => {
    let buffer = '',
      handled = false;
    socket.setEncoding('utf8');
    socket.setTimeout(120000, () => socket.destroy());
    socket.on('error', () => {});
    socket.on('data', async (chunk) => {
      if (handled) return;
      buffer += chunk;
      if (Buffer.byteLength(buffer) > 16 * 1024 * 1024) {
        socket.destroy();
        return;
      }
      if (!buffer.includes('\n')) return;
      handled = true;
      try {
        const request = JSON.parse(buffer.slice(0, buffer.indexOf('\n')));
        const supplied = Buffer.from(typeof request.token === 'string' ? request.token : '');
        const expected = Buffer.from(token);
        if (supplied.length !== expected.length || !crypto.timingSafeEqual(supplied, expected)) {
          socket.end(
            JSON.stringify({
              ok: false,
              error: { code: 'forbidden', message: '本机连接令牌无效' },
            }) + '\n',
          );
          return;
        }
        if (typeof request.name !== 'string') throw Error('命令格式不正确');
        const response = await dispatch(request.name, request.input ?? {});
        socket.end(JSON.stringify(response) + '\n');
      } catch (error) {
        socket.end(
          JSON.stringify({
            ok: false,
            error: {
              code: 'invalid_input',
              message: error instanceof Error ? error.message : '输入格式不正确',
            },
          }) + '\n',
        );
      }
    });
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(endpoint, () => resolve(undefined));
  });
  if (process.platform !== 'win32') await fs.chmod(endpoint, 0o600);
  await atomicWrite(tokenFile, { endpoint, token, pid: process.pid });
  return {
    server,
    endpoint,
    async close() {
      server.close();
      await fs.rm(tokenFile, { force: true });
      if (process.platform !== 'win32') await fs.rm(endpoint, { force: true });
    },
  };
}
