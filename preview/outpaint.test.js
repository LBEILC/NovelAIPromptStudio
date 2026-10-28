import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startServices } from './services.mjs';
import { createSession } from './session.mjs';
import { createWorkbenchFixtures } from '../electron/acceptance/workbenchFixtures.js';

describe.sequential('preview outpaint through an isolated session', () => {
  const events = [],
    terminal = new Map(),
    waiters = new Map();
  let services, session, input, opened;
  const wait = (id) =>
    terminal.has(id)
      ? Promise.resolve(terminal.get(id))
      : new Promise((resolve) => waiters.set(id, resolve));
  beforeAll(async () => {
    services = await startServices([]);
    services.novel.state.delay = 10;
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
    const [file] = await createWorkbenchFixtures(session.directory, {
      sizes: [[512, 512]],
      prompts: ['synthetic preview'],
    });
    opened = await session.call('workbench.open', { path: file });
    input = {
      tabId: opened.tab.id,
      imageId: opened.tab.project.id,
      edges: { left: 64, right: 0, top: 64, bottom: 0 },
    };
  });
  afterAll(async () => {
    await session?.close();
    await services?.close();
  });
  it('estimates blocks and retains the first block when the second fails', async () => {
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
    const current = (await session.call('workbench.get', { tabId: input.tabId })).tab;
    expect(current.versionImageId).toBe(partial.images[0]);
    expect(current.project.image_path).toBe(
      session.database.loadProject(partial.images[0]).image_path,
    );
    expect(current.project.metadata).toMatchObject({ width: 576, height: 512 });
    expect(
      events.some(
        (event) =>
          event.type === 'generation' &&
          event.data.jobs.some((job) => job.id === partial.id && job.blockIndex === 2),
      ),
    ).toBe(true);
    expect(services.blocked).toEqual([]);
  });
  it('completes both blocks using the persisted original after disabling the failure switch', async () => {
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
  });
});
