import crypto from 'node:crypto';
import path from 'node:path';
import { MODEL_CAPS, MAX_VIBES, MAX_PRECISE } from '../../src/shared/params.ts';
import { hydrateParameters, normalizeSettings } from '../params.js';
import { referenceImage } from '../vibeLibrary.js';
import { promptDocumentProject } from '../../src/lib/promptDocument.ts';
import { CommandError } from './registry.js';

export function parameterCommands({ services, tab, edit, revision, unlocked }) {
  const library = services.database.vibeLibrary;
  const fail = (message) => {
    throw new CommandError('invalid_input', message);
  };
  const draft = (input) => {
    const t = tab(input.tabId);
    revision(input.expectedRevision, t.revision || 0);
    unlocked(input);
    return library.refresh(hydrateParameters(t.project));
  };
  const update = (input, fn) =>
    edit(input, (doc) => fn(hydrateParameters(promptDocumentProject(doc))));
  async function add(input, caller, kind) {
    const p = draft(input),
      other = kind === 'vibes' ? 'precise' : 'vibes';
    if (!MODEL_CAPS[p.params.model].references) fail('这个模型不支持添加参考图');
    if (p.references[other].length) fail('Vibe 与精确参考不能同时使用');
    if (p.references[kind].length >= (kind === 'vibes' ? MAX_VIBES : MAX_PRECISE))
      fail('参考图已达到上限');
    if ([input.path, input.imageId, input.libraryId].filter(Boolean).length > 1)
      fail('只能指定一个参考来源');
    let source = input.path,
      name,
      libraryId = input.libraryId,
      thumbnail;
    if (libraryId) {
      const item = library.get(libraryId);
      if (!item) throw new CommandError('not_found', 'Vibe 不存在');
      thumbnail = item.thumbnail || null;
      name = item.name;
    } else {
      if (input.imageId) {
        const image = services.database.loadProject(input.imageId);
        if (!image) throw new CommandError('not_found', '图片不存在');
        source = image.image_path;
        name = image.name;
      }
      if (!source && caller.source === 'ui') source = (await services.selectSource?.(caller))?.path;
      if (!source) fail('请指定参考图片路径或图片 ID');
      thumbnail = `data:image/png;base64,${(await referenceImage(source)).toString('base64')}`;
      name ||= path.basename(source);
    }
    const ref =
      kind === 'vibes'
        ? {
            id: crypto.randomUUID(),
            name,
            thumbnail,
            file: null,
            strength: 0.6,
            information: p.params.model === 'nai-diffusion-4-5-full' ? 0.7 : 1,
            encode: 'new',
            ...(libraryId ? { libraryId } : {}),
          }
        : {
            id: crypto.randomUUID(),
            name,
            thumbnail,
            type: 'character&style',
            strength: 1,
            fidelity: 1,
          };
    if (libraryId) {
      const d = library.get(libraryId);
      ref.information = d.importInfo.information_extracted;
      if (library.variant(d, p.params.model, ref.information)) {
        ref.encode = null;
        ref.file = `${d.id}.naiv4vibe`;
      } else if (!d.image) fail('这个 Vibe 没有适用于当前模型的编码');
    }
    return update(input, (next) => ({
      ...next,
      references: { ...next.references, [kind]: [...next.references[kind], ref] },
    }));
  }
  return {
    'params.set': async (input) => {
      const p = draft(input),
        requested = { ...p.params, ...input.patch },
        caps = MODEL_CAPS[requested.model];
      if ((p.prompt_structure?.characters.length || 0) > caps.maxCharacters)
        fail('目标模型的角色数量上限不足');
      const refs = p.references.vibes.length + p.references.precise.length;
      if (requested.model !== p.params.model && !caps.references && refs && !input.dropReferences)
        throw new CommandError('needs_confirm', '切换模型需要移除参考图');
      const next = normalizeSettings(requested),
        notes = [];
      // TODO(design): 校准自动调整通知文案；目前逐项报告字段名和调整前后的值。
      for (const key of Object.keys(next))
        if (JSON.stringify(next[key]) !== JSON.stringify(requested[key]))
          notes.push(`${key}: ${requested[key]} → ${next[key]}`);
      const references = structuredClone(p.references);
      if (!caps.references && input.dropReferences) {
        references.vibes = [];
        references.precise = [];
      } else if (next.model !== p.params.model)
        for (const v of references.vibes) {
          if (library.variant(v.libraryId && library.get(v.libraryId), next.model, v.information))
            v.encode = null;
          else if (v.thumbnail && v.information !== null) v.encode = 'changed';
          else fail('参考图缺少目标模型的编码，无法切换');
        }
      const result = await update(input, (current) => ({
        ...current,
        params: next,
        references,
        keptParameters:
          input.patch.uc !== undefined
            ? current.keptParameters.filter(([key]) => key !== 'tag_hint_uc_preset')
            : current.keptParameters,
      }));
      return { ...result, notes };
    },
    'reference.add-vibe': (i, c) => add(i, c, 'vibes'),
    'reference.add-precise': (i, c) => add(i, c, 'precise'),
    'reference.set': (input) =>
      update(input, (p) => {
        const references = structuredClone(p.references),
          vibe = references.vibes.find((v) => v.id === input.id),
          precise = references.precise.find((v) => v.id === input.id),
          ref = vibe || precise;
        if (!ref) throw new CommandError('not_found', '参考图不存在');
        const allowed = vibe ? ['strength', 'information'] : ['strength', 'type', 'fidelity'];
        for (const key of ['strength', 'information', 'type', 'fidelity'])
          if (input[key] !== undefined) {
            if (!allowed.includes(key)) fail('这个参考不支持该参数');
            if (key === 'information' && (!vibe.thumbnail || vibe.information === null))
              fail('没有原图或信息提取记录，无法重新提取');
            ref[key] = input[key];
          }
        if (vibe && input.information !== undefined)
          vibe.encode = library.variant(
            vibe.libraryId && library.get(vibe.libraryId),
            p.params.model,
            vibe.information,
          )
            ? null
            : 'changed';
        return { ...p, references };
      }),
    'reference.remove': (input) =>
      update(input, (p) => ({
        ...p,
        references: {
          vibes: p.references.vibes.filter((v) => v.id !== input.id),
          precise: p.references.precise.filter((v) => v.id !== input.id),
        },
      })),
    'vibe.library': () => ({ items: library.list() }),
  };
}
