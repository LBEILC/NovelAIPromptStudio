import { MODEL_CAPS, SAMPLERS, NOISE_SCHEDULES } from '../../src/shared/params.ts';

export function validSettingsPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return false;
  const range = (n, lo, hi) => typeof n === 'number' && Number.isFinite(n) && n >= lo && n <= hi;
  const checks = {
    model: (v) => Object.hasOwn(MODEL_CAPS, v),
    effort: (v) => v === null || ['High', 'Medium'].includes(v),
    steps: (v) => Number.isInteger(v) && range(v, 1, 50),
    scale: (v) => range(v, 0, 10),
    rescale: (v) => v === null || range(v, 0, 1),
    sampler: (v) => SAMPLERS.some((s) => s.id === v),
    noise: (v) => v === null || NOISE_SCHEDULES.includes(v),
    quality: (v) => ['None', 'Standard', 'Light'].includes(v),
    uc: (v) => ['Heavy', 'Light', 'Furry Focus', 'Human Focus', 'None'].includes(v),
    aiPositions: (v) => typeof v === 'boolean',
    positions: (v) =>
      v &&
      typeof v === 'object' &&
      !Array.isArray(v) &&
      Object.entries(v).every(([k, c]) => k.length > 0 && /^[A-E][1-5]$/.test(c)),
  };
  return Object.entries(patch).every(([k, v]) => Object.hasOwn(checks, k) && checks[k](v));
}
