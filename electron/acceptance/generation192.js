import { commandFor } from './release186.js';
import { expectQueueCompletion } from './generationQueueWait.js';

export async function generation192Checks({ h, generationService }) {
  const call = commandFor(h);
  await call('account.save', { token: 'acceptance-token' });
  await h.click('工作台', 'document.querySelector(".tb")');
  const { settings } = await call('generate.status');
  const { tab } = await call('workbench.new', { width: 1216, height: 832 });
  await h.wait('!!document.querySelector(".gen-bar")');
  const oldWidth = await h.evaluate(
    `(()=>{const s=document.documentElement.style;const old=s.getPropertyValue('--prompt-w-live');s.setProperty('--prompt-w-live','var(--prompt-min-w)');return old})()`,
  );
  let job;
  try {
    await call('settings.generation.save', { continuous: true });
    generationService.state.holdAt = generationService.state.requests.length + 1;
    job = await call('generate.start', { tabId: tab.id, count: 1 });
    await generationService.waitForHold();
    await h.wait(`document.querySelector('.gen-bar .btn.seal')?.textContent.includes('加入队列')`);
    await h.check(
      '101 最窄提示词栏生成中按钮保持在底栏右内边距以内',
      `(()=>{const bar=document.querySelector('.gen-bar'),button=bar.querySelector('.btn.seal');return button.getBoundingClientRect().right<=bar.getBoundingClientRect().right-parseFloat(getComputedStyle(bar).paddingRight)})()`,
    );
    await h.check(
      '101 连续生成中底栏按钮文字为加入队列',
      `document.querySelector('.gen-bar .btn.seal')?.textContent.trim()==='加入队列'`,
    );
    await h.screenshot('generation-min-width');
  } finally {
    generationService.state.resume?.();
    generationService.state.holdAt = 0;
    if (job) await expectQueueCompletion(h, job.id);
    await call('settings.generation.save', { continuous: settings.continuous });
    await h.evaluate(
      `document.documentElement.style.setProperty('--prompt-w-live',${JSON.stringify(oldWidth)})`,
    );
    await call('workbench.close', { tabId: tab.id });
  }
}
