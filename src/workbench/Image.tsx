import { useState } from 'react';
import type { WorkbenchTab } from '../state/workbench';
import type { ImageProject, Vibe } from '../shared/types';
import { Button, Banner } from '../ui';
import { hasImageName } from '../lib/imageNaming.js';
import { mediaUrl } from '../lib/imageStage.js';
import { workbenchTabHasChanges } from '../lib/workbenchSession.js';
import { generationParameters, modelDisplayName } from '../library/presentation';
import './workbench.css';
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
  const [missing, setMissing] = useState(false);
  const [preview, setPreview] = useState(false);
  const image = tab.project;
  const metadata = image?.metadata;
  return (
    <section className="wb-stage" aria-label="当前图片">
      {(missing || !image) && (
        <Banner tone="warn">
          这张图片已被移动或删除。Prompt 还在，可以继续编辑和复制；关闭这个标签不影响其他标签。
        </Banner>
      )}
      <div className="wb-canvas">
        {image && !missing ? (
          <img
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
          <p>无法显示图片</p>
        )}
      </div>
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
            {workbenchTabHasChanges(tab) && (
              <span className="wb-dirty-line">
                Prompt 已经和原图不一样
                <Button variant="quiet" size="small" onClick={p.onReset}>
                  还原成原图的 Prompt
                </Button>
              </span>
            )}
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
            previewGroup: null,
            groups: [],
            onPreview: () => {},
            onCopyImage: async () => p.onCopyImage(image),
            onDownloadImage: async () => p.onDownloadImage(image),
          }}
        />
      )}
    </section>
  );
}
