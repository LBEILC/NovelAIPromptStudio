export interface RandomOptions {
  pool: string;
  count: number;
  repeat: boolean;
  weight?: { min: number; max: number; step: number };
}
export interface PoolEntry {
  id: string;
  text: string;
  chance: number;
}
export interface RandomRecord {
  blocks: {
    source: string;
    pool: string;
    scope: string;
    start: number;
    text: string;
    entries: {
      id: string;
      text: string;
      rendered: string;
      weights?: { text: string; weight: number }[];
    }[];
  }[];
}
export const randomMarkerPattern = () => /__[^\r\n]*?(?:__(?!_)|(?=\r?$))/gm;
export const randomMarkers = (text: string) => [...text.matchAll(randomMarkerPattern())];
export function validatePoolName(name: string) {
  if (!name.trim() || /[_*~\r\n]/.test(name))
    throw new Error('随机池名称不能为空或包含 _ * ~ 换行');
  return name.trim();
}
export function parseRandomMarker(source: string): RandomOptions {
  const m =
    /^__([^_*~\r\n]+?)(?:\*(\d+)(r)?)?(?:~(\d*\.?\d+)-(\d*\.?\d+)(?:\/(\d*\.?\d+))?)?__$/.exec(
      source,
    );
  if (!m) throw new Error('随机块格式不正确');
  const pool = validatePoolName(m[1]);
  const count = Number(m[2] || 1);
  if (count < 1 || count > 16) throw new Error('随机块抽取数量必须为 1～16');
  const weight = m[4]
    ? { min: Number(m[4]), max: Number(m[5]), step: Number(m[6] || 0.05) }
    : undefined;
  if (
    weight &&
    (weight.min < 0.1 ||
      weight.max > 3 ||
      weight.min > weight.max ||
      weight.step < 0.01 ||
      weight.step > 1)
  )
    throw new Error('随机权重范围为 0.1～3，步长为 0.01～1');
  return { pool, count, repeat: !!m[3], ...(weight ? { weight } : {}) };
}
export function formatRandomMarker(options: Partial<RandomOptions> & { pool: string }) {
  const { pool, count = 1, repeat = false, weight } = options;
  const source = `__${validatePoolName(pool)}${count !== 1 || repeat ? `*${count}${repeat ? 'r' : ''}` : ''}${weight ? `~${weight.min}-${weight.max}/${weight.step}` : ''}__`;
  parseRandomMarker(source);
  return source;
}
export function randomSyntaxNote(
  source: string,
  pools?: readonly { name: string; entries?: PoolEntry[] }[],
  negative = false,
) {
  try {
    if (negative) throw new Error('负面提示词不能使用随机块');
    const options = parseRandomMarker(source);
    if (pools) {
      const pool = pools.find((p) => p.name === options.pool);
      if (!pool) throw new Error(`找不到随机池「${options.pool}」`);
      if (!pool.entries?.length) throw new Error(`随机池「${options.pool}」没有条目`);
      if (!options.repeat && options.count > pool.entries.length)
        throw new Error('抽取数量超过随机池条目数');
    }
    return '';
  } catch (error) {
    return (error as Error).message;
  }
}
