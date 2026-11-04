// 生成尺寸：NovelAI 要求宽高都是 64 的倍数，单边不超过 2048，面积不超过 1536×2048。
// 不是 64 倍数的尺寸（比如放大过的原图 1467×2144）NovelAI 不报参数错误，而是返回笼统的 500。
export const MAX_GENERATION_EDGE = 2048;
export const MAX_GENERATION_AREA = 1536 * 2048;

/** 把任意尺寸换成能生成的尺寸：先按比例缩到上限内，再四舍五入到 64 的倍数；超面积时在上下两个倍数里挑比例最接近的 */
export function fitGenerationSize(width: number, height: number) {
  if (![width, height].every((n) => Number.isFinite(n) && n > 0)) throw new Error('尺寸无效');
  const scale = Math.min(
    1,
    Math.sqrt(MAX_GENERATION_AREA / (width * height)),
    MAX_GENERATION_EDGE / width,
    MAX_GENERATION_EDGE / height,
  );
  const snap = (n: number) => Math.min(MAX_GENERATION_EDGE, Math.max(64, Math.round(n / 64) * 64));
  const near = { width: snap(width * scale), height: snap(height * scale) };
  if (near.width * near.height <= MAX_GENERATION_AREA) return near;
  const ratio = width / height;
  const steps = (n: number) =>
    [Math.floor(n / 64), Math.ceil(n / 64)].map((k) =>
      Math.min(MAX_GENERATION_EDGE, Math.max(64, k * 64)),
    );
  let best: { width: number; height: number; off: number } | null = null;
  for (const w of steps(width * scale))
    for (const h of steps(height * scale)) {
      if (w * h > MAX_GENERATION_AREA) continue;
      const off = Math.abs(Math.log(w / h / ratio));
      if (
        !best ||
        off < best.off - 1e-9 ||
        (off < best.off + 1e-9 && w * h > best.width * best.height)
      )
        best = { width: w, height: h, off };
    }
  return { width: best!.width, height: best!.height };
}
