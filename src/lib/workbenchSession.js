import { promptSnapshot, restorePromptSnapshot, syncProjectPromptMetadata } from './promptStructure.js';

export const WORKBENCH_SESSION_KEY = 'novelai-prompt-studio.workbench-session.v1';

export function createWorkbenchSession(project, saved = null) {
  const originalProject = syncProjectPromptMetadata(structuredClone(project));
  const restored = saved?.sourcePath === project.image_path && saved?.draft
    ? syncProjectPromptMetadata(restorePromptSnapshot(structuredClone(originalProject), saved.draft))
    : structuredClone(originalProject);
  return {
    sourcePath: project.image_path,
    originalProject,
    project: restored,
    updatedAt: saved?.updatedAt || new Date().toISOString(),
  };
}

export function serializeWorkbenchSession(session) {
  if (!session?.sourcePath || !session?.project) return '';
  return JSON.stringify({
    sourcePath: session.sourcePath,
    draft: promptSnapshot(session.project),
    updatedAt: session.updatedAt || new Date().toISOString(),
  });
}

export function parseWorkbenchSession(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    if (!parsed?.sourcePath || !parsed?.draft) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function workbenchHasChanges(session) {
  if (!session?.project || !session?.originalProject) return false;
  return JSON.stringify(promptSnapshot(session.project)) !== JSON.stringify(promptSnapshot(session.originalProject));
}

