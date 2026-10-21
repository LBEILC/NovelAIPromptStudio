import { it, expect } from 'vitest';
import { startServices } from './services.mjs';
import { createSession } from './session.mjs';

it('runs all ChatGPT preview scenes against isolated local authorization and Responses services', async () => {
  const services = await startServices([]);
  let session;
  try {
    session = await createSession(services, [], () => {}, true);
    for (const scene of ['signed-out', 'plus', 'free', 'limited', 'codex-plus', 'codex-pro']) {
      await session.setChatGPT(scene);
      const settings = await session.call('settings.ai.get');
      expect(settings.provider).toBe('chatgpt');
      if (scene === 'signed-out' || scene === 'free') expect(settings.chatgpt.signedIn).toBe(false);
      else expect(settings.chatgpt.signedIn).toBe(true);
      if (scene === 'free')
        expect(await session.dispatch('ai.chatgpt.sign-in')).toMatchObject({
          ok: false,
          error: { code: 'not_eligible' },
        });
      if (scene === 'limited') expect(settings.chatgpt.limited).toEqual({ resetsAt: null });
      if (scene.startsWith('codex'))
        expect(settings.chatgpt.quota.windows).toHaveLength(scene === 'codex-pro' ? 1 : 2);
    }
    expect(services.blocked).toEqual([]);
  } finally {
    await session?.close();
    await services.close();
  }
}, 15000);
