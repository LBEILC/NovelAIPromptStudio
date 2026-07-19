import { countPromptTags, normalizePromptStructure } from './promptStructure.js';

const FIELD_LABELS = {
  prompt: 'Prompt',
  vibe: 'Vibe',
  seed: 'Seed',
  model: 'Model',
  sampler: 'Sampler',
  steps: 'Steps',
  guidance: 'CFG',
  size: '尺寸',
};

const COMPARABLE_FIELDS = Object.keys(FIELD_LABELS);

function clean(value) {
  return String(value ?? '').trim();
}

function tagValue(tag) {
  return {
    raw: clean(tag?.raw_segment),
    syntax: clean(tag?.syntax_issue),
    tag: clean(tag?.tag),
    weight: Number(tag?.weight ?? 1),
  };
}

function signature(value) {
  return JSON.stringify(value);
}

function promptParts(project) {
  const structure = normalizePromptStructure(project?.prompt_structure, project?.metadata);
  const base = {
    prompt: (project?.tags || []).map(tagValue),
    undesired: structure.base_undesired_tags.map(tagValue),
  };
  const character = {
    useCoords: Boolean(structure.use_coords),
    useOrder: Boolean(structure.use_order),
    characters: structure.characters.map((item) => ({
      center: item.center ?? item.position ?? null,
      prompt: item.prompt_tags.map(tagValue),
      undesired: item.undesired_tags.map(tagValue),
    })),
  };
  const known = base.prompt.length > 0 || base.undesired.length > 0 || character.characters.length > 0;
  return {
    base: known ? signature(base) : '',
    character: character.characters.length ? signature(character) : '',
    full: known ? signature({ base, character }) : '',
  };
}

function vibeSourceKey(vibe) {
  return clean(vibe?.source_image_hash)
    || clean(vibe?.library_id)
    || clean(vibe?.encoded_fingerprint)
    || clean(vibe?.fingerprint)
    || clean(vibe?.reference_image).toLocaleLowerCase()
    || clean(vibe?.name).toLocaleLowerCase();
}

function vibeParts(project) {
  const vibes = (project?.vibes || []).filter((vibe) => vibe?.enabled !== false);
  const sources = vibes.map(vibeSourceKey).filter(Boolean).sort();
  const configurations = vibes.map((vibe) => ({
    information: Number(vibe?.information_extracted ?? 0.7),
    source: vibeSourceKey(vibe),
    strength: Number(vibe?.strength ?? 0.6),
  })).filter((vibe) => vibe.source).sort((left, right) => signature(left).localeCompare(signature(right)));
  return {
    config: configurations.length ? signature(configurations) : '',
    source: sources.length ? signature(sources) : '',
  };
}

function comparableValues(project) {
  const prompt = promptParts(project);
  const vibes = vibeParts(project);
  const metadata = project?.metadata || {};
  const width = Number(metadata.width || 0);
  const height = Number(metadata.height || 0);
  return {
    prompt: prompt.full,
    vibe: vibes.config || (Array.isArray(project?.vibes) && project.vibes.length === 0 ? '[]' : ''),
    seed: clean(metadata.seed),
    model: clean(metadata.model),
    sampler: clean(metadata.sampler),
    steps: metadata.steps === '' || metadata.steps == null ? '' : String(Number(metadata.steps)),
    guidance: metadata.guidance === '' || metadata.guidance == null ? '' : String(Number(metadata.guidance)),
    size: width > 0 && height > 0 ? `${Math.round(width)}x${Math.round(height)}` : '',
  };
}

function varyingFields(projects) {
  const values = projects.map(comparableValues);
  return COMPARABLE_FIELDS.filter((field) => {
    const known = values.map((value) => value[field]).filter(Boolean);
    return known.length === values.length && new Set(known).size > 1;
  });
}

function fixedSummary(projects, fixedFields) {
  if (!projects.length) return '';
  const first = projects[0];
  const metadata = first.metadata || {};
  const summaries = [];
  if (fixedFields.includes('prompt')) summaries.push(`Prompt ${countPromptTags(first)} Tags`);
  if (fixedFields.includes('seed') && clean(metadata.seed)) summaries.push(`Seed ${metadata.seed}`);
  if (fixedFields.includes('model') && clean(metadata.model)) summaries.push(clean(metadata.model));
  if (fixedFields.includes('size') && Number(metadata.width) > 0 && Number(metadata.height) > 0) summaries.push(`${metadata.width} × ${metadata.height}`);
  if (fixedFields.includes('vibe')) summaries.push(`${(first.vibes || []).filter((vibe) => vibe?.enabled !== false).length} Vibe`);
  return summaries.slice(0, 3).join(' · ') || '共享的生成字段已核对';
}

function addByKey(target, projects, keyForProject, makeGroup) {
  const buckets = new Map();
  for (const project of projects) {
    const key = keyForProject(project);
    if (!key) continue;
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(project);
  }
  for (const members of buckets.values()) {
    if (members.length < 2) continue;
    const group = makeGroup(members);
    if (group) target.push(group);
  }
}

function relation({ type, title, score, projects, changedFields, fixedFields, exact = false, summary = '' }) {
  const ordered = [...projects].sort((left, right) => clean(left.name).localeCompare(clean(right.name), 'zh-CN', { numeric: true }) || clean(left.id).localeCompare(clean(right.id)));
  return {
    id: `${type}:${ordered.map((project) => project.id).join('|')}`,
    type,
    title,
    conditions: [title],
    score,
    exact,
    member_ids: ordered.map((project) => project.id),
    changed_fields: changedFields.map((field) => FIELD_LABELS[field] || field),
    fixed_fields: fixedFields.map((field) => FIELD_LABELS[field] || field),
    fixed_summary: summary || fixedSummary(ordered, fixedFields),
  };
}

function mergeDuplicateMembers(groups) {
  const merged = new Map();
  for (const group of groups) {
    const key = [...group.member_ids].sort().join('|');
    const current = merged.get(key);
    if (!current) {
      merged.set(key, group);
      continue;
    }
    const preferred = current.score >= group.score ? current : group;
    merged.set(key, {
      ...preferred,
      id: `merged:${key}`,
      conditions: [...new Set([...current.conditions, ...group.conditions])],
      changed_fields: [...new Set([...current.changed_fields, ...group.changed_fields])],
      fixed_fields: [...new Set([...current.fixed_fields, ...group.fixed_fields])],
      exact: current.exact && group.exact,
    });
  }
  return [...merged.values()];
}

export function buildRelationshipGroups(projects = []) {
  const available = projects.filter((project) => project?.id && !project.deleted_at);
  const groups = [];

  addByKey(groups, available, (project) => promptParts(project).full, (members) => {
    const changed = varyingFields(members).filter((field) => field !== 'prompt');
    if (!changed.length) return null;
    const fixed = COMPARABLE_FIELDS.filter((field) => field === 'prompt' || (!changed.includes(field) && members.every((project) => comparableValues(project)[field])));
    const labels = changed.map((field) => FIELD_LABELS[field]);
    return relation({
      type: 'same-prompt',
      title: labels.length === 1 && labels[0] === 'Seed' ? '同 Prompt · Seed 不同' : `同 Prompt · ${labels.join(' / ')}有变化`,
      score: changed.length === 1 ? 110 : 92,
      projects: members,
      changedFields: changed,
      fixedFields: fixed,
      exact: changed.length === 1,
    });
  });

  addByKey(groups, available, (project) => promptParts(project).base, (members) => {
    if (new Set(members.map((project) => promptParts(project).character || '[]')).size < 2) return null;
    return relation({ type: 'same-base', title: '同 Base Prompt · Character 不同', score: 80, projects: members, changedFields: ['Character'], fixedFields: ['Base Prompt'], exact: false, summary: 'Base Prompt 与 Base Undesired Content 相同' });
  });

  addByKey(groups, available, (project) => promptParts(project).character, (members) => {
    if (new Set(members.map((project) => promptParts(project).base)).size < 2) return null;
    return relation({ type: 'same-character', title: '同 Character · Base Prompt 不同', score: 78, projects: members, changedFields: ['Base Prompt'], fixedFields: ['Character'], exact: false, summary: 'Character Prompt、Undesired Content 与位置相同' });
  });

  addByKey(groups, available, (project) => comparableValues(project).seed, (members) => {
    if (new Set(members.map((project) => promptParts(project).full).filter(Boolean)).size < 2) return null;
    return relation({ type: 'same-seed', title: '同 Seed · Prompt 不同', score: 76, projects: members, changedFields: ['prompt'], fixedFields: ['seed'], exact: false });
  });

  for (const [kind, score, title] of [['config', 84, '同 Vibe 配置 · Prompt / 参数有变化'], ['source', 66, '同 Vibe 来源 · 使用配置可能不同']]) {
    addByKey(groups, available, (project) => vibeParts(project)[kind], (members) => {
      const changed = varyingFields(members).filter((field) => field !== 'vibe');
      if (!changed.length && kind === 'config') return null;
      return relation({ type: `same-vibe-${kind}`, title, score, projects: members, changedFields: kind === 'source' ? ['Vibe 配置', ...changed] : changed, fixedFields: [kind === 'source' ? 'Vibe 来源' : 'Vibe 配置'], exact: kind === 'config' && changed.length === 1, summary: kind === 'source' ? '引用同一 Vibe 来源指纹' : 'Vibe 来源、Information 与 Strength 相同' });
    });
  }

  for (const variable of COMPARABLE_FIELDS) {
    addByKey(groups, available, (project) => {
      const values = comparableValues(project);
      if (!COMPARABLE_FIELDS.every((field) => values[field])) return '';
      return signature(Object.fromEntries(COMPARABLE_FIELDS.filter((field) => field !== variable).map((field) => [field, values[field]])));
    }, (members) => {
      if (new Set(members.map((project) => comparableValues(project)[variable])).size < 2) return null;
      const fixed = COMPARABLE_FIELDS.filter((field) => field !== variable);
      return relation({ type: `single-variable-${variable}`, title: `仅 ${FIELD_LABELS[variable]} 不同 · 单变量候选`, score: 120, projects: members, changedFields: [variable], fixedFields: fixed, exact: true });
    });
  }

  return mergeDuplicateMembers(groups).sort((left, right) => right.score - left.score || right.member_ids.length - left.member_ids.length || left.id.localeCompare(right.id));
}

export function relationshipGroupsForProject(projects, projectId) {
  return buildRelationshipGroups(projects).filter((group) => group.member_ids.includes(projectId));
}
