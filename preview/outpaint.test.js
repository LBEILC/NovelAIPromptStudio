import { expect, it } from 'vitest';
import { startServices } from './services.mjs';
import { createSession } from './session.mjs';
import { createWorkbenchFixtures } from '../electron/acceptance/workbenchFixtures.js';

it('previews both estimates, block progress and the second-block failure switch without external requests', async () => {
  const services = await startServices([]),
    events = [],
    terminal = new Map(),
    waiters = new Map();
  services.novel.state.delay = 10;
  let session;
  try {
    session = await createSession(
      services,
      [],
      (event) => {
        events.push(event);
        if (event.type === 'generation')
          for (const job of event.data.jobs)
            if (['completed', 'failed', 'canceled'].includes(job.state)) {
              terminal.set(job.id, job);
              waiters.get(job.id)?.(job);
            }
      },
      true,
    );
    const wait = (id) =>
      terminal.has(id)
        ? Promise.resolve(terminal.get(id))
        : new Promise((resolve) => waiters.set(id, resolve));
    const [file] = await createWorkbenchFixtures(session.directory, {
      sizes: [[512, 512]],
      prompts: ['synthetic preview'],
    });
    const opened = await session.call('workbench.open', { path: file });
    const input = {
      tabId: opened.tab.id,
      imageId: opened.tab.project.id,
      edges: { left: 64, right: 0, top: 64, bottom: 0 },
    };
    const estimate = await session.call('generate.estimate-outpaint', input);
    expect(estimate.canvas).toEqual({ width: 576, height: 576 });
    expect(estimate.edges.blocks).toHaveLength(2);
    services.state.outpaintFailSecond = true;
    const partial = await wait(
      (await session.call('generate.outpaint', { ...input, mode: 'edges' })).id,
    );
    expect(partial.state).toBe('completed');
    expect(partial.failedEdges).toEqual(['top']);
    expect(session.database.loadProject(partial.images[0]).metadata).toMatchObject({
      width: 576,
      height: 512,
    });
    expect(
      events.some(
        (event) =>
          event.type === 'generation' &&
          event.data.jobs.some((job) => job.id === partial.id && job.blockIndex === 2),
      ),
    ).toBe(true);
    // Opening an external source saves the original; subsequent operations use its persisted ID.
    input.imageId = session.database.versions.list(
      opened.tab.workId || opened.tab.id,
    )[0].project.id;
    services.state.outpaintFailSecond = false;
    const complete = await wait(
      (await session.call('generate.outpaint', { ...input, mode: 'edges' })).id,
    );
    expect(complete.failure).toBeUndefined();
    expect(session.database.loadProject(complete.images[0]).metadata).toMatchObject({
      width: 576,
      height: 576,
    });
    expect(services.blocked).toEqual([]);
  } finally {
    await session?.close();
    await services.close();
  }
});
