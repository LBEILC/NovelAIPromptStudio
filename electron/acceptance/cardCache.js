import { DatabaseSync } from 'node:sqlite';

export async function cardCacheChecks({ database, h }) {
  h.category('卡片缓存');
  const ids = Array.from({ length: 300 }, (_, i) => `cache-acceptance-${i}`);
  const raw = new DatabaseSync(database.filePath);
  const contents = h.window.webContents;
  const send = contents.send;
  const now = performance.now;
  const timing = process.env.NPS_ACCEPTANCE_CARD_TIMING || 'normal';
  let tick = now.call(performance);
  const delayed = [];
  try {
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
    await h.click('工作台', 'document.querySelector(".studio-titlebar")');
    // Acceptance-only scheduling: force terminal events behind the list reply.
    // Exercise the real send/preload path when the queued events are released.
    contents.send = function (channel, ...args) {
      if (channel === 'library:cards-progress' && args[0].completed === args[0].total)
        delayed.push(() => send.call(this, channel, ...args));
      else return send.call(this, channel, ...args);
    };
    // Only the main-process build clock is controlled, never product defaults.
    // Slow: one row per 12ms budget; fast: reach the hard cap of 25 rows/batch.
    if (timing === 'slow') performance.now = () => (tick += 13);
    else if (timing === 'fast') performance.now = () => tick;
    else if (timing !== 'normal') throw Error(`Unknown card timing: ${timing}`);
    await h.evaluate(`(async () => {
      const state = window.__cardCacheAcceptance = { progress: [], pending: true, clicked: false, responsive: false };
      let probe;
      window.studio.onLibraryCardCacheProgress(value => {
        state.progress.push(value);
        if (!state.clicked && value.completed < value.total) {
          document.querySelector('.studio-titlebar [aria-label="设置"]').click();
          state.clicked = true;
          probe = window.studio.getAppearanceSettings().then(() => {
            state.responsive = state.pending && !!document.querySelector('.studio-settings');
          });
        }
      });
      try {
        const [first, second, trash] = await Promise.all([
          window.studio.loadLibraryCards(), window.studio.loadLibraryCards(), window.studio.loadLibraryCards('trash'),
        ]);
        state.pending = false;
        if (probe) await probe;
        state.same = JSON.stringify(first) === JSON.stringify(second);
        state.counts = { active: first.length, trash: trash.length };
        state.complete = first.length === ${counts.active} && trash.length === ${counts.trash};
      } finally { window.studio.offLibraryCardCacheProgress(); }
    })()`);
    performance.now = now;
    contents.send = send;
    for (const deliver of delayed) deliver();
    await h.check(
      '建立期间仍能切换设置页面并完成主进程请求',
      'window.__cardCacheAcceptance.clicked && window.__cardCacheAcceptance.responsive',
      'window.__cardCacheAcceptance',
    );
    await h.check(
      '并发卡片 IPC 等待同一建立过程并返回完整视图',
      'window.__cardCacheAcceptance.same && window.__cardCacheAcceptance.complete',
      `({ expected: ${JSON.stringify(counts)}, actual: window.__cardCacheAcceptance })`,
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
    );
    await h.check(
      '末尾进度晚于列表回复时取消监听，仍取得完整列表',
      async () =>
        delayed.length > 0 &&
        (await h.evaluate(`window.__cardCacheAcceptance.complete &&
        window.__cardCacheAcceptance.progress.every(p => p.completed < p.total)`)),
      'window.__cardCacheAcceptance',
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
      );
    await h.screenshot('card-cache-settings-responsive');
    await h.evaluate('delete window.__cardCacheAcceptance');
  } finally {
    performance.now = now;
    contents.send = send;
    await h.evaluate('window.studio.offLibraryCardCacheProgress()').catch(() => {});
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
