import { invokeUI } from '../lib/commands';
import { writeClipboardText } from '../lib/clipboard';
import { useState, type ReactNode } from 'react';
import { ContextMenu, Dialog, Input, type MenuItem } from '../ui';
import { LibraryRename } from './Rename';
import { libraryPositivePrompt } from './Prompt';
import { hasImageName } from '../lib/imageNaming.js';
import type { LibraryGroup, LibraryProps } from './types';
import type { LibraryCard } from '../shared/types';

export function CardMenu({
  p,
  group,
  image: hoveredImage,
  onViewer,
  children,
}: {
  p: LibraryProps;
  group: LibraryGroup;
  image: LibraryCard;
  onViewer: () => void;
  children: ReactNode;
}) {
  const [rename, setRename] = useState(false);
  const [create, setCreate] = useState(false);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [image, setImage] = useState(hoveredImage);
  const multiple = p.selectedGroupIds.includes(group.id) && p.selectedImageCount > 1;
  const images = multiple
    ? p.groups.filter((g) => p.selectedGroupIds.includes(g.id)).flatMap((g) => g.members)
    : group.members;
  const ids = images.map((item) => item.id);
  const items: MenuItem[] =
    p.view === 'trash'
      ? [
          { id: 'restore', label: '恢复', onSelect: () => void p.onRestore(ids) },
          {
            id: 'delete',
            label: '永久删除…',
            danger: true,
            onSelect: () => void p.onPermanentDelete(ids),
          },
        ]
      : [
          {
            id: 'open',
            label: multiple ? `在工作台打开 ${ids.length} 张` : '在工作台打开',
            shortcut: multiple ? undefined : ['Enter'],
            onSelect: () => {
              for (const item of multiple ? images : [image]) p.onOpenWorkbench(item);
            },
          },
          ...(!multiple
            ? [
                { id: 'view', label: '看大图', shortcut: ['空格'], onSelect: onViewer },
                { id: 'copy-separator', separator: true as const },
                {
                  id: 'prompt',
                  label: '复制提示词',
                  onSelect: () => {
                    void invokeUI('library.get', { id: image.id })
                      .then((result) => result.project)
                      .then((detail) => {
                        if (detail) return writeClipboardText(libraryPositivePrompt(detail));
                      });
                  },
                },
                { id: 'copy', label: '复制图片', onSelect: () => void p.onCopyImage(image) },
                { id: 'save', label: '另存为…', onSelect: () => void p.onDownloadImage(image) },
                { id: 'edit-separator', separator: true as const },
              ]
            : []),
          { id: 'rename', label: '起名…', onSelect: () => setRename(true) },
          {
            id: 'collection',
            label: '加入收藏集',
            children: [
              ...p.collections
                .filter((c) => c.kind === 'manual')
                .map((c) => ({
                  id: c.id,
                  label: c.name,
                  onSelect: () => void p.onCollectionProjectsChange(c.id, ids, 'add'),
                })),
              {
                id: 'new',
                label: '新建收藏集…',
                onSelect: () => {
                  setName('');
                  setCreate(true);
                },
              },
            ],
          },
          ...(!multiple
            ? [{ id: 'reveal', label: '在文件夹中显示', onSelect: () => p.onReveal(image) }]
            : []),
          ...(p.activeCollection?.kind === 'manual'
            ? [
                {
                  id: 'remove',
                  label: '移出这个收藏集',
                  onSelect: () =>
                    void p.onCollectionProjectsChange(p.activeCollection!.id, ids, 'remove'),
                },
              ]
            : []),
          { id: 'trash-separator', separator: true },
          { id: 'trash', label: '移入回收站', danger: true, onSelect: () => void p.onTrash(ids) },
        ];
  return (
    <>
      <ContextMenu
        label="图片操作"
        heading={multiple ? `已选 ${ids.length} 张` : undefined}
        items={items}
        onContextOpen={() => {
          setImage(hoveredImage);
          if (!p.selectedGroupIds.includes(group.id)) p.onClearSelection();
          p.onPreview(group, hoveredImage);
        }}
      >
        {children}
      </ContextMenu>
      <LibraryRename
        open={rename}
        p={p}
        ids={ids}
        initialName={hasImageName(image) ? image.name : ''}
        onClose={() => setRename(false)}
      />
      <Dialog
        open={create}
        title="新建收藏集"
        cancelLabel="取消"
        confirmLabel="新建并加入"
        confirmDisabled={busy || !name.trim()}
        onCancel={() => {
          if (!busy) setCreate(false);
        }}
        onConfirm={async () => {
          setBusy(true);
          try {
            const collection = await p.onCollectionCreate('manual', name.trim());
            if (collection && typeof collection === 'object') {
              await p.onCollectionProjectsChange(collection.id, ids, 'add');
              setCreate(false);
            }
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input
          aria-label="新收藏集名称"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Dialog>
    </>
  );
}
