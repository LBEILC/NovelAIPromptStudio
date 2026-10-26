import { extractEmbeddedVibes } from '../vibes.js';
import crypto from 'node:crypto';
import { CommandError } from './registry.js';
import { parsePrompt } from '../../src/lib/prompt.js';
import {
  createPromptDocument,
  parsePromptSection,
  serializePromptSection,
  promptDocumentProject,
  editPromptBlockText,
} from '../../src/lib/promptDocument.ts';
import { reparseSection } from '../../src/workbench/model.ts';
import { addPromptCharacter, updatePromptCharacter } from '../../src/lib/promptStructure.js';
import { requestStructuredAI } from '../translation.js';

// Fail closed: edit distance alone would accept meaningful changes such as blue -> glue.
function spelling(a, b, known) {
  if (a === b) return true;
  const repairs = {
    'flim grain': 'film grain',
    umbrela: 'umbrella',
    'looking at veiwer': 'looking at viewer',
  };
  if (repairs[a] === b) return true;
  if (!known || known(a) || !known(b) || Math.abs(a.length - b.length) > 1) return false;
  // Only an unknown term becoming a known dictionary term can use a single
  // insertion, deletion, replacement or adjacent transposition.
  let i = 0;
  while (i < Math.min(a.length, b.length) && a[i] === b[i]) i++;
  return (
    a.slice(i + 1) === b.slice(i + 1) ||
    a.slice(i + 1) === b.slice(i) ||
    a.slice(i) === b.slice(i + 1) ||
    (a[i] === b[i + 1] && a[i + 1] === b[i] && a.slice(i + 2) === b.slice(i + 2))
  );
}
function closeSyntax(text) {
  for (const [open, close] of [
    ['{', '}'],
    ['[', ']'],
  ]) {
    let depth = 0;
    for (const c of text) {
      if (c === open) depth++;
      if (c === close) depth--;
    }
    if (depth > 0) text += close.repeat(depth);
    if (depth < 0) text = open.repeat(-depth) + text;
  }
  if ((text.match(/::/g)?.length || 0) % 2) text += '::';
  return text;
}
export function safeTidyChange(before, after, known) {
  if (typeof after !== 'string' || after.length > before.length * 2 + 100) return false;
  const numbers = (s) => s.match(/[+-]?(?:\d+(?:\.\d*)?|\.\d+)\s*::/g) || [];
  if (JSON.stringify(numbers(before)) !== JSON.stringify(numbers(after))) return false;
  const terms = (s) =>
    parsePrompt(closeSyntax(s).replace(/\n+/g, ', ')).map((t) => ({
      text: t.tag.trim().toLowerCase(),
      weight: t.weight,
    }));
  const a = terms(before),
    b = terms(after);
  return (
    a.length === b.length &&
    a.every((t, i) => t.weight === b[i].weight && spelling(t.text, b[i].text, known))
  );
}

export function materialCommands({ services, tab, full, edit, locate, revision }) {
  const db = services.database.materials;
  const requests = new Map();
  const read = (id) => {
    const found = db.get(id);
    if (!found) throw new CommandError('not_found', '素材不存在');
    return found;
  };
  const ai = async (input, instruction, payload) => {
    if (requests.has(input.requestId)) throw new CommandError('conflict', '请求正在进行');
    const controller = new AbortController();
    requests.set(input.requestId, controller);
    try {
      const result = await requestStructuredAI(
        instruction,
        payload,
        services.preferences?.credentials() || {},
        controller.signal,
        services.fetcher,
      );
      if (controller.signal.aborted) throw new Error('已取消');
      return result;
    } finally {
      requests.delete(input.requestId);
    }
  };
  return {
    'ai.cancel': ({ requestId }) => {
      requests.get(requestId)?.abort();
      return {};
    },
    'prompt.tidy': async (input) => {
      const current = full(tab(input.tabId));
      revision(input.expectedRevision, current.revision);
      const blocks = current.document.scopes.flatMap((s) =>
        s.blocks.map((b, block) => ({
          scope: s.scope.key,
          block,
          text: b.content,
          type: b.type,
        })),
      );
      const result = await ai(
        input,
        'Organize image prompts. Return JSON {changes:[{scope,block,after,type,title,reason}]}. Each change replaces one whole block. Only repair obvious spelling or unmatched brackets/::, split blocks or classify tags/paragraph. Never add/remove meaningful tags or change numerical weights. Preserve order, labels and meaning. Give concise Chinese title and reason for each change. Return no change for correct blocks.',
        blocks,
      );
      revision(current.revision, tab(input.tabId).revision || 0);
      const seen = new Set();
      const changes = (Array.isArray(result.changes) ? result.changes : []).flatMap((c) => {
        const source = blocks.find((b) => b.scope === c.scope && b.block === c.block);
        const key = `${c.scope}:${c.block}`;
        if (
          !source ||
          seen.has(key) ||
          !['tags', 'paragraph'].includes(c.type) ||
          typeof c.reason !== 'string' ||
          !c.reason.trim() ||
          typeof c.title !== 'string' ||
          !safeTidyChange(
            source.text,
            c.after,
            (text) => services.database.lookupTagDictionary([text]).size > 0,
          ) ||
          (source.text === c.after && source.type === c.type)
        )
          return [];
        seen.add(key);
        return [
          {
            id: crypto.randomUUID(),
            scope: c.scope,
            block: c.block,
            before: source.text,
            after: c.after,
            type: c.type,
            title: c.title,
            reason: c.reason,
          },
        ];
      });
      return { changes, revision: current.revision };
    },
    'library.suggest-names': async (input) => {
      const groups = input.groups.map((ids) =>
        ids.map((id) => {
          const p = services.database.loadProject(id);
          if (!p || p.deleted_at) throw new CommandError('not_found', '图片不存在');
          return p;
        }),
      );
      const result = await ai(
        input,
        'Return JSON {names:["简短中文名"]}, one concise Chinese name for each numbered image group, in the same order and based only on its supplied prompts. Each name must contain 2 to 8 Chinese characters, with no punctuation, spaces or numbering. All names in this batch must be distinct. Do not use a generic subject word such as 少女, 女孩, 男孩, 人物 or 风景 as the entire name. Choose concrete distinguishing scene, action, clothing or composition details. When groups have nearly identical prompts, identify their actual differences and reflect those differences in their names, for example 雪地远景 and 雪地特写. Do not invent details absent from the prompts. Return only the JSON object; no explanations.',
        groups.map((items, index) => ({
          index,
          prompts: items.map((p) =>
            createPromptDocument(p).scopes.map((s) => serializePromptSection(s)),
          ),
        })),
      );
      if (!Array.isArray(result.names) || result.names.length !== groups.length)
        throw new Error('AI 返回的名称数量不正确');
      return {
        changes: groups.flatMap((items, index) => {
          const name = result.names[index];
          if (typeof name !== 'string' || !name.trim() || name.length > 100)
            throw new Error('AI 返回的名称无效');
          return items.map((p, i) => ({
            id: p.id,
            name:
              items.length > 1 ? `${name.trim()}-${String(i + 1).padStart(2, '0')}` : name.trim(),
            original: p.name,
            thumbnail: p.thumbnail_path,
          }));
        }),
      };
    },
    'material.vibes': async () => {
      const found = new Map();
      for (const card of await services.database.loadLibraryCards()) {
        if (!card.vibe_fingerprint) continue;
        const p = services.database.loadProject(card.id);
        let raw;
        try {
          raw = JSON.parse(p.metadata.extra_json || '{}');
        } catch {
          continue;
        }
        for (const vibe of extractEmbeddedVibes(raw.parsed || raw, p.metadata.model)) {
          const id = crypto.createHash('sha256').update(vibe.encoding).digest('hex');
          if (!found.has(id)) found.set(id, { id, name: `Vibe ${found.size + 1}`, sources: [] });
          found
            .get(id)
            .sources.push({ id: card.id, name: card.name, thumbnail: card.thumbnail_path });
        }
      }
      return { items: [...found.values()] };
    },
    'material.list': () => ({ items: db.list() }),
    'material.save': (input) => {
      const current = full(tab(input.tabId));
      revision(input.expectedRevision, current.revision);
      const { section } = locate(current.document, input);
      let value;
      if (input.block !== undefined)
        value = { kind: 'block', blocks: [structuredClone(section.blocks[input.block])] };
      else {
        const character = current.tab.project.prompt_structure.characters.find(
          (c) => c.id === section.scope.characterId,
        );
        if (!character) throw new CommandError('invalid_input', '请选择角色');
        const scopes = current.document.scopes.filter((s) => s.scope.characterId === character.id);
        value = {
          kind: 'character',
          character: structuredClone(character),
          blocks: scopes.find((s) => s.scope.polarity === 'prompt')?.blocks || [],
          negativeBlocks: scopes.find((s) => s.scope.polarity === 'undesired')?.blocks || [],
        };
      }
      return {
        item: db.save({
          ...value,
          name: input.name.trim(),
          examples: current.tab.source.projectId ? [current.tab.source.projectId] : [],
        }),
      };
    },
    'material.rename': ({ id, name }) => ({ item: db.rename(read(id).id, name.trim()) }),
    'material.update': ({ id, block, negative, text, asNew }) => {
      const material = read(id);
      if (typeof text !== 'string' || !text.trim())
        throw new CommandError('invalid_input', '素材内容不能为空');
      if (material.kind === 'block' && negative !== undefined)
        throw new CommandError('invalid_input', '常用块没有负面提示词');
      if (negative && block !== undefined)
        throw new CommandError('invalid_input', '负面提示词和块位置不能同时指定');
      const next = structuredClone(material);
      if (negative) {
        const base = parsePromptSection('placeholder').blocks[0];
        next.negativeBlocks = editPromptBlockText(
          { blocks: [base], separators: ['', ''] },
          0,
          text,
        ).blocks;
      } else {
        const index = material.kind === 'block' && block === undefined ? 0 : block;
        if (!Number.isInteger(index) || index < 0 || index >= material.blocks.length)
          throw new CommandError('invalid_input', '素材块位置不存在');
        const section = editPromptBlockText(
          { blocks: [material.blocks[index]], separators: ['', ''] },
          0,
          text,
        );
        next.blocks[index] = section.blocks[0];
        if (next.blocks[index].type === 'paragraph') delete next.blocks[index].translation;
      }
      return { item: db.update(id, next, asNew) };
    },
    'material.delete': ({ id }) => {
      db.remove(read(id).id);
      return {};
    },
    'material.insert': async (input) => {
      const material = read(input.id);
      const result = await edit(input, (doc) => {
        if (material.kind === 'character') {
          const before = promptDocumentProject(doc);
          const next = addPromptCharacter(before);
          if (next === before) throw new CommandError('invalid_input', '角色数量已达上限');
          const character = next.prompt_structure.characters.at(-1);
          const names = new Set(before.prompt_structure.characters.map((c) => c.label));
          let name = material.name,
            n = 2;
          while (names.has(name)) name = `${material.name} ${n++}`;
          const project = updatePromptCharacter(next, character.id, {
            ...material.character,
            id: character.id,
            label: name,
          });
          const fresh = createPromptDocument(project);
          for (const section of fresh.scopes.filter((s) => s.scope.characterId === character.id)) {
            const saved =
              section.scope.polarity === 'prompt' ? material.blocks : material.negativeBlocks || [];
            section.blocks = structuredClone(saved);
            section.separators = [
              '',
              ...saved.map((_, i) => (i === saved.length - 1 ? '' : '\n\n')),
            ];
          }
          return fresh;
        }
        const { si, section } = locate(doc, { ...input, block: undefined });
        const at = input.before ?? section.blocks.length;
        if (at > section.blocks.length) throw new CommandError('invalid_input', '插入位置不存在');
        const texts = section.blocks.map((b) => b.raw);
        texts.splice(at, 0, material.blocks[0].raw);
        const parsed = reparseSection(section, texts.join('\n\n'));
        const inserted = parsed.blocks[at];
        if (inserted)
          parsed.blocks[at] = {
            ...inserted,
            type: material.blocks[0].type,
            userType: true,
            translation: material.blocks[0].translation,
            displayLabel: material.blocks[0].displayLabel,
            tags: material.blocks[0].type === 'tags' ? parsePrompt(inserted.content) : [],
          };
        doc.scopes[si] = { ...section, ...parsed };
        return doc;
      });
      db.used(material.id);
      return result;
    },
  };
}
