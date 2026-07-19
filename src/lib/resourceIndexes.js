const normalizeKey = (value) => String(value || '').trim().toLocaleLowerCase('en-US');

const sourcePriority = (source) => ({ manual: 4, ai: 3, cache: 2, builtin: 1, heuristic: 0 }[source] || 0);

export function projectTagOccurrences(project) {
  const structure = project?.prompt_structure || {};
  const occurrence = (tag, area, polarity, character = null) => ({
    ...tag,
    project_id: project.id,
    area,
    polarity,
    character_id: character?.id || '',
    character_label: character?.label || '',
  });
  return [
    ...(project?.tags || []).map((tag) => occurrence(tag, 'base', 'prompt')),
    ...(structure.base_undesired_tags || []).map((tag) => occurrence(tag, 'base', 'undesired')),
    ...(structure.characters || []).flatMap((character) => [
      ...(character.prompt_tags || []).map((tag) => occurrence(tag, 'character', 'prompt', character)),
      ...(character.undesired_tags || []).map((tag) => occurrence(tag, 'character', 'undesired', character)),
    ]),
  ];
}

function preferKnowledge(current, value, source) {
  const cleaned = String(value || '').trim();
  if (!cleaned) return current;
  if (!current.value || sourcePriority(source) > sourcePriority(current.source)) return { value: cleaned, source: String(source || '') };
  return current;
}

export function buildTagLibrary(projects = [], dictionaryRows = []) {
  const dictionary = new Map(dictionaryRows.map((row) => [normalizeKey(row.tag), row]));
  const tags = new Map();
  for (const project of projects) {
    for (const occurrence of projectTagOccurrences(project)) {
      const key = normalizeKey(occurrence.tag);
      if (!key) continue;
      const current = tags.get(key) || {
        key,
        tag: String(occurrence.tag || '').trim(),
        translationKnowledge: { value: '', source: '' },
        categoryKnowledge: { value: 'Unsorted', source: '' },
        usage_count: 0,
        project_ids: new Set(),
        scope_counts: { base: 0, character: 0, prompt: 0, undesired: 0 },
        issues: [],
        first_seen: project.created_at || '',
        last_seen: project.updated_at || project.created_at || '',
      };
      current.usage_count += 1;
      current.project_ids.add(project.id);
      current.scope_counts[occurrence.area] += 1;
      current.scope_counts[occurrence.polarity] += 1;
      current.translationKnowledge = preferKnowledge(current.translationKnowledge, occurrence.translation, occurrence.translation_source);
      current.categoryKnowledge = preferKnowledge(current.categoryKnowledge, occurrence.category, occurrence.category_source);
      if (occurrence.syntax_issue || occurrence.raw_segment) current.issues.push({
        reason: String(occurrence.syntax_issue || 'raw_syntax'),
        sample: String(occurrence.raw_segment || occurrence.tag || ''),
        project_id: project.id,
      });
      if (project.created_at && (!current.first_seen || project.created_at < current.first_seen)) current.first_seen = project.created_at;
      if (project.updated_at && (!current.last_seen || project.updated_at > current.last_seen)) current.last_seen = project.updated_at;
      tags.set(key, current);
    }
  }
  for (const [key, row] of dictionary) {
    const current = tags.get(key) || {
      key,
      tag: row.display_tag || row.tag,
      translationKnowledge: { value: '', source: '' },
      categoryKnowledge: { value: 'Unsorted', source: '' },
      usage_count: 0,
      project_ids: new Set(),
      scope_counts: { base: 0, character: 0, prompt: 0, undesired: 0 },
      issues: [], first_seen: '', last_seen: row.updated_at || '',
    };
    if (row.has_translation) current.translationKnowledge = preferKnowledge(current.translationKnowledge, row.translation, row.translation_source || 'cache');
    if (row.has_classification) current.categoryKnowledge = preferKnowledge(current.categoryKnowledge, row.category, row.category_source || 'cache');
    current.note = row.note || '';
    current.aliases = row.aliases || '';
    current.visibility = row.visibility || 'auto';
    current.updated_at = row.updated_at || '';
    tags.set(key, current);
  }
  return [...tags.values()].map((entry) => {
    const problematic = entry.issues.length > 0;
    const visibility = entry.visibility || 'auto';
    return {
      key: entry.key,
      tag: entry.tag,
      translation: entry.translationKnowledge.value,
      translation_source: entry.translationKnowledge.source,
      category: entry.categoryKnowledge.value || 'Unsorted',
      category_source: entry.categoryKnowledge.source,
      note: entry.note || '',
      aliases: entry.aliases || '',
      visibility,
      effective_visibility: visibility === 'hidden' ? 'hidden' : visibility === 'visible' ? 'visible' : problematic ? 'problematic' : 'visible',
      usage_count: entry.usage_count,
      image_count: entry.project_ids.size,
      project_ids: [...entry.project_ids],
      scope_counts: entry.scope_counts,
      issues: entry.issues.slice(0, 20),
      problematic,
      first_seen: entry.first_seen,
      last_seen: entry.last_seen,
      updated_at: entry.updated_at || '',
    };
  }).sort((left, right) => right.usage_count - left.usage_count || left.tag.localeCompare(right.tag));
}

export function parseVibeVariants(entry) {
  try {
    const variants = JSON.parse(entry?.encoding_variants_json || '[]');
    return Array.isArray(variants) ? variants : [];
  } catch {
    return [];
  }
}

export function parseVibeValues(entry) {
  try {
    const values = JSON.parse(entry?.encoded_values_json || '[]');
    return Array.isArray(values) ? values.map(Number).filter(Number.isFinite).sort((a, b) => a - b) : [];
  } catch {
    return [];
  }
}

export function vibeGroupUsages(group, projects = []) {
  const ids = new Set((group?.entries || []).map((entry) => entry.id));
  const sourceHash = group?.source?.source_image_hash || (String(group?.key || '').startsWith('missing:') ? '' : group?.key || '');
  const usages = [];
  for (const project of projects) {
    for (const vibe of project.vibes || []) {
      if ((vibe.library_id && ids.has(vibe.library_id)) || (sourceHash && vibe.source_image_hash === sourceHash)) usages.push({ project, vibe });
    }
  }
  return usages;
}
