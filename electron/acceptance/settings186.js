import fs from 'node:fs/promises';
import path from 'node:path';
import { commandFor } from './release186.js';
import { expectQueueCompletion } from './generationQueueWait.js';

export async function settings186Checks({ h }) {
  h.category('设置');
  const call = commandFor(h);
  await call('account.connection.save', { connection: 'official' });
  await call('account.save', { token: 'acceptance-token' });
  const { tab } = await call('workbench.new', { width: 64, height: 64 });
  const job = await call('generate.start', { tabId: tab.id, count: 1 });
  await expectQueueCompletion(h, job.id);
  await h.section('NovelAI 账号');
  const today = await call('usage.summary', { range: 'today' });
  await h.wait(
    `document.querySelector('[data-feature="usage"] .usage-total')?.textContent.includes('${today.images} 张')`,
  );
  const correct = await h.evaluate(
    `document.querySelector('[data-feature="usage"] .usage-total').textContent.includes('${today.images} 张')`,
  );
  await h.click('本月', 'document.querySelector("[data-feature=usage]")');
  const month = await call('usage.summary', { range: 'month' });
  await h.wait(
    `document.querySelector('[data-feature="usage"] .usage-total')?.textContent.includes('${month.images} 张')`,
  );
  await h.check(
    '091-22 用量今天张数与命令一致，本月切换成功',
    () => correct && today.images > 0 && month.images >= today.images,
  );
  await call('workbench.close', { tabId: tab.id });
  await call('settings.library.save', { trashAutoCleanup: false });
  await h.section('图片库');
  const control = 'document.querySelector("[data-feature=trash-clean] .switch")';
  const dialog = 'document.querySelector("[role=dialog]:not(.leaving *)")';
  await h.wait(`!!${control}`);
  await h.evaluate(`${control}.click()`);
  await h.click('取消', dialog);
  await h.wait('!document.querySelector("[role=dialog]:not(.leaving *)")');
  const canceled = !(await call('settings.library.get')).trashAutoCleanup;
  await h.evaluate(`${control}.click()`);
  await h.click('打开', dialog);
  await h.until(
    async () => (await call('settings.library.get')).trashAutoCleanup,
    '确认自动清理设置',
  );
  const size = await call('trash.size');
  await h.check(
    '091-23 自动清理取消保持关闭，确认才保存，并显示回收站占用',
    async () =>
      canceled &&
      (await call('settings.library.get')).trashAutoCleanup &&
      (!size.bytes ||
        (await h.evaluate(
          'document.querySelector("[data-settings-section=storage]").textContent.includes("占用")',
        ))),
  );
  await h.screenshot('091-usage-trash');
  await call('settings.library.save', { trashAutoCleanup: false });
}

export async function trash186Checks({ h }) {
  h.category('图片库');
  const call = commandFor(h);
  const previous = (await call('settings.library.get')).trashAutoCleanup;
  await call('settings.library.save', { trashAutoCleanup: true });
  await h.click('图片库', 'document.querySelector(".tb")');
  await h.click('回收站', 'document.querySelector(".libp .side")');
  await h.wait(
    'document.querySelector(".libp")?.textContent.includes("超过 30 天的会自动永久删除")',
  );
  await h.check(
    '091-24 回收站显示已启用三十天自动清理说明',
    'document.querySelector(".libp").textContent.includes("超过 30 天的会自动永久删除")',
  );
  await call('settings.library.save', { trashAutoCleanup: previous });
  await h.click('全部图片', 'document.querySelector(".libp .side")');
}

export async function queueRestart186({ h, mode }, prepare = false) {
  const call = commandFor(h);
  const file = path.join(mode.root, 'queue-186.json');
  if (prepare) {
    await call('account.save', { token: 'acceptance-token' });
    await call('generate.pause');
    const { tab } = await call('workbench.new', { width: 64, height: 64 });
    const job = await call('generate.start', { tabId: tab.id, count: 2 });
    await fs.writeFile(file, JSON.stringify({ id: job.id, tabId: tab.id }));
    return;
  }
  const saved = JSON.parse(await fs.readFile(file, 'utf8'));
  h.category('生成');
  const state = await call('generate.status');
  // Startup notifications can expire during the preceding database checks.
  // The persistent queue entry and saved jobs are the recovery outcome.
  await h.wait(
    'document.querySelector("[data-trigger=queue]:not(.leaving)")?.textContent.includes("队列已暂停")',
  );
  await h.check(
    '091-18 进程重启保留两张排队任务并显示队列已暂停',
    () =>
      state.paused &&
      state.jobs.some((j) => j.id === saved.id && j.state === 'queued' && j.count === 2),
  );
}
