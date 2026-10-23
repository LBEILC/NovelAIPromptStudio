import {
  MODEL_CAPS,
  SAMPLERS,
  NOISE_SCHEDULES,
  validParameterNumber,
} from '../../src/shared/params.ts';

export function validSettingsPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return false;
  const checks = {
    model: (v) => Object.hasOwn(MODEL_CAPS, v),
    effort: (v) => v === null || ['High', 'Medium'].includes(v),
    steps: (v) => validParameterNumber('steps', v),
    scale: (v) => validParameterNumber('scale', v),
    rescale: (v) => v === null || validParameterNumber('rescale', v),
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
