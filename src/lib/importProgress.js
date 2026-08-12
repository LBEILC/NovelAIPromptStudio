const ACTIVE_IMPORT_PHASES = new Set(['preparing', 'importing']);

export function isImportActive(progress) {
  return ACTIVE_IMPORT_PHASES.has(progress?.phase);
}
