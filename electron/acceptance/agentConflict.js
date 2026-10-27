// Drive the real renderer and command store; no replacement of UI state or IPC.
export async function agentConflictChecks({ h, call, files }) {
  const other = await call('workbench.open', { path: files[1] });
  const opened = await call('workbench.open', { path: files[0] });
  const id = opened.tab.id;
  await h.wait(`!!document.querySelector('[data-tab="${id}"][aria-selected=true]')`);
  await h.evaluate(`(() => {
    window.conflictNotices = [];
    window.conflictObserver = new MutationObserver(() => {
      for (const node of document.querySelectorAll('.toast'))
        window.conflictNotices.push(node.textContent);
    });
    window.conflictObserver.observe(document.body, {childList:true, subtree:true, characterData:true});
    document.querySelector('.tags .tag[data-tag-key]').click();
  })()`);
  await h.input('.tag-pop [aria-label=Tag]', 'conflict user draft');
  // Commit another writer's version without the Agent prepare handshake. This
  // deterministically represents a write that lands after that handshake and
  // before the renderer's pending edit, using the actual conflict boundary.
  await h.evaluate(`(async () => {
    const initial = await window.studio.invoke('workbench.session', {});
    if (!initial.ok) throw Error(initial.error.message);
    const next = structuredClone(initial.data);
    next.tabs.find(t => t.id === ${JSON.stringify(id)}).project.metadata.prompt_raw = 'concurrent command draft';
    const result = await window.studio.invoke('workbench.commit', {base:initial.data, next});
    if (!result.ok) throw Error(result.error.message);
  })()`);
  await h.key('Enter', {}, 'document.querySelector(".tag-pop [aria-label=Tag]")');
  await h.wait('!document.querySelector(".tag-pop:not(.leaving)")');
  await h.wait(
    `window.studio.invoke('workbench.session',{}).then(r => r.ok && r.data.tabs.find(t=>t.id===${JSON.stringify(id)})?.project.metadata.prompt_raw.includes('conflict user draft'))`,
  );
  await h.check(
    '冲突后用户提示词覆盖并显示保留修改通知',
    `window.conflictNotices.some(text => text.includes('Agent 同时改了这个标签页，已保留你的修改'))`,
  );
  await h.evaluate(
    `document.querySelector('[data-tab="${id}"]').dispatchEvent(new MouseEvent('auxclick',{bubbles:true,button:1}))`,
  );
  // Race again with the pending close, so the close-only recovery is exercised.
  await h.evaluate(`(async () => {
    const initial = await window.studio.invoke('workbench.session', {});
    if (!initial.ok) throw Error(initial.error.message);
    const next = structuredClone(initial.data);
    next.tabs.find(t => t.id === ${JSON.stringify(id)}).project.metadata.prompt_raw = 'concurrent close draft';
    const result = await window.studio.invoke('workbench.commit', {base:initial.data, next});
    if (!result.ok) throw Error(result.error.message);
  })()`);
  await h.click('丢弃并关闭', 'document.querySelector("[role=dialog]:not(.leaving *)")');
  await h.wait(`!document.querySelector('[data-tab="${id}"]')`);
  await h.check(
    '冲突标签页关闭后主进程中不再存在',
    async () => !(await call('workbench.list')).tabs.some((t) => t.id === id),
  );
  await h.evaluate(`document.querySelector('[data-tab="${other.tab.id}"]').click()`);
  await h.wait(`!!document.querySelector('[data-tab="${other.tab.id}"][aria-selected=true]')`);
  await h.evaluate(`document.querySelector('.tags .tag[data-tag-key]').click()`);
  await h.input('.tag-pop [aria-label=Tag]', 'after conflict saved');
  await h.key('Enter', {}, 'document.querySelector(".tag-pop [aria-label=Tag]")');
  await h.wait('!document.querySelector(".tag-pop:not(.leaving)")');
  await call('workbench.get', { tabId: other.tab.id });
  await h.check(
    '冲突流程未显示重新读取提示',
    `!window.conflictNotices.some(text => text.includes('重新读取'))`,
  );
  await h.evaluate('window.conflictObserver.disconnect()');
  await h.reload();
  await h.wait(`!!document.querySelector('[data-tab="${other.tab.id}"]')`);
  await h.check('重载后关闭状态和另一标签页的编辑仍保存', async () => {
    const tabs = (await call('workbench.list')).tabs;
    const saved = await call('workbench.get', { tabId: other.tab.id });
    return (
      !tabs.some((t) => t.id === id) &&
      saved.tab.project.metadata.prompt_raw.includes('after conflict saved')
    );
  });
  await call('workbench.close', { tabId: other.tab.id });
}
