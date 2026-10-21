import { MODEL_CAPS, MEDIUM_FIXED } from '../src/shared/params.ts';
import { generationModel } from './generation.js';
import { fingerprintVibe } from './vibes.js';

export const HINTS = {
  None: 0,
  Standard: 1,
  Heavy: 2,
  Light: 3,
  'Human Focus': 4,
  'Furry Focus': 5,
};
const KEPT = [
  'skip_cfg_above_sigma',
  'straight_alpha',
  'tag_hint_transparent_background',
  'deliberate_euler_ancestral_bug',
  'prefer_brownian',
  'legacy_v3_extend',
];
export function rawParameters(project) {
  try {
    return JSON.parse(project.metadata?.extra_json || '{}').parsed || {};
  } catch {
    return {};
  }
}
export function gridCell(center = {}) {
  const index = (n) =>
    Math.max(0, Math.min(4, Math.round(((Number.isFinite(n) ? n : 0.5) - 0.1) / 0.2)));
  return `${'ABCDE'[index(center.x)]}${index(center.y) + 1}`;
}
export function gridCenter(cell = 'C3') {
  return { x: (cell.charCodeAt(0) - 65) * 0.2 + 0.1, y: (Number(cell[1]) - 1) * 0.2 + 0.1 };
}
export function normalizeSettings(settings) {
  const p = { ...settings },
    caps = MODEL_CAPS[p.model];
  p.effort = caps.effort ? p.effort || 'High' : null;
  p.rescale = p.effort !== 'Medium' ? (p.rescale ?? 0) : null;
  p.noise = caps.noise ? p.noise || (p.sampler === 'k_dpmpp_2m' ? 'exponential' : 'karras') : null;
  if (!caps.qualities.includes(p.quality)) p.quality = 'Standard';
  if (!caps.ucPresets.includes(p.uc)) p.uc = 'Heavy';
  if (p.effort === 'Medium') Object.assign(p, MEDIUM_FIXED);
  return p;
}
export function hydrateParameters(project) {
  if (!project?.metadata) return project;
  let saved = {};
  try {
    saved = JSON.parse(project.metadata.extra_json || '{}').studio_generation || {};
  } catch {
    /* Original metadata may be absent. */
  }
  const raw = rawParameters(project),
    m = project.metadata;
  const source = raw.model_name || raw.model || m.model;
  const recognized = generationModel(source);
  const model = recognized?.replace(/-medium$/, '') || 'nai-diffusion-5-full';
  const caps = MODEL_CAPS[model];
  const medium = /medium|93f4bd30|70ab5786/i.test(String(source));
  const uc = Object.entries(HINTS).find(([, n]) => n === raw.tag_hint_uc_preset)?.[0];
  const params = normalizeSettings({
    model,
    effort: medium ? 'Medium' : caps.effort ? 'High' : null,
    steps: raw.steps ?? m.steps ?? caps.defaults.steps,
    scale: raw.scale ?? m.guidance ?? caps.defaults.scale,
    rescale: raw.cfg_rescale ?? null,
    sampler: raw.sampler || m.sampler || 'k_euler_ancestral',
    noise: raw.noise_schedule || null,
    quality:
      raw.tag_hint_qt !== undefined
        ? { 0: 'None', 1: 'Standard', 3: 'Light' }[raw.tag_hint_qt] || 'None'
        : raw.qualityToggle === true
          ? 'Standard'
          : 'None',
    uc:
      raw.tag_hint_uc_preset !== undefined
        ? uc && uc !== 'Standard'
          ? uc
          : 'None'
        : caps.ucPresets[raw.ucPreset] || 'None',
    aiPositions: !(
      raw.v4_prompt?.use_coords ??
      raw.use_coords ??
      project.prompt_structure?.use_coords
    ),
    positions: Object.fromEntries(
      (project.prompt_structure?.characters || []).map((c, i) => [
        c.id,
        gridCell(raw.v4_prompt?.caption?.char_captions?.[i]?.centers?.[0] || c.center),
      ]),
    ),
  });
  const encodings = Array.isArray(raw.reference_image_multiple) ? raw.reference_image_multiple : [];
  const vibeCount = Math.max(
    encodings.length,
    Array.isArray(raw.reference_information_extracted_multiple)
      ? raw.reference_information_extracted_multiple.length
      : 0,
    Array.isArray(raw.reference_strength_multiple) ? raw.reference_strength_multiple.length : 0,
  );
  const vibes = Array.from({ length: vibeCount }, (_, i) => ({
    id: `embedded-vibe-${i}`,
    name: `Vibe ${i + 1}`,
    thumbnail: null,
    file: encodings[i] ? `${fingerprintVibe(encodings[i])}.naiv4vibe` : null,
    strength: raw.reference_strength_multiple?.[i] ?? 0.6,
    information: raw.reference_information_extracted_multiple?.[i] ?? null,
    encode: null,
    encoding: encodings[i],
    model,
  }));
  const precise = (
    Array.isArray(raw.director_reference_images) ? raw.director_reference_images : []
  ).map((image, i) => ({
    id: `embedded-precise-${i}`,
    name: `Reference ${i + 1}`,
    thumbnail: `data:image/png;base64,${image}`,
    type: raw.director_reference_descriptions?.[i]?.caption?.base_caption || 'character&style',
    strength: raw.director_reference_strength_values?.[i] ?? 1,
    fidelity: 1 - (raw.director_reference_secondary_strength_values?.[i] ?? 0),
  }));
  return {
    ...project,
    params: project.params || saved.params || params,
    references: project.references || saved.references || { vibes, precise },
    keptParameters: project.keptParameters ||
      saved.keptParameters || [
        ...KEPT.filter((k) => raw[k] !== undefined).map((k) => [k, String(raw[k])]),
        ...(!recognized && source ? [['model', String(source)]] : []),
        ...(raw.tag_hint_uc_preset === 1 ? [['tag_hint_uc_preset', '1']] : []),
      ],
  };
}
