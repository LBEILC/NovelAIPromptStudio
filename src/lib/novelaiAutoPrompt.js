import { findPromptTextBlockStart, parsePrompt } from './prompt.js';

// V4.5 and earlier templates follow NovelAI's public Quality Tags and Undesired Content docs.
// V5 hint IDs and current templates follow the official image client (2026-10-20).
const V45_FULL_HEAVY =
  'lowres, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, dithering, halftone, screentone, multiple views, logo, too many watermarks, negative space, blank page';
const V45_FULL_LIGHT =
  'lowres, artistic error, scan artifacts, worst quality, bad quality, jpeg artifacts, multiple views, very displeasing, too many watermarks, negative space, blank page';
const V45_FULL_FURRY =
  '{worst quality}, distracting watermark, unfinished, bad quality, {widescreen}, upscale, {sequence}, {{grandfathered content}}, blurred foreground, chromatic aberration, sketch, everyone, [sketch background], simple, [flat colors], ych (character), outline, multiple scenes, [[horror (theme)]], comic';
const V45_FULL_HUMAN = `${V45_FULL_HEAVY}, @_@, mismatched pupils, glowing eyes, bad anatomy`;

const MODEL_PROFILES = {
  v5: {
    label: 'V5',
    quality: {
      label: 'Standard',
      template: 'very aesthetic, masterpiece, no text',
      position: 'suffix',
    },
    undesired: [
      { label: 'Furry Focus', template: V45_FULL_FURRY },
      { label: 'Heavy', template: V45_FULL_HEAVY },
      {
        label: 'Light',
        template:
          'lowres, bad hands, bad anatomy, artistic error, sepia, white haze, worst quality, very displeasing, jpeg artifacts, 0::ai-generated::',
      },
      { label: 'Human Focus', template: V45_FULL_HUMAN },
    ],
  },
  v45Full: {
    label: 'V4.5 Full',
    quality: {
      // NovelAI imports older V4.5 PNGs with this three-tag suffix as the Standard preset.
      compatibleTemplates: ['location, very aesthetic, masterpiece, no text'],
      label: 'Standard',
      template: 'very aesthetic, masterpiece, no text',
      position: 'suffix',
    },
    undesired: [
      { label: 'Furry Focus', template: V45_FULL_FURRY },
      { label: 'Heavy', template: V45_FULL_HEAVY },
      { label: 'Light', template: V45_FULL_LIGHT },
      { label: 'Human Focus', template: V45_FULL_HUMAN },
    ],
  },
  v45Curated: {
    label: 'V4.5 Curated',
    quality: {
      label: 'Standard',
      template: 'very aesthetic, masterpiece, no text, -0.8::feet::, rating:general',
      compatibleTemplates: ['location, masterpiece, no text, -0.8::feet::, rating:general'],
      position: 'suffix',
    },
    undesired: [
      {
        label: 'Heavy',
        template:
          'blurry, lowres, upscaled, artistic error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, negative space, blank page',
      },
      {
        label: 'Light',
        template:
          'blurry, lowres, upscaled, artistic error, scan artifacts, jpeg artifacts, logo, too many watermarks, negative space, blank page',
      },
      {
        label: 'Human Focus',
        template:
          'blurry, lowres, upscaled, artistic error, film grain, scan artifacts, bad anatomy, bad hands, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, halftone, multiple views, logo, too many watermarks, @_@, mismatched pupils, glowing eyes, negative space, blank page',
      },
    ],
  },
  v4Full: {
    label: 'V4 Full',
    quality: {
      label: 'Standard',
      template: 'no text, best quality, very aesthetic, absurdres',
      position: 'suffix',
    },
    undesired: [
      {
        label: 'Heavy',
        template:
          'blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, multiple views, logo, too many watermarks',
      },
      {
        label: 'Light',
        template:
          'blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing',
      },
    ],
  },
  v4Curated: {
    label: 'V4 Curated',
    quality: {
      label: 'Standard',
      template: 'rating:general, best quality, very aesthetic, absurdres',
      compatibleTemplates: ['rating:general, amazing quality, very aesthetic, absurdres'],
      position: 'suffix',
    },
    undesired: [
      {
        label: 'Heavy',
        template:
          'blurry, lowres, error, film grain, scan artifacts, worst quality, bad quality, jpeg artifacts, very displeasing, chromatic aberration, logo, dated, signature, multiple views, gigantic breasts',
      },
      {
        label: 'Light',
        template:
          'blurry, lowres, error, worst quality, bad quality, jpeg artifacts, very displeasing, logo, dated, signature',
      },
    ],
  },
  animeV3: {
    label: 'Anime V3',
    quality: {
      label: 'Standard',
      template: 'best quality, amazing quality, very aesthetic, absurdres',
      position: 'suffix',
    },
    undesired: [
      {
        label: 'Heavy',
        template:
          'lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract]',
      },
      {
        label: 'Light',
        template: 'lowres, jpeg artifacts, worst quality, watermark, blurry, very displeasing',
      },
      {
        label: 'Human Focus',
        template:
          'lowres, {bad}, error, fewer, extra, missing, worst quality, jpeg artifacts, bad quality, watermark, unfinished, displeasing, chromatic aberration, signature, extra digits, artistic error, username, scan, [abstract], bad anatomy, bad hands, @_@, mismatched pupils, heart-shaped pupils, glowing eyes',
      },
    ],
  },
  furryV3: {
    label: 'Furry V3',
    quality: {
      label: 'Standard',
      template: '{best quality}, {amazing quality}',
      position: 'suffix',
    },
    undesired: [
      {
        label: 'Heavy',
        template:
          '{{worst quality}}, [displeasing], {unusual pupils}, guide lines, {{unfinished}}, {bad}, url, artist name, {{tall image}}, mosaic, {sketch page}, comic panel, impact (font), [dated], {logo}, ych, {what}, {where is your god now}, {distorted text}, repeated text, {floating head}, {1994}, {widescreen}, absolutely everyone, sequence, {compression artifacts}, hard translated, {cropped}, {commissioner name}, unknown text, high contrast',
      },
      {
        label: 'Light',
        template:
          '{worst quality}, guide lines, unfinished, bad, url, tall image, widescreen, compression artifacts, unknown text',
      },
    ],
  },
  animeV2: {
    label: 'Anime V2',
    quality: {
      label: 'Standard',
      template: 'very aesthetic, best quality, absurdres',
      position: 'prefix',
    },
    undesired: [
      {
        label: 'Heavy',
        template:
          'lowres, bad, text, error, missing, extra, fewer, cropped, jpeg artifacts, worst quality, bad quality, watermark, displeasing, unfinished, chromatic aberration, scan, scan artifacts',
      },
      {
        label: 'Light',
        template: 'lowres, jpeg artifacts, worst quality, watermark, blurry, very displeasing',
      },
    ],
  },
};

function firstPresent(source, keys) {
  for (const key of keys) {
    if (source?.[key] !== undefined && source[key] !== null) return { key, value: source[key] };
  }
  return { key: '', value: null };
}

function normalizeToggle(value) {
  if (value === true || value === 1 || value === '1' || String(value).toLowerCase() === 'true')
    return true;
  if (value === false || value === 0 || value === '0' || String(value).toLowerCase() === 'false')
    return false;
  return null;
}

export function extractNovelAIAutoSettings(raw = {}, model = '') {
  const quality = firstPresent(raw, ['tag_hint_qt', 'qualityToggle', 'quality_toggle']);
  const undesired = firstPresent(raw, ['tag_hint_uc_preset', 'ucPreset', 'uc_preset']);
  const version = firstPresent(raw, ['params_version', 'version']);
  return {
    model: String(model || raw.model_name || raw.model || raw.source || ''),
    quality_toggle: normalizeToggle(quality.value),
    quality_preset: quality.value,
    quality_source: quality.key,
    uc_preset: undesired.value,
    uc_preset_source: undesired.key,
    params_version: version.value,
  };
}

function modelProfileKeys(model = '') {
  const value = String(model || '').toLocaleLowerCase('en-US');
  if (/(?:diffusion|nai)[\s-]*v?5\b|diffusion[\s-]*5\b/.test(value)) return ['v5'];
  if (/4(?:[.\s-]*5).*curated/.test(value)) return ['v45Curated'];
  if (/4(?:[.\s-]*5).*full/.test(value)) return ['v45Full'];
  if (/4(?:[.\s-]*5)/.test(value)) return ['v45Full', 'v45Curated'];
  if (/v?4.*curated/.test(value)) return ['v4Curated'];
  if (/v?4.*full/.test(value)) return ['v4Full'];
  if (/v?4/.test(value)) return ['v4Full', 'v4Curated'];
  if (/furry.*v?3|v?3.*furry/.test(value)) return ['furryV3'];
  if (/v?3/.test(value)) return ['animeV3'];
  if (/v?2/.test(value)) return ['animeV2'];
  return [];
}

function escapePattern(value) {
  return String(value)
    .trim()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
}

function templatePattern(template) {
  return String(template).split(',').map(escapePattern).join('\\s*[,，]\\s*');
}

function stripSuffixTemplate(rawPrompt, template) {
  const raw = String(rawPrompt || '');
  const textStart = findPromptTextBlockStart(raw);
  const boundary = textStart >= 0 ? textStart : raw.length;
  const beforeText = raw.slice(0, boundary);
  const expression = new RegExp(
    `(?:^|[,，]\\s*)${templatePattern(template)}(?:\\s*[,，]\\s*)?$`,
    'i',
  );
  const match = expression.exec(beforeText);
  if (!match) return null;
  const prefix = beforeText
    .slice(0, match.index)
    .replace(/[ \t]*[,，][ \t]*$/, '')
    .replace(/[ \t]+$/, '');
  const textBlock = textStart >= 0 ? raw.slice(textStart) : '';
  return {
    cleanedRaw: textBlock ? (prefix.trim() ? `${prefix}, ${textBlock}` : textBlock) : prefix,
    matchIndex: match.index,
  };
}

function stripPrefixTemplate(rawPrompt, template) {
  const raw = String(rawPrompt || '');
  const expression = new RegExp(`^\\s*${templatePattern(template)}(?:\\s*[,，]\\s*|\\s*$)`, 'i');
  const match = expression.exec(raw);
  if (!match) return null;
  return { cleanedRaw: raw.slice(match[0].length), matchIndex: match.index };
}

function stripContainedTemplate(rawPrompt, template) {
  const raw = String(rawPrompt || '');
  const expression = new RegExp(
    `(?:^|[,，]\\s*)${templatePattern(template)}(?=\\s*(?:[,，]|$))`,
    'i',
  );
  const match = expression.exec(raw);
  if (!match) return null;
  const cleanedRaw = `${raw.slice(0, match.index)}${raw.slice(match.index + match[0].length)}`
    .replace(/^\s*[,，]\s*/, '')
    .replace(/\s*[,，]\s*$/, '')
    .trim();
  return { cleanedRaw, matchIndex: match.index };
}

function stripTemplate(rawPrompt, definition) {
  if (definition.position === 'prefix') return stripPrefixTemplate(rawPrompt, definition.template);
  if (definition.position === 'contained')
    return stripContainedTemplate(rawPrompt, definition.template);
  return stripSuffixTemplate(rawPrompt, definition.template);
}

function normalizedTag(tag) {
  return {
    braceDepth: Math.trunc(Number(tag.brace_depth) || 0),
    tag: String(tag.tag || '')
      .trim()
      .toLocaleLowerCase('en-US'),
    weight: Number.isFinite(Number(tag.weight)) ? Number(tag.weight) : 1,
  };
}

function templateTagIds(scopeTags, definition) {
  let id = 0;
  const expected = parsePrompt(definition.template, () => `automatic-${id++}`).map(normalizedTag);
  const actual = (scopeTags || []).map(normalizedTag);
  const matches = [];
  for (let index = 0; index <= actual.length - expected.length; index += 1) {
    const equal = expected.every(
      (tag, offset) =>
        tag.tag === actual[index + offset].tag &&
        tag.braceDepth === actual[index + offset].braceDepth &&
        Math.abs(tag.weight - actual[index + offset].weight) < 0.001,
    );
    if (equal) matches.push(index);
  }
  const start = definition.position === 'suffix' ? matches.at(-1) : matches[0];
  if (!Number.isInteger(start)) return [];
  return scopeTags.slice(start, start + expected.length).map((tag) => tag.id);
}

function emptyAnalysis(kind, status = 'unknown') {
  return {
    cleanedRaw: '',
    kind,
    label: kind === 'quality' ? '自动质量词' : 'UC 预设',
    modelLabel: '',
    sourceLabel: '',
    status,
    tagCount: 0,
    tagIds: [],
  };
}

function hintedAnalysis(kind, scope, profile, label, template) {
  const definition = { template, position: kind === 'quality' ? 'suffix' : 'prefix' };
  if (
    kind === 'undesired' &&
    template &&
    stripPrefixTemplate(scope.raw_prompt, `nsfw, ${template}`)
  )
    definition.template = `nsfw, ${template}`;
  const match = template ? stripTemplate(scope.raw_prompt, definition) : null;
  return {
    ...emptyAnalysis(kind, 'confirmed'),
    cleanedRaw: match?.cleanedRaw ?? scope.raw_prompt,
    label,
    modelLabel: profile?.label || '',
    template: definition.template,
    virtual: !match,
    tagIds: match ? templateTagIds(scope.tags, definition) : [],
    tagCount: template ? parsePrompt(definition.template, () => '').length : 0,
  };
}

// The V5 server does not expand hints: same-seed verification on 2026-10-20.
// Keep this at the request boundary so stored drafts and ordinary copies stay unchanged.
export function expandV5AutomaticPrompt(prompt, negative, model, hints) {
  if (!model.startsWith('nai-diffusion-5-')) return { prompt, negative };
  const quality = {
    1: MODEL_PROFILES.v5.quality.template,
    3: 'very aesthetic, amazing quality, no text',
  }[Number(hints.tag_hint_qt)];
  if (quality && !stripSuffixTemplate(prompt, quality)) {
    const textStart = findPromptTextBlockStart(prompt);
    const boundary = textStart >= 0 ? textStart : prompt.length;
    const prefix = prompt
      .slice(0, boundary)
      .trim()
      .replace(/[,，]\s*$/, '');
    const text = prompt.slice(boundary);
    prompt = [prefix, quality, text].filter(Boolean).join(', ');
  }
  const label = { 2: 'Heavy', 3: 'Light', 4: 'Human Focus', 5: 'Furry Focus' }[
    Number(hints.tag_hint_uc_preset)
  ];
  const template = MODEL_PROFILES.v5.undesired.find((preset) => preset.label === label)?.template;
  if (template) {
    const withNsfw = !!stripPrefixTemplate(negative, `nsfw, ${template}`);
    if (!withNsfw && !stripPrefixTemplate(negative, template))
      negative = [template, negative].filter(Boolean).join(', ');
    if (model.endsWith('-full') && !prompt.toLowerCase().includes('nsfw') && !withNsfw)
      negative = `nsfw, ${negative}`;
  }
  return { prompt, negative };
}

// Explicit draft presets use the same templates as import recognition.
export function stripAutomaticAtBoundary(raw, automation, model) {
  if (!automation?.template || !['confirmed', 'inferred'].includes(automation.status)) return raw;
  const template = automation.template;
  if (automation.kind === 'quality') return stripSuffixTemplate(raw, template)?.cleanedRaw ?? raw;
  const templates =
    model?.startsWith('nai-diffusion-4-') && !model.startsWith('nai-diffusion-4-5-')
      ? [`${template}, white blank page, blank page`, template]
      : [template];
  for (const candidate of templates) {
    const match =
      stripPrefixTemplate(raw, `nsfw, ${candidate}`) || stripPrefixTemplate(raw, candidate);
    if (match) return match.cleanedRaw;
  }
  return raw;
}

export function expandDraftAutomaticPrompt(prompt, negative, model, quality, uc) {
  const profile = MODEL_PROFILES[modelProfileKeys(model)[0]];
  const suffix =
    quality === 'Light'
      ? 'very aesthetic, amazing quality, no text'
      : quality === 'Standard'
        ? profile?.quality.template
        : '';
  if (suffix && !stripSuffixTemplate(prompt, suffix)) {
    const start = findPromptTextBlockStart(prompt),
      boundary = start < 0 ? prompt.length : start;
    prompt = [
      prompt
        .slice(0, boundary)
        .trim()
        .replace(/[,，]\s*$/, ''),
      suffix,
      prompt.slice(boundary),
    ]
      .filter(Boolean)
      .join(', ');
  }
  let template = profile?.undesired.find((p) => p.label === uc)?.template;
  if (template && model.startsWith('nai-diffusion-4-') && !model.startsWith('nai-diffusion-4-5-'))
    template += ', white blank page, blank page';
  if (template) {
    if (
      !stripPrefixTemplate(negative, template) &&
      !stripPrefixTemplate(negative, `nsfw, ${template}`)
    )
      negative = [template, negative].filter(Boolean).join(', ');
    if (
      model.includes('-full') &&
      !prompt.toLowerCase().includes('nsfw') &&
      !negative.startsWith('nsfw, ')
    )
      negative = `nsfw, ${negative}`;
  }
  return { prompt, negative };
}
function analyzeQuality(settings, scope, profiles) {
  if (
    settings.quality_source === 'tag_hint_qt' &&
    Number(settings.quality_preset ?? settings.quality_toggle) > 0
  ) {
    const light = Number(settings.quality_preset) === 3;
    return hintedAnalysis(
      'quality',
      scope,
      profiles[0],
      light ? 'Light' : 'Standard',
      light ? 'very aesthetic, amazing quality, no text' : profiles[0]?.quality.template || '',
    );
  }
  if (settings.quality_toggle === false) return emptyAnalysis('quality', 'disabled');
  for (const profile of profiles) {
    const definitions = [profile.quality.template, ...(profile.quality.compatibleTemplates || [])]
      .sort((a, b) => b.length - a.length)
      .map((template) => ({ ...profile.quality, template }));
    for (const definition of definitions) {
      const match = stripTemplate(scope.raw_prompt, definition);
      if (!match) continue;
      const status = settings.quality_toggle === true ? 'confirmed' : 'inferred';
      const tagIds = templateTagIds(scope.tags, definition);
      return {
        ...emptyAnalysis('quality', status),
        ...match,
        label: definition.label || 'Standard',
        modelLabel: profile.label,
        sourceLabel:
          status === 'confirmed'
            ? `NovelAI ${profile.label} Quality Tags · ${definition.label || 'Standard'}`
            : `推断为 NovelAI ${profile.label} Quality Tags · ${definition.label || 'Standard'}`,
        tagCount: tagIds.length || parsePrompt(definition.template, () => '').length,
        tagIds,
        template: definition.template,
      };
    }
  }
  return settings.quality_toggle === true
    ? emptyAnalysis('quality', 'mismatch')
    : emptyAnalysis('quality');
}

function ucSelectionState(settings) {
  if (!settings.uc_preset_source) return 'unknown';
  if (settings.uc_preset_source === 'tag_hint_uc_preset')
    return Number(settings.uc_preset) === 0 ? 'none' : 'selected';
  return 'legacy';
}

function analyzeUndesired(settings, scope, profiles) {
  if (settings.uc_preset_source === 'tag_hint_uc_preset') {
    const label =
      { 0: 'None', 1: 'Standard', 2: 'Heavy', 3: 'Light', 4: 'Human Focus', 5: 'Furry Focus' }[
        Number(settings.uc_preset)
      ] || `预设 ${settings.uc_preset}`;
    const template = profiles[0]?.undesired.find((p) => p.label === label)?.template || '';
    return hintedAnalysis('undesired', scope, profiles[0], label, template);
  }
  const selection = ucSelectionState(settings);
  for (const profile of profiles) {
    for (const preset of [...profile.undesired].sort(
      (left, right) => right.template.length - left.template.length,
    )) {
      const definition = { ...preset, position: 'contained' };
      const match = stripTemplate(scope.raw_prompt, definition);
      if (!match) continue;
      const confirmed = selection === 'selected' || selection === 'legacy';
      const status = confirmed ? 'confirmed' : selection === 'unknown' ? 'inferred' : 'suspected';
      const tagIds = templateTagIds(scope.tags, definition);
      return {
        ...emptyAnalysis('undesired', status),
        ...match,
        label: preset.label,
        modelLabel: profile.label,
        sourceLabel:
          status === 'confirmed'
            ? `NovelAI UC · ${preset.label}`
            : status === 'inferred'
              ? `推断为 NovelAI UC · ${preset.label}`
              : `疑似 NovelAI UC · ${preset.label}`,
        tagCount: tagIds.length || parsePrompt(preset.template, () => '').length,
        tagIds,
        template: definition.template,
      };
    }
  }
  if (selection === 'selected') return emptyAnalysis('undesired', 'mismatch');
  return emptyAnalysis('undesired', selection === 'none' ? 'disabled' : 'unknown');
}

export function analyzeNovelAIAutomaticPrompts(project = {}, scopes = []) {
  const structure = project.prompt_structure || {};
  const settings =
    structure.novelai_auto ||
    project.metadata?.prompt_structure_raw?.novelai_auto ||
    extractNovelAIAutoSettings({}, project.metadata?.model);
  const profiles = modelProfileKeys(settings.model || project.metadata?.model).map(
    (key) => MODEL_PROFILES[key],
  );
  const basePrompt = scopes.find((scope) => scope.key === 'base:prompt');
  const baseUndesired = scopes.find((scope) => scope.key === 'base:undesired');
  return {
    settings,
    scopes: {
      'base:prompt': basePrompt
        ? analyzeQuality(settings, basePrompt, profiles)
        : emptyAnalysis('quality'),
      'base:undesired': baseUndesired
        ? analyzeUndesired(settings, baseUndesired, profiles)
        : emptyAnalysis('undesired'),
    },
  };
}
