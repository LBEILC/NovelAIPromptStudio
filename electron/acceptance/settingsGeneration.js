import fs from 'node:fs/promises';
import path from 'node:path';
import { clipboard } from 'electron';
import { RELAY_PRESETS } from '../../src/shared/relayPresets.ts';

export async function settingsGenerationChecks({
  h,
  generationService,
  preferences,
  encrypted,
  mode,
  doubles,
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
  h.category('设置·图片库');
  const library = await invoke('settings.library.get');
  const cleanupOn = await invoke('settings.library.save', { trashAutoCleanup: true });
  const trashSize = await invoke('trash.size');
  const cleanupOff = await invoke('settings.library.save', { trashAutoCleanup: false });
  await check(
    '回收站自动清理默认关闭、可保存开关且不改变资源路径',
    () =>
      !library.trashAutoCleanup &&
      cleanupOn.trashAutoCleanup &&
      !cleanupOff.trashAutoCleanup &&
      cleanupOn.assetsDirectory === library.assetsDirectory &&
      trashSize.bytes >= 0 &&
      trashSize.count >= 0,
  );
  h.category('设置·NovelAI 账号');
  await section('NovelAI 账号');
  const firstToken = !preferences.novelAIToken();
  if (await evaluate('!document.querySelector(\'[aria-label="持久令牌"]\')')) await click('更换');
  await input('[aria-label="持久令牌"]', 'acceptance-token');
  await click('保存', 'document.querySelector("[data-settings-section=novelai]")');
  if (firstToken)
    await wait('document.querySelector(".tb [aria-current=page]")?.textContent.trim()==="工作台"');
  await section('NovelAI 账号');
  await wait('document.body.innerText.includes("10,000 Anlas")');
  await check(
    '保存令牌后输入框清空并退出编辑',
    '!document.querySelector(\'[aria-label="持久令牌"]\') && document.body.innerText.includes("已保存 ••••••••")',
  );
  await click('复制', 'document.querySelector("[data-settings-section=novelai]:not(.leaving)")');
  await wait('document.body.innerText.includes("已复制持久令牌")');
  await check(
    '持久令牌复制到剪贴板并显示成功通知',
    async () =>
      clipboard.readText() === 'acceptance-token' &&
      (await evaluate('document.body.innerText.includes("已复制持久令牌")')),
  );
  const previousConnection = preferences.generationSettings();
  await invoke('account.relay.save', {
    baseUrl: generationService.url + '/v1',
    key: 'acceptance-token',
  });
  await h.select('连接方式', '中转站');
  const pickPreset = async (name) => {
    await wait('!!document.querySelector("button[aria-label=中转站]")');
    await click('中转站', 'document.querySelector("button[aria-label=中转站]").parentElement');
    await wait('!!document.querySelector(".menu:not(.leaving) [role=menuitem]")');
    await click(name, 'document.querySelector(".menu:not(.leaving)")');
  };
  for (const preset of RELAY_PRESETS) {
    await pickPreset(preset.name);
    await wait(
      `document.querySelector('.relay-endpoint')?.textContent.includes(${JSON.stringify(preset.address)})`,
    );
    await check(
      `选择 ${preset.name} 自动填写预设地址`,
      `document.querySelector('.relay-endpoint')?.textContent.includes(${JSON.stringify(preset.address)})`,
    );
    const before = doubles.calls.filter((call) => call.kind === 'openExternal').length;
    await click('打开网站');
    await wait('document.body.innerText.includes("已在浏览器中打开")');
    await check(`打开 ${preset.name} 网站经过主进程`, () => {
      const calls = doubles.calls.filter((call) => call.kind === 'openExternal');
      return calls.length === before + 1 && calls.at(-1).value === preset.site;
    });
  }
  await pickPreset('自定义');
  await input('[aria-label="中转站地址"]', generationService.url + '/v1');
  await wait(
    'document.querySelector("[data-settings-section=novelai]:not(.leaving)")?.textContent.includes("已保存 ••••••••")',
  );
  await click('复制', 'document.querySelector("[data-settings-section=novelai]:not(.leaving)")');
  await wait('document.body.innerText.includes("已复制中转站 Key")');
  await check(
    '中转站 Key 复制到剪贴板并显示成功通知',
    async () =>
      clipboard.readText() === 'acceptance-token' &&
      (await evaluate('document.body.innerText.includes("已复制中转站 Key")')),
  );
  for (const [name, key] of [
    ['小忆API开放平台', 'acceptance-token'],
    ['hamubox', 'acceptance-token-second'],
  ]) {
    await pickPreset(name);
    await input('[aria-label="中转站 Key"]', key);
    await click('保存', 'document.querySelector("[data-settings-section=novelai]:not(.leaving)")');
    await wait('!document.querySelector(\'[aria-label="中转站 Key"]\')');
  }
  for (const [name, id, key] of [
    ['小忆API开放平台', 'chr1', 'acceptance-token'],
    ['hamubox', 'hamubox', 'acceptance-token-second'],
    ['自定义', 'custom', 'acceptance-token'],
  ]) {
    await pickPreset(name);
    await h.until(() => preferences.generationSettings().relay.slot === id, '下拉切换已保存槽位');
    await wait('!document.querySelector(\'[aria-label="中转站 Key"]\')');
    await check(`切到 ${name} 无需重填且使用独立 Key`, () => preferences.relayKey() === key);
  }
  await wait('document.body.innerText.includes("这个 Key 已用")');
  await check('中转站用量查询显示额度', 'document.body.innerText.includes("额度")');
  await h.select('连接方式', previousConnection.connection === 'relay' ? '中转站' : 'NovelAI 官方');
  await wait('!document.querySelector(\'[aria-label="中转站地址"]\')');
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
  await wait('!!document.querySelector("[role=dialog]:not(.leaving *)")');
  await check('确认前不启用无人值守', () => !preferences.generationSettings().continuous);
  await click('取消', 'document.querySelector("[role=dialog]:not(.leaving *)")');
  await check('取消后保持关闭', () => !preferences.generationSettings().continuous);
  await click('无人值守连续生成');
  await click('仍然开启', 'document.querySelector("[role=dialog]:not(.leaving *)")');
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
  await wait(
    `document.querySelector('[role=dialog]:not(.leaving *)')?.textContent.includes('允许 Agent 直接生成？')`,
  );
  await wait('!!document.querySelector("[role=dialog]:not(.leaving *)")');
  await check(
    '直接生成确认前保持排队',
    () => preferences.generationSettings().agentMode === 'confirm',
  );
  await click('取消', 'document.querySelector("[role=dialog]:not(.leaving *)")');
  await click('花费上限');
  await wait('!!document.querySelector(\'[aria-label="每日上限"]\')');
  await input('[aria-label="每日上限"]', '500');
  await h.key('Enter');
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
