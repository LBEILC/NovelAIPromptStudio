import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { BatchToolbar, GalleryCardHoverPreview, GalleryCardView } from './GalleryPage.jsx';

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
    Switch: Component,
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
    const cover = {
      created_at: '2026-08-18T00:00:00.000Z',
      id: 'cover',
      image_path: 'C:\\gallery\\original.png',
      metadata: { height: 1216, width: 832 },
      name: 'unused generated filename',
      prompt_structure: { base_undesired_tags: [], characters: [] },
      tags: [{ id: 'one', tag: '1girl' }, { id: 'two', tag: 'outdoors' }],
      thumbnail_path: 'C:\\gallery\\thumbnail.webp',
    };
    const html = renderToStaticMarkup(<GalleryCardHoverPreview group={{
      count: 2,
      cover,
      members: [cover],
    }}/>);

    expect(html).toContain('thumbnail.webp');
    expect(html).toContain('832 × 1216 · 2 Tags');
    expect(html).toContain('1 / 2');
    expect(html).not.toContain('unused generated filename');
  });

  it('renders the currently scrubbed group member and its position', () => {
    const cover = {
      created_at: '2026-08-18T00:00:00.000Z',
      id: 'cover',
      image_path: 'C:\\gallery\\cover.png',
      metadata: { height: 1216, width: 832 },
      name: 'cover',
      prompt_structure: { base_undesired_tags: [], characters: [] },
      tags: [],
    };
    const variant = {
      ...cover,
      id: 'variant',
      image_path: 'C:\\gallery\\variant.png',
      metadata: { height: 832, width: 1216 },
      name: 'variant',
    };
    const html = renderToStaticMarkup(<GalleryCardHoverPreview
      group={{ count: 2, cover, members: [cover, variant] }}
      project={variant}
    />);

    expect(html).toContain('variant.png');
    expect(html).toContain('1216 × 832');
    expect(html).toContain('2 / 2');
  });

  it('keeps the visual-only hover layer transparent to pointer hit testing', () => {
    const element = GalleryCardView({
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

  it('keeps filenames out of the permanent card layout and exposes the scrubbed name as a hover label', () => {
    const cover = {
      id: 'cover',
      image_path: 'C:\\gallery\\cover.png',
      metadata: {},
      name: 'cover.png',
      prompt_structure: { base_undesired_tags: [], characters: [] },
      tags: [],
    };
    const variant = { ...cover, id: 'variant', name: 'variant.png' };
    const element = GalleryCardView({
      active: false,
      group: { count: 2, cover, members: [cover, variant] },
      hoverProject: variant,
      onContextMenu: vi.fn(),
      onPreview: vi.fn(),
      onSelect: vi.fn(),
      selected: false,
    });
    const mainButton = element.props.children.props.children[0];
    const imageChildren = mainButton.props.children.props.children.flat(Infinity).filter(Boolean);
    const hoverName = imageChildren.find((child) => child.props?.className === 'gallery-card-hover-name');

    expect(mainButton.props['aria-label']).toContain('cover.png');
    expect(hoverName.props.children).toBe('variant.png');
    expect(hoverName.props['aria-hidden']).toBe('true');
    expect(mainButton.props.children.props.className).toBe('gallery-card-image');
  });

  it('opens the currently scrubbed member in the detail panel and Workbench', () => {
    const onOpenWorkbench = vi.fn();
    const onPreview = vi.fn();
    const cover = {
      id: 'cover',
      image_path: 'C:\\gallery\\cover.png',
      metadata: {},
      name: 'cover',
      prompt_structure: { base_undesired_tags: [], characters: [] },
      tags: [],
    };
    const variant = { ...cover, id: 'variant', image_path: 'C:\\gallery\\variant.png', name: 'variant' };
    const element = GalleryCardView({
      active: false,
      group: { count: 2, cover, members: [cover, variant] },
      hoverProject: variant,
      onContextMenu: vi.fn(),
      onOpenWorkbench,
      onPreview,
      onSelect: vi.fn(),
      selected: false,
    });
    const mainButton = element.props.children.props.children[0];
    const clickEvent = { ctrlKey: false, detail: 1, metaKey: false, shiftKey: false };

    mainButton.props.onClick(clickEvent);
    mainButton.props.onDoubleClick(clickEvent);

    expect(onPreview).toHaveBeenCalledWith(variant, clickEvent);
    expect(onOpenWorkbench).toHaveBeenCalledWith(variant);
  });

  it('keeps modified double clicks available for selection gestures', () => {
    const onOpenWorkbench = vi.fn();
    const cover = {
      id: 'cover',
      image_path: 'C:\\gallery\\cover.png',
      metadata: {},
      name: 'cover',
      prompt_structure: { base_undesired_tags: [], characters: [] },
      tags: [],
    };
    const element = GalleryCardView({
      active: false,
      group: { count: 1, cover, members: [cover] },
      onContextMenu: vi.fn(),
      onOpenWorkbench,
      onPreview: vi.fn(),
      onSelect: vi.fn(),
      selected: false,
    });
    const mainButton = element.props.children.props.children[0];

    mainButton.props.onDoubleClick({ ctrlKey: true, metaKey: false, shiftKey: false });

    expect(onOpenWorkbench).not.toHaveBeenCalled();
  });
});
