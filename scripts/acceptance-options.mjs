import { timingMode } from '../electron/acceptance/timing.js';

export function acceptanceOptions(argv = process.argv.slice(2), env = process.env) {
  const value = (name) =>
    argv
      .find((arg) => arg.startsWith(`--${name}=`))
      ?.split('=')
      .slice(1)
      .join('=');
  const slow = Number(value('slow') || 1);
  if (![1, 4, 6].includes(slow)) throw Error('--slow must be 1, 4 or 6');
  const ci = !!env.CI && !/^(false|0)$/i.test(env.CI);
  if (ci && slow > 1) throw Error('--slow is only available outside CI');
  const timing = timingMode(value('timing'));
  const category = value('category') || '全部';
  if (
    ![
      '全部',
      'Agent',
      '客户端边界',
      '悬停态覆盖',
      '客户端控件',
      '减少动态效果',
      '诊断·计时',
      '工作台',
      '工作台·细节',
      '工作台·交互',
      '交互修正',
      '详情布局',
      '图片库·交互',
      '图片库·细节',
      '图片库',
      '图片库·起名',
      '图片库·复制',
      '图片库·导入',
      '图片库·收尾',
      '图片库·滚动条',
      '设置',
      '设置·外观',
      '设置·AI 服务',
      '设置·翻译词典',
      '设置·版式',
      '基础组件',
      '基础组件·细节',
      '卡片缓存',
      '外壳',
      '外壳·快捷键',
      '动效',
      '过渡动效',
      '诊断',
      '诊断·渲染器',
    ].includes(category)
  )
    throw Error(`Unknown acceptance category: ${category}`);
  // CI splits the full suite into parallel jobs; each shard runs its share of
  // phase 0, and only shard 2 (which owns settings) runs the restarts.
  // The groups themselves live in electron/acceptance/run.js.
  const shardValue = value('shard');
  const shardMatch = shardValue?.match(/^([1-3])\/3$/);
  if (shardValue && !shardMatch) throw Error('--shard must be 1/3, 2/3 or 3/3');
  if (shardValue && category !== '全部') throw Error('--shard requires the full suite');
  const shard = shardMatch
    ? { index: Number(shardMatch[1]), total: 3, restarts: shardMatch[1] === '2' }
    : null;
  const reducedMotion = argv.includes('--reduced-motion');
  const restart = argv.includes('--restart');
  if (restart && category !== '设置') throw Error('--restart requires --category=设置');
  const motion = value('motion');
  if (motion && !['system', 'off'].includes(motion)) throw Error('--motion must be system or off');
  const suffix = `${slow > 1 ? `-slow-${slow}` : ''}${reducedMotion ? '-reduced' : ''}${motion ? `-${motion}` : ''}${category === '全部' ? '' : `-${category.replaceAll('·', '-')}`}${shard ? `-shard-${shard.index}` : ''}`;
  const needsLibrary = [
    '悬停态覆盖',
    '客户端控件',
    '减少动态效果',
    '全部',
    '过渡动效',
    '图片库',
    '图片库·细节',
    '工作台·细节',
    '工作台·交互',
    '交互修正',
    '详情布局',
    '图片库·交互',
    '图片库·起名',
    '图片库·复制',
    '图片库·导入',
    '图片库·收尾',
    '图片库·滚动条',
    '设置',
    '设置·翻译词典',
    '外壳·快捷键',
  ].includes(category);
  const needsDictionary = [
    '全部',
    '悬停态覆盖',
    '客户端控件',
    '设置',
    '设置·翻译词典',
    '减少动态效果',
  ].includes(category);
  return {
    timing,
    slow,
    processTimeoutMs: Math.min(600_000 * slow, 1_800_000),
    category,
    shard,
    needsLibrary,
    needsDictionary,
    reducedMotion,
    motion,
    restart,
    outputName: `acceptance${suffix}${restart ? '-restart' : ''}`,
  };
}
