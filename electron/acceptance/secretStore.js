import fs from 'node:fs';
import { safeStorage } from 'electron';
import { commandFor } from './release186.js';

export async function secretStoreChecks({ h, preferences, generationService }) {
  h.category('密钥存储');
  const call = commandFor(h);
  const original = fs.readFileSync(preferences.filePath, 'utf8');
  const decrypt = safeStorage.decryptString;
  const available = safeStorage.isEncryptionAvailable;
  let tabId;
  try {
    preferences.saveNovelAIToken('synthetic-secret-token');
    preferences.saveRelay({ baseUrl: 'https://example.invalid', key: 'synthetic-relay' });
    preferences.saveAISettings({ provider: 'apiKey', apiKey: 'synthetic-api' });
    preferences.saveChatGPTRecord('official', { accessToken: 'synthetic-login' });
    safeStorage.isEncryptionAvailable = () => true;
    safeStorage.decryptString = () => {
      throw Error('Synthetic unreadable secret');
    };
    preferences.refreshSecretStore();
    await h.reload();
    await h.section('NovelAI 账号');
    await h.checkSoon(
      '持久令牌显示无法读取和更换提示',
      `document.body.innerText.includes('已保存的持久令牌无法读取，请点"更换"重新填写。')`,
    );
    await h.click('中转站');
    await h.checkSoon(
      '中转站显示无法读取和更换提示',
      `document.body.innerText.includes('已保存的中转站 Key 无法读取，请点"更换"重新填写。')`,
    );
    await h.section('AI 服务');
    await h.checkSoon(
      'API Key 显示无法读取和更换提示',
      `document.body.innerText.includes('已保存的 API Key 无法读取，请点"更换"重新填写。')`,
    );
    await h.click('ChatGPT 账号');
    await h.checkSoon(
      'ChatGPT 显示登录信息无法读取',
      `document.body.innerText.includes('登录信息无法读取')`,
    );
    await h.screenshot('secret-unreadable-settings');
    await h.click('工作台');
    await call('account.connection.save', { connection: 'official' });
    await h.reload();
    const { tab } = await call('workbench.new', { width: 64, height: 64 });
    tabId = tab.id;
    const start = generationService.state.requests.length;
    const job = await call('generate.start', { tabId, count: 1 });
    await h.wait(
      `window.studio.invoke('generate.status',{id:${JSON.stringify(job.id)}}).then(r=>r.data.jobs[0].state==='failed')`,
    );
    const failed = (await call('generate.status', { id: job.id })).jobs[0];
    await h.check(
      '密钥失败保留错误码、零消耗且未发送生成请求',
      () =>
        failed.errorCode === 'secret_unreadable' &&
        failed.spentKnown &&
        failed.spent === 0 &&
        generationService.state.requests.length === start,
    );
    await h.click('0 Anlas');
    await h.click('打开 NovelAI 账号设置');
    await h.checkSoon(
      '失败队列可跳到 NovelAI 账号设置',
      `document.body.innerText.includes('已保存的持久令牌无法读取，请点"更换"重新填写。')`,
    );
    await h.screenshot('secret-unreadable-generation');
    await h.click('工作台');
  } finally {
    safeStorage.decryptString = decrypt;
    safeStorage.isEncryptionAvailable = available;
    fs.writeFileSync(preferences.filePath, original);
    preferences.refreshSecretStore();
    if (tabId) await call('workbench.close', { tabId });
    await h.reload();
  }
}
