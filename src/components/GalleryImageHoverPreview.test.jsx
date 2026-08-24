import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import GalleryImageHoverPreview from './GalleryImageHoverPreview.jsx';

describe('GalleryImageHoverPreview', () => {
  it('keeps hover artwork synchronous, non-draggable, and proportionally sized', () => {
    const html = renderToStaticMarkup(<GalleryImageHoverPreview height={1216} src="media://preview.webp" width={832}>
      <span>预览信息</span>
    </GalleryImageHoverPreview>);

    expect(html).toContain('gallery-card-hover-preview');
    expect(html).toContain('--gallery-card-hover-ratio:246 / 360');
    expect(html).toContain('draggable="false"');
    expect(html).not.toContain('decoding="async"');
    expect(html).toContain('预览信息');
  });
});
