import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

// Opt-in evidence from the isolated acceptance profile; never used in normal startup.
export function referenceEvidence(h, database) {
  if (!process.env.NPS_REFERENCE_EVIDENCE) return;
  const screenshot = h.screenshot;
  h.screenshot = async (name) => {
    const output = path.resolve('.codex-runs/034-states');
    await fs.mkdir(path.join(output, 'assets'), { recursive: true });
    const session = await h.evaluate(`window.studio.invoke('workbench.list',{}).then(r=>r.data)`);
    const versions = {};
    for (const tab of session.tabs) {
      const result = await h.evaluate(
        `window.studio.invoke('version.list',{tabId:${JSON.stringify(tab.id)}}).then(r=>r.ok?r.data:null)`,
      );
      if (result) versions[tab.id] = result;
    }
    const state = {
      session,
      versions,
      library: database.loadLibrary(),
      materials: database.materials.list(),
      size: h.window.getContentSize(),
    };
    const images = {};
    const visit = async (value) => {
      if (!value || typeof value !== 'object') return;
      for (const [key, item] of Object.entries(value)) {
        if (
          ['image_path', 'thumbnail_path'].includes(key) &&
          typeof item === 'string' &&
          item &&
          !images[item]
        ) {
          const dest = path.join(
            output,
            'assets',
            createHash('sha256').update(item).digest('hex') + path.extname(item),
          );
          await fs.copyFile(item, dest);
          images[item] = dest;
        } else if (typeof item === 'object') await visit(item);
      }
    };
    await visit(state);
    await fs.writeFile(path.join(output, name + '.json'), JSON.stringify({ ...state, images }));
    await screenshot(name);
  };
}
