import { Collapse, DecodedImage, TransitionSurface } from '../ui/transitions';
import { writeClipboardText } from '../lib/clipboard';
import { Shortcut, SurfaceButton } from '../ui';
import {
  dimensions,
  generationParameters,
  libraryCountText,
  modelDisplayName,
} from './presentation';
import { useEffect, useRef, useState } from 'react';
import { Button, useScrollArea } from '../ui';
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
  const [name, setName] = useState('');
  const [expanded, setExpanded] = useState(false);
  const nameInput = useRef<HTMLInputElement>(null);
  const saving = useRef(false);
  const canceled = useRef(false);
  const startRename = () => {
    if (!detail || p.preview?.id !== detail.id || p.view === 'trash') return;
    canceled.current = false;
    setName(hasImageName(detail) ? detail.name : '');
    setRenaming(true);
  };
  useEffect(() => {
    setRenaming(false);
  }, [detail?.id]);
  useEffect(() => {
    setExpanded(false);
  }, [p.previewGroup?.id]);
  useEffect(() => {
    if (p.renameRequest?.id === detail?.id) startRename();
  }, [p.renameRequest, detail?.id]);
  useEffect(() => {
    if (renaming) {
      nameInput.current?.focus();
      nameInput.current?.select();
    }
  }, [renaming]);
  const saveName = async () => {
    if (saving.current || canceled.current || !detail) return;
    if (!name.trim()) {
      setRenaming(false);
      return;
    }
    saving.current = true;
    try {
      const ids = p.previewGroup?.members.map((member) => member.id) || [detail.id];
      if (await p.onRenameMany(ids, name.trim())) {
        canceled.current = true;
        setRenaming(false);
      }
    } finally {
      saving.current = false;
    }
  };
  const scroll = useRef<HTMLDivElement>(null);
  useScrollArea(scroll, { enabled: !!detail && !p.selectedGroupIds.length });
  if (p.selectedGroupIds.length)
    return (
      <aside className="library-detail">
        <div className="library-summary">
          <b>已选 {libraryCountText(p.selectedGroupIds.length, p.selectedImageCount)}</b>
          <div className="library-fan">
            {p.groups
              .filter((group) => p.selectedGroupIds.includes(group.id))
              .slice(0, 5)
              .map((group) => (
                <DecodedImage key={group.id} src={mediaUrl(group.cover.thumbnail_path)} alt="" />
              ))}
          </div>
          <span className="library-help">
            点击图片可继续选择或取消，按住 <Shortcut keys={['Shift']} /> 可连续选择，按{' '}
            <Shortcut keys={['Esc']} /> 退出多选
          </span>
        </div>
        <div className="library-detail-bar">
          <Button onClick={p.onClearSelection}>取消选择</Button>
          {p.view !== 'trash' && (
            <Button
              variant="ink"
              onClick={() => {
                for (const group of p.groups.filter((group) =>
                  p.selectedGroupIds.includes(group.id),
                ))
                  for (const member of group.members) p.onOpenWorkbench(member);
              }}
            >
              在工作台打开 {p.selectedImageCount} 张
            </Button>
          )}
        </div>
      </aside>
    );
  if (!detail) return <aside className="library-detail" />;
  const group = p.previewGroup;
  const filename = imageFileName(detail);
  const filenameCharacters = Array.from(filename);
  const pending = p.preview?.id !== detail.id;
  // TODO(design): The prototype does not specify generation parameters or the set-cover action.
  const parameters = generationParameters(detail.metadata);
  return (
    <aside className="library-detail" data-detail-id={detail.id} aria-busy={pending}>
      <div className="library-detail-scroll" ref={scroll}>
        <TransitionSurface className="library-detail-picture" change={detail.id}>
          <DecodedImage
            src={mediaUrl(detail.image_path)}
            width={detail.metadata.width || undefined}
            height={detail.metadata.height || undefined}
            style={{
              aspectRatio: `${detail.metadata.width || 1} / ${detail.metadata.height || 1}`,
            }}
            alt={imageAccessibleName(detail)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onViewer();
              }
            }}
            onClick={onViewer}
          />
        </TransitionSurface>
        <Collapse open={!!group && group.members.length > 1}>
          {group && (
            <div className="library-strip">
              {group.members.slice(0, group.members.length > 7 ? 6 : 7).map((member) => (
                <SurfaceButton
                  kind="image"
                  key={member.id}
                  className={`${member.id === detail.id ? 'is-current' : ''} ${member.id === group.cover.id ? 'is-cover' : ''}`}
                  aria-label={imageAccessibleName(member)}
                  onClick={() => p.onPreview(group, member)}
                >
                  <DecodedImage src={mediaUrl(member.thumbnail_path)} alt="" />
                </SurfaceButton>
              ))}
              {group.members.length > 7 && (
                <SurfaceButton
                  className="library-strip-more library-mono"
                  aria-label={expanded ? '收起' : `展开其余 ${group.members.length - 6} 张`}
                  data-tip={expanded ? '收起' : undefined}
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? <i className="ri-arrow-up-s-line" /> : `+${group.members.length - 6}`}
                </SurfaceButton>
              )}
              <span className="library-help library-mono">
                {group.members.findIndex((member) => member.id === detail.id) + 1} /{' '}
                {group.members.length}
              </span>
              <Collapse open={expanded} className="library-strip-expanded">
                <div className="library-strip-rest">
                  {group.members.slice(6).map((member) => (
                    <SurfaceButton
                      kind="image"
                      key={member.id}
                      className={member.id === detail.id ? 'is-current' : ''}
                      aria-label={imageAccessibleName(member)}
                      onClick={() => p.onPreview(group, member)}
                    >
                      <DecodedImage src={mediaUrl(member.thumbnail_path)} alt="" />
                    </SurfaceButton>
                  ))}
                </div>
              </Collapse>
            </div>
          )}
        </Collapse>
        <div className="library-caption">
          {renaming ? (
            <div className="library-inline-name">
              <input
                ref={nameInput}
                aria-label="图片名称"
                value={name}
                onChange={(event) => setName(event.target.value)}
                onBlur={() => void saveName()}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void saveName();
                  }
                  if (event.key === 'Escape') {
                    event.preventDefault();
                    event.stopPropagation();
                    canceled.current = true;
                    setRenaming(false);
                  }
                }}
              />
              <span className="library-help">
                <Shortcut keys={['Enter']} /> 保存 <Shortcut keys={['Esc']} /> 取消
                {group && group.members.length > 1 && (
                  <> · {group.members.length} 张图片将按顺序编号</>
                )}
              </span>
            </div>
          ) : (
            hasImageName(detail) && (
              <SurfaceButton
                className="library-name"
                data-tip={p.view === 'trash' ? undefined : '重命名'}
                disabled={pending || p.view === 'trash'}
                onClick={startRename}
              >
                {detail.name}
              </SurfaceButton>
            )
          )}
          {group && group.members.length > 1 && (
            <span className="library-help">一组 · {group.members.length} 张</span>
          )}
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
              <CollectionPicker
                p={p}
                ids={group?.members.map((member) => member.id) || [detail.id]}
              />
              <Button variant="quiet" size="small" disabled={pending} onClick={startRename}>
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
                onClick={() =>
                  p.onTrash(group?.members.map((member) => member.id) || [detail.id], 'detail')
                }
              >
                <i className="ri-delete-bin-line" />
              </Button>
            </>
          )}
        </div>
        <LibraryPrompt project={detail} />
      </div>
      <div className="library-detail-bar">
        <Button onClick={() => writeClipboardText(libraryPositivePrompt(detail))}>
          <i className="ri-file-copy-line" />
          复制提示词
        </Button>
        {p.view !== 'trash' && (
          <Button variant="ink" onClick={() => p.onOpenWorkbench(detail)}>
            在工作台打开
          </Button>
        )}
      </div>
    </aside>
  );
}
