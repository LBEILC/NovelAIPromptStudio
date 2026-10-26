import http from 'node:http';
import { maxEnhanceResultSize } from '../imageOperations.js';
import sharp from 'sharp';
import yazl from 'yazl';
function pngText(value) {
  const content = Buffer.from('Comment\0' + JSON.stringify(value)),
    bytes = Buffer.concat([Buffer.from('tEXt'), content]);
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  const length = Buffer.alloc(4),
    checksum = Buffer.alloc(4);
  length.writeUInt32BE(content.length);
  checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0);
  return Buffer.concat([length, bytes, checksum]);
}

// Local-only acceptance service. No production URL or credential is used here.
export async function startFakeNovelAI() {
  const heldWaiters = new Set();
  const state = {
    requests: [],
    encodes: [],
    active: 0,
    maxActive: 0,
    failNext: 0,
    delay: 20,
    balance: 10000,
    tier: 3,
    usage: 12,
    images: [],
    holdAt: 0,
    resume: null,
  };
  const png = await sharp({ create: { width: 64, height: 64, channels: 4, background: '#8899aa' } })
    .png()
    .toBuffer();
  const server = http.createServer(async (req, res) => {
    if (req.headers.authorization !== 'Bearer acceptance-token') {
      res.writeHead(401).end('{}');
      return;
    }
    if (req.url === '/v1/models') {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          data: [
            { id: 'nai-diffusion-5-full' },
            { id: 'nai-diffusion-4-5-full' },
            { id: 'nai-diffusion-5-full-inpainting' },
          ],
        }),
      );
      return;
    }
    if (req.url === '/user/subscription') {
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          active: state.tier > 0,
          tier: state.tier,
          trainingStepsLeft: { fixedTrainingStepsLeft: state.balance, purchasedTrainingSteps: 0 },
          usage: { percent: state.usage, isNegative: false, timeUntilNextPercent: 60 },
        }),
      );
      return;
    }
    if (req.url === '/ai/encode-vibe') {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString());
      state.encodes.push(body);
      state.balance -= 2;
      res.writeHead(201, { 'Content-Type': 'application/binary' });
      res.end(Buffer.from(JSON.stringify(body)));
      return;
    }
    if (!['/ai/generate-image', '/ai/generate-image-stream', '/ai/upscale'].includes(req.url)) {
      res.writeHead(404).end();
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString());
    state.requests.push(body);
    // 和真实服务一样校验 Vibe 的三个数组一样长（用户 10-21 实测被拒）
    const vibeLengths = [
      'reference_image_multiple',
      'reference_strength_multiple',
      'reference_information_extracted_multiple',
    ].map((key) => body.parameters?.[key]?.length || 0);
    if (vibeLengths.some((n) => n !== vibeLengths[0])) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          statusCode: 400,
          message:
            'Validation error: error validating request: reference_information_extracted_multiple and reference_image_multiple must be the same length',
        }),
      );
      return;
    }
    state.active++;
    state.maxActive = Math.max(state.maxActive, state.active);
    await new Promise((r) => setTimeout(r, state.delay));
    state.active--;
    if (state.failNext) {
      const code = state.failNext;
      state.failNext = 0;
      res.writeHead(code).end('{}');
      return;
    }
    if (req.url === '/ai/upscale') {
      const source = Buffer.from(body.image, 'base64');
      const { width, height } = await sharp(source).metadata();
      const pixels = await sharp(source)
        .resize(width * 2, height * 2)
        .png()
        .toBuffer();
      const texts = [];
      for (let offset = 8; offset + 12 <= source.length; ) {
        const length = source.readUInt32BE(offset),
          type = source.toString('ascii', offset + 4, offset + 8);
        if (['tEXt', 'iTXt', 'zTXt'].includes(type))
          texts.push(source.subarray(offset, offset + length + 12));
        offset += length + 12;
      }
      const image = Buffer.concat([pixels.subarray(0, -12), ...texts, pixels.subarray(-12)]);
      state.balance -= 1;
      const zip = new yazl.ZipFile();
      zip.addBuffer(image, 'image_0.png');
      zip.end();
      res.setHeader('Content-Type', 'application/zip');
      zip.outputStream.pipe(res);
      return;
    }
    const size = body.parameters.upscaled_enhance
      ? maxEnhanceResultSize(body.parameters.width, body.parameters.height)
      : body.parameters;
    // Different seeds yield distinct bytes, preserving importer duplicate behavior.
    const pixels = await sharp(
      body.action === 'infill'
        ? { create: { width: size.width, height: size.height, channels: 4, background: '#ee5533' } }
        : state.images[(state.requests.length - 1) % state.images.length] || png,
    )
      .resize(size.width, size.height)
      .png()
      .toBuffer();
    const text = pngText({
      ...Object.fromEntries(
        Object.entries(body.parameters).filter(([key]) => !['image', 'mask'].includes(key)),
      ),
      request_type: body.action === 'img2img' ? 'Img2ImgRequest' : 'PromptGenerateRequest',
      model: body.model,
      uc: body.parameters.negative_prompt,
    });
    const image = Buffer.concat([
      pixels.subarray(0, pixels.length - 12),
      text,
      pixels.subarray(pixels.length - 12),
    ]);
    if (state.tier < 3) state.balance -= 30;
    if (req.url.endsWith('-stream')) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.write(`event: intermediate\ndata: ${JSON.stringify({ step_ix: 14, samp_ix: 0 })}\n\n`);
      if (state.requests.length === state.holdAt) {
        await new Promise((resolve) => {
          state.resume = resolve;
          for (const notify of heldWaiters) notify();
          heldWaiters.clear();
        });
        state.resume = null;
      }
      res.end(
        `event: final\ndata: ${JSON.stringify({ image: image.toString('base64'), samp_ix: 0 })}\n\n`,
      );
      return;
    }
    const zip = new yazl.ZipFile();
    zip.addBuffer(image, 'image_0.png');
    zip.end();
    res.setHeader('Content-Type', 'application/zip');
    zip.outputStream.pipe(res);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    state,
    // Tests wait for the exact suspended-request boundary instead of polling
    // against a short assertion timeout on busy Windows CI runners.
    waitForHold: () =>
      state.resume ? Promise.resolve() : new Promise((resolve) => heldWaiters.add(resolve)),
    url: `http://127.0.0.1:${server.address().port}`,
    close: () =>
      new Promise((resolve) => {
        server.close(resolve);
        // Chromium may retain a speculative connection with no request yet.
        // It must not keep the isolated acceptance process alive after all checks.
        server.closeAllConnections();
        state.resume?.();
      }),
  };
}
