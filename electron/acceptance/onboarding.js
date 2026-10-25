import { createFolderFixture, folderDialog } from './folderImport.js';

export async function onboardingChecks({ h, mode, preferences, doubles }) {
  h.category('首次引导');
  const dialog =
    'document.querySelector(\'.dialog.onboard[role="dialog"][aria-label="欢迎使用"]\')';
  const press = async (action) => {
    const selector = `[data-onboard="${action}"]`;
    await h.wait(`!!document.querySelector(${JSON.stringify(selector)})`);
    await h.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
  };
  const page = async (name) => {
    const condition = `${dialog}?.dataset.onboardPage === ${JSON.stringify(name)}`;
    await h.wait(condition);
    await h.check(`欢迎卡片显示 ${name} 页`, condition);
  };
  const closed = async (label) => {
    await h.wait(`!${dialog}`);
    await h.until(() => !preferences.onboardingSettings().show, '引导完成状态已保存');
    await h.check(label, `!${dialog}`);
  };
  const replay = async () => {
    await h.section('关于与更新');
    await press('replay');
    await page('recover');
  };
  if ([0, 3, 5].includes(mode.phase)) {
    await page('recover');
    await h.check('第一页没有上一页', '!document.querySelector(\'[data-onboard="back"]\')');
    if (mode.phase === 0) {
      await h.screenshot('onboarding-recover');
      for (const name of ['folder', 'token', 'agent']) {
        await press('next');
        await page(name);
      }
      for (const name of ['token', 'folder', 'recover']) {
        await press('back');
        await page(name);
      }
      for (const name of ['folder', 'token', 'agent']) {
        await press('next');
        await page(name);
      }
      await press('done');
      await closed('完成引导后关闭并保存');
    } else if (mode.phase === 3) {
      await press('skip');
      await closed('新装跳过引导后关闭并保存');
    } else {
      await h.nativeKey('Escape');
      await closed('新装按 Esc 后关闭并保存');
    }
    return;
  }
  await h.evaluate('window.studio.invoke("onboarding.get", {})');
  await h.check('重启进程后引导仍为已完成', () => !preferences.onboardingSettings().show);
  await h.check('重启进程后没有欢迎卡片', `!${dialog}`);
  if (mode.phase !== 1) return;
  await replay();
  await h.check('重新查看不改变已完成状态', () => !preferences.onboardingSettings().show);
  await press('skip');
  await closed('关闭重新查看的引导');
  for (const [name, section, steps] of [
    ['token', 'novelai', 2],
    ['agent', 'agent', 3],
  ]) {
    await replay();
    for (let i = 0; i < steps; i++) await press('next');
    await page(name);
    await press('action');
    await closed(`${name} 操作关闭卡片`);
    const target = `!!document.querySelector('[data-settings-section="${section}"]:not(.leaving)')`;
    await h.wait(target);
    await h.check(`${name} 操作打开对应设置页`, target);
  }
  await replay();
  await press('next');
  await page('folder');
  const folder = await createFolderFixture(mode);
  doubles.selections.push({ canceled: false, filePaths: [folder] });
  await press('action');
  await closed('文件夹操作关闭引导并保存');
  await h.wait(`!!${folderDialog}`);
  await h.check(
    '引导第 2 页打开文件夹扫描对话框',
    `${folderDialog}?.textContent.includes('初音（角色）')`,
  );
  await h.click('取消', folderDialog);
  h.uncovered('recover 页打开图片', '系统文件选择对话框不由自动化操作');
}
