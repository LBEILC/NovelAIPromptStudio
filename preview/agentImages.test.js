import { expect, it } from 'vitest';
import { realpath } from 'node:fs/promises';
import { startServices } from './services.mjs';
import { createSession } from './session.mjs';
import { createWorkbenchFixtures } from '../electron/acceptance/workbenchFixtures.js';

it('serves Agent image previews through the shared commands in an isolated preview profile', async () => {
  const services = await startServices([]);
  let session;
  try {
    session = await createSession(services, [], () => {}, true);
    const [file] = await createWorkbenchFixtures(session.directory, {
      sizes: [[512, 512]],
      prompts: ['synthetic preview'],
    });
    const opened = await session.call('workbench.open', { path: file });
    const input = {
      tabId: opened.tab.id,
      imageId: opened.tab.project.id,
      shapes: [{ type: 'rect', x: 128, y: 128, width: 128, height: 128 }],
    };
    const preview = await session.call('generate.estimate-inpaint', input, 'agent');
    expect(session.allowedPath(preview.previewPath)).toBe(await realpath(preview.previewPath));
    expect(preview.maskRatio).toBe(1 / 16);
    const pending = await session.call('generate.inpaint', input, 'agent');
    expect(pending.state).toBe('pending');
    expect(session.allowedPath(pending.previewPath)).toBe(await realpath(pending.previewPath));
    expect(await session.call('inpaint.get', { tabId: input.tabId }, 'agent')).toEqual({
      active: false,
    });
    await session.call('generate.cancel', { ids: [pending.id] });
    expect(services.novel.state.requests).toHaveLength(0);
    expect(services.blocked).toEqual([]);
  } finally {
    await session?.close();
    await services.close();
  }
});
