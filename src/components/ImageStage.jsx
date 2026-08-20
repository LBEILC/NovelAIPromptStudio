import { Image as LobeImage } from '@lobehub/ui';
import { useLayoutEffect, useRef, useState } from 'react';
import { mediaUrl, shouldResetImageStageLoading } from '../lib/imageStage.js';

export { mediaUrl } from '../lib/imageStage.js';

export default function ImageStage({
  alt,
  className = '',
  filePath,
  preview = true,
  previewToolbar,
  toolbarAddon,
  children,
}) {
  const [loaded, setLoaded] = useState(false);
  const stageRef = useRef(null);
  const previousFilePathRef = useRef(filePath);
  useLayoutEffect(() => {
    if (shouldResetImageStageLoading(previousFilePathRef.current, filePath)) setLoaded(false);
    previousFilePathRef.current = filePath;
    const image = stageRef.current?.querySelector('.image-stage-media');
    if (image?.complete && image.naturalWidth > 0) setLoaded(true);
  }, [filePath]);

  return <div aria-busy={Boolean(filePath) && !loaded} className={`image-stage ${className}`} ref={stageRef}>
    {filePath && !loaded && <span aria-hidden="true" className="image-stage-loading"/>}
    {filePath ? <LobeImage
      alt={alt || ''}
      className="image-stage-image"
      classNames={{
        image: `image-stage-media ${loaded ? 'is-loaded' : ''}`,
        wrapper: 'image-stage-media-wrapper',
      }}
      decoding="async"
      key={filePath}
      maxHeight="100%"
      maxWidth="100%"
      objectFit="contain"
      onLoad={() => setLoaded(true)}
      preview={preview ? { toolbarAddon, toolbarRender: previewToolbar } : false}
      src={mediaUrl(filePath)}
      variant="borderless"
    /> : <div className="image-stage-empty">没有可显示的图片</div>}
    {children}
  </div>;
}
