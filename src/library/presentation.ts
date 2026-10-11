/** Display names never replace the raw values stored in collection rules. */
export function modelDisplayName(raw = '') {
  const name = raw.replace(/\s+[\da-f]{8}$/i, '');
  const known = name.match(/^(?:NovelAI Diffusion )?(V(?:3|4(?:\.5)?|5))(?: (Full|Curated))?$/i);
  return known
    ? known[1].toUpperCase() + (known[2]?.toLowerCase() === 'curated' ? ' Curated' : '')
    : name;
}

export function groupModelOptions(options: { label: string; value: string }[]) {
  const groups = new Map<string, { label: string; values: string[] }>();
  for (const option of options) {
    const label = modelDisplayName(option.label);
    const group = groups.get(label) || { label, values: [] };
    if (!group.values.includes(option.value)) group.values.push(option.value);
    groups.set(label, group);
  }
  return [...groups.values()];
}

export function dimensions(metadata: { width?: number; height?: number }) {
  return metadata.width && metadata.height ? `${metadata.width} × ${metadata.height}` : '尺寸未知';
}

export function generationParameters(metadata: {
  steps?: number | string | null;
  guidance?: number | string | null;
  seed?: string;
  extra_json?: string;
}) {
  // Older imports coerced missing numeric fields to zero. Retained PNG metadata
  // distinguishes that sentinel from an explicitly recorded zero value.
  let raw: Record<string, unknown> = {};
  try {
    raw = JSON.parse(metadata.extra_json || '{}').parsed || {};
  } catch {
    /* Malformed legacy metadata must not prevent rendering. */
  }
  const present = (value: number | string | null | undefined, keys: string[]) =>
    value != null &&
    String(value).trim() !== '' &&
    Number.isFinite(Number(value)) &&
    (Number(value) !== 0 || keys.some((key) => raw[key] != null && String(raw[key]).trim() !== ''));
  return [
    present(metadata.steps, ['steps']) ? `${metadata.steps} 步` : '',
    present(metadata.guidance, ['scale', 'cfg_scale', 'guidance'])
      ? `引导 ${metadata.guidance}`
      : '',
    metadata.seed != null && String(metadata.seed).trim() !== '' ? `Seed ${metadata.seed}` : '',
  ]
    .filter(Boolean)
    .join(' · ');
}

export function deletionDetail(impact: { open: number; dirty: number }, space: string) {
  return [
    impact.open ? `${impact.open} 张正在工作台打开，删除后这些标签会关闭。` : '',
    impact.dirty ? `其中 ${impact.dirty} 个标签里有还没保存的改动，会一起丢弃。` : '',
    space ? `会释放 ${space}。` : '',
  ]
    .filter(Boolean)
    .join('');
}
