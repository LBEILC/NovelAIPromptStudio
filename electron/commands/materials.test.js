import { afterEach, beforeEach, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { createMaterialStore, migrateMaterials } from '../materials.js';
import { materialCommands } from './materials.js';
import { validateCommand } from './registry.js';
import { parsePromptSection } from '../../src/lib/promptDocument.ts';

let connection, store, commands;
beforeEach(() => {
  connection = new DatabaseSync(':memory:');
  connection.exec('CREATE TABLE app_meta(key TEXT PRIMARY KEY,value TEXT)');
  migrateMaterials(connection, ':memory:');
  store = createMaterialStore(connection);
  commands = materialCommands({ services: { database: { materials: store } } });
});
afterEach(() => connection.close());
const save = (extra = {}) =>
  store.save({
    kind: 'block',
    name: 'Synthetic',
    examples: ['synthetic-image'],
    blocks: parsePromptSection('blue hair, smile').blocks,
    ...extra,
  });
const update = (input) => {
  validateCommand('material.update', input, 'ui');
  return commands['material.update'](input).item;
};

it('edits tags using the shared weighted parser and preserves metadata and usage', () => {
  const original = save();
  store.used(original.id);
  const edited = update({ id: original.id, text: '1.2::red hair::, standing' });
  expect(edited).toMatchObject({
    id: original.id,
    name: original.name,
    uses: 1,
    examples: original.examples,
  });
  expect(edited.blocks[0].tags.map(({ tag, weight }) => [tag, weight])).toEqual([
    ['red hair', 1.2],
    ['standing', 1],
  ]);
  expect(edited.blocks[0].raw).toBe('1.2::red hair::, standing');
  expect(store.get(original.id)).toEqual(edited);
});

it('copies with unique names, zero usage and persistent placement immediately after the source', () => {
  const original = save();
  store.used(original.id);
  const before = store.get(original.id);
  const other = save({ name: 'Other' });
  const copy = update({ id: original.id, text: 'standing', asNew: true });
  expect(copy).toMatchObject({ name: 'Synthetic 副本', uses: 0, examples: original.examples });
  expect(copy.id).not.toBe(original.id);
  expect(store.get(original.id)).toEqual(before);
  const second = update({ id: original.id, text: 'smile', asNew: true });
  expect(second.name).toBe('Synthetic 副本 2');
  expect(
    createMaterialStore(connection)
      .list()
      .map((x) => x.id),
  ).toEqual([other.id, original.id, second.id, copy.id]);
  const latest = save({ name: 'Latest' });
  expect(store.list()[0].id).toBe(latest.id);
});

it('edits only the selected character block and clears paragraph translation while retaining type', () => {
  const blocks = parsePromptSection('blue hair\n\nstanding').blocks;
  blocks[1] = { ...blocks[1], type: 'paragraph', tags: [], translation: '旧译文' };
  const original = save({
    kind: 'character',
    blocks,
    character: { label: 'Synthetic character' },
    negativeBlocks: parsePromptSection('lowres').blocks,
  });
  const edited = update({
    id: original.id,
    block: 1,
    text: '  A synthetic paragraph.\n\nAnother line.  ',
  });
  expect(edited.blocks[0]).toEqual(original.blocks[0]);
  expect(edited.blocks[1]).toMatchObject({
    type: 'paragraph',
    content: '  A synthetic paragraph.\n\nAnother line.  ',
    tags: [],
  });
  expect(edited.blocks[1].translation).toBeUndefined();
  expect(edited.negativeBlocks).toEqual(original.negativeBlocks);
  expect(edited.character).toEqual(original.character);
});

it('replaces all character negative blocks with one weighted tag block', () => {
  const original = save({
    kind: 'character',
    negativeBlocks: parsePromptSection('lowres\n\nblurry').blocks,
  });
  const edited = update({ id: original.id, negative: true, text: '1.2::blurry::, lowres' });
  expect(edited.blocks).toEqual(original.blocks);
  expect(edited.negativeBlocks).toHaveLength(1);
  expect(edited.negativeBlocks[0]).toMatchObject({
    type: 'tags',
    tags: [
      { tag: 'blurry', weight: 1.2 },
      { tag: 'lowres', weight: 1 },
    ],
  });
});

it('rejects empty text, invalid indices, invalid negative targets and conflicting selectors without writes', () => {
  const block = save();
  const character = save({ kind: 'character' });
  const before = store.list();
  for (const input of [
    { id: block.id, text: '' },
    { id: block.id, text: ' \n ' },
    { id: block.id, text: 'smile', block: 5 },
    { id: character.id, text: 'smile', block: -1 },
    { id: character.id, text: 'smile', block: 0.5 },
    { id: character.id, text: 'smile' },
    { id: block.id, text: 'smile', negative: true },
    { id: block.id, text: 'smile', negative: false },
    { id: character.id, text: 'smile', negative: true, block: 0 },
    { id: 'missing', text: 'smile' },
  ])
    expect(() => update({ ...input, asNew: true })).toThrow();
  expect(store.list()).toEqual(before);
});

it('denies Agent and CLI callers before changing data', () => {
  const original = save();
  for (const source of ['agent', 'cli'])
    expect(() =>
      validateCommand('material.update', { id: original.id, text: 'smile' }, source),
    ).toThrow('只供软件界面');
  expect(store.get(original.id)).toEqual(original);
});

it('reads legacy payloads and rolls back the copy and ordering together on a write failure', () => {
  const original = save();
  connection
    .prepare('UPDATE materials SET payload=? WHERE id=?')
    .run(JSON.stringify(original), original.id);
  expect(store.get(original.id)).toEqual(original);
  const before = connection.prepare('SELECT * FROM materials').all();
  connection.exec(`CREATE TRIGGER reject_material_order BEFORE UPDATE ON materials
    BEGIN SELECT RAISE(ABORT, 'synthetic write failure'); END`);
  expect(() => update({ id: original.id, text: 'standing', asNew: true })).toThrow(
    'synthetic write failure',
  );
  expect(connection.prepare('SELECT * FROM materials').all()).toEqual(before);
  connection.exec('DROP TRIGGER reject_material_order');
  const copy = update({ id: original.id, text: 'standing', asNew: true });
  expect(store.list().map((m) => m.id)).toEqual([original.id, copy.id]);
  expect(store.get(original.id)).toEqual(original);
});
