// 图片右键菜单最上面的一组：复制图片、另存为、在文件夹中显示（用户 10-27）。
// 舞台、版本栏小图、图片库卡片、图片库大图都放这一组，做的事和舞台下面、大图工具条上的按钮一样。
// 图片库里的图按 ID；不在图片库里的（外部打开的原图）按路径。
import { invokeUI } from '../lib/commands';
import type { MenuEntry } from './menu';
import type { useNotifications } from './toast';

type Notify = ReturnType<typeof useNotifications>;

export interface ImageFileTarget {
  id?: string;
  path?: string;
  name?: string;
}

export const imageFileMenu = (target: ImageFileTarget, notify: Notify): MenuEntry[] => {
  const fail = (e: unknown, text: string) =>
    notify({ text: (e as Error)?.message || text, tone: 'error' });
  const ref = target.id ? { id: target.id } : { path: target.path, name: target.name };
  return [
    {
      label: '复制图片',
      icon: 'file-copy-line',
      onSelect: () =>
        void invokeUI('image.copy', ref)
          .then((r) =>
            r?.ok ? notify({ text: '已复制图片' }) : fail(new Error(r?.error), '复制图片失败'),
          )
          .catch((e) => fail(e, '复制图片失败')),
    },
    {
      label: '另存为…',
      icon: 'download-2-line',
      onSelect: () =>
        void invokeUI('image.save-as', ref)
          .then((r) => {
            if ('canceled' in r && r.canceled) return;
            if (r?.ok) notify({ text: '已下载原图' });
            else fail(new Error(r?.error), '下载原图失败');
          })
          .catch((e) => fail(e, '下载原图失败')),
    },
    {
      label: '在文件夹中显示',
      icon: 'folder-open-line',
      onSelect: async () => {
        try {
          const path =
            target.path || (await invokeUI('library.get', { id: target.id! })).project.image_path;
          await invokeUI('file.reveal', { path });
        } catch (e) {
          fail(e, '找不到这张图片的文件');
        }
      },
    },
  ];
};
