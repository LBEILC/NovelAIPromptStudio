import { expect, it } from 'vitest';
import { startServices } from './services.mjs';
import { createSession } from './session.mjs';

it('drives all three preview scenarios through the real secret store', async () => {
  const services = await startServices([]);
  let session;
  try {
    session = await createSession(services, [], () => {}, true);
    session.preferences.saveRelay({ baseUrl: 'https://example.invalid', key: 'synthetic-relay' });
    session.preferences.saveChatGPTRecord('official', { accessToken: 'synthetic-login' });
    for (const state of ['denied', 'unreadable', 'ok']) {
      session.setKeychain(state);
      expect(session.preferences.generationSettings()).toMatchObject({
        secretStore: state,
        officialTokenReadable: state === 'ok',
        relayKeyReadable: state === 'ok',
      });
      expect(session.preferences.publicSettings()).toMatchObject({
        secretStore: state,
        apiKeyReadable: state === 'ok',
        chatgpt: { readable: state === 'ok' },
      });
      if (state !== 'ok')
        expect(() => session.preferences.novelAIToken()).toThrow(
          expect.objectContaining({ code: `secret_${state}` }),
        );
    }
  } finally {
    await session?.close();
    await services.close();
  }
});
