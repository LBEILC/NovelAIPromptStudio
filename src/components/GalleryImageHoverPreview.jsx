import { fitTabPreviewCanvas } from '../lib/imagePreview.js';

export default function GalleryImageHoverPreview({ children, height, src, width }) {
  const previewCanvas = fitTabPreviewCanvas(width, height, {
    maxWidth: 320,
    maxHeight: 360,
    minWidth: 220,
    minHeight: 180,
  });
  return <div
    className="gallery-card-hover-preview"
    style={{
      '--gallery-card-hover-ratio': `${previewCanvas.width} / ${previewCanvas.height}`,
      '--gallery-card-hover-width': `${previewCanvas.width}px`,
    }}
  >
    <div className="gallery-card-hover-media">
      <img alt="" draggable="false" key={src} src={src}/>
    </div>
    {children}
  </div>;
}
