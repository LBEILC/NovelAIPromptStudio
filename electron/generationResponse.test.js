import { describe, it, expect } from 'vitest';
import { encode } from '@msgpack/msgpack';
import sharp from 'sharp';
import yazl from 'yazl';
import { createNovelAIClient, buildGenerationRequest } from './generation.js';

const png = await sharp({ create: { width: 2, height: 2, channels: 4, background: '#123456' } })
  .png()
  .toBuffer();
const request = () =>
  buildGenerationRequest(
    { width: 832, height: 1216, steps: 28, scale: 5, sampler: 'k_euler_ancestral' },
    'nai-diffusion-5-full',
  );
const frame = (value) => {
  const payload = Buffer.from(encode(value));
  const header = Buffer.alloc(4);
  header.writeUInt32BE(payload.length);
  return Buffer.concat([header, payload]);
};
const intermediate = frame({ event_type: 'intermediate', step_ix: 14, samp_ix: 0 });
const client = (
  body,
  contentType = 'application/octet-stream',
  connection = 'relay',
  status = 200,
) =>
  createNovelAIClient({
    connection,
    baseUrl: connection === 'relay' ? 'https://example.com/novelai' : 'https://image.novelai.net',
    token: () => 'synthetic-key',
    fetchImpl: async () =>
      new Response(body, { status, headers: contentType ? { 'content-type': contentType } : {} }),
  });

describe('generation response content detection', () => {
  it.each(['generate', 'upscale'])('%s detects PNG and framed images', async (method) => {
    for (const contentType of ['image/png', 'application/octet-stream']) {
      expect(await client(png, contentType)[method](request())).toEqual(png);
    }
    for (const image of [png, png.toString('base64')]) {
      const progress = [];
      expect(
        await client(Buffer.concat([intermediate, frame({ event_type: 'final', image })]))[method](
          request(),
          (value) => progress.push(value),
        ),
      ).toEqual(png);
      if (method === 'generate') expect(progress).toEqual([0.5, 1]);
    }
  });
  it.each(['msgpack', 'sse'])(
    'reports %s progress before receiving the final response',
    async (format) => {
      let controller;
      const body = new ReadableStream({
        start(value) {
          controller = value;
        },
      });
      const encodeFrame = (value) =>
        format === 'msgpack'
          ? frame(value)
          : Buffer.from(`event: ${value.event_type}\r\ndata: ${JSON.stringify(value)}\r\n\r\n`);
      const first = encodeFrame({ event_type: 'intermediate', step_ix: 14 });
      // Split the signature, length header, payload and CRLF at every byte boundary.
      for (const byte of first) controller.enqueue(Uint8Array.of(byte));
      const progress = [];
      let notify;
      const reached = new Promise((resolve) => {
        notify = resolve;
      });
      const result = client(body).generate(request(), (value) => {
        progress.push(value);
        if (value === 0.5) notify();
      });
      await reached;
      const last = encodeFrame({
        event_type: 'final',
        image: format === 'msgpack' ? png : png.toString('base64'),
      });
      for (const byte of last) controller.enqueue(Uint8Array.of(byte));
      controller.close();
      expect(await result).toEqual(png);
      expect(progress).toEqual([0.5, 1]);
    },
  );
  it('extracts ZIP from a MessagePack final frame', async () => {
    const zip = new yazl.ZipFile();
    zip.addBuffer(png, 'synthetic.png');
    zip.end();
    const chunks = [];
    for await (const chunk of zip.outputStream) chunks.push(chunk);
    expect(
      await client(frame({ event_type: 'final', image: Buffer.concat(chunks) })).generate(
        request(),
      ),
    ).toEqual(png);
  });
  it('preserves server wording and redacts secrets in HTTP and framed errors', async () => {
    const message = 'unsupported NovelAI model';
    await expect(
      client(JSON.stringify({ message }), 'application/json', 'relay', 400).generate(request()),
    ).rejects.toThrow('中转站拒绝了这次请求：unsupported NovelAI model');
    await expect(
      client(
        frame({ event_type: 'error', status: 400, message: message + ' synthetic-key' }),
      ).generate(request()),
    ).rejects.toThrow('中转站拒绝了这次请求：unsupported NovelAI model [redacted]');
  });
  it.each([
    Buffer.from('0640000180', 'hex'),
    frame({ event_type: 'final', image: png }).subarray(0, -1),
    Buffer.concat([intermediate, Buffer.from([0, 0])]),
    Buffer.concat([intermediate, Buffer.from('0640000180', 'hex')]),
    Buffer.concat([intermediate, Buffer.from('0000000181', 'hex')]),
    Buffer.concat([intermediate, Buffer.alloc(4)]),
  ])('rejects truncated, oversized and malformed frames', async (body) => {
    await expect(client(body).generate(request())).rejects.toThrow('无法读取生成结果');
  });
  it('requires a final image', async () => {
    await expect(client(intermediate).generate(request())).rejects.toThrow('生成结果没有 PNG');
  });
  it.each(['relay', 'official'])(
    'diagnoses unknown %s content without secrets or changed metadata',
    async (connection) => {
      const body = Buffer.from(Array.from({ length: 32 }, (_, i) => i));
      const error = await client(body, '', connection)
        .generate(request())
        .catch((error) => error);
      expect(error.constructor).toBe(Error);
      expect(Object.keys(error)).toEqual([]);
      expect(error.message).toBe(
        `${connection === 'relay' ? '中转站' : 'NovelAI'}返回的内容无法识别（HTTP 200，没有 content-type，开头 00 01 02 03 04 05 06 07 08 09 0a 0b 0c 0d 0e 0f）`,
      );
      expect(error.message).not.toContain('synthetic-key');
    },
  );
  it.each(['ffd8ffe0', '524946460000000057454250'])('rejects non-PNG images %s', async (hex) => {
    await expect(client(Buffer.from(hex, 'hex')).upscale(request())).rejects.toThrow(
      '返回的内容无法识别',
    );
  });
});
