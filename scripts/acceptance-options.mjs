export function acceptanceOptions(argv = process.argv.slice(2)) {
  const value = (name) =>
    argv
      .find((arg) => arg.startsWith(`--${name}=`))
      ?.split('=')
      .slice(1)
      .join('=');
  const slow = Number(value('slow') || 1);
  if (![1, 4, 6].includes(slow)) throw Error('--slow must be 1, 4 or 6');
  const category = value('category') || '全部';
  if (
    ![
      '全部',
      '工作台',
      '图片库',
      '图片库·起名',
      '图片库·复制',
      '图片库·导入',
      '图片库·收尾',
      '图片库·滚动条',
      '设置',
      '设置·AI 服务',
      '设置·翻译词典',
      '设置·版式',
      '基础组件',
      '卡片缓存',
      '外壳',
      '外壳·快捷键',
      '动效',
      '诊断',
      '诊断·渲染器',
    ].includes(category)
  )
    throw Error(`Unknown acceptance category: ${category}`);
  const reducedMotion = argv.includes('--reduced-motion');
  const suffix = `${slow > 1 ? `-slow-${slow}` : ''}${reducedMotion ? '-reduced' : ''}${category === '全部' ? '' : `-${category.replaceAll('·', '-')}`}`;
  const needsLibrary = [
    '全部',
    '图片库',
    '图片库·起名',
    '图片库·复制',
    '图片库·导入',
    '图片库·收尾',
    '图片库·滚动条',
    '设置',
    '设置·翻译词典',
    '外壳·快捷键',
  ].includes(category);
  const needsDictionary = ['全部', '设置', '设置·翻译词典'].includes(category);
  return {
    slow,
    processTimeoutMs: Math.min(600_000 * slow, 1_800_000),
    category,
    needsLibrary,
    needsDictionary,
    reducedMotion,
    outputName: `acceptance${suffix}`,
  };
}
