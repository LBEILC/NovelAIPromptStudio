import { commandFor, contextMenu, menuRoot, toastRoot } from './release186.js';
import { expectQueueCompletion } from './generationQueueWait.js';
import fs from 'node:fs';
import path from 'node:path';
import { libraryDetailsChecks } from './libraryDetails.js';
export async function pick186Checks({ h, preferences, mode, database }) {
  const call = commandFor(h);
  if (!path.resolve(preferences.filePath).startsWith(path.resolve(mode.root) + path.sep))
    throw Error('Pick account fixture must stay in the temporary profile');
  const token = JSON.parse(fs.readFileSync(preferences.filePath, 'utf8')).novelAITokenEncrypted;
  await call('account.connection.save', { connection: 'official' });
  await call('account.save', { token: 'acceptance-token' });
  const { tab } = await call('workbench.new', { width: 64, height: 64 });
  const job = await call('generate.start', { tabId: tab.id, count: 3 });
  await expectQueueCompletion(h, job.id);
  const version = (await call('version.list', { tabId: tab.id })).versions.at(-1);
  await h.click('工作台', 'document.querySelector(".tb")');
  h.category('工作台');
  await contextMenu(h, `[data-key="ver-${version.id}"]`);
  await h.click('挑图…', menuRoot);
  await h.wait('document.querySelectorAll("[data-pick-index]").length===3');
  await h.key(' ', {}, 'document.body');
  await h.wait('document.querySelector(\'[data-pick-index="0"]\')?.dataset.pickMark==="keep"');
  await h.key('x', {}, 'document.body');
  await h.wait('document.querySelector(\'[data-pick-index="1"]\')?.dataset.pickMark==="drop"');
  await h.screenshot('091-pick-marks');
  await h.click('把不要的 1 张移入回收站', 'document.querySelector("[data-pick]")');
  const imageId = version.images[1].projectId;
  const image = () => call('library.get', { id: imageId });
  await h.until(async () => !!(await image()).project.deleted_at, '挑图移入回收站');
  await h.click('撤销', toastRoot);
  await h.until(async () => !(await image()).project.deleted_at, '挑图撤销恢复');
  await h.check(
    '091-19 挑图空格保留、X 丢弃，回收站撤销恢复图片',
    async () => !(await image()).project.deleted_at,
  );
  await h.key('Escape');
  await h.wait('!document.querySelector("[data-pick]:not(.leaving)")');
  await libraryDetailsChecks({ h, database });
  await call('workbench.close', { tabId: tab.id });
  const settings = JSON.parse(fs.readFileSync(preferences.filePath, 'utf8'));
  if (token === undefined) delete settings.novelAITokenEncrypted;
  else settings.novelAITokenEncrypted = token;
  fs.writeFileSync(preferences.filePath, JSON.stringify(settings));
  await call('settings.generation.save');
  await h.reload();
}
