import http from 'node:http';
import net from 'node:net';
import fs from 'node:fs';
import { startFakeNovelAI } from '../electron/fixtures/novelAIService.js';

export const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
export async function startServices(images) {
  const novel = await startFakeNovelAI();
  novel.state.images = images.map((file) => fs.readFileSync(file));
  novel.state.delay = 1500;
  const state = { aiFail: false, slowImport: false, disconnect: false, aiDelay: 1000 };
  const ai = http.createServer(async (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/v1/models')
      return res.end(JSON.stringify({ data: [{ id: 'preview-model' }] }));
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = JSON.parse(Buffer.concat(chunks).toString() || '{}');
    await pause(state.aiDelay);
    if (state.aiFail) {
      state.aiFail = false;
      res.writeHead(500).end(JSON.stringify({ error: { message: '预览 AI 服务暂时不可用' } }));
      return;
    }
    const instruction = body.messages?.[0]?.content || '';
    const raw = body.messages?.at(-1)?.content || '';
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      input = raw;
    }
    let content = '连接成功';
    if (instruction.includes('Organize image prompts')) {
      const changes = input
        .map((b) => {
          const after = b.text
            .replace(/flim grain/g, 'film grain')
            .replace(/umbrela/g, 'umbrella')
            .replace(/looking at veiwer/g, 'looking at viewer');
          return {
            ...b,
            after,
            title: '修正拼写与排版',
            reason: '修正明确的英文拼写错误，保留原有 Tag、顺序和权重。',
          };
        })
        .filter((b) => b.after !== b.text)
        .slice(0, 3);
      content = JSON.stringify({ changes });
    } else if (instruction.includes('names:'))
      content = JSON.stringify({
        names: input.map((_, i) => ['雨后微光', '静谧书页', '海风手记'][i % 3]),
      });
    else if (input?.tags)
      content = JSON.stringify({
        items: input.tags.map((tag) => ({
          translation:
            {
              'blue hair': '蓝色头发',
              standing: '站立',
              'film grain': '胶片颗粒',
              umbrella: '雨伞',
            }[tag] || `画面元素：${tag}`,
          category: 'Subject',
        })),
      });
    else if (instruction.includes('Simplified Chinese'))
      content = '柔和的光线洒在安静的街道上，人物撑着雨伞，远处的灯火映在湿润的地面。';
    else if (instruction.includes('Rewrite') || instruction.includes('English'))
      content =
        'Soft light falls across a quiet street. A traveler holds an umbrella above the rain-washed pavement.';
    res.end(JSON.stringify({ choices: [{ message: { content } }] }));
  });
  await new Promise((resolve) => ai.listen(0, '127.0.0.1', resolve));
  const aiUrl = `http://127.0.0.1:${ai.address().port}/v1`;
  const allowed = new Set([new URL(novel.url).origin, new URL(aiUrl).origin]);
  const blocked = [];
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    if (!allowed.has(url.origin)) {
      blocked.push(url.origin);
      console.error('Blocked preview network:', url.origin);
      throw Error('预览禁止外部网络请求');
    }
    if (url.origin === novel.url && url.pathname.includes('generate')) {
      if (state.disconnect) {
        state.disconnect = false;
        throw TypeError('fetch failed: preview connection unavailable');
      }
      if (novel.state.failNext === 422) {
        novel.state.failNext = 0;
        await pause(novel.state.delay);
        return new Response(JSON.stringify({ message: '预览服务器：图片尺寸与模型不兼容' }), {
          status: 422,
        });
      }
    }
    return originalFetch(input, options);
  };
  // Also deny non-fetch sockets; only the two owned fixture listeners may be contacted.
  const connect = net.Socket.prototype.connect;
  const ports = new Set([...allowed].map((origin) => Number(new URL(origin).port)));
  net.Socket.prototype.connect = function (...args) {
    const first = Array.isArray(args[0]) ? args[0][0] : args[0];
    const opts = typeof first === 'object' ? first : { port: first, host: args[1] };
    if (
      !ports.has(Number(opts.port)) ||
      !['127.0.0.1', 'localhost', '::1'].includes(opts.host || 'localhost')
    ) {
      const target = `${opts.host || 'localhost'}:${opts.port}`;
      blocked.push(target);
      throw Error(`Blocked preview socket: ${target}`);
    }
    return connect.apply(this, args);
  };
  return {
    novel,
    state,
    aiUrl,
    blocked,
    allowPort: (port) => ports.add(port),
    async close() {
      globalThis.fetch = originalFetch;
      net.Socket.prototype.connect = connect;
      novel.state.resume?.();
      ai.closeAllConnections();
      await Promise.all([novel.close(), new Promise((resolve) => ai.close(resolve))]);
    },
  };
}
