import { branchChangeFields } from './branches.js';

export const EXPERIMENT_FIELDS = ['Prompt', 'Vibe', 'Seed', 'Model', 'Sampler', 'Steps', 'CFG'];

function metadataValue(project, field) {
  const metadata = project?.metadata || {};
  const key = { Seed: 'seed', Model: 'model', Sampler: 'sampler', Steps: 'steps', CFG: 'guidance' }[field];
  return key ? metadata[key] : undefined;
}

function hasComparableValue(project, field) {
  if (field === 'Prompt' || field === 'Vibe') return true;
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
