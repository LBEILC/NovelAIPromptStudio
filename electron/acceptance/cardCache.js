import { DatabaseSync } from 'node:sqlite';
import { BrowserWindow } from 'electron';

export async function cardCacheChecks({ database, h, mode = {}, cardCacheControl }) {
  h.category('卡片缓存');
  const ids = Array.from({ length: 300 }, (_, i) => `cache-acceptance-${i}`);
  const timing = process.env.NPS_ACCEPTANCE_CARD_TIMING || 'fast';
  if (!cardCacheControl) throw Error('Card cache checks require guarded acceptance mode');
  const raw = new DatabaseSync(database.filePath);
  const unrelated = new BrowserWindow({ show: false });
  let unrelatedProgress = 0;
  const originalSend = unrelated.webContents.send.bind(unrelated.webContents);
  unrelated.webContents.send = (channel, event, ...args) => {
    if (channel === 'studio:command-event' && event?.type === 'progress') unrelatedProgress++;
    return originalSend(channel, event, ...args);
  };
  try {
    await h.click('工作台', 'document.querySelector(".studio-titlebar")');
    await database.loadLibraryCards();
    database.insertProjects(
      ids.map((id) => ({
        id,
        name: id,
        tags: [],
        metadata: { extra_json: JSON.stringify({ padding: 'x'.repeat(128 * 1024) }) },
      })),
    );
    raw.exec('DROP TABLE IF EXISTS library_card_cache');
    const counts = raw
      .prepare(
        `SELECT count(*) AS total,
      sum(CASE WHEN deleted_at = '' THEN 1 ELSE 0 END) AS active,
      sum(CASE WHEN deleted_at != '' THEN 1 ELSE 0 END) AS trash FROM projects`,
      )
      .get();
    // Hold terminal reports at their source until the renderer receives its list.
    // The actual webContents.send, preload and main-process clock stay untouched.
    cardCacheControl.begin(timing);
    await h.evaluate(`(async () => {
      const state = window.__cardCacheAcceptance = { progress: [], pending: true, clicked: false, responsive: false };
      let probe;
      window.__cardCacheUnsubscribe = window.studio.onCommandEvent(event => {
        if(event.type !== 'progress' || event.topic !== 'library:cards-progress') return;
        const value = event.data;
        state.progress.push(value);
        if (!state.clicked && value.completed < value.total) {
          const started = performance.now();
          const clickedWhilePending = state.pending;
          document.querySelector('.studio-titlebar [aria-label="设置"]').click();
          state.clicked = true;
          // Probe the main event loop without deliberately delayed disk I/O.
          // A fast build may legitimately finish before the response returns.
          probe = window.studio.invoke('updates.status',{}).then(result=>{if(!result.ok)throw Error(result.error.message);return result.data}).then(async () => {
            state.responseMs = performance.now() - started;
            state.clickedWhilePending = clickedWhilePending;
          });
        }
      });
      try {
        const [first, second, trash] = await Promise.all([
          window.studio.invoke('library.cards',{}).then(result=>{if(!result.ok)throw Error(result.error.message);return result.data}), window.studio.invoke('library.cards',{}).then(result=>{if(!result.ok)throw Error(result.error.message);return result.data}), window.studio.invoke('library.cards',{view:'trash'}).then(result=>{if(!result.ok)throw Error(result.error.message);return result.data}),
        ]);
        state.pending = false;
        if (probe) await probe;
        state.same = JSON.stringify(first) === JSON.stringify(second);
        state.counts = { active: first.length, trash: trash.length };
        state.complete = first.length === ${counts.active} && trash.length === ${counts.trash};
      } finally { window.__cardCacheUnsubscribe(); }
    })()`);
    await h.wait('!!document.querySelector(".studio-settings")?.getClientRects().length');
    const delayedCount = cardCacheControl.flush();
    await h.check('进度只发送给请求卡片的窗口', () => unrelatedProgress === 0, undefined, 'once');
    await h.check(
      '建立期间发起切页与主进程请求并完成',
      'window.__cardCacheAcceptance.clicked && window.__cardCacheAcceptance.clickedWhilePending',
      'window.__cardCacheAcceptance',
      'once',
    );
    await h.check(
      '并发卡片 IPC 等待同一建立过程并返回完整视图',
      'window.__cardCacheAcceptance.same && window.__cardCacheAcceptance.complete',
      `({ expected: ${JSON.stringify(counts)}, actual: window.__cardCacheAcceptance })`,
      'once',
    );
    await h.check(
      '中间进度形状正确且已完成张数不回退，列表返回即完成',
      `(() => {
      const progress = window.__cardCacheAcceptance.progress;
      return progress.some(p => p.completed > 0 && p.completed < p.total) &&
        progress.every((p, i) => Object.keys(p).sort().join(',') === 'completed,total' && Number.isInteger(p.completed) && Number.isInteger(p.total) && p.completed >= 0 && p.total === ${counts.total} && (i === 0 || p.completed >= progress[i - 1].completed)) &&
        window.__cardCacheAcceptance.complete && !window.__cardCacheAcceptance.pending;
    })()`,
      'window.__cardCacheAcceptance',
      'once',
    );
    await h.check(
      '末尾进度晚于列表回复时取消监听，仍取得完整列表',
      async () =>
        delayedCount > 0 &&
        (await h.evaluate(`window.__cardCacheAcceptance.complete &&
        window.__cardCacheAcceptance.progress.every(p => p.completed < p.total)`)),
      'window.__cardCacheAcceptance',
      'once',
    );
    if (timing !== 'normal')
      await h.check(
        `受控 ${timing} 建立过程使用预期批次大小`,
        `(() => {
          const progress = window.__cardCacheAcceptance.progress;
          const deltas = progress.slice(1).map((p, i) => p.completed - progress[i].completed);
          return deltas.length > 0 && deltas.every(n => n === ${timing === 'slow' ? 1 : 25});
        })()`,
        'window.__cardCacheAcceptance.progress',
        'once',
      );
    await h.screenshot('card-cache-settings-responsive');
    await h.evaluate('delete window.__cardCacheAcceptance');
  } finally {
    unrelated.destroy();
    cardCacheControl.reset();
    await h
      .evaluate('window.__cardCacheUnsubscribe?.(); delete window.__cardCacheUnsubscribe')
      .catch(() => {});
    for (const id of ids) database.deleteProject(id);
    raw.exec('BEGIN');
    for (const id of ids) {
      raw.prepare('DELETE FROM prompt_tags WHERE project_id = ?').run(id);
      raw.prepare('DELETE FROM generation_metadata WHERE project_id = ?').run(id);
    }
    raw.exec('COMMIT');
    raw.close();
    await database.loadLibraryCards();
  }
}
