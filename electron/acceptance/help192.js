import { commandFor } from './release186.js';

export async function help192Checks(h) {
  const group = (name) =>
    h.evaluate(
      `[...document.querySelectorAll('.help-groups [role=radio]')].find(e=>e.textContent===${JSON.stringify(name)}).click()`,
    );
  const selected = (name) =>
    `document.querySelector('.help-groups [aria-checked=true]')?.textContent===${JSON.stringify(name)}`;
  const tab = (name) => h.evaluate(`document.querySelector('[data-help-tab="${name}"]').click()`);
  await h.check(
    '101 默认工作台分组且分组切换包含五项',
    `${selected('工作台')} && document.querySelectorAll('.help-groups [role=radio]').length===5 && document.querySelectorAll('.feat-group').length===1`,
  );
  await group('全部');
  await h.check(
    '帮助导航存在且全部显示四组',
    `!!document.querySelector('[data-settings-target="help"]') && document.querySelectorAll('.feat-group').length===4`,
  );
  await h.check(
    '每项功能的位置提示与位置说明一致',
    `[...document.querySelectorAll('.feat-go')].every(e=>!!e.dataset.tip?.trim() && e.dataset.tip===e.querySelector('.feat-where')?.textContent)`,
  );
  await h.screenshot('help-features');
  await group('图片库');
  await h.check(
    '101 图片库分组只显示图片库且包含回收站',
    `document.querySelectorAll('.feat-group').length===1 && document.querySelector('.feat-group')?.dataset.featureGroup==='图片库' && document.querySelector('.feat-group').textContent.includes('回收站')`,
  );
  await h.input('[aria-label="搜索功能"]', '回收站');
  await h.check(
    '101 搜索跨组并显示位置说明',
    `${selected('全部')} && document.querySelectorAll('.feat-where').length>0 && [...document.querySelectorAll('.feat-where')].every(e=>getComputedStyle(e).display!=='none')`,
  );
  await h.input('[aria-label="搜索功能"]', '');
  await h.check(
    '101 清空搜索返回图片库分组',
    `${selected('图片库')} && document.querySelectorAll('.feat-group').length===1 && document.querySelector('.feat-group').dataset.featureGroup==='图片库'`,
  );
  await tab('keys');
  await h.check(
    '帮助快捷键页签显示三组快捷键',
    `document.querySelector('[data-help-tab=keys]')?.getAttribute('aria-selected')==='true' && document.querySelectorAll('.key-group').length===3`,
  );
  await h.reload();
  await h.section('帮助');
  await h.check(
    '101 刷新后记住快捷键页签',
    `document.querySelector('[data-help-tab=keys]')?.getAttribute('aria-selected')==='true' && document.querySelectorAll('.key-group').length===3`,
  );
  await tab('features');
  await h.check('101 刷新后记住图片库分组', selected('图片库'));
  await group('全部');
  const demos = [
    ['drag', '按块整理'],
    ['compare', '两张图对比'],
    ['inpaint', '局部重绘'],
    ['pick', '挑图'],
    ['random', '随机池'],
  ];
  const button = (name) =>
    `[...document.querySelectorAll('.feat-row')].find(e=>e.querySelector('.feat-name')?.textContent===${JSON.stringify(name)}).querySelector('.feat-demo')`;
  const toggle = (name) => h.evaluate(`${button(name)}.click()`);
  for (const [id, name] of demos) {
    await toggle(name);
    await h.check(
      `101 ${id} 演示展开`,
      `!!document.querySelector('.hd-${id}') && ${button(name)}.getAttribute('aria-expanded')==='true'`,
    );
    await toggle(name);
    await h.check(
      `101 ${id} 演示收起`,
      `!document.querySelector('.hd-${id}') && ${button(name)}.getAttribute('aria-expanded')==='false'`,
    );
  }
  await toggle(demos[0][1]);
  for (let i = 1; i < demos.length; i++) {
    const [id, name] = demos[i];
    await toggle(name);
    await h.check(
      `101 切到 ${id} 时收起前一个演示`,
      `document.querySelectorAll('.hd').length===1 && !!document.querySelector('.hd-${id}') && ${button(demos[i - 1][1])}.getAttribute('aria-expanded')==='false'`,
    );
  }
  await toggle(demos.at(-1)[1]);
  const call = commandFor(h);
  const settings = await call('settings.appearance.get');
  try {
    await call('settings.appearance.save', { settings: { motion: 'off' } });
    await h.reload();
    await h.section('帮助');
    await h.wait("document.documentElement.dataset.motion==='off'");
    await toggle('挑图');
    const final = `!!document.querySelector('.hd-pick.s9:not(.out)')`;
    await h.check('101 动效关闭时挑图演示直接到最终状态', final);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    await h.check('101 动效关闭两秒后挑图保持最终状态', final);
    await toggle('挑图');
  } finally {
    await call('settings.appearance.save', { settings: { motion: settings.motion } });
    await h.reload();
    await h.section('帮助');
  }
}
