import { createFolderFixture, folderDialog } from './folderImport.js';
import { app } from 'electron';
import fs from 'node:fs/promises';
import { helpChecks } from './help.js';

export async function onboardingChecks({ h, mode, preferences, doubles }) {
  h.category('首次引导');
  if (mode.phase >= 7) return newsChecks({ h, mode, preferences });
  const dialog =
    'document.querySelector(\'.dialog.onboard[role="dialog"][aria-label="欢迎使用"]\')';
  const press = async (action) => {
    const selector = `[data-onboard="${action}"]`;
    await h.wait(`!!document.querySelector(${JSON.stringify(selector)})`);
    const before = await h.evaluate(`${dialog}?.dataset.onboardPage`);
    await h.evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
    if (action === 'next' || action === 'back') {
      await h.wait(`${dialog}?.dataset.onboardPage !== ${JSON.stringify(before)}`);
    }
  };
  const page = async (name) => {
    const condition = `${dialog}?.dataset.onboardPage === ${JSON.stringify(name)}`;
    await h.wait(condition);
    await h.check(`欢迎卡片显示 ${name} 页`, condition);
  };
  const closed = async (label) => {
    await h.wait(`!${dialog}`);
    await h.until(() => !preferences.onboardingSettings().show, '引导完成状态已保存');
    await h.check(
      '引导完成后记录当前功能版本',
      () => preferences.onboardingSettings().seen === app.getVersion(),
    );
    await h.check(label, `!${dialog}`);
  };
  const replay = async () => {
    // Isolate navigation cases from the card's delayed page reset after closing.
    await h.reload();
    await h.section('帮助');
    await press('replay');
    await page('recover');
  };
  if ([0, 3, 5].includes(mode.phase)) {
    await page('recover');
    await h.check('新装只显示完整引导', '!document.querySelector(".dialog.news")');
    await h.check('第一页没有上一页', '!document.querySelector(\'[data-onboard="back"]\')');
    if (mode.phase === 0) {
      await h.screenshot('onboarding-recover');
      for (const name of ['tidy', 'folder', 'token', 'fix', 'agent', 'help']) {
        await press('next');
        await page(name);
      }
      for (const name of ['agent', 'fix', 'token', 'folder', 'tidy', 'recover']) {
        await press('back');
        await page(name);
      }
      for (const name of ['tidy', 'folder', 'token', 'fix', 'agent', 'help']) {
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
  await h.check(
    '重启进程后保留已看功能版本',
    () => preferences.onboardingSettings().seen === app.getVersion(),
  );
  await h.check('重启进程后没有欢迎卡片', `!${dialog}`);
  await h.check('新装完成后重启没有新功能卡片', '!document.querySelector(".dialog.news")');
  if (mode.phase !== 1) return;
  await helpChecks({ h, preferences, mode, doubles });
  await replay();
  await h.check('重新查看不改变已完成状态', () => !preferences.onboardingSettings().show);
  await press('skip');
  await closed('关闭重新查看的引导');
  for (const [name, section, steps] of [
    ['tidy', 'tags', 1],
    ['token', 'novelai', 3],
    ['help', 'help', 6],
    ['agent', 'agent', 5],
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
  await press('next');
  await page('folder');
  const folder = await createFolderFixture(mode);
  doubles.selections.push({ canceled: false, filePaths: [folder] });
  await press('action');
  await closed('文件夹操作关闭引导并保存');
  await h.wait(`!!${folderDialog}`);
  await h.check(
    '引导第 3 页打开文件夹扫描对话框',
    `${folderDialog}?.textContent.includes('初音（角色）')`,
  );
  await h.click('取消', folderDialog);
  h.uncovered('系统文件选择对话框外观', '打开图片流程已用预定响应验证，原生选择器不由自动化操作');
}

async function newsChecks({ h, mode, preferences }) {
  const news = 'document.querySelector(\'.dialog.news[aria-label="新功能"]\')';
  const cmp = (a, b) => {
    const x = a.split('.').map(Number),
      y = b.split('.').map(Number);
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i];
    return 0;
  };
  const current = app.getVersion();
  const dir = new URL('../../release-notes/', import.meta.url);
  const notes = await Promise.all(
    (await fs.readdir(dir))
      .filter((f) => f.endsWith('.json'))
      .map(async (f) => JSON.parse(await fs.readFile(new URL(f, dir), 'utf8'))),
  );
  const highlights = notes
    .filter(
      (n) =>
        cmp(n.version, current) <= 0 &&
        (mode.phase === 10 ? n.version === current : cmp(n.version, '1.7.0') > 0),
    )
    .sort((a, b) => cmp(b.version, a.version))
    .flatMap((n) => n.items.filter((i) => i.highlight));
  const press = async (action) => {
    await h.wait(`!!document.querySelector('[data-news="${action}"]')`);
    await h.evaluate(`document.querySelector('[data-news="${action}"]').click()`);
  };
  if (mode.phase === 8 || !highlights.length) {
    await h.evaluate('window.studio.invoke("onboarding.get", {})');
    await h.check(
      mode.phase === 8 ? '看完新功能后重启不再弹出' : '当前版本无重点时不弹新功能',
      `!${news}`,
    );
    return;
  }
  await h.wait(`!!${news}`);
  const title = `${news}?.querySelector('.ob-page:not(.leaving) h3')?.textContent`;
  await h.wait(`${title} === ${JSON.stringify(highlights[0].title)}`);
  await h.check(
    '新功能首条来自适用版本的更新说明',
    `${title} === ${JSON.stringify(highlights[0].title)}`,
  );
  const count = Math.min(highlights.length, 6) + (highlights.length > 6 ? 1 : 0);
  await h.check(
    '新功能页数符合适用版本的重点条数',
    `${news}.querySelectorAll('.ob-dots i').length === ${count > 1 ? count : 0}`,
  );
  await h.screenshot(`news-${mode.phase}`);
  const destinationIndex = highlights.slice(0, 6).findIndex((item) => item.goto);
  const followsLink = mode.phase === 9 && destinationIndex >= 0;
  const target = followsLink ? destinationIndex : count - 1;
  for (let i = 0; i < target; i++) {
    await press('next');
    await h.wait(`${news}?.dataset.newsPage === '${i + 2}'`);
  }
  await press(followsLink ? 'go' : 'done');
  await h.wait(`!${news}`);
  await h.until(() => preferences.onboardingSettings().seen === current, '新功能版本持久化');
  await h.check('关闭新功能记录当前版本', () => preferences.onboardingSettings().seen === current);
  if (followsLink) {
    const destination = highlights[target].goto;
    const page = { workbench: '工作台', gallery: '图片库', materials: '素材' }[destination];
    const condition = page
      ? `document.querySelector('.tb nav [aria-current="page"]')?.textContent.includes(${JSON.stringify(page)})`
      : `!!document.querySelector('[data-settings-section="${destination.split(':')[1]}"]:not(.leaving)')`;
    await h.wait(condition);
    await h.check('去试试打开更新说明指定的页面', condition);
  }
}
