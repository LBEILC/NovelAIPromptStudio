import { useState } from 'react';
import { Button, Dialog, Input } from '../ui';
import { mediaUrl } from '../components/ImageStage.jsx';
import { LibraryPrompt, libraryPositivePrompt } from './Prompt';
import { CollectionPicker } from './Collections';
import type { ImageRecord } from '../shared/types';
import type { LibraryProps } from './types';

export function LibraryDetail({
  p,
  detail,
  onViewer,
}: {
  p: LibraryProps;
  detail: ImageRecord | null;
  onViewer: () => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState('');
  if (p.selectedGroupIds.length)
    return (
      <aside className="library-detail">
        <div className="library-summary">
          <div className="library-fan">
            {p.groups
              .filter((group) => p.selectedGroupIds.includes(group.id))
              .slice(0, 3)
              .map((group) => (
                <img key={group.id} src={mediaUrl(group.cover.thumbnail_path)} alt="" />
              ))}
          </div>
          <b>
            已选 {p.selectedGroupIds.length} 组 · {p.selectedImageCount} 张
          </b>
          <span className="library-help">选中一张时，这里显示它的 Prompt。</span>
        </div>
      </aside>
    );
  if (!detail) return <aside className="library-detail" />;
  const group = p.previewGroup;
  const pending = p.preview?.id !== detail.id;
  return (
    <aside className="library-detail" data-detail-id={detail.id} aria-busy={pending}>
      <div className="library-detail-scroll">
        <div className="library-detail-picture">
          <img src={mediaUrl(detail.image_path)} alt={detail.name} onDoubleClick={onViewer} />
        </div>
        {group && group.members.length > 1 && (
          <div className="library-strip">
            {group.members.map((member) => (
              <button
                key={member.id}
                className={`${member.id === detail.id ? 'is-current' : ''} ${member.id === group.cover.id ? 'is-cover' : ''}`}
                aria-label={member.name}
                onClick={() => p.onPreview(group, member)}
              >
                <img src={mediaUrl(member.thumbnail_path)} alt="" />
              </button>
            ))}
            <span className="library-help library-mono">
              {group.members.findIndex((member) => member.id === detail.id) + 1} /{' '}
              {group.members.length}
            </span>
          </div>
        )}
        <div className="library-caption">
          <b>{detail.name}</b>
          <span className="library-mono">
            {detail.metadata.width} × {detail.metadata.height} · {detail.metadata.model}
          </span>
          <span className="library-mono">
            {detail.metadata.steps} 步 · 引导 {detail.metadata.guidance} · Seed{' '}
            {detail.metadata.seed}
          </span>
          <span>
            {(p.view === 'trash' ? detail.deleted_at : detail.created_at).slice(0, 10)}{' '}
            {p.view === 'trash' ? '移入回收站' : '导入'}
          </span>
        </div>
        <div className="library-detail-actions">
          {p.view === 'trash' ? (
            <>
              <Button
                variant="quiet"
                size="small"
                onClick={() => p.onRestore([detail.id], 'detail')}
              >
                恢复
              </Button>
              <Button
                variant="danger"
                size="small"
                onClick={() => p.onPermanentDelete([detail.id], null, 'detail')}
              >
                永久删除
              </Button>
            </>
          ) : (
            <>
              <CollectionPicker p={p} ids={[detail.id]} />
              <Button
                variant="quiet"
                size="small"
                onClick={() => {
                  setName(detail.name);
                  setRenaming(true);
                }}
              >
                <i className="ri-edit-line" />
                重命名
              </Button>
              {group && group.members.length > 1 && group.canSetCover && (
                <Button variant="quiet" size="small" onClick={() => p.onSetCover(group, detail)}>
                  设为封面
                </Button>
              )}
              <Button
                variant="quiet"
                size="small"
                aria-label="在文件夹中显示"
                onClick={() => p.onReveal(detail)}
              >
                <i className="ri-folder-open-line" />
              </Button>
              <Button
                variant="danger"
                size="small"
                aria-label="移入回收站"
                onClick={() => p.onTrash([detail.id], 'detail')}
              >
                <i className="ri-delete-bin-line" />
              </Button>
            </>
          )}
        </div>
        <LibraryPrompt project={detail} />
      </div>
      <div className="library-detail-bar">
        <Button onClick={() => navigator.clipboard.writeText(libraryPositivePrompt(detail))}>
          <i className="ri-file-copy-line" />
          复制 Prompt
        </Button>
        {p.view !== 'trash' && (
          <Button variant="ink" onClick={() => p.onOpenWorkbench(detail)}>
            在工作台打开
          </Button>
        )}
      </div>
      <Dialog
        open={renaming}
        title="重命名"
        cancelLabel="取消"
        confirmLabel="重命名"
        onCancel={() => setRenaming(false)}
        onConfirm={async () => {
          if (name.trim() && (await p.onRename(detail, name.trim()))) setRenaming(false);
        }}
      >
        <Input
          aria-label="图片名称"
          value={name}
          onChange={(event) => setName(event.target.value)}
        />
      </Dialog>
    </aside>
  );
}
