import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import ArchiveImportModal from './ArchiveImportModal.jsx';

vi.mock('@lobehub/ui/base-ui', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
  Modal: ({ children, okText, title }) => <section><h2>{title}</h2>{children}<footer>{okText}</footer></section>,
}));

vi.mock('@lobehub/ui', () => {
  const Image = () => null;
  Image.PreviewGroup = ({ children, items }) => <div data-preview-items={items.length}>{children}</div>;
  return {
    ActionIcon: ({ icon, title, ...props }) => <button {...props}>{icon}<span>{title}</span></button>,
    Image,
  };
});

vi.mock('./Icon.jsx', () => ({ default: () => null }));

describe('ArchiveImportModal', () => {
  it('renders image-first archive groups and excludes unreadable entries from the initial count', () => {
    const html = renderToStaticMarkup(<ArchiveImportModal
      importSession={{
        archives: [{ id: 'archive', name: 'NovelAI 图片.zip', count: 2 }],
        directImageCount: 1,
        entries: [
          { archiveId: 'archive', fileName: '作品/第一张.png', id: 'one', previewPath: 'C:\\preview\\one.webp' },
          { archiveId: 'archive', fileName: '作品/损坏.png', id: 'broken', previewError: '文件签名不匹配' },
        ],
        previewComplete: true,
        previewCompleted: 2,
        sessionId: 'session',
      }}
      onCancel={vi.fn()}
      onImport={vi.fn()}
    />);

    expect(html).toContain('选择要导入的图片');
    expect(html).toContain('已选 1 / 1 张 ZIP 图片');
    expect(html).toContain('导入 2 张');
    expect(html).toContain('NovelAI 图片.zip');
    expect(html).toContain('第一张.png');
    expect(html).toContain('损坏.png');
    expect(html).toContain('aria-label="预览 第一张.png"');
    expect(html).toContain('data-preview-items="1"');
    expect(html).toContain('draggable="false"');
    expect(html).toContain('archive-import-hover-name');
    expect(html).toContain('archive-import-card-select');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('disabled=""');
  });
});
