import net from 'node:net';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { commandRegistry, validateCommand } from '../electron/commands/registry.js';
import { parseAppProfile } from '../electron/appProfile.js';

const directory = path.dirname(fileURLToPath(import.meta.url));
export function parse(argv) {
  const input = {};
  let name = 'help',
    json,
    profile = 'default';
  const args = [...argv];
  if (args[0] && !args[0].startsWith('--')) name = args.shift();
  while (args.length) {
    let flag = args.shift();
    if (!flag.startsWith('--') && name === 'help') {
      name = flag;
      continue;
    }
    const equals = flag.indexOf('=');
    if (equals >= 0) {
      args.unshift(flag.slice(equals + 1));
      flag = flag.slice(0, equals);
    }
    if (flag.startsWith('--profile=')) {
      profile = flag.slice(10);
      continue;
    }
    if (flag === '--profile') {
      profile = args.shift();
      continue;
    }
    if (flag === '--help') {
      name = 'help';
      continue;
    }
    if (flag === '--json') {
      if (json !== undefined) throw Error('--json 只能使用一次');
      json = JSON.parse(args.shift());
      continue;
    }
    if (!flag.startsWith('--')) throw Error('参数应以 -- 开头');
    const key = flag.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    const value = args.shift();
    if (value === undefined) throw Error(`${flag} 缺少值`);
    const type = commandRegistry[name]?.fields[key];
    if (type === 'boolean' && !['true', 'false'].includes(value))
      throw Error(`${flag} 必须为 true 或 false`);
    input[key] =
      type === 'integer' || type === 'number'
        ? Number(value)
        : type === 'boolean'
          ? value === 'true'
          : type === 'strings'
            ? value.split(',')
            : value;
  }
  profile = parseAppProfile([`--profile=${profile}`]);
  if (json !== undefined && (json === null || typeof json !== 'object' || Array.isArray(json)))
    throw Error('--json 必须是对象');
  return { name, input: { ...json, ...input }, profile };
}
export async function configuration(profile) {
  const config = await fs
    .readFile(path.join(directory, 'launch.json'), 'utf8')
    .then(JSON.parse)
    .catch(() => null);
  const appData =
    process.platform === 'win32'
      ? process.env.APPDATA
      : process.platform === 'darwin'
        ? path.join(os.homedir(), 'Library', 'Application Support')
        : process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');
  const base = config?.userData || path.join(appData, 'NovelAI Prompt Studio');
  const userData =
    process.env.NAI_STUDIO_USER_DATA ||
    (profile === 'default'
      ? base
      : path.join(path.dirname(base), `NovelAI Prompt Studio-${profile}`));
  let executable = config?.executable,
    args = config?.args || [];
  if (!executable) {
    const appRoot = path.resolve(directory, '..');
    const dev = path.join(
      appRoot,
      'node_modules',
      'electron',
      process.platform === 'win32'
        ? 'dist/electron.exe'
        : process.platform === 'darwin'
          ? 'dist/Electron.app/Contents/MacOS/Electron'
          : 'dist/electron',
    );
    const packaged = appRoot.endsWith('.asar') && !!process.versions.electron;
    executable = packaged ? process.execPath : dev;
    args = packaged ? [] : [appRoot];
  }
  return {
    userData,
    executable,
    args: [...args, ...(profile === 'default' ? [] : [`--profile=${profile}`])],
  };
}
async function connect(config, request) {
  const connection = JSON.parse(
    await fs.readFile(path.join(config.userData, 'agent', 'connection.json'), 'utf8'),
  );
  // Discovery is a local filesystem capability, never a host/port pair.
  if (
    typeof connection.endpoint !== 'string' ||
    (process.platform === 'win32'
      ? !connection.endpoint.startsWith('\\\\.\\pipe\\nai-studio-')
      : connection.endpoint !== path.join(config.userData, 'agent', 's'))
  )
    throw Error('本机连接地址无效');
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(connection.endpoint);
    let data = '';
    socket.setEncoding('utf8');
    socket.setTimeout(120000, () => {
      socket.destroy();
      reject(Error('软件没有及时响应'));
    });
    socket.once('error', reject);
    socket.once('connect', () =>
      socket.write(JSON.stringify({ ...request, token: connection.token }) + '\n'),
    );
    socket.on('data', (chunk) => {
      data += chunk;
      if (Buffer.byteLength(data) > 32 * 1024 * 1024) {
        socket.destroy();
        reject(Error('响应过大'));
        return;
      }
      if (data.includes('\n')) {
        socket.end();
        try {
          resolve(JSON.parse(data.slice(0, data.indexOf('\n'))));
        } catch (e) {
          reject(e);
        }
      }
    });
    socket.once('end', () => {
      if (!data.includes('\n')) reject(Error('连接在返回结果前关闭'));
    });
  });
}
export async function main(argv = process.argv.slice(2), services = {}) {
  const request = parse(argv);
  if (request.name === 'help')
    return {
      ok: true,
      data: {
        usage: 'nai-studio <命令> [--json <JSON对象>] [--profile=demo]',
        imageOperations: {
          title: '图片操作',
          shapes: [
            { type: 'rect', x: 0, y: 0, width: 100, height: 80 },
            { type: 'ellipse', cx: 300, cy: 200, rx: 60, ry: 90 },
            {
              type: 'polygon',
              points: [
                [10, 10],
                [200, 40],
                [120, 180],
              ],
            },
          ],
          shapeLimits: 'polygon 3–64 个点。所有坐标和 grow 都是原图像素。',
          workflow: [
            '导演工具先用 generate.estimate-director 估价，再用 generate.director 发起。约 1MP 时线稿、草图、上色、换表情各 20 Anlas，符合条件的 Opus 免费；去背景、去杂物较贵，各 65 Anlas，Opus 也收费。去背景一次返回三张，属于同一版。换表情适合正面清楚的单人脸。中转站不支持。',
            '先 version.list 找到图片的 projectId（原图用根版本 project.id）。',
            '先估价再发起，默认进入 pending；Agent 不能调用 generate.confirm，也不能修改确认或费用设置。',
            '放大、增强用源图那一版的提示词，不看草稿；局部重绘、扩图用当前草稿，提示词写新区域里要有什么。',
            '局部重绘：image.grid 看原图坐标 → 写 shapes → generate.estimate-inpaint 看 previewPath → 调整形状再估价 → generate.inpaint。',
            '用户已涂好时先 inpaint.get 看 previewPath/cropPath，再改草稿；useCurrent:true 可使用同步的遮罩发起重绘。',
            'shapes、maskPath、useCurrent:true 恰好给一种。rect 可省略；给了就必须包含全部遮罩。grow 为 0–128 原图像素，只用于 shapes。',
            'maskPath 只读本地 PNG（不超过 50 MB），尺寸与原图一致，亮度过半为重画；Agent 结果新增版本，不切换用户舞台。',
          ],
          examples: [
            {
              name: 'generate.estimate-director',
              input: { tabId: 'TAB', imageId: 'IMAGE', tool: 'bg-removal' },
            },
            {
              name: 'generate.director',
              input: {
                tabId: 'TAB',
                imageId: 'IMAGE',
                tool: 'emotion',
                emotion: 'happy',
                prompt: '',
                defry: 0,
              },
            },
            {
              name: 'generate.estimate-op',
              input: { tabId: 'TAB', imageId: 'IMAGE', op: 'upscale' },
            },
            { name: 'generate.upscale', input: { tabId: 'TAB', imageId: 'IMAGE' } },
            {
              name: 'generate.estimate-op',
              input: { tabId: 'TAB', imageId: 'IMAGE', op: 'enhance', magnitude: 2, scale: 1 },
            },
            {
              name: 'generate.enhance',
              input: { tabId: 'TAB', imageId: 'IMAGE', magnitude: 2, scale: 1 },
            },
            {
              name: 'generate.estimate-outpaint',
              input: {
                tabId: 'TAB',
                imageId: 'IMAGE',
                edges: { left: 64, right: 0, top: 0, bottom: 0 },
              },
            },
            {
              name: 'generate.outpaint',
              input: {
                tabId: 'TAB',
                imageId: 'IMAGE',
                edges: { left: 64, right: 0, top: 0, bottom: 0 },
              },
            },
            { name: 'image.grid', input: { tabId: 'TAB', imageId: 'IMAGE' } },
            {
              name: 'generate.estimate-inpaint',
              input: {
                tabId: 'TAB',
                imageId: 'IMAGE',
                shapes: [{ type: 'rect', x: 100, y: 100, width: 128, height: 128 }],
              },
            },
            {
              name: 'generate.inpaint',
              input: {
                tabId: 'TAB',
                imageId: 'IMAGE',
                shapes: [{ type: 'rect', x: 100, y: 100, width: 128, height: 128 }],
              },
            },
            { name: 'inpaint.get', input: {} },
            { name: 'generate.inpaint', input: { tabId: 'TAB', useCurrent: true } },
          ],
        },
        commands: Object.entries(commandRegistry)
          .filter(([, v]) => !v.uiOnly)
          .map(([name, v]) => ({
            name,
            input: v.fields,
            required: v.required || [],
            ...(v.example ? { example: v.example } : {}),
            ...(name.startsWith('material.pool.')
              ? {
                  description:
                    '随机池素材命令。名称区分大小写且禁止 _ * ~；chance 为正数相对概率（默认 1）。replace 按行替换、忽略空行；rename 同步打开的草稿，不改历史版本；delete 保留草稿引用。',
                }
              : {}),
            ...(name.startsWith('block.random.')
              ? {
                  description:
                    '基础或角色正面提示词随机块：__池名*2r~0.8-1.2/0.1__。count 1～16，repeat 默认 false；min/max 成对提供（0.1～3），step 默认 0.05（0.01～1）。每张图发送前独立抽取，模板和 Seed 不变，生成仍遵守确认规则。',
                }
              : {}),
            ...(name === 'version.apply-random'
              ? {
                  description:
                    '把所选图的实际抽取内容写回草稿。imageId 接受版本图片 id 或图库 projectId；按 scope/start/source 匹配，返回 applied 数量和 skipped 记录。抽取记录在 version.list 的 versions[].images[].random.blocks。',
                }
              : {}),
            ...(name === 'generate.status'
              ? {
                  description:
                    '按 id 查询；省略 id 返回全部未结束任务及最近 20 条已结束任务。limit 为 1–100，仅限制已结束条数。返回值不含内嵌图片。',
                }
              : {}),
          })),
      },
    };
  validateCommand(request.name, request.input, 'agent');
  if (request.input.path) request.input.path = path.resolve(request.input.path);
  if (request.input.maskPath) request.input.maskPath = path.resolve(request.input.maskPath);
  const config = await (services.configuration || configuration)(request.profile);
  const requestConnection = services.connect || connect;
  try {
    return await requestConnection(config, request);
  } catch (error) {
    if (!['ENOENT', 'ECONNREFUSED', 'EPIPE'].includes(error.code)) throw error;
    if (process.env.NAI_STUDIO_NO_LAUNCH === '1') throw error;
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const child = (services.spawn || spawn)(config.executable, config.args, {
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
      env,
      shell: false,
    });
    child.unref();
    await new Promise((resolve, reject) => {
      child.once('spawn', resolve);
      child.once('error', reject);
    });
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      try {
        return await requestConnection(config, request);
      } catch (e) {
        if (!['ENOENT', 'ECONNREFUSED', 'EPIPE'].includes(e.code)) throw e;
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    return { ok: false, error: { code: 'app_busy', message: '软件还没有准备好，请稍后再试' } };
  }
}
