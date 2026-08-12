import { Image as LobeImage } from '@lobehub/ui';

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
  return <div className={`image-stage ${className}`}>
    {filePath ? <LobeImage
      alt={alt || ''}
      className="image-stage-image"
      maxHeight="100%"
      maxWidth="100%"
      objectFit="contain"
      preview={preview ? { toolbarAddon, toolbarRender: previewToolbar } : false}
      src={mediaUrl(filePath)}
      styles={{
        image: {
          display: 'block',
          height: 'auto',
          maxHeight: '100%',
          maxWidth: '100%',
          objectPosition: 'center',
          width: 'auto',
        },
        wrapper: {
          alignItems: 'center',
          display: 'flex',
          height: '100%',
          justifyContent: 'center',
          width: '100%',
        },
      }}
      variant="borderless"
    /> : <div className="image-stage-empty">没有可显示的图片</div>}
    {children}
  </div>;
}
