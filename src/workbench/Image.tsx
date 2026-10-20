import { Collapse, DecodedImage } from '../ui/transitions';
import { useEffect, useState } from 'react';
import type { WorkbenchTab } from '../state/workbench';
import type { ImageProject, ImageRecord, Vibe } from '../shared/types';
import { Button, Banner, ContextMenu, useNotifications } from '../ui';
import { hasImageName } from '../lib/imageNaming.js';
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
  const image = tab.project;
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
        setMembers(list);
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
          canSetCover: false,
          grouping: { promptScope: 'separate', mergeVibes: false, similarityThreshold: 85 },
        } as unknown as LibraryGroup)
      : null;
  const imageMenu =
    version && tab.versionImageId
      ? [
          {
            id: 'new-work',
            label: '作为新作品打开',
            onSelect: () => {
              void invokeUI('work.open-from-image', {
                tabId: tab.id,
                versionId: version.id,
                imageId: tab.versionImageId!,
              }).then(() => notify({ text: '已作为新作品打开' }));
            },
          },
          {
            id: 'trash',
            label: '移入回收站',
            onSelect: () => {
              const id = tab.versionImageId!;
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
          {(image as ImageProject & { vibes?: Vibe[] }).vibes?.map((vibe, index) => (
            <Banner tone="info" key={vibe.id || index}>
              <strong>{vibe.name || `Vibe ${index + 1}`}</strong>
              {' · '}原图强度 {Number(vibe.strength ?? 0.6).toFixed(2)} · Information{' '}
              {vibe.information_extracted == null
                ? '未知'
                : Number(vibe.information_extracted).toFixed(2)}
              <Button variant="quiet" size="small" onClick={() => p.onRevealVibe(vibe)}>
                在文件夹中显示
              </Button>
            </Banner>
          ))}
          <div className="wb-caption">
            {hasImageName(image) && <strong>{image.name}</strong>}
            <span className="wb-meta">
              {[
                metadata?.width && metadata?.height ? `${metadata.width} × ${metadata.height}` : '',
                modelDisplayName(metadata?.model),
                generationParameters(metadata || {}),
              ]
                .filter(Boolean)
                .join(' · ')}
            </span>
            <Collapse
              open={!!tab.originalProject && workbenchTabHasChanges(tab)}
              className="wb-dirty-collapse"
            >
              <span className="wb-dirty-line">
                提示词已经和原图不一样
                <Button variant="quiet" size="small" onClick={p.onReset}>
                  还原成原图的提示词
                </Button>
              </span>
            </Collapse>
          </div>
          <div className="wb-image-actions">
            {tab.source.type === 'library' ? (
              <span>已存入图片库</span>
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
