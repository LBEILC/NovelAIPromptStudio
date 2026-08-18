import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BatchToolbar, GalleryCard, GalleryCardHoverPreview } from './GalleryPage.jsx';

vi.mock('@lobehub/ui', () => {
  const Component = () => null;
  return {
    Accordion: Component,
    AccordionItem: Component,
    ActionIcon: Component,
    DraggablePanel: Object.assign(Component, { Body: Component }),
    Empty: Component,
    Highlighter: Component,
    Popover: Component,
    PopoverGroup: Component,
    SearchBar: Component,
  };
});

vi.mock('@lobehub/ui/base-ui', () => {
  const Component = () => null;
  return {
    Button: Component,
    Input: Component,
    Segmented: Component,
    Select: Component,
    Slider: Component,
    SplitButton: Object.assign(Component, { Main: Component, Menu: Component }),
  };
});

function toolbarActions(view, callbacks) {
  const toolbar = BatchToolbar({
    view,
    selectedGroups: 2,
    selectedImages: 3,
    onFavorite: vi.fn(),
    onTrash: vi.fn(),
    onRestore: vi.fn(),
    onPermanentDelete: vi.fn(),
    onClear: vi.fn(),
    ...callbacks,
  });

  return {
    batch: toolbar.props.children[1].props.children,
    clear: toolbar.props.children[2],
  };
}

describe('BatchToolbar', () => {
  it('does not pass the click event as explicit ids when moving a selection to trash', () => {
    const onTrash = vi.fn();
    const { batch } = toolbarActions('all', { onTrash });

    batch[2].props.onClick({ type: 'click' });

    expect(onTrash).toHaveBeenCalledWith();
  });

  it('does not pass the click event to trash selection actions', () => {
    const onRestore = vi.fn();
    const onPermanentDelete = vi.fn();
    const { batch } = toolbarActions('trash', { onRestore, onPermanentDelete });

    batch[0].props.onClick({ type: 'click' });
    batch[1].props.onClick({ type: 'click' });

    expect(onRestore).toHaveBeenCalledWith();
    expect(onPermanentDelete).toHaveBeenCalledWith();
  });
});

describe('GalleryCardHoverPreview', () => {
  it('uses the thumbnail and keeps the preview focused on visual metadata', () => {
    const html = renderToStaticMarkup(<GalleryCardHoverPreview group={{
      count: 2,
      cover: {
        created_at: '2026-08-18T00:00:00.000Z',
        image_path: 'C:\\gallery\\original.png',
        metadata: { height: 1216, width: 832 },
        name: 'unused generated filename',
        prompt_structure: { base_undesired_tags: [], characters: [] },
        tags: [{ id: 'one', tag: '1girl' }, { id: 'two', tag: 'outdoors' }],
        thumbnail_path: 'C:\\gallery\\thumbnail.webp',
      },
    }}/>);

    expect(html).toContain('thumbnail.webp');
    expect(html).toContain('832 × 1216 · 2 Tags');
    expect(html).toContain('2 张变体');
    expect(html).not.toContain('unused generated filename');
  });

  it('keeps the visual-only hover layer transparent to pointer hit testing', () => {
    const element = GalleryCard({
      active: false,
      group: {
        count: 1,
        cover: {
          id: 'cover',
          image_path: 'C:\\gallery\\original.png',
          metadata: {},
          name: 'cover',
          prompt_structure: { base_undesired_tags: [], characters: [] },
          tags: [],
        },
        members: [],
      },
      onContextMenu: vi.fn(),
      onPreview: vi.fn(),
      onSelect: vi.fn(),
      selected: false,
    });

    expect(element.props.styles).toEqual({ root: { pointerEvents: 'none' } });
  });
});
