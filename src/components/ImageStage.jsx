import { Image as LobeImage } from '@lobehub/ui';

export function mediaUrl(filePath) {
  return filePath ? `novelai-media://file?path=${encodeURIComponent(filePath)}` : '';
}

export default function ImageStage({
  alt,
  className = '',
  filePath,
  preview = true,
  previewActions,
  toolbarAddon,
  children,
}) {
  return <div className={`image-stage ${className}`}>
    {filePath ? <LobeImage
      alt={alt || ''}
      className="image-stage-image"
      maxHeight="100%"
      maxWidth="100%"
      objectFit="contain"
      preview={preview ? { actionsRender: previewActions, toolbarAddon } : false}
      src={mediaUrl(filePath)}
      variant="borderless"
    /> : <div className="image-stage-empty">没有可显示的图片</div>}
    {children}
  </div>;
}
