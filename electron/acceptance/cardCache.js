import { DatabaseSync } from 'node:sqlite';

export async function cardCacheChecks({ database, h }) {
  h.category('卡片缓存');
  const ids = Array.from({ length: 300 }, (_, i) => `cache-acceptance-${i}`);
  const raw = new DatabaseSync(database.filePath);
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
    await h.click('工作台', 'document.querySelector(".studio-titlebar")');
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
        state.complete = first.length === 313 && trash.length === 1;
      } finally { window.studio.offLibraryCardCacheProgress(); }
    })()`);
    await h.check(
      '建立期间仍能切换设置页面并完成主进程请求',
      'window.__cardCacheAcceptance.clicked && window.__cardCacheAcceptance.responsive',
    );
    await h.check(
      '并发卡片 IPC 等待同一建立过程并返回完整视图',
      'window.__cardCacheAcceptance.same && window.__cardCacheAcceptance.complete',
    );
    await h.check(
      '只读进度事件包含已完成张数和总数，最终覆盖全部图片',
      `(() => {
      const progress = window.__cardCacheAcceptance.progress;
      return progress.some(p => p.completed > 0 && p.completed < p.total) &&
        progress.every(p => Object.keys(p).sort().join(',') === 'completed,total' && Number.isInteger(p.completed) && Number.isInteger(p.total) && p.completed >= 0 && p.completed <= p.total) &&
        progress.at(-1).completed === 314 && progress.at(-1).total === 314;
    })()`,
    );
    await h.screenshot('card-cache-settings-responsive');
    await h.evaluate('delete window.__cardCacheAcceptance');
  } finally {
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
