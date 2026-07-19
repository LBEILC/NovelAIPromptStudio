import { branchChangeFields } from './branches.js';

export const EXPERIMENT_FIELDS = ['Prompt', 'Vibe', 'Seed', 'Model', 'Sampler', 'Steps', 'CFG', 'Size'];

function metadataValue(project, field) {
  const metadata = project?.metadata || {};
  const key = { Seed: 'seed', Model: 'model', Sampler: 'sampler', Steps: 'steps', CFG: 'guidance' }[field];
  return key ? metadata[key] : undefined;
}

function hasComparableValue(project, field) {
  if (field === 'Prompt' || field === 'Vibe') return true;
  if (field === 'Size') return Number(project?.metadata?.width) > 0 && Number(project?.metadata?.height) > 0;
  const value = metadataValue(project, field);
  return value !== '' && value != null;
}

export function analyzeExperiment(baseline, members = []) {
  if (!baseline) return { status: 'incomplete', fixedFields: [], variableFields: [], incompleteFields: EXPERIMENT_FIELDS };
  const comparisons = (members || []).filter((member) => member?.id !== baseline.id);
  if (!comparisons.length) return { status: 'incomplete', fixedFields: [], variableFields: [], incompleteFields: [] };

  const allProjects = [baseline, ...comparisons];
  const incompleteFields = EXPERIMENT_FIELDS.filter((field) => !allProjects.every((project) => hasComparableValue(project, field)));
  const variableFields = [...new Set(comparisons.flatMap((member) => branchChangeFields(baseline, member)))];
  const fixedFields = EXPERIMENT_FIELDS.filter((field) => !variableFields.includes(field) && !incompleteFields.includes(field));
  const status = variableFields.length === 0 ? 'identical' : variableFields.length === 1 ? 'single' : 'mixed';
  return { status, fixedFields, variableFields, incompleteFields };
}

export function moveExperimentMember(memberIds, sourceId, targetId, baselineId) {
  const ids = [...(memberIds || [])];
  if (sourceId === baselineId || sourceId === targetId || !ids.includes(sourceId) || !ids.includes(targetId)) return ids;
  const withoutSource = ids.filter((id) => id !== sourceId);
  const targetIndex = Math.max(1, withoutSource.indexOf(targetId));
  withoutSource.splice(targetIndex, 0, sourceId);
  if (withoutSource[0] !== baselineId) return ids;
  return withoutSource;
}
