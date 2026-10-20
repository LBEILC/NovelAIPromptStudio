import { DecodedImage } from '../ui/transitions';
import { useEffect, useState, useRef } from 'react';
import type { WorkbenchTab } from '../state/workbench';
import type { ImageProject, ImageRecord, Vibe } from '../shared/types';
import { Button, Banner, ContextMenu, Popover, useNotifications } from '../ui';
import { hasImageName, imageFileName } from '../lib/imageNaming.js';
import { mediaUrl } from '../lib/imageStage.js';
import { workbenchTabHasChanges } from '../lib/workbenchSession.js';
import { generationParameters, modelDisplayName } from '../library/presentation';
import './workbench.css';
import { invokeUI } from '../lib/commands';
import { useGeneration } from '../state/generation';
import type { WorkVersion } from '../shared/generation';
import type { LibraryGroup } from '../library/types';
import { LibraryViewer } from '../library/Viewer';

export interface ImageProps {
  tab: WorkbenchTab;
  onSaveLibrary: () => void;
  onReveal: () => void;
  onCopyImage: (project: ImageProject) => void;
  onDownloadImage: (project: ImageProject) => void;
  onReset: () => void;
  onRevealVibe: (vibe: Vibe) => void;
}
export function WorkbenchImage({ tab, ...p }: ImageProps) {
  const [missing, setMissing] = useState(!!tab.error);
  const [preview, setPreview] = useState(false);
  const image = tab.project as (ImageProject & { vibes?: Vibe[] }) | null;
  const generation = useGeneration(),
    notify = useNotifications();
  const [version, setVersion] = useState<WorkVersion | null>(null),
    [members, setMembers] = useState<ImageRecord[]>([]),
    [refresh, setRefresh] = useState(0);
  useEffect(() => {
    if (!generation.settings.hasToken) return;
    let active = true;
    void invokeUI('version.list', { tabId: tab.id }).then(async (r) => {
      const v = r.versions.find((v) => v.id === tab.versionId) || r.versions[0];
      const list = await Promise.all(
        v.images
          .filter((i) => !i.deleted)
          .map((i) => invokeUI('library.get', { id: i.projectId }).then((r) => r.project)),
      );
      if (active) {
        setVersion(v);
        setMembers(v.parentId ? list : [v.project as unknown as ImageRecord, ...list]);
      }
    });
    return () => {
      active = false;
    };
  }, [tab.id, tab.versionId, tab.revision, generation.jobs, refresh]);
  useEffect(
    () =>
      window.studio?.onCommandEvent((event) => {
        if (event.type === 'workbench' && event.libraryChanged) setRefresh((n) => n + 1);
      }),
    [],
  );
  const allTrashed =
    !!version?.parentId && version.images.length > 0 && !version.images.some((i) => !i.deleted);
  const group =
    version && members.length
      ? ({
          id: version.id,
          fingerprint: version.id,
          cover: members[0],
          members,
          grouping: { promptScope: 'separate', mergeVibes: false, similarityThreshold: 85 },
        } as unknown as LibraryGroup)
      : null;
  const stageImageId = tab.versionImageId || (!version?.parentId ? version?.project.id : '');
  const imageMenu =
    version && stageImageId
      ? [
          {
            id: 'new-work',
            label: '作为新作品打开',
            onSelect: () => {
              void invokeUI('work.open-from-image', {
                tabId: tab.id,
                versionId: version.id,
                imageId: stageImageId!,
              }).then(() => notify({ text: '已作为新作品打开' }));
            },
          },
          {
            id: 'trash',
            label: '移入回收站',
            disabled: tab.source.type !== 'library',
            disabledReason: tab.source.type !== 'library' ? '请先存入图片库' : undefined,
            onSelect: () => {
              const id = stageImageId!;
              void invokeUI('library.trash', { ids: [id] }).then(() => {
                setRefresh((n) => n + 1);
                notify({
                  text: '已移入回收站',
                  action: {
                    label: '撤销',
                    onClick: () => {
                      void invokeUI('library.restore', { ids: [id] }).then(() =>
                        setRefresh((n) => n + 1),
                      );
                    },
                  },
                });
              });
            },
          },
        ]
      : [];

  useEffect(() => setMissing(!!tab.error), [image?.image_path, tab.error]);
  const metadata = image?.metadata;
  return (
    <section className="wb-stage" aria-label="当前图片">
      {(missing || !image) && (
        <Banner tone="warn">
          这张图片已被移动或删除。提示词还在，可以继续编辑和复制；关闭这个标签页不影响其他标签页。
        </Banner>
      )}
      <ContextMenu className="wb-canvas-menu" label="图片操作" items={imageMenu}>
        <div className="wb-canvas">
          {image && !missing && !allTrashed ? (
            <DecodedImage
              alt="当前图片"
              role="button"
              tabIndex={0}
              onClick={() => setPreview(true)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') setPreview(true);
              }}
              src={mediaUrl(image.image_path)}
              onError={() => setMissing(true)}
            />
          ) : (
            <p>{allTrashed ? '这一版的图片都在回收站' : '无法显示图片'}</p>
          )}
        </div>
      </ContextMenu>
      {image && (
        <>
          <div className="wb-caption">
            <div className="wb-stage-title">
              <strong
                data-tip={`${hasImageName(image) ? image.name + ' · ' : ''}${version?.parentId ? `第 ${version.number} 版` : '原图'}`}
                data-tip-overflow=""
              >
                {hasImageName(image) ? image.name + ' · ' : ''}
                {version?.parentId ? `第 ${version.number} 版` : '原图'}
              </strong>
              <span
                className="wb-stage-dirty"
                data-visible={workbenchTabHasChanges(tab) || undefined}
              >
                已修改
              </span>
              <Button
                className="wb-stage-reset"
                data-visible={workbenchTabHasChanges(tab) || undefined}
                tabIndex={workbenchTabHasChanges(tab) ? 0 : -1}
                variant="quiet"
                size="small"
                data-tip={`恢复成${version?.parentId ? `第 ${version.number} 版` : '原图'}的提示词`}
                onClick={p.onReset}
              >
                <i className="ri-arrow-go-back-line" />
                恢复
              </Button>
            </div>
            <span className="wb-meta">
              {[
                metadata?.width && metadata?.height ? `${metadata.width} × ${metadata.height}` : '',
                modelDisplayName(metadata?.model),
                generationParameters(metadata || {}),
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            {!hasImageName(image) && (
              <span className="wb-file" data-tip={imageFileName(image)}>
                文件{' '}
                <span>
                  {imageFileName(image).slice(0, Math.ceil(imageFileName(image).length / 2))}
                </span>
                <span>
                  {imageFileName(image).slice(Math.ceil(imageFileName(image).length / 2))}
                </span>
              </span>
            )}
            {!!image.vibes?.length && (
              <div className="wb-vibes">
                <span>Vibe</span>
                {image.vibes.map((vibe, index) => (
                  <VibeChip
                    key={vibe.id || index}
                    vibe={vibe}
                    index={index}
                    onReveal={() => p.onRevealVibe(vibe)}
                  />
                ))}
              </div>
            )}
          </div>
          <div className="wb-image-actions">
            {tab.source.type === 'library' ? (
              <span className="wb-saved">
                <i className="ri-check-line" />
                已存入图片库
              </span>
            ) : (
              <Button size="small" onClick={p.onSaveLibrary}>
                存入图片库
              </Button>
            )}
            <Button variant="quiet" size="small" onClick={p.onReveal}>
              <i className="ri-folder-open-line" />
              在文件夹中显示
            </Button>
            <Button variant="quiet" size="small" onClick={() => p.onCopyImage(image)}>
              <i className="ri-file-copy-line" />
              复制图片
            </Button>
            <Button variant="quiet" size="small" onClick={() => p.onDownloadImage(image)}>
              <i className="ri-download-2-line" />
              另存为
            </Button>
          </div>
        </>
      )}
      {preview && image && (
        <LibraryViewer
          onClose={() => setPreview(false)}
          p={{
            preview: image,
            previewGroup: group,
            groups: group ? [group] : [],
            onPreview: (_group, next) => {
              if (version && next)
                void invokeUI('version.open', {
                  tabId: tab.id,
                  versionId: version.id,
                  imageId: next.id,
                });
            },
            onCopyImage: async () => p.onCopyImage(image),
            onDownloadImage: async () => p.onDownloadImage(image),
          }}
        />
      )}
    </section>
  );
}

function VibeChip({ vibe, index, onReveal }: { vibe: Vibe; index: number; onReveal: () => void }) {
  const anchor = useRef<HTMLButtonElement>(null),
    [open, setOpen] = useState(false);
  const information =
    vibe.information_extracted == null ? '未知' : Number(vibe.information_extracted).toFixed(2);
  return (
    <>
      <Button
        ref={anchor}
        size="small"
        variant="quiet"
        data-tip={`Vibe ${index + 1} · 参考强度 ${Number(vibe.strength).toFixed(2)} · 信息提取 ${information}`}
        onClick={() => setOpen(true)}
      >
        <i className="ri-image-line" />
        {Number(vibe.strength).toFixed(2)}
      </Button>
      <Popover
        open={open}
        anchor={anchor}
        onClose={() => setOpen(false)}
        label={`Vibe ${index + 1}`}
      >
        <div className="wb-vibe-detail">
          <i className="ri-image-line" />
          <strong>Vibe {index + 1}</strong>
          <span>参考强度 {Number(vibe.strength).toFixed(2)}</span>
          <span>
            信息提取 {information}
            {information === '未知' ? ' · 原图里没有记录' : ''}
          </span>
          <span>编码文件 {vibe.name}</span>
          <Button size="small" onClick={onReveal}>
            在文件夹中显示
          </Button>
        </div>
      </Popover>
    </>
  );
}
