import net from 'node:net';
import { once } from 'node:events';
import { expect, it } from 'vitest';
import { startFakeNovelAI } from './novelAIService.js';

it('closes a speculative client connection that has not sent an HTTP request', async () => {
  const service = await startFakeNovelAI();
  const socket = net.createConnection({
    host: '127.0.0.1',
    port: Number(new URL(service.url).port),
  });
  try {
    await once(socket, 'connect');
    const closed = once(socket, 'close');
    await service.close();
    await closed;
    expect(socket.destroyed).toBe(true);
  } finally {
    socket.destroy();
    await service.close();
  }
});
