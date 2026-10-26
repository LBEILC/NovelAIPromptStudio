import crypto from 'node:crypto';
import {
  formatRandomMarker,
  parseRandomMarker,
  validatePoolName,
} from '../../src/lib/randomPrompt.ts';
import {
  createPromptDocument,
  promptDocumentProject,
  serializePromptSection,
} from '../../src/lib/promptDocument.ts';
import { reparseSection } from '../../src/workbench/model.ts';
import { syncProjectPromptMetadata } from '../../src/lib/promptStructure.js';
import { CommandError } from './registry.js';

export function randomCommands({ services, store, tab, edit, locate, unlocked, emit }) {
  const db = services.database.materials;
  const pool = (id) => {
    const item = db.get(id);
    if (item?.kind !== 'pool') throw new CommandError('not_found', '随机池不存在');
    return item;
  };
  const name = (value, id) => {
    value = validatePoolName(value);
    if (db.list().some((p) => p.kind === 'pool' && p.id !== id && p.name === value))
      throw new CommandError('conflict', '随机池名称已存在');
    return value;
  };
  const entry = (text, chance = 1, id = crypto.randomUUID()) => {
    if (!text.trim() || !Number.isFinite(chance) || chance <= 0)
      throw new CommandError('invalid_input', '条目不能为空，概率必须为正数');
    return { id, text: text.trim(), chance };
  };
  const changeBlock = (input, replace) =>
    edit(input, (doc) => {
      const { section } = locate(doc, input);
      if (section.scope.polarity === 'undesired')
        throw new CommandError('invalid_input', '负面提示词不能使用随机块');
      if (
        (input.min === undefined) !== (input.max === undefined) ||
        (input.step !== undefined && input.min === undefined)
      )
        throw new CommandError('invalid_input', '随机权重需要同时提供 min 和 max');
      const marker = formatRandomMarker({
        pool: input.pool,
        count: input.count,
        repeat: input.repeat,
        ...(input.min !== undefined
          ? { weight: { min: input.min, max: input.max, step: input.step ?? 0.05 } }
          : {}),
      });
      if (!db.list().some((p) => p.kind === 'pool' && p.name === parseRandomMarker(marker).pool))
        throw new CommandError('not_found', `找不到随机池「${input.pool}」`);
      const text = serializePromptSection(section);
      if (replace) {
        const block = section.blocks[input.block];
        if (block.type !== 'random') throw new CommandError('invalid_input', '请选择随机块');
        Object.assign(
          section,
          reparseSection(
            section,
            text.slice(0, block.range.start) + marker + text.slice(block.range.end),
          ),
        );
      } else {
        const at =
          input.before === undefined || input.before === section.blocks.length
            ? text.length
            : section.blocks[input.before]?.range.start;
        if (at === undefined) throw new CommandError('invalid_input', '插入位置不存在');
        Object.assign(
          section,
          reparseSection(
            section,
            text.slice(0, at) +
              (at ? '\n\n' : '') +
              marker +
              (at < text.length ? '\n\n' : '') +
              text.slice(at),
          ),
        );
      }
      return doc;
    });
  return {
    'material.pool.create': ({ name: value }) => ({
      item: db.save({ kind: 'pool', name: name(value), entries: [], blocks: [], examples: [] }),
    }),
    'material.pool.rename': async ({ id, name: value }) => {
      const old = pool(id).name,
        next = name(value, id);
      if (old === next) return { item: pool(id) };
      const previous = store.get(),
        session = structuredClone(previous);
      const affected = [];
      for (const t of session.tabs.filter((t) => t.project)) {
        const doc = createPromptDocument(t.project);
        let changed = false;
        for (const section of doc.scopes) {
          const text = serializePromptSection(section).replace(/__[^\r\n]*?__(?!_)/g, (source) => {
            try {
              const options = parseRandomMarker(source);
              return options.pool === old ? formatRandomMarker({ ...options, pool: next }) : source;
            } catch {
              return source;
            }
          });
          if (text !== serializePromptSection(section)) {
            Object.assign(section, reparseSection(section, text));
            changed = true;
          }
        }
        if (!changed) continue;
        unlocked({ tabId: t.id });
        t.project = syncProjectPromptMetadata(promptDocumentProject(doc));
        t.revision = (t.revision || 0) + 1;
        t.updatedAt = new Date().toISOString();
        affected.push(t);
      }
      if (affected.length) await store.save(session);
      let item;
      try {
        item = db.rename(id, next);
      } catch (error) {
        if (affected.length) await store.save(previous);
        throw error;
      }
      for (const t of affected) services.remember?.(t);
      emit?.();
      return { item };
    },
    'material.pool.delete': ({ id }) => {
      pool(id);
      db.remove(id);
      return {};
    },
    'material.pool.entry.add': ({ id, text, chance }) => {
      const item = pool(id);
      item.entries.push(entry(text, chance));
      return { item: db.update(id, item) };
    },
    'material.pool.entry.update': ({ id, entryId, text, chance }) => {
      if (text === undefined && chance === undefined)
        throw new CommandError('invalid_input', '请提供条目文字或概率');
      const item = pool(id),
        index = item.entries.findIndex((e) => e.id === entryId);
      if (index < 0) throw new CommandError('not_found', '条目不存在');
      item.entries[index] = entry(
        text ?? item.entries[index].text,
        chance ?? item.entries[index].chance,
        entryId,
      );
      return { item: db.update(id, item) };
    },
    'material.pool.entry.delete': ({ id, entryId }) => {
      const item = pool(id);
      if (!item.entries.some((e) => e.id === entryId))
        throw new CommandError('not_found', '条目不存在');
      item.entries = item.entries.filter((e) => e.id !== entryId);
      return { item: db.update(id, item) };
    },
    'material.pool.replace': ({ id, text }) => {
      const item = pool(id);
      item.entries = text
        .split(/\r\n|\r|\n/)
        .filter((line) => line.trim())
        .map((line) => entry(line));
      return { item: db.update(id, item) };
    },
    'block.random.insert': (input) => changeBlock(input, false),
    'block.random.update': (input) => changeBlock(input, true),
    'version.apply-random': async (input) => {
      const current = tab(input.tabId);
      const version = services.database.versions.get(input.versionId);
      const image = version?.images.find(
        (i) => i.id === input.imageId || i.projectId === input.imageId,
      );
      if (!image || version.workId !== current.workId)
        throw new CommandError('not_found', '版本图片不存在');
      const skipped = [],
        applied = [];
      const result = await edit(input, (doc) => {
        for (const block of [...(image.random?.blocks || [])].sort((a, b) => b.start - a.start)) {
          const section = doc.scopes.find((s) => s.scope.key === block.scope);
          const text = section && serializePromptSection(section);
          if (
            !section ||
            text.slice(block.start, block.start + block.source.length) !== block.source
          ) {
            skipped.push(block);
            continue;
          }
          Object.assign(
            section,
            reparseSection(
              section,
              text.slice(0, block.start) +
                block.text +
                text.slice(block.start + block.source.length),
            ),
          );
          applied.push(block);
        }
        return doc;
      });
      return { ...result, applied: applied.length, skipped };
    },
  };
}
