import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, expect, it } from 'vitest';
import './fixtures/databaseTestBudget.js';
import { openDatabase } from './database.js';
import { retranslateDictionary } from './dictionaryTranslation.js';

const roots = [];
const databases = [];
async function fixture(count = 0) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dictionary-check-'));
  roots.push(root);
  const database = await openDatabase(root);
  databases.push(database);
  const tags = Array.from({ length: count }, (_, i) => `fixture_tag_${String(i).padStart(3, '0')}`);
  database.upsertTagDictionary(
    tags.map((tag) => ({
      tag,
      translation: '原译文',
      category: 'Body',
      has_translation: true,
      has_classification: true,
    })),
  );
  return { database, tags };
}
afterEach(() => {
  databases.splice(0).forEach((database) => database.close());
  roots.splice(0).forEach((root) => fs.rmSync(root, { recursive: true, force: true }));
});
const response = (_url, options) => {
  const tags = JSON.parse(JSON.parse(options.body).messages[1].content).tags;
  return Promise.resolve(
    new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: JSON.stringify({
                items: tags.map(() => ({ translation: '新译文', category: 'Environment' })),
              }),
            },
          },
        ],
      }),
    ),
  );
};
it('counts each active image once across positive, negative and character tags with space aliases', async () => {
  const { database } = await fixture();
  const tag = (text, id) => ({ tag: text, id, category: 'Body', weight: 1 });
  database.insertProject({
    id: 'one',
    tags: [tag('blue_hair', 'a'), tag('blue hair', 'b')],
    prompt_structure: {
      base_undesired_tags: [tag('lowres', 'c')],
      characters: [
        { id: 'subject', prompt_tags: [tag('blue_hair', 'd')], undesired_tags: [tag('hat', 'e')] },
      ],
    },
    metadata: {},
  });
  database.insertProject({ id: 'two', tags: [tag('blue hair', 'f')], metadata: {} });
  database.insertProject({ id: 'trashed', tags: [tag('blue hair', 'g')], metadata: {} });
  database.updateProjects(['trashed'], { deleted: true });
  let counts = await database.tagImageCounts();
  expect(counts.get('blue hair')).toBe(2);
  expect(counts.get('lowres')).toBe(1);
  expect(counts.get('hat')).toBe(1);
  database.updateProjects(['two'], { deleted: true });
  counts = await database.tagImageCounts();
  expect(counts.get('blue hair')).toBe(1);
});
it('loads an entire snapshot beyond the old page size without changing paginated callers', async () => {
  const { database } = await fixture(201);
  expect(database.listTagDictionary({ all: true }).items).toHaveLength(201);
  expect(database.listTagDictionary({ limit: 200 }).items).toHaveLength(200);
});
it('keeps a failed batch unchanged and commits the successful remainder', async () => {
  const { database, tags } = await fixture(51);
  let calls = 0;
  const result = await retranslateDictionary({
    tags,
    database,
    settings: { model: 'fixture' },
    fetcher: (...args) =>
      ++calls === 1 ? Promise.resolve(new Response('{}', { status: 500 })) : response(...args),
  });
  expect(result).toMatchObject({ completed: 51, translated: 1, canceled: false });
  expect(result.failed).toHaveLength(50);
  expect(database.lookupTagDictionary([tags[0]]).get(tags[0]).translation).toBe('原译文');
  expect(database.lookupTagDictionary([tags[50]]).get(tags[50])).toMatchObject({
    translation: '新译文',
    translation_source: 'ai',
    category_source: 'ai',
  });
});
it('cancels between batches and preserves newer manual edits during a request', async () => {
  const { database, tags } = await fixture(51);
  const controller = new AbortController();
  const result = await retranslateDictionary({
    tags,
    database,
    settings: { model: 'fixture' },
    signal: controller.signal,
    fetcher: async (...args) => {
      database.updateTagDictionary(tags[0], { translation: '后来修改' });
      return response(...args);
    },
    progress: (value) => {
      if (value.completed === 50) controller.abort();
    },
  });
  expect(result).toMatchObject({ completed: 50, translated: 49, canceled: true });
  expect(result.failed).toHaveLength(1);
  expect(database.lookupTagDictionary([tags[0]]).get(tags[0]).translation).toBe('后来修改');
  expect(database.lookupTagDictionary([tags[50]]).get(tags[50]).translation).toBe('原译文');
});
it('aborts an in-flight batch before writing any result', async () => {
  const { database, tags } = await fixture(2);
  const controller = new AbortController();
  const result = await retranslateDictionary({
    tags,
    database,
    settings: { model: 'fixture' },
    signal: controller.signal,
    fetcher: async () => {
      controller.abort();
      return response('', {
        body: JSON.stringify({ messages: [{}, { content: JSON.stringify({ tags }) }] }),
      });
    },
  });
  expect(result).toMatchObject({ completed: 0, translated: 0, canceled: true });
  expect(
    [...database.lookupTagDictionary(tags).values()].every((item) => item.translation === '原译文'),
  ).toBe(true);
});
