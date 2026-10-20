import fs from 'node:fs/promises';
import path from 'node:path';

export async function settingsGenerationChecks({
  h,
  generationService,
  preferences,
  encrypted,
  mode,
}) {
  if (!encrypted) {
    h.uncovered('设置账号与生成偏好', '系统安全存储不可用');
    return;
  }
  const { click, input, wait, check, section, evaluate } = h;
  const invoke = (name, input = {}) =>
    evaluate(
      `window.studio.invoke(${JSON.stringify(name)},${JSON.stringify(input)}).then(r=>{if(!r.ok)throw Error(r.error.message);return r.data})`,
    );
  h.category('设置·NovelAI 账号');
  await section('NovelAI 账号');
  if (await evaluate('!document.querySelector(\'[aria-label="持久令牌"]\')')) await click('更换');
  await input('[aria-label="持久令牌"]', 'acceptance-token');
  await click('保存', 'document.querySelector("[data-settings-section=novelai]")');
  await wait('document.body.innerText.includes("10,000 Anlas")');
  await check(
    '保存令牌后输入框清空并退出编辑',
    '!document.querySelector(\'[aria-label="持久令牌"]\') && document.body.innerText.includes("已保存 ••••••••")',
  );
  await click('更换');
  await input('[aria-label="持久令牌"]', 'discarded-token');
  await click('取消', 'document.querySelector("[data-settings-section=novelai]")');
  await check('取消更换不改变已保存令牌', () => preferences.novelAIToken() === 'acceptance-token');
  generationService.state.tier = 0;
  await invoke('account.refresh');
  await wait('document.body.innerText.includes("未订阅 · 每次生成都要花 Anlas")');
  await check(
    '未订阅显示按次付费说明且不显示免费用量',
    '!document.querySelector(\'[aria-label="V5 免费用量"]\')',
  );
  generationService.state.tier = 3;
  generationService.state.usage = 100;
  await invoke('account.refresh');
  await wait('document.body.innerText.includes("已用 100%")');
  await check(
    '订阅用量耗尽仍显示实际用量和付费说明',
    '!!document.querySelector(\'[aria-label="V5 免费用量"]\') && document.body.innerText.includes("用完后 V5 的生成要花 Anlas")',
  );
  await invoke('settings.generation.save', {
    continuous: false,
    agentMode: 'confirm',
    limitEnabled: false,
  });
  await wait(
    'document.querySelector(\'[aria-label="无人值守连续生成"]\')?.getAttribute("aria-checked")==="false"',
  );
  await click('无人值守连续生成');
  await wait('!!document.querySelector("dialog[open]")');
  await check('确认前不启用无人值守', () => !preferences.generationSettings().continuous);
  await click('取消', 'document.querySelector("dialog[open]")');
  await check('取消后保持关闭', () => !preferences.generationSettings().continuous);
  await click('无人值守连续生成');
  await click('仍然开启', 'document.querySelector("dialog[open]")');
  await h.until(() => preferences.generationSettings().continuous, '确认后保存连续生成偏好');
  await check(
    '确认后开关与持久化值一致',
    'document.querySelector(\'[aria-label="无人值守连续生成"]\')?.getAttribute("aria-checked")==="true"',
  );
  await click('无人值守连续生成');
  h.category('设置·Agent');
  await section('Agent');
  const setup = await invoke('agent.setup');
  await click(setup.installed ? '重新安装' : '安装');
  await wait('document.body.innerText.includes("已安装 · nai-studio")');
  await check('设置页安装命令行工具只写验收目录', async () => {
    const installed = await invoke('agent.setup');
    return installed.installed && installed.path.startsWith(mode.root);
  });
  const size = h.window.getContentSize();
  h.window.setContentSize(1240, 760);
  await h.evaluate(
    'document.fonts.ready.then(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))))',
  );
  await h.screenshot('032-settings-agent-installed');
  await fs.writeFile(
    path.join(mode.output, '032-agent-fixture.json'),
    JSON.stringify(await invoke('agent.setup')),
  );
  h.window.setContentSize(...size);
  await click('直接生成');
  await wait('!!document.querySelector("dialog[open]")');
  await check(
    '直接生成确认前保持排队',
    () => preferences.generationSettings().agentMode === 'confirm',
  );
  await click('取消', 'document.querySelector("dialog[open]")');
  await click('花费上限');
  await wait('!!document.querySelector(\'[aria-label="每日上限"]\')');
  await input('[aria-label="每日上限"]', '500');
  await h.until(() => preferences.generationSettings().dailyLimit === 500, '每日上限保存');
  await check(
    '开启上限并保存金额',
    () =>
      preferences.generationSettings().limitEnabled &&
      preferences.generationSettings().dailyLimit === 500,
  );
  await invoke('settings.generation.save', {
    continuous: false,
    agentMode: 'confirm',
    limitEnabled: false,
  });
  generationService.state.usage = 12;
  await invoke('account.refresh');
}
