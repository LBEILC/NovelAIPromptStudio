const events = new Set(),
  preparations = new Set(),
  uploads = new Map();
const files = new WeakMap();
let resetting = false;
let preparation;
async function prepareUI() {
  if (!preparation) {
    preparation = (async () => {
      for (const callback of preparations) await callback();
    })().finally(() => {
      preparation = undefined;
    });
  }
  await preparation;
}
const abandoned = () => new Promise(() => {});
function clearWorkbenchCache() {
  for (const key of Object.keys(localStorage))
    if (key.includes('workbench')) localStorage.removeItem(key);
}
const startup = await (await fetch('/__preview/status')).json();
if (localStorage.getItem('ui-preview-session') !== startup.directory) clearWorkbenchCache();
localStorage.setItem('ui-preview-session', startup.directory);
async function request(endpoint, data) {
  if (resetting && endpoint === 'invoke') return abandoned();
  const res = await fetch(`/__preview/${endpoint}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-UI-Preview': '1' },
    body: JSON.stringify(data),
  });
  if (resetting && endpoint === 'invoke') return abandoned();
  const result = await res.json();
  if (!res.ok) throw Error(result.error);
  return result;
}
function chooseFiles(multiple) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = multiple;
    input.accept = '.png,.jpg,.jpeg,.webp,.zip';
    input.onchange = () => resolve(Array.from(input.files || []));
    input.oncancel = () => resolve([]);
    input.click();
  });
}
function pathsForFiles(list) {
  return Array.from(list || [], (file) => {
    if (files.has(file)) return files.get(file);
    const id = `preview-upload:${crypto.randomUUID()}`;
    files.set(file, id);
    uploads.set(
      id,
      fetch(`/__preview/upload?name=${encodeURIComponent(file.name)}`, {
        method: 'POST',
        headers: { 'X-UI-Preview': '1' },
        body: file,
      }).then(async (res) => {
        const result = await res.json();
        if (!res.ok) throw Error(result.error);
        return result.path;
      }),
    );
    return id;
  });
}
async function resolveUploads(value) {
  if (typeof value === 'string' && uploads.has(value)) return uploads.get(value);
  if (Array.isArray(value)) return Promise.all(value.map(resolveUploads));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      await Promise.all(Object.entries(value).map(async ([k, v]) => [k, await resolveUploads(v)])),
    );
  return value;
}
window.studio = {
  pathsForFiles,
  onCommandEvent(callback) {
    events.add(callback);
    return () => events.delete(callback);
  },
  onCommandPrepare(callback) {
    preparations.add(callback);
    return () => preparations.delete(callback);
  },
  async invoke(name, input = {}) {
    // HTTP adds latency to the local-tab commit. Publish it before reading versions.
    if (name === 'version.list') await prepareUI();
    if (
      (['import.prepare', 'import.files'].includes(name) &&
        !input.paths?.length &&
        !input.fromClipboard) ||
      (name === 'workbench.open' && !input.path && !input.source && !input.libraryId)
    ) {
      const selected = await chooseFiles(name !== 'workbench.open');
      if (!selected.length)
        return {
          ok: true,
          data: {
            ok: true,
            canceled: true,
            project: null,
            imported: [],
            duplicates: [],
            errors: [],
          },
        };
      const paths = pathsForFiles(selected);
      input = name === 'workbench.open' ? { ...input, path: paths[0] } : { ...input, paths };
    }
    if (name === 'clipboard.write-text') {
      await navigator.clipboard?.writeText(input.text).catch(() => {});
    }
    if (name === 'clipboard.read-text') {
      try {
        return { ok: true, data: await navigator.clipboard.readText() };
      } catch {}
    }
    if (name === 'image.save-as') {
      let file = input.path;
      if (input.id) {
        const r = await request('invoke', { name: 'library.get', input: { id: input.id } });
        file = r.data?.project?.image_path;
      }
      if (file) {
        const a = document.createElement('a');
        a.href = `/__preview/media?path=${encodeURIComponent(file)}`;
        a.download = input.name || 'preview.png';
        a.click();
        return { ok: true, data: { ok: true, filePath: file } };
      }
    }
    return request('invoke', { name, input: await resolveUploads(input) });
  },
};
const stream = new EventSource('/__preview/events');
stream.onmessage = (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'preview-session') {
    if (message.directory !== startup.directory) location.reload();
    return;
  }
  if (message.type === 'preview-reset-start') {
    resetting = true;
    return;
  }
  if (message.type === 'preview-reset-complete') {
    clearWorkbenchCache();
    location.reload();
    return;
  }
  if (message.type === 'preview-appearance') {
    location.reload();
    return;
  }
  for (const callback of events) callback(message);
};
await import('/src/main.tsx');
const host = document.createElement('div');
host.style.cssText = 'position:fixed;bottom:8px;left:8px;z-index:2147483647';
document.body.append(host);
const shadow = host.attachShadow({ mode: 'open' });
shadow.innerHTML = `<style>:host{font:13px system-ui;color:#222}button,select{font:inherit;padding:5px;margin:3px;border:1px solid #bbb;border-radius:4px;background:#fff;color:#222;cursor:pointer}section{width:290px;max-height:65vh;overflow:auto;padding:10px;background:#f3f3f3;border:1px solid #aaa;box-shadow:0 2px 14px #0003}section[hidden]{display:none}h4{margin:8px 3px}p{margin:4px;line-height:1.5}output{display:block;color:#a22}</style><section hidden><h4>预览场景</h4><div id="actions"></div><output></output></section><button id="toggle">预览场景</button>`;
const panel = shadow.querySelector('section');
shadow.querySelector('#toggle').onclick = () => (panel.hidden = !panel.hidden);
const actions = shadow.querySelector('#actions');
function add(label, action, value) {
  const b = document.createElement('button');
  b.textContent = label;
  b.onclick = async () => {
    b.disabled = true;
    try {
      shadow.querySelector('output').textContent = '';
      if (action.startsWith('agent-')) await prepareUI();
      const r = await request('scenario', { action, value });
      if (r.reload) {
        for (const key of Object.keys(localStorage))
          if (key.includes('workbench')) localStorage.removeItem(key);
        location.reload();
      }
    } catch (error) {
      shadow.querySelector('output').textContent = error.message;
    } finally {
      b.disabled = false;
    }
  };
  actions.append(b);
}
add('重置数据', 'reset');
add('空图片库', 'empty');
add('没有令牌', 'token', false);
add('已填令牌', 'token', true);
add('没有 AI', 'ai', false);
add('已配置 AI', 'ai', true);
for (const code of [401, 402, 422, 429, 500, 'offline'])
  add(code === 'offline' ? '生成连不上' : `生成失败 ${code}`, 'generation-error', code);
add('生成变慢', 'slow-generation', true);
add('恢复生成速度', 'slow-generation', false);
add('未订阅', 'account', 'unsubscribed');
add('V5 用量用完', 'account', 'usage');
add('余额不足', 'account', 'balance');
add('恢复账号', 'account', 'normal');
add('下次 AI 失败', 'ai-error');
add('Agent 改 Tag', 'agent-edit');
add('Agent 排两次生成', 'agent-generate');
add('导入变慢', 'slow-import', true);
add('恢复导入速度', 'slow-import', false);
add('2000 张图片', 'many');
add('浅色', 'appearance', { themeMode: 'light' });
add('深色', 'appearance', { themeMode: 'dark' });
add('完整动效', 'appearance', { motion: 'full' });
add('关闭动效', 'appearance', { motion: 'off' });
