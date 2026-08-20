import { Image as LobeImage } from '@lobehub/ui';
import { useLayoutEffect, useState } from 'react';

export function mediaUrl(filePath) {
  return filePath ? `novelai-media://file?path=${encodeURIComponent(filePath)}` : '';
}

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
  useLayoutEffect(() => setLoaded(false), [filePath]);

  return <div aria-busy={Boolean(filePath) && !loaded} className={`image-stage ${className}`}>
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
