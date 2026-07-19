const CACHE_EPSILON = 0.0051;

export function cachedInformationValues(value) {
  try {
    return [...new Set(JSON.parse(value || '[]')
      .map(Number)
      .filter((item) => Number.isFinite(item) && item >= 0 && item <= 1))]
      .sort((left, right) => left - right);
  } catch {
    return [];
  }
}

export function isCachedInformationValue(values, value) {
  const target = Number(value);
  return Number.isFinite(target) && values.some((item) => Math.abs(item - target) <= CACHE_EPSILON);
}

export function informationExtractedState(vibe) {
  const cachedValues = cachedInformationValues(vibe?.encoded_values_json);
  if (vibe?.source_kind === 'image') {
    return { kind: 'source', cachedValues, fileUsable: false };
  }
  const cached = isCachedInformationValue(cachedValues, vibe?.information_extracted);
  if (cachedValues.length) {
    return { kind: cached ? 'cached' : 'uncached', cachedValues, fileUsable: cached };
  }
  const dirty = Boolean(vibe?.information_extracted_dirty);
  return { kind: dirty ? 'uncached' : 'unknown', cachedValues, fileUsable: !dirty };
}

export function informationExtractedPatch(vibe, value) {
  const informationExtracted = Math.max(0, Math.min(1, Number(value)));
  const cachedValues = cachedInformationValues(vibe?.encoded_values_json);
  const cached = isCachedInformationValue(cachedValues, informationExtracted);
  return {
    information_extracted: informationExtracted,
    information_extracted_known: 1,
    information_extracted_dirty: vibe?.source_kind === 'image' ? 0 : cached ? 0 : 1,
  };
}

export function restoreOriginalInformationPatch(vibe) {
  return {
    information_extracted: Math.max(0, Math.min(1, Number(vibe?.information_extracted_origin ?? 0.7))),
    information_extracted_known: 0,
    information_extracted_dirty: 0,
  };
}
