const events = new Set(),
  preparations = new Set(),
  uploads = new Map();
const files = new WeakMap();
let resetting = false;
// 托盘菜单（doc/design.md 2.28）：外框里用一个 iframe 打开 #tray-menu 来模拟托盘的菜单窗口
const TRAY = location.hash === '#tray-menu';
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
// 外框上的"导入 · 压缩包"：下一次打开文件时直接用后台打好的 ZIP，不弹选择框
let nextPick = null;
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
      if (nextPick && name !== 'workbench.open') {
        input = { ...input, paths: nextPick };
        nextPick = null;
        return request('invoke', { name, input: await resolveUploads(input) });
      }
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
    // 关闭弹框和托盘菜单在产品里由主进程处理；预览里只在外框上显示结果
    if (name === 'window.close-choice') {
      out.textContent = `关闭窗口：${input.action === 'tray' ? '最小化到托盘' : '退出'}${input.remember ? '（不再询问）' : ''}`;
      if (input.remember)
        await request('invoke', {
          name: 'settings.productivity.save',
          input: { settings: { closeAction: input.action } },
        });
      return { ok: true, data: {} };
    }
    if (name === 'tray.menu-size' || name === 'tray.action') {
      parent.postMessage({ trayMenu: name, input }, location.origin);
      return { ok: true, data: {} };
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
// 外框发给托盘菜单 iframe 的事件（tray-menu-open）
addEventListener('message', (event) => {
  if (event.origin !== location.origin || !event.data?.pvEvent) return;
  for (const callback of events) callback(event.data.pvEvent);
});
// 预览的外框：上面一排模拟按钮，下面一个 1240×760 的窗口（和原来的交互原型一样）；平台可以切 Windows / macOS
const PLATFORM_KEY = 'nps-preview-platform';
const platform = (() => {
  try {
    return localStorage.getItem(PLATFORM_KEY) || 'windows';
  } catch {
    return 'windows';
  }
})();
await import('/src/main.tsx');
// 托盘菜单的 iframe 只要菜单本身，不要外框：停在这里，下面的外框代码不再执行
if (TRAY) await new Promise(() => {});
await import('/preview/frame.css');
const html = document.documentElement;
html.classList.add('pv');
html.dataset.platform = platform;
const bar = document.createElement('header');
bar.className = 'pv-bar';
const stage = document.createElement('main');
stage.className = 'pv-stage';
const rootEl = document.getElementById('root');
document.body.prepend(bar);
rootEl.replaceWith(stage);
stage.append(rootEl);
// 平台的外壳：Windows 右边是窗口按钮，macOS 左边是红绿灯（产品里都是系统画的，这里只是示意）
const dressShell = () => {
  const tb = rootEl.querySelector('.tb');
  if (!tb) return;
  const wc = tb.querySelector('.wc');
  if (wc && !wc.childElementCount && platform === 'windows')
    wc.innerHTML = '<span>—</span><span>☐</span><span>✕</span>';
  if (platform === 'macos' && !tb.querySelector('.lights'))
    tb.insertAdjacentHTML(
      'afterbegin',
      '<span class="lights" aria-hidden="true"><i></i><i></i><i></i></span>',
    );
};
new MutationObserver(dressShell).observe(rootEl, { childList: true, subtree: true });
const out = document.createElement('span');
out.className = 'pv-out';
const group = (title, items) => {
  const g = document.createElement('div');
  g.className = 'pv-group';
  const head = document.createElement('span');
  head.textContent = title;
  g.append(head);
  for (const [label, run, on] of items) {
    const b = document.createElement('button');
    b.textContent = label;
    if (on?.()) b.classList.add('on');
    b.onclick = async () => {
      b.disabled = true;
      out.textContent = '';
      try {
        await run();
      } catch (error) {
        out.textContent = error.message;
      } finally {
        b.disabled = false;
      }
    };
    g.append(b);
  }
  bar.append(g);
};
const act = (action, value) => async () => {
  if (action.startsWith('agent-')) await prepareUI();
  const r = await request('scenario', { action, value });
  if (r.reload) {
    if (action === 'chatgpt') sessionStorage.setItem('preview-chatgpt-scene', String(value));
    for (const key of Object.keys(localStorage))
      if (key.includes('workbench')) localStorage.removeItem(key);
    location.reload();
  }
};
bar.innerHTML = '<b>界面整体预览</b>';
group('主题', [
  ['浅色', act('appearance', { themeMode: 'light' }), () => html.dataset.theme === 'light'],
  ['深色', act('appearance', { themeMode: 'dark' }), () => html.dataset.theme === 'dark'],
]);
group('动效', [
  ['完整', act('appearance', { motion: 'full' }), () => html.dataset.motion !== 'off'],
  ['关闭', act('appearance', { motion: 'off' }), () => html.dataset.motion === 'off'],
]);
const setPlatform = (p) => async () => {
  localStorage.setItem(PLATFORM_KEY, p);
  location.reload();
};
group('平台', [
  ['Windows', setPlatform('windows'), () => platform === 'windows'],
  ['macOS', setPlatform('macos'), () => platform === 'macos'],
]);
// 窗口的常用尺寸：最小 1080×700（软件允许的最小窗口，electron/main.js）、默认 1240×760，以及几种常见的屏幕
const SIZE_KEY = 'nps-preview-size';
const SIZES = [
  ['1080×700', '最小'],
  ['1240×760', '默认'],
  ['1366×768', ''],
  ['1440×900', ''],
  ['1920×1080', ''],
];
let size = (() => {
  try {
    return localStorage.getItem(SIZE_KEY) || '1240×760';
  } catch {
    return '1240×760';
  }
})();
const applySize = () => {
  const [w, h] = size.split('×');
  rootEl.style.width = w + 'px';
  rootEl.style.height = h + 'px';
  for (const b of bar.querySelectorAll('[data-size]'))
    b.classList.toggle('on', b.dataset.size === size);
  // 产品里窗口大小变了会触发 resize；这里改的是外框，补发一次
  dispatchEvent(new Event('resize'));
};
group(
  '尺寸',
  SIZES.map(([s, note]) => [
    note ? s + ' ' + note : s,
    async () => {
      size = s;
      try {
        localStorage.setItem(SIZE_KEY, s);
      } catch {
        /* 记不住也照常能用 */
      }
      applySize();
    },
    () => size === s,
  ]),
);
bar.lastElementChild.querySelectorAll('button').forEach((b, i) => (b.dataset.size = SIZES[i][0]));
applySize();
group('数据', [
  ['首次启动', act('onboarding')],
  ['重来', act('reset')],
  ['空图片库', act('empty')],
  ['2000 张图片', act('many')],
]);
group('账号', [
  ['没有令牌', act('token', false)],
  ['已填令牌', act('token', true)],
  ['未订阅', act('account', 'unsubscribed')],
  ['V5 用量用尽', act('account', 'usage')],
  ['余额不足', act('account', 'balance')],
  ['恢复账号', act('account', 'normal')],
  ['钥匙串被拒绝', act('keychain', 'denied')],
  ['密钥解不开', act('keychain', 'unreadable')],
  ['钥匙串正常', act('keychain', 'ok')],
]);
group('生成', [
  ...[401, 402, 422, 429, 500].map((code) => ['下次失败 ' + code, act('generation-error', code)]),
  ['下次连不上', act('generation-error', 'offline')],
  ['变慢', act('slow-generation', true)],
  ['恢复速度', act('slow-generation', false)],
  ['扩图第 2 块失败', act('outpaint-failure', true)],
  ['恢复扩图', act('outpaint-failure', false)],
]);
group('AI 服务', [
  ['ChatGPT 未登录', act('chatgpt', 'signed-out')],
  ['ChatGPT Plus', act('chatgpt', 'plus')],
  ['ChatGPT 免费账号', act('chatgpt', 'free')],
  ['ChatGPT 额度用完', act('chatgpt', 'limited')],
  ['Codex 两个窗口', act('chatgpt', 'codex-plus')],
  ['Codex Pro 一个窗口', act('chatgpt', 'codex-pro')],
  ['未配置', act('ai', false)],
  ['已配置', act('ai', true)],
  ['下次 AI 失败', act('ai-error')],
]);
const chatGPTScene = sessionStorage.getItem('preview-chatgpt-scene');
if (chatGPTScene) {
  sessionStorage.removeItem('preview-chatgpt-scene');
  const clickWhenReady = async (label) => {
    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      const button = [...document.querySelectorAll('button')].find(
        (b) => b.textContent.trim() === label && b.getClientRects().length && !b.disabled,
      );
      if (button) {
        button.click();
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  };
  void (async () => {
    await clickWhenReady('设置');
    await clickWhenReady('AI 服务');
    if (chatGPTScene === 'free') await clickWhenReady('登录 ChatGPT');
  })();
}
group('Agent', [
  ['改提示词', act('agent-edit')],
  ['排两次生成', act('agent-generate')],
  ['排图片操作', act('agent-ops')],
]);
// 托盘菜单：贴着外框右下角弹出（像任务栏在下面时从托盘图标往上弹）；点外面、Esc、点了一项就关
let trayFrame = null;
const trayMessages = (event) => {
  if (event.origin !== location.origin || !event.data?.trayMenu || !trayFrame) return;
  const { trayMenu, input } = event.data;
  if (trayMenu === 'tray.menu-size') {
    trayFrame.style.width = input.width + 'px';
    trayFrame.style.height = input.height + 'px';
    trayFrame.style.visibility = 'visible';
    trayFrame.focus();
  } else {
    trayFrame.style.visibility = 'hidden';
    if (input.action !== 'close')
      out.textContent = `托盘菜单：${input.action === 'show' ? '打开主窗口' : '退出'}`;
  }
};
addEventListener('message', trayMessages);
addEventListener('pointerdown', (event) => {
  if (trayFrame && event.target !== trayFrame) trayFrame.style.visibility = 'hidden';
});
const openTray = async () => {
  if (!trayFrame) {
    trayFrame = document.createElement('iframe');
    trayFrame.src = '/preview/#tray-menu';
    trayFrame.title = '托盘菜单';
    Object.assign(trayFrame.style, {
      position: 'fixed',
      right: '8px',
      bottom: '8px',
      border: '0',
      background: 'transparent',
      colorScheme: 'normal',
      visibility: 'hidden',
      zIndex: '1000',
    });
    trayFrame.setAttribute('allowtransparency', 'true');
    document.body.append(trayFrame);
    return;
  }
  trayFrame.contentWindow.postMessage({ pvEvent: { type: 'tray-menu-open' } }, location.origin);
};
group('窗口', [
  ['关闭窗口', async () => events.forEach((callback) => callback({ type: 'close-request' }))],
  ['托盘菜单', openTray],
]);
group('更新', [
  ['有新版本', act('update', true)],
  ['已是最新', act('update', false)],
]);
const importZip = async () => {
  const r = await request('scenario', { action: 'zip' });
  nextPick = [r.path];
  [...document.querySelectorAll('.tb .nav button')]
    .find((b) => b.textContent === '图片库')
    ?.click();
  await new Promise((done) => setTimeout(done, 400));
  const button = [...document.querySelectorAll('.libp .btn.ink')].find(
    (b) => b.textContent.trim() === '导入',
  );
  if (!button) throw Error('先关掉浮层和对话框');
  button.click();
};
group('导入', [
  ['压缩包', importZip],
  ['变慢', act('slow-import', true)],
  ['恢复速度', act('slow-import', false)],
]);
bar.append(out);
// 主题、动效的按钮跟着当前的样子
new MutationObserver(() => {
  for (const b of bar.querySelectorAll('.pv-group button')) {
    const t = b.textContent,
      g = b.parentElement.firstChild.textContent;
    if (g === '主题')
      b.classList.toggle('on', html.dataset.theme === (t === '深色' ? 'dark' : 'light'));
    if (g === '动效') b.classList.toggle('on', (html.dataset.motion === 'off') === (t === '关闭'));
  }
}).observe(html, { attributes: true, attributeFilter: ['data-theme', 'data-motion'] });
