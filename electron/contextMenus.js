const TAG_CATEGORIES = [
  ['Artist', '画师'],
  ['Character', '角色'],
  ['Clothing', '服装'],
  ['Scene', '场景'],
  ['Style', '风格'],
  ['Unsorted', '未分类'],
];

function actionItem(label, action, select, options = {}) {
  return { label, click: () => select(action), ...options };
}

export function buildContextMenuTemplate(request = {}, select = () => {}) {
  if (request.kind === 'text') return [
    { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
    { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
    { type: 'separator' }, { role: 'selectAll' },
  ];

  if (request.kind === 'project-simple') return [
    actionItem('在工作台中打开', 'project:open-workbench', select),
    actionItem('复制原始 Prompt', 'project:copy-prompt', select),
    actionItem('在文件夹中显示', 'project:reveal', select),
    { type: 'separator' },
    actionItem('从图片库移除', 'project:delete', select),
  ];

  if (request.kind === 'tag') return [
    actionItem('复制 Tag', 'tag:copy', select),
    actionItem('复制翻译', 'tag:copy-translation', select, { enabled: Boolean(request.hasTranslation) }),
    actionItem('编辑', 'tag:edit', select),
    actionItem('AI 翻译与分类', 'tag:translate', select),
    {
      label: '设置分类',
      submenu: TAG_CATEGORIES.map(([category, label]) => actionItem(label, `tag:category:${category}`, select, { type: 'radio', checked: request.category === category })),
    },
    { type: 'separator' },
    actionItem('删除 Tag', 'tag:delete', select),
  ];

  return [];
}
