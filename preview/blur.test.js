import { expect, it } from 'vitest';
import { startServices } from './services.mjs';
import { createSession } from './session.mjs';
import { createPromptStructure } from '../src/lib/promptStructure.js';
import { parsePrompt } from '../src/lib/prompt.js';

it('runs blur commands and events through the preview adapter and real database', async () => {
  const services = await startServices([]),
    events = [];
  let session;
  try {
    session = await createSession(services, [], (event) => events.push(event), true);
    const metadata = { prompt_raw: 'nsfw', negative_prompt: '', extra_json: '{}' };
    session.database.insertProject({
      id: 'synthetic',
      name: 'Synthetic',
      metadata,
      tags: parsePrompt('nsfw'),
      prompt_structure: createPromptStructure(metadata),
    });
    expect((await session.call('library.cards')).find((c) => c.id === 'synthetic').nsfw.value).toBe(
      true,
    );
    await session.call('settings.blur.save', { settings: { mode: 'nsfw', quickAll: true } });
    expect(await session.call('settings.blur.get')).toMatchObject({ mode: 'nsfw', quickAll: true });
    expect(events.some((event) => event.type === 'blur')).toBe(true);
    await session.call('library.nsfw.mark', { ids: ['synthetic'], value: 'safe' });
    expect(events.at(-1)).toEqual({
      type: 'nsfw-changed',
      states: { synthetic: { value: false, source: 'manual' } },
    });
    await session.call('library.nsfw.mark', { ids: ['synthetic'], value: 'auto' });
    await session.call('settings.blur.save', { settings: { words: [] } });
    expect((await session.call('library.cards'))[0].nsfw).toEqual({ value: false, source: 'auto' });
    expect(services.blocked).toEqual([]);
  } finally {
    await session?.close();
    await services.close();
  }
});
