// 不满意原图（doc/design.md 2.23，1.5.1）：原图在图片库里的移入回收站，从文件打开的从作品里去掉（不动文件）。
// 第一行变成"起点"，提示词、参数和后面各版都不变；通知里可以撤销。版本栏和舞台的右键菜单共用。
import { invokeUI } from '../lib/commands';
import type { MenuEntry } from '../kit/menu';
import type { WorkVersion } from '../shared/generation';

type Notify = (n: {
  text: string;
  tone?: 'error';
  action?: { label: string; onClick: () => void };
}) => void;

export const originGone = (v?: WorkVersion | null) =>
  v?.originState === 'trashed' || v?.originState === 'removed';

export function originMenu(
  v: WorkVersion,
  tabId: string,
  opts: { before?: () => Promise<void>; notify: Notify; refresh: () => void },
): MenuEntry {
  const run = async () => {
    try {
      await opts.before?.();
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
