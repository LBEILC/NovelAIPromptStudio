import { dimensions, generationParameters, modelDisplayName } from './presentation';
import { useRef, useState } from 'react';
import { Button, useScrollArea } from '../ui';
import { LibraryRename } from './Rename';
import { hasImageName, imageFileName, imageAccessibleName } from '../lib/imageNaming.js';
import { mediaUrl } from '../lib/imageStage.js';
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
  const scroll = useRef<HTMLDivElement>(null);
  useScrollArea(scroll, { enabled: !!detail && !p.selectedGroupIds.length });
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
          <span className="library-help">选中一张时，这里显示它的提示词。</span>
        </div>
      </aside>
    );
  if (!detail) return <aside className="library-detail" />;
  const group = p.previewGroup;
  const filename = imageFileName(detail);
  const filenameCharacters = Array.from(filename);
  const pending = p.preview?.id !== detail.id;
  const parameters = generationParameters(detail.metadata);
  return (
    <aside className="library-detail" data-detail-id={detail.id} aria-busy={pending}>
      <div className="library-detail-scroll" ref={scroll}>
        <div className="library-detail-picture">
          <img
            src={mediaUrl(detail.image_path)}
            alt={imageAccessibleName(detail)}
            onClick={onViewer}
          />
        </div>
        {group && group.members.length > 1 && (
          <div className="library-strip">
            {group.members.map((member) => (
              <button
                key={member.id}
                className={`${member.id === detail.id ? 'is-current' : ''} ${member.id === group.cover.id ? 'is-cover' : ''}`}
                aria-label={imageAccessibleName(member)}
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
          {hasImageName(detail) && <b>{detail.name}</b>}
          <span className="library-mono">
            {dimensions(detail.metadata)}
            {detail.metadata.model && (
              <>
                {' '}
                ·{' '}
                <span data-tip={detail.metadata.model}>
                  {modelDisplayName(detail.metadata.model)}
                </span>
              </>
            )}
          </span>
          {parameters && (
            <span className="library-mono" data-generation-parameters>
              {parameters}
            </span>
          )}
          <span>
            {(p.view === 'trash' ? detail.deleted_at : detail.created_at).slice(0, 10)}{' '}
            {p.view === 'trash' ? '移入回收站' : '导入'}
          </span>
          {!hasImageName(detail) && (
            <span className="library-mono library-file" data-tip-overflow={filename}>
              <span>文件 </span>
              <span className="library-file-start" data-tip-measure>
                {filenameCharacters.slice(0, -20).join('')}
              </span>
              <span className="library-file-end">{filenameCharacters.slice(-20).join('')}</span>
            </span>
          )}
        </div>
        <div className="library-detail-actions">
          {p.view === 'trash' ? (
            <>
              <Button
                variant="quiet"
                size="small"
                onClick={() => p.onRestore([detail.id], 'detail')}
              >
                <i className="ri-arrow-go-back-line" />
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
                  setRenaming(true);
                }}
              >
                <i className="ri-edit-line" />
                {hasImageName(detail) ? '重命名' : '起名'}
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
          复制提示词
        </Button>
        {p.view !== 'trash' && (
          <Button variant="ink" onClick={() => p.onOpenWorkbench(detail)}>
            在工作台打开
          </Button>
        )}
      </div>
      {/* TODO(design): 界面稿未展示单张和整摞初始态；单张沿用原名预填，整摞暂留空。 */}
      <LibraryRename
        open={renaming}
        p={p}
        ids={group?.members.map((member) => member.id) || [detail.id]}
        currentId={detail.id}
        initialName={
          hasImageName(detail) && (!group || group.members.length === 1) ? detail.name : ''
        }
        onClose={() => setRenaming(false)}
      />
    </aside>
  );
}
