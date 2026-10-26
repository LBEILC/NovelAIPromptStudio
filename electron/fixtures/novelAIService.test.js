import net from 'node:net';
import { once } from 'node:events';
import { expect, it } from 'vitest';
import { startFakeNovelAI } from './novelAIService.js';
import { startFakeChatGPT } from './chatGPTService.js';

it.each([
  ['NovelAI', startFakeNovelAI],
  ['ChatGPT', startFakeChatGPT],
])(
  'closes a speculative client connection that has not sent an HTTP request (%s)',
  async (_name, start) => {
    const service = await start();
    const socket = net.createConnection({
      host: '127.0.0.1',
      port: Number(new URL(service.url || service.origin).port),
    });
    try {
      await once(socket, 'connect');
      const errors = [];
      socket.on('error', (error) => errors.push(error.code));
      const closed = new Promise((resolve) => socket.once('close', resolve));
      await service.close();
      await closed;
      expect(socket.destroyed).toBe(true);
      expect(errors.every((code) => code === 'ECONNRESET')).toBe(true);
    } finally {
      socket.destroy();
      await service.close();
    }
  },
);
