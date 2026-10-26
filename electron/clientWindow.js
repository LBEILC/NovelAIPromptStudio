import fs from 'node:fs';
import path from 'node:path';

export function openExternalLink(shell, candidate) {
  try {
    const url = new URL(candidate);
    if (['http:', 'https:'].includes(url.protocol)) return shell.openExternal(url.href);
  } catch {}
  return Promise.resolve();
}

export function themeBackground(root, theme) {
  const directory = path.join(root, 'dist', 'assets');
  const sheets = fs.existsSync(directory)
    ? fs
        .readdirSync(directory)
        .filter((name) => name.endsWith('.css'))
        .map((name) => fs.readFileSync(path.join(directory, name), 'utf8'))
    : [fs.readFileSync(path.join(root, 'design', 'tokens.css'), 'utf8')];
  for (const css of sheets) {
    const block = css.match(new RegExp(`\\[data-theme=["']?${theme}["']?\\]\\s*\\{([^}]+)\\}`));
    const value = block?.[1].match(/--bg:\s*([^;}]+)/)?.[1].trim();
    if (value) return value;
  }
  throw new Error('Theme background token is missing');
}

export function guardClientWindow(window, { packaged, shell }) {
  const contents = window.webContents;
  contents.session.spellCheckerEnabled = false;
  contents.on('will-navigate', (event, url) => {
    event.preventDefault();
    void openExternalLink(shell, url);
  });
  contents.setWindowOpenHandler(({ url }) => {
    void openExternalLink(shell, url);
    return { action: 'deny' };
  });
  if (packaged) {
    void contents.setVisualZoomLevelLimits(1, 1);
    contents.setZoomFactor(1);
    contents.on('before-input-event', (event, input) => {
      const key = input.key.toLowerCase();
      const modifier = input.control || input.meta;
      if (
        key === 'f5' ||
        key === 'f12' ||
        (modifier && ['r', '+', '-', '=', '0'].includes(key)) ||
        (modifier && (input.shift || input.alt) && ['i', 'j', 'c'].includes(key))
      )
        event.preventDefault();
    });
    contents.on('before-mouse-event', (event, input) => {
      if (input.type === 'mouseWheel' && input.modifiers?.includes('control'))
        event.preventDefault();
    });
  }
}

export function clientMenu({ app, navigate, feedback, development }) {
  return [
    {
      label: app.name,
      submenu: [
        { label: '关于 NovelAI Prompt Studio', click: () => navigate('about') },
        { label: '设置…', accelerator: 'Command+,', click: () => navigate('settings') },
        { type: 'separator' },
        { label: '隐藏', role: 'hide' },
        { label: '隐藏其他', role: 'hideOthers' },
        { label: '全部显示', role: 'unhide' },
        { type: 'separator' },
        { label: '退出', role: 'quit' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' },
      ],
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', role: 'minimize' },
        { label: '缩放', role: 'zoom' },
        { label: '全屏', role: 'togglefullscreen' },
        { label: '前置全部窗口', role: 'front' },
        ...(development
          ? [
              { type: 'separator' },
              { label: '刷新', role: 'reload' },
              { label: '开发者工具', role: 'toggleDevTools' },
              { label: '放大页面', role: 'zoomIn' },
              { label: '缩小页面', role: 'zoomOut' },
            ]
          : []),
      ],
    },
    {
      label: '帮助',
      role: 'help',
      submenu: [
        { label: '功能一览', click: () => navigate('help') },
        { label: '查看引导', click: () => navigate('onboarding') },
        { label: '更新日志', click: () => navigate('changelog') },
        { type: 'separator' },
        { label: '报告问题', click: () => feedback('bug', '[问题] ') },
      ],
    },
  ];
}
