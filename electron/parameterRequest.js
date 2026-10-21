import {
  hydrateParameters,
  normalizeSettings,
  rawParameters,
  gridCenter,
  HINTS,
} from './params.js';
import { buildGenerationRequest, generationModel } from './generation.js';
import { getPromptScopes, promptForTransmission } from '../src/lib/promptStructure.js';
import {
  expandDraftAutomaticPrompt,
  stripAutomaticAtBoundary,
} from '../src/lib/novelaiAutoPrompt.js';
import { preciseImage } from './vibeLibrary.js';
import { MODEL_CAPS } from '../src/shared/params.ts';

export async function buildProjectRequest(project, library, { seed, encode } = {}) {
  const p = hydrateParameters(project),
    settings = normalizeSettings(p.params),
    refs = p.references;
  const medium = settings.effort === 'Medium',
    model = settings.model + (medium ? '-medium' : '');
  if (refs.vibes.length && refs.precise.length) throw new Error('Vibe 与精确参考不能同时使用');
  if (refs.vibes.length > 16 || refs.precise.length > 16) throw new Error('参考图超过上限');
  if (
    (refs.vibes.length && settings.model.startsWith('nai-diffusion-5-')) ||
    (refs.precise.length && !MODEL_CAPS[settings.model].references)
  )
    throw new Error('这个模型不支持参考图');
  if ((p.prompt_structure?.characters.length || 0) > MODEL_CAPS[settings.model].maxCharacters)
    throw new Error('角色数量超过模型上限');
  const raw = rawParameters(p);
  // Reference arrays are reconstructed from the draft; removed references must not reappear.
  for (const key of Object.keys(raw))
    if (key.startsWith('reference_') || key.startsWith('director_reference_')) delete raw[key];
  const scopes = getPromptScopes(p);
  const text = (key, fallback) => {
    const s = scopes.find((s) => s.key === key);
    const value = stripAutomaticAtBoundary(
      fallback,
      s?.automation,
      generationModel(
        p.prompt_structure?.novelai_auto?.model || raw.model_name || raw.model || p.metadata.model,
      ),
    );
    return promptForTransmission(value || '', p, key);
  };
  let prompt = text('base:prompt', p.metadata.prompt_raw),
    negative = medium ? '' : text('base:undesired', p.metadata.negative_prompt);
  ({ prompt, negative } = expandDraftAutomaticPrompt(
    prompt,
    negative,
    model,
    settings.quality,
    settings.uc,
  ));
  Object.assign(raw, {
    steps: settings.steps,
    scale: settings.scale,
    sampler: settings.sampler,
    noise_schedule: settings.noise || 'karras',
    tag_hint_qt: HINTS[settings.quality],
    tag_hint_uc_preset: HINTS[settings.uc],
  });
  // Unknown Standard UC has no known template; preserve its hint until explicitly changed.
  if (
    !medium &&
    settings.uc === 'None' &&
    p.keptParameters.some(([key, value]) => key === 'tag_hint_uc_preset' && value === '1')
  )
    raw.tag_hint_uc_preset = 1;
  if (settings.rescale === null) delete raw.cfg_rescale;
  else raw.cfg_rescale = settings.rescale;
  const edits = {
    prompt,
    negative,
    width: p.metadata.width,
    height: p.metadata.height,
    ...(seed !== undefined ? { seed } : {}),
  };
  for (const [key, field, base] of [
    ['v4_prompt', 'prompt_raw', prompt],
    ['v4_negative_prompt', 'undesired_raw', negative],
  ]) {
    edits[key] = {
      caption: {
        base_caption: base,
        char_captions: (p.prompt_structure?.characters || []).map((c) => ({
          char_caption:
            medium && field === 'undesired_raw'
              ? ''
              : promptForTransmission(
                  c[field] || '',
                  p,
                  `character:${c.id}:${field === 'prompt_raw' ? 'prompt' : 'undesired'}`,
                ),
          centers: [gridCenter(settings.positions[c.id] || 'C3')],
        })),
      },
      ...(key === 'v4_prompt'
        ? { use_coords: !settings.aiPositions, use_order: raw.v4_prompt?.use_order ?? true }
        : {
            legacy_uc:
              settings.model.startsWith('nai-diffusion-4-') &&
              !settings.model.startsWith('nai-diffusion-4-5-'),
          }),
    };
  }
  const request = buildGenerationRequest(raw, model, edits),
    parameters = request.parameters;
  if (!settings.model.startsWith('nai-diffusion-5-')) {
    delete parameters.straight_alpha;
    delete parameters.tag_hint_transparent_background;
  }
  if (medium) delete parameters.cfg_rescale;
  const pending = new Set();
  if (refs.vibes.length) {
    parameters.reference_image_multiple = [];
    parameters.reference_strength_multiple = [];
    for (const ref of refs.vibes) {
      const resolved = await library.resolve(ref, settings.model, encode);
      if (resolved.pending) pending.add(resolved.cacheKey);
      parameters.reference_image_multiple.push(resolved.encoding || 'pending');
      parameters.reference_strength_multiple.push(ref.strength);
      if (encode) {
        ref.encode = null;
        ref.file = resolved.file || ref.file;
        ref.model = settings.model;
        ref.encoding = resolved.encoding;
        if (resolved.libraryId) ref.libraryId = resolved.libraryId;
      }
    }
  }
  if (refs.precise.length) {
    parameters.director_reference_images = await Promise.all(
      refs.precise.map((r) => preciseImage(r.thumbnail)),
    );
    parameters.director_reference_descriptions = refs.precise.map((r) => ({
      caption: { base_caption: r.type, char_captions: [] },
      legacy_uc: false,
    }));
    parameters.director_reference_strength_values = refs.precise.map((r) => r.strength);
    parameters.director_reference_secondary_strength_values = refs.precise.map(
      (r) => 1 - r.fidelity,
    );
    parameters.director_reference_information_extracted = refs.precise.map(() => 1);
  }
  // Local estimate information is deliberately outside the API payload.
  return { request, pendingEncodes: pending.size, project: p };
}
