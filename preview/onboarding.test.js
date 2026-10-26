import { it, expect } from 'vitest';
import { startServices } from './services.mjs';
import { createSession } from './session.mjs';

it('skips onboarding by default and replays it through the first-launch preview scene', async () => {
  const services = await startServices([]);
  let session;
  try {
    session = await createSession(services, [], () => {}, true);
    expect(await session.call('onboarding.get')).toEqual({
      show: false,
      seen: 'preview',
      current: 'preview',
    });
    session.resetOnboarding();
    expect(await session.call('onboarding.get')).toEqual({
      show: true,
      seen: 'preview',
      current: 'preview',
    });
    await session.call('onboarding.done');
    expect(await session.call('onboarding.get')).toEqual({
      show: false,
      seen: 'preview',
      current: 'preview',
    });
    session.resetOnboarding();
    expect(await session.call('onboarding.get')).toEqual({
      show: true,
      seen: 'preview',
      current: 'preview',
    });
    expect(services.blocked).toEqual([]);
  } finally {
    await session?.close();
    await services.close();
  }
});
