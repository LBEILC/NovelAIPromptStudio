export async function settingsCopyChecks(h) {
  const { evaluate: e, check, section, wait } = h;
  h.category('设置·文案');
  await section('关于与更新');
  const modifier = process.platform === 'darwin' ? '⌘' : 'Ctrl';
  const shortcuts = [
    ['打开图片；在图片库里是导入', [[modifier, 'I']]],
    ['从剪贴板打开或导入图片', [[modifier, 'V']]],
    ['聚焦搜索框', [[modifier, 'K']]],
    [
      '下一个 / 上一个标签页',
      [
        [modifier, 'Tab'],
        [modifier, 'Shift', 'Tab'],
      ],
    ],
    ['关闭当前标签页', [[modifier, 'W']]],
    ['移动当前 Tag', [[process.platform === 'darwin' ? '⌥' : 'Alt', '方向键']]],
    ['在图片之间移动', [['方向键']]],
    ['在一摞图片里切换', [['←'], ['→']]],
    ['在工作台打开', [['Enter']]],
    ['看大图', [['Space']]],
    ['全选图片', [[modifier, 'A']]],
    ['取消选择；关闭大图', [['Esc']]],
  ];
  await check(
    '快捷键按定稿顺序显示，每个键独立成框且绑定之间只有斜线',
    `(()=>{const rows=[...document.querySelectorAll('.settings-shortcuts')];return JSON.stringify(rows.map(row=>[row.previousElementSibling.textContent,[...row.querySelectorAll('.settings-shortcut-binding')].map(group=>[...group.querySelectorAll('kbd')].map(key=>key.textContent))]))===${JSON.stringify(JSON.stringify(shortcuts))} && rows.every(row=>row.querySelectorAll('.settings-shortcut-separator').length===row.querySelectorAll('.settings-shortcut-binding').length-1 && [...row.querySelectorAll('.settings-shortcut-separator')].every(n=>n.textContent==='/'))})()`,
    undefined,
    'once',
  );
  await h.screenshot('settings-about-copy');
  await e(
    `[...document.querySelectorAll('.settings-copy h2')].find(n=>n.textContent==='快捷键').scrollIntoView({block:'start'})`,
  );
  await h.screenshot('settings-about-shortcuts');
  const privacy = [
    ['图片和图库数据只存在这台电脑上', ['位置见"图片库"那一页。软件不会上传图片']],
    [
      '这些时候会联网，都不会发送图片',
      [
        '检查和下载更新：访问 GitHub。自动检查可以在上面关掉；更新说明里带图片时，会从图片所在的网站加载',
        '翻译与分类：内置词典里没有的 Tag，会把 Tag 的名字发给 Danbooru，查它属于哪一类；配置了 AI 服务时，还没有译文的 Tag 会再发给你配置的服务',
        '段落的"译成中文""按中文改写英文"：把这一段文字发给你配置的 AI 服务',
        '读取模型列表、测试连接：只和你配置的 AI 服务通信，不带你的提示词',
        '报告问题、提出建议：在浏览器里打开 GitHub，不自动附带任何数据',
      ],
    ],
    [
      'API Key 加密后保存在这台电脑上',
      ['用系统自带的加密能力加密，软件不保存明文；诊断信息和报告问题都不会带上它'],
    ],
  ];
  await check(
    '数据与隐私三行和五项联网说明逐字匹配定稿',
    `(()=>{let row=[...document.querySelectorAll('.settings-copy h2')].find(n=>n.textContent==='数据与隐私').nextElementSibling;const actual=[];while(row?.classList.contains('settings-line')){actual.push([row.firstElementChild.firstChild.textContent,[...row.querySelectorAll('small')].map(n=>n.textContent)]);row=row.nextElementSibling;}return JSON.stringify(actual)===${JSON.stringify(JSON.stringify(privacy))}})()`,
    undefined,
    'once',
  );
  await e(
    `[...document.querySelectorAll('.settings-copy h2')].find(n=>n.textContent==='数据与隐私').scrollIntoView({block:'start'})`,
  );
  await h.screenshot('settings-about-privacy');
  await section('AI 服务');
  await wait('!!document.querySelector("input[type=password]")');
  await check(
    'AI Key 说明与关于页采用一致的加密存储文案',
    `document.querySelector('input[type=password]').closest('.settings-column').lastElementChild.textContent==='加密后保存在这台电脑上，软件不保存明文'`,
    undefined,
    'once',
  );
}
