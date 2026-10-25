// scanning：导入文件夹前扫描（1.7.0）
const ACTIVE_IMPORT_PHASES = new Set(['scanning', 'preparing', 'importing']);

export function isImportActive(progress) {
  return ACTIVE_IMPORT_PHASES.has(progress?.phase);
}
