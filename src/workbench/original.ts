// 不满意原图（doc/design.md 2.23，1.5.1）：原图在图片库里的移入回收站，从文件打开的从作品里去掉（不动文件）。
// 第一行变成"起点"，提示词、参数和后面各版都不变；通知里可以撤销。版本栏和舞台的右键菜单共用。
import { invokeUI } from '../lib/commands';
import type { MenuEntry } from '../kit/menu';
import type { WorkVersion } from '../shared/generation';
import { trashNotice } from '../lib/trashNotice';
import type { useSharedTrash } from '../shell/SharedTrash';

type AskShared = ReturnType<typeof useSharedTrash>[1];

type Notify = (n: {
  text: string;
  tone?: 'error';
  action?: { label: string; onClick: () => void };
}) => void;

export const originGone = (v?: WorkVersion | null) =>
  v?.originState === 'trashed' || v?.originState === 'removed';

/** 这张图同时在别的作品里时先问（1.5.6）；返回 detach / trash / cancel */
async function askFor(imageId: string, workId: string | undefined, ask?: AskShared) {
  if (!ask) return 'trash' as const;
  const r = await invokeUI('library.get', { id: imageId }).catch(() => null);
  const refs = r?.project?.work_refs;
  return (await ask({ ids: [imageId], refsOf: () => refs, workId })).choice;
}
/** 只从这个作品里去掉（共用的图，1.5.6）：图本身留在别的作品和图片库里 */
async function detach(
  workId: string,
  imageId: string,
  opts: { notify: Notify; refresh: () => void },
) {
  const r = await invokeUI('work.detach-images', { workId, imageIds: [imageId] });
  opts.refresh();
  opts.notify({
    text: trashNotice('已从这个作品里去掉，其他作品里还在', r.versions),
    action: {
      label: '撤销',
      onClick: () =>
        void invokeUI('work.restore-detached', { undo: r.undo })
          .then(opts.refresh)
          .catch((e) => opts.notify({ text: `撤销失败：${(e as Error).message}`, tone: 'error' })),
    },
  });
}

/** 版本栏和舞台上把一张图移入回收站：共用的图先问（1.5.6） */
export async function trashImage(
  imageId: string,
  workId: string | undefined,
  opts: { notify: Notify; refresh: () => void; ask?: AskShared },
) {
  try {
    const choice = await askFor(imageId, workId, opts.ask);
    if (choice === 'cancel') return;
    if (choice === 'detach' && workId) return await detach(workId, imageId, opts);
    const r = await invokeUI('library.trash', { ids: [imageId] });
    opts.refresh();
    opts.notify({
      text: trashNotice('已移入回收站', r.versions),
      action: {
        label: '撤销',
        onClick: () => void invokeUI('library.restore', { ids: [imageId] }).then(opts.refresh),
      },
    });
  } catch (e) {
    opts.notify({ text: `操作失败：${(e as Error).message}`, tone: 'error' });
  }
}

export function originMenu(
  v: WorkVersion,
  tabId: string,
  opts: {
    before?: () => Promise<void>;
    notify: Notify;
    refresh: () => void;
    ask?: AskShared;
    workId?: string;
  },
): MenuEntry {
  const run = async () => {
    try {
      await opts.before?.();
      // 原图也在别的作品里：问只从这个作品去掉（不进回收站），还是移入回收站（1.5.6）
      if (v.originState !== 'file') {
        const choice = await askFor(v.project.id, opts.workId, opts.ask);
        if (choice === 'cancel') return;
        if (choice === 'detach' && opts.workId)
          return await detach(opts.workId, v.project.id, opts);
      }
      const r = await invokeUI('work.remove-original', { tabId });
      opts.refresh();
      opts.notify({
        text: r.trashed ? '原图已移入回收站，作品从起点继续' : '已从作品里去掉原图，作品从起点继续',
        action: {
          label: '撤销',
          onClick: () =>
            void invokeUI('work.restore-original', { undo: r.undo })
              .then(opts.refresh)
              .catch((e) =>
                opts.notify({ text: `撤销失败：${(e as Error).message}`, tone: 'error' }),
              ),
        },
      });
    } catch (e) {
      opts.notify({ text: `操作失败：${(e as Error).message}`, tone: 'error' });
    }
  };
  return v.originState === 'file'
    ? { label: '从作品里去掉原图', onSelect: () => void run() }
    : { label: '移入回收站', danger: true, onSelect: () => void run() };
}
