import { invokeResult, invokeUI } from '../lib/commands';
import {
  allPromptTags,
  getPromptScope,
  syncProjectPromptMetadata,
  updatePromptScopeAnnotations,
} from '../lib/promptStructure.js';
import { updateWorkbenchTab } from '../lib/workbenchSession.js';
import type { CommandTab } from '../shared/commands';
import type { ImageProject, Tag } from '../shared/types';
import type { EditorProps } from '../workbench/Prompt';
import type { useAppState } from './state';
export function useWorkbenchAnnotations({
  annotationTimer,
  showToast,
  activeTab,
  setWorkbenchSession,
}: Pick<
  ReturnType<typeof useAppState>,
  'annotationTimer' | 'showToast' | 'activeTab' | 'setWorkbenchSession'
>) {
  const scheduleAnnotations = (project: ImageProject) => {
    window.clearTimeout(annotationTimer.current);
    const entries = allPromptTags(project).filter(
      (tag) => tag.translation_source === 'manual' || tag.category_source === 'manual',
    );
    if (!entries.length) return;
    annotationTimer.current = window.setTimeout(async () => {
      const result = await invokeResult('dictionary.set-many', {
        entries: entries
          .filter(
            (entry) => entry.translation_source === 'manual' || entry.category_source === 'manual',
          )
          .map((entry) => ({
            tag: entry.tag,
            ...(entry.translation_source === 'manual'
              ? { translation: entry.translation || '' }
              : {}),
            ...(entry.category_source === 'manual'
              ? { category: entry.category || 'Unsorted' }
              : {}),
          })),
      });
      if (!result?.ok) showToast(result?.error || '保存 Tag 译文和分类失败', 'error');
    }, 500);
  };

  const updateWorkbenchProject = (nextProject: ImageProject) => {
    if (!activeTab) return;
    const updated = {
      ...syncProjectPromptMetadata(nextProject),
      updated_at: new Date().toISOString(),
    };
    setWorkbenchSession((current) =>
      updateWorkbenchTab(current, activeTab.id, (tab: CommandTab) => ({
        ...tab,
        project: updated,
        updatedAt: updated.updated_at,
      })),
    );
    scheduleAnnotations(updated);
    void invokeUI('workbench.save-structure', {
      filePath: activeTab.source.path,
      structure: updated.prompt_structure,
      projectId: activeTab.source.projectId,
    }).then((result) => {
      if (!result.ok) showToast(result.error || '保存块类型和译文失败', 'error');
    });
  };

  const translateWorkbenchTags = async (entries: Parameters<EditorProps['onTranslateTags']>[0]) => {
    if (!activeTab?.project) return;
    const tabId = activeTab.id;
    const result = await invokeUI('dictionary.translate', {
      tags: entries.map((entry) => entry.tag.tag),
    });
    if (!result?.ok) {
      showToast(result?.error || '翻译和分类失败', 'error');
      return;
    }
    setWorkbenchSession((current) =>
      updateWorkbenchTab(current, tabId, (tab: CommandTab) => {
        if (!tab.project) return tab;
        let nextProject = tab.project;
        entries.forEach((entry, index) => {
          const scope = getPromptScope(nextProject, entry.scopeKey);
          const item: Partial<Tag> = result.items?.[index] || {};
          nextProject = updatePromptScopeAnnotations(
            nextProject,
            scope.key,
            scope.tags.map((tag: Tag) =>
              tag.id === entry.tag.id
                ? {
                    ...tag,
                    ...item,
                    translation_source: item.translation_source || '',
                    category_source: item.category_source || '',
                  }
                : tag,
            ),
          );
        });
        const updated = {
          ...syncProjectPromptMetadata(nextProject),
          updated_at: new Date().toISOString(),
        };
        scheduleAnnotations(updated);
        return { ...tab, project: updated, updatedAt: updated.updated_at };
      }),
    );
    if (result.ai_count)
      showToast(`已整理 ${entries.length} 个 Tag，其中 ${result.ai_count} 个由 AI 补全`);
    else if (result.unresolved_count)
      showToast(`已用内置词典整理，还有 ${result.unresolved_count} 个 Tag 没有译文或分类`);
    else showToast(`已用内置词典整理 ${entries.length} 个 Tag`);
  };
  return { translateWorkbenchTags, updateWorkbenchProject };
}
