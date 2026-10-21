export async function chatGPTChecks({ h, preferences, chatGPTFixture, database, encrypted }) {
  h.category('ChatGPT');
  if (!encrypted) {
    h.uncovered('ChatGPT 系统加密登录', '当前平台系统加密不可用；协议由离线单元测试覆盖');
    return;
  }
  const saved = preferences.publicSettings();
  const call = (name, input = {}) =>
    h.evaluate(
      `(async()=>{const r=await window.studio.invoke(${JSON.stringify(name)},${JSON.stringify(input)});if(!r.ok)throw Error(r.error.message);return r.data})()`,
    );
  try {
    await call('settings.ai.save', {
      settings: { provider: 'chatgpt', codexMode: false, introShown: true },
    });
    await h.section('AI 服务');
    await h.click('ChatGPT 账号', 'document.querySelector("[data-settings-section=ai]")');
    await h.click('登录 ChatGPT', 'document.querySelector("[data-settings-section=ai]")');
    await h.wait(
      'document.querySelector("[data-settings-section=ai]")?.textContent.includes("synthetic@example.invalid")',
      '假授权服务登录完成',
    );
    await h.check(
      '登录保存系统加密凭据并返回已登录状态',
      () =>
        preferences.publicSettings().chatgpt.signedIn &&
        !!preferences.chatGPTRecord('official').refreshToken,
      undefined,
      'once',
    );
    const ids = database
      .loadLibrary('all')
      .slice(0, 1)
      .map((p) => p.id);
    const result = await call('library.suggest-names', {
      groups: [ids],
      requestId: 'chatgpt-acceptance-name',
    });
    await h.check(
      '登录后起名只走 ChatGPT Responses 并返回名称',
      () =>
        JSON.stringify(result).includes('合成画面1') &&
        chatGPTFixture.state.requests.some(
          (r) =>
            r.kind === 'responses' && !r.codex && r.body.store === false && r.body.stream === true,
        ),
      undefined,
      'once',
    );
    await h.click('退出登录', 'document.querySelector("[data-settings-section=ai]")');
    await h.wait(
      'Array.from(document.querySelectorAll("[data-settings-section=ai] button")).some(b=>b.textContent.includes("登录 ChatGPT"))',
      '退出后回到未登录状态',
    );
    await h.check(
      '退出清本地访问和刷新令牌并向假服务撤销',
      () =>
        !preferences.publicSettings().chatgpt.signedIn &&
        !preferences.chatGPTRecord('official').refreshToken &&
        chatGPTFixture.state.requests.some((r) => r.kind === 'revoke'),
      undefined,
      'once',
    );
    await h.screenshot('chatgpt-signed-out');
    await h.check(
      'ChatGPT 假服务没有外网请求',
      () => chatGPTFixture.blocked.length === 0,
      undefined,
      'once',
    );
  } finally {
    preferences.saveAISettings({
      provider: saved.provider,
      codexMode: saved.chatgpt.mode === 'codex',
    });
  }
}
