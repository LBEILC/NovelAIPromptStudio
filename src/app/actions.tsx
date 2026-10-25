import { invokeUI } from '../lib/commands';
import { updateWorkbenchTab } from '../lib/workbenchSession.js';
import type { CommandTab } from '../shared/commands';
import type { useAppState } from './state';
export function useAppActions({
  activeTab,
  setWorkbenchSession,
  showToast,
  workbenchConnection,
}: Pick<
  ReturnType<typeof useAppState>,
  'activeTab' | 'setWorkbenchSession' | 'showToast' | 'workbenchConnection'
>) {
  const resetWorkbench = async () => {
    if (!activeTab?.project) return;
    setWorkbenchSession((current) =>
      updateWorkbenchTab(current, activeTab.id, (tab: CommandTab) => ({
        ...tab,
        project: structuredClone(tab.originalProject),
        updatedAt: new Date().toISOString(),
      })),
    );
    showToast('已恢复图片中的原始提示词');
  };

  const installDownloadedUpdate = async () => {
    try {
      await workbenchConnection?.flush();
      const result = await invokeUI('updates.install', {});
      if (!result?.ok) throw new Error(result?.error || '安装更新失败');
      return true;
    } catch (error) {
      showToast(`重启安装失败：${error instanceof Error ? error.message : String(error)}`, 'error');
      return false;
    }
  };
  return { resetWorkbench, installDownloadedUpdate };
}
