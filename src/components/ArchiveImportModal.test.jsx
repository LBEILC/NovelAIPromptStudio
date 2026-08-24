import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import ArchiveImportModal from './ArchiveImportModal.jsx';

vi.mock('@lobehub/ui/base-ui', () => ({
  Button: ({ children, ...props }) => <button {...props}>{children}</button>,
  Modal: ({ children, okText, title }) => <section><h2>{title}</h2>{children}<footer>{okText}</footer></section>,
}));

vi.mock('@lobehub/ui', () => ({
  Popover: ({ children, content, disabled, trigger }) => <div data-popover-disabled={String(Boolean(disabled))} data-popover-trigger={trigger}>{children}<aside>{content}</aside></div>,
  PopoverGroup: ({ children, closeDelay, openDelay, zIndex }) => <section data-close-delay={closeDelay} data-open-delay={openDelay} data-z-index={zIndex}>{children}</section>,
}));

vi.mock('./Icon.jsx', () => ({ default: () => null }));

describe('ArchiveImportModal', () => {
  it('renders image-first archive groups and excludes unreadable entries from the initial count', () => {
    const html = renderToStaticMarkup(<ArchiveImportModal
      importSession={{
        archives: [{ id: 'archive', name: 'NovelAI 图片.zip', count: 2 }],
        directImageCount: 1,
        entries: [
          {
            archiveId: 'archive',
            fileName: '作品/第一张.png',
            id: 'one',
            previewHeight: 640,
            previewPath: 'C:\\preview\\one.webp',
            previewWidth: 1280,
          },
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
    expect(html).toContain('data-popover-trigger="hover"');
    expect(html).toContain('data-open-delay="80"');
    expect(html).toContain('data-close-delay="0"');
    expect(html).toContain('data-z-index="1203"');
    expect(html).toContain('gallery-card-hover-preview');
    expect(html).toContain('1280 × 640 · ZIP 预览');
    expect(html).not.toContain('aria-label="预览 第一张.png"');
    expect(html).not.toContain('title="作品/第一张.png"');
    expect(html).toContain('draggable="false"');
    expect(html).toContain('archive-import-hover-name');
    expect(html).toContain('archive-import-card-select');
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('disabled=""');
  });

  it('enables each hover preview as soon as that entry is ready', () => {
    const html = renderToStaticMarkup(<ArchiveImportModal
      importSession={{
        archives: [{ id: 'archive', name: '渐进预览.zip', count: 2 }],
        directImageCount: 0,
        entries: [
          {
            archiveId: 'archive',
            fileName: '已生成.png',
            id: 'ready',
            previewHeight: 1216,
            previewPath: 'C:\\preview\\ready.webp',
            previewWidth: 832,
          },
          { archiveId: 'archive', fileName: '生成中.png', id: 'pending' },
        ],
        previewComplete: false,
        previewCompleted: 1,
        sessionId: 'session',
      }}
      onCancel={vi.fn()}
      onImport={vi.fn()}
    />);

    expect(html).toContain('正在生成预览 1 / 2');
    expect(html.match(/data-popover-trigger="hover"/g)).toHaveLength(2);
    expect(html.match(/data-popover-disabled="false"/g)).toHaveLength(1);
    expect(html.match(/data-popover-disabled="true"/g)).toHaveLength(1);
    expect(html).toContain('832 × 1216 · ZIP 预览');
    expect(html).toContain('data-z-index="1203"');
  });
});
