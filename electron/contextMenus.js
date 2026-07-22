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

function safeCollections(collections) {
  return (Array.isArray(collections) ? collections : []).slice(0, 100).map((collection) => ({
    id: String(collection?.id || ''),
    name: String(collection?.name || '').trim().slice(0, 80),
  })).filter((collection) => collection.id && collection.name);
}

function safeSeries(series) {
  return (Array.isArray(series) ? series : []).slice(0, 100).map((entry) => ({
    id: String(entry?.id || ''),
    name: String(entry?.name || '').trim().slice(0, 80),
  })).filter((entry) => entry.id && entry.name);
}

function safeExperiments(experiments) {
  return (Array.isArray(experiments) ? experiments : []).slice(0, 100).map((entry) => ({
    id: String(entry?.id || ''),
    name: String(entry?.name || '').trim().slice(0, 80),
  })).filter((entry) => entry.id && entry.name);
}

function safeResults(results) {
  return (Array.isArray(results) ? results : []).slice(0, 20).map((result) => ({
    id: String(result?.project_id || ''),
    name: String(result?.name || '结果图').trim().slice(0, 100),
  })).filter((result) => result.id);
}

export function buildContextMenuTemplate(request = {}, select = () => {}) {
  if (request.kind === 'text') return [
    { role: 'undo' },
    { role: 'redo' },
    { type: 'separator' },
    { role: 'cut' },
    { role: 'copy' },
    { role: 'paste' },
    { type: 'separator' },
    { role: 'selectAll' },
  ];

  if (request.kind === 'project') {
    const collections = safeCollections(request.collections);
    const series = safeSeries(request.series);
    const experiments = safeExperiments(request.experiments);
    return [
      actionItem('打开 Prompt 总览', 'project:open-prompt', select),
      actionItem('复制 Prompt', 'project:copy-prompt', select),
      actionItem('在文件夹中显示', 'project:reveal', select),
      { type: 'separator' },
      actionItem(request.favorite ? '取消收藏' : '收藏', 'project:toggle-favorite', select),
      {
        label: '加入收藏集',
        enabled: collections.length > 0,
        submenu: collections.map((collection) => actionItem(collection.name, `project:add-collection:${collection.id}`, select)),
      },
      {
        label: '加入创作系列',
        enabled: series.length > 0,
        submenu: series.map((entry) => actionItem(entry.name, `project:add-series:${entry.id}`, select)),
      },
      {
        label: '加入对比实验',
        enabled: experiments.length > 0,
        submenu: experiments.map((entry) => actionItem(entry.name, `project:add-experiment:${entry.id}`, select)),
      },
      { type: 'separator' },
      actionItem(request.deleted ? '恢复到作品库' : '移入回收站', 'project:toggle-trash', select),
    ];
  }

  if (request.kind === 'project-simple') return [
    actionItem('在工作台中打开', 'project:open-workbench', select),
    actionItem('复制原始 Prompt', 'project:copy-prompt', select),
    actionItem('在文件夹中显示', 'project:reveal', select),
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

  if (request.kind === 'vibe-current') return [
    actionItem(request.enabled ? '停用' : '启用', 'vibe:toggle', select),
    actionItem('打开源图所在文件夹', 'vibe:reveal-source', select, { enabled: Boolean(request.hasSource) }),
    actionItem('显示 .naiv4vibe 文件', 'vibe:reveal-file', select, { enabled: Boolean(request.fileUsable) }),
    { type: 'separator' },
    actionItem('从当前分支移除', 'vibe:remove', select),
  ];

  if (request.kind === 'vibe-library') return [
    actionItem(request.inUse ? '已在当前分支中' : '加入当前分支', 'vibe-library:use', select, { enabled: !request.inUse }),
    actionItem('打开源图所在文件夹', 'vibe-library:reveal-source', select, { enabled: Boolean(request.hasSource) }),
    actionItem('显示 .naiv4vibe 文件', 'vibe-library:reveal-file', select, { enabled: Boolean(request.hasFile) }),
    { type: 'separator' },
    actionItem('编辑资料', 'vibe-library:edit', select),
    actionItem(request.archived ? '恢复到 Vibe 库' : '归档', 'vibe-library:archive', select),
  ];

  if (request.kind === 'branch') {
    const status = String(request.status || '');
    const results = safeResults(request.results);
    return [
      actionItem('打开分支', 'branch:open', select),
      actionItem('复制分支 Prompt', 'branch:copy-prompt', select),
      ...(status === 'draft' ? [actionItem('标记为待生成', 'branch:mark-waiting', select)] : []),
      ...(['waiting', 'result', 'mismatch'].includes(status) ? [actionItem('上传结果图', 'branch:upload-result', select)] : []),
      {
        label: '关联结果',
        enabled: results.length > 0,
        submenu: results.flatMap((result, index) => [
          actionItem(`打开 · ${result.name}`, `branch:open-result:${result.id}`, select),
          actionItem(`在文件夹中显示 · ${result.name}`, `branch:reveal-result:${result.id}`, select),
          ...(index < results.length - 1 ? [{ type: 'separator' }] : []),
        ]),
      },
      ...(status === 'draft' ? [{ type: 'separator' }, actionItem('放弃草稿', 'branch:discard', select)] : []),
    ];
  }

  return [];
}
